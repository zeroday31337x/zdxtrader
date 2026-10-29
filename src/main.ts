import { scheduleDatasetRefresh } from '../reports/calibration.js';
import { scheduleCorrelationAgent } from '../inference/agent.js';
import { claimRunner } from '../execution/ownership.js';
import { decideDeterministic } from '../policy/deterministic.js';
import { entriesScheduled } from '../execution/schedule.js';
import { saveAnalysis } from '../reports/live-analysis.js';
import { positionSignal } from '../market/golden.js';
import { envNumber, envBoolean, envText } from '../policy/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { flushFailedReservation } from '../book/recovery.js';
import dotenv from 'dotenv';
import { buildCandidateSnapshots, scanProducts, type MarketSnapshot } from '../state/scanner.js';
import { gamblerQuestions } from '../questions/gambler.js';
import { askJev } from '../judge/index.js';
import { decideGambler } from '../policy/index.js';
import { RiskEngine } from '../risk/engine.js';
import { PaperBroker } from '../broker/paper.js';
import { CoinbaseBroker, NotSubmittedError } from '../broker/coinbase.js';
import { Filter } from '../filter/funnel.js';
import { Book } from '../book/index.js';
import { logDecision, logRejection, logExecution } from '../logs/logger.js';

dotenv.config();

const MODE = envText('MODE');
const STOP_AFTER_PURCHASE = envBoolean('STOP_AFTER_PURCHASE');
const LIVE_ENABLED = envBoolean('LIVE_TRADING');
const POLL = envNumber('POLL_INTERVAL_MS');
const DESK_SECRET = process.env.DESK_SECRET || '';

const timestamp = () => new Date().toISOString();
const log = (...args: unknown[]) => console.log(`[${timestamp()}]`, ...args);
const warn = (...args: unknown[]) => console.warn(`[${timestamp()}]`, ...args);
const err = (...args: unknown[]) => console.error(`[${timestamp()}]`, ...args);

const risk = new RiskEngine(path.join(process.cwd(),'state',`risk-${MODE}.json`));
const paperBroker = new PaperBroker();
const coinbaseBroker = new CoinbaseBroker();
const filter = new Filter();
const book = new Book();

let nextBlockedAnalysis=0;
async function analyzeWhileHolding() {
  if(Date.now()<nextBlockedAnalysis)return;
  await saveAnalysis(await scanProducts());
  nextBlockedAnalysis=Date.now()+envNumber('ANALYSIS_INTERVAL_MS');
}

async function cycle() {
  if (MODE==='live' && coinbaseBroker.isReady() && book.getOpen()?.status==='pending') {
    await reconcilePending();
  }
  if (book.getOpen()?.status === 'pending') {
    const pending = book.getOpen()!;
    const created = Date.parse(pending.entryTime);
    if (Number.isFinite(created) && Date.now() - created >= envNumber('FAILED_ORDER_TTL_MS')) {
      const logDir = path.join(process.cwd(), 'logs');
      const rows: unknown[] = [];
      for (const file of await fs.readdir(logDir)) {
        if (!/^rejections-.*\.jsonl$/.test(file)) continue;
        for (const line of (await fs.readFile(path.join(logDir, file), 'utf8')).split('\n')) {
          try { rows.push(JSON.parse(line)); } catch { /* Ignore incomplete log lines. */ }
        }
      }
      if (flushFailedReservation(book, rows)) log('Flushed confirmed failed order older than five minutes');
    }
  }
  if (book.getOpen()?.status === 'open') {
    await analyzeWhileHolding();
    await analyzeOwnedPosition();
    return;
  }
  if (book.hasOpen()) {
    await analyzeWhileHolding();
    log('Order awaiting reconciliation — entries locked; scheduled market analysis remains active');
    return;
  }

  const snapshots = await buildCandidateSnapshots();
  if (!snapshots.length) {
    log('No product cleared fee + edge threshold — skipping');
    return;
  }

  for (const snapshot of snapshots) {
    if(!entriesScheduled()){log('Entry schedule closed; market analysis continues');break;}
    await evaluateCandidate(snapshot);
    if (book.hasOpen()) break;
  }
}

async function evaluateCandidate(snapshot: MarketSnapshot) {
  const candidate = {
    id: `c-${Date.now()}`,
    symbol: snapshot.symbol,
    data: snapshot,
    flags: [] as string[],
  };

  const funnelResult = await filter.pass(candidate, snapshot);
  if (!funnelResult.ok) {
    await logRejection({ id: candidate.id, reason: funnelResult.reason, check: 'funnel' });
    log(`Rejected by funnel: ${funnelResult.reason}`);
    return;
  }

  let answers, model='deterministic';
  let policyDecision;
  if(envText('DECISION_ENGINE')==='deterministic') {
    policyDecision=decideDeterministic(snapshot);
  } else {
    try {
      const resp=await askJev({secret:DESK_SECRET,state:snapshot as unknown as Record<string,unknown>,questions:gamblerQuestions});
      answers=resp.answers;model=resp.model;policyDecision=decideGambler(answers,snapshot);
    } catch(error:any) {err('Model evaluation failed:',error.message);return;}
  }
  if(policyDecision.action!=='skip'&&MODE==='live'&&LIVE_ENABLED&&coinbaseBroker.isReady()) {
    try {
      const balance=await coinbaseBroker.availableUsd();
      Object.assign(snapshot,{account_balance_usd:balance,account_state_available:true});
      if(policyDecision.size*(1+envNumber('BUY_FEE_BPS')/10000)>balance) {
        await logRejection({check:'balance',reason:'insufficient verified USD including fee reserve',symbol:candidate.symbol});return;
      }
    } catch(error:any) {
      await logRejection({check:'account',reason:error.message,symbol:candidate.symbol});
      err('Cannot verify live USD balance:',error.message);return;
    }
  }
  const riskCheck = policyDecision.action === 'skip'
    ? { approved: false, veto: 'not evaluated: policy skipped entry' }
    : risk.check({ size: policyDecision.size, symbol: candidate.symbol }, snapshot);


  let executed = null;
  const canExecute = policyDecision.action !== 'skip' && riskCheck.approved;

  if (canExecute && MODE === 'paper') {
    const side = policyDecision.action === 'long' ? 'buy' : 'sell';
    executed = await paperBroker.place(
      { symbol: candidate.symbol, side, sizeUsd: policyDecision.size, type: 'market' },
      snapshot.mid
    );
    book.openPosition(candidate.symbol, policyDecision.size, snapshot.mid, {quantity:String(policyDecision.size/snapshot.mid),fees:executed.fees,sellTarget:snapshot.golden?.valid?snapshot.golden.sell_target:undefined});
    log('Paper executed:', executed);
  } else if (canExecute && MODE === 'live' && LIVE_ENABLED && coinbaseBroker.isReady()) {
    const side = policyDecision.action === 'long' ? 'buy' : 'sell';
    const clientOrderId = crypto.randomUUID();
    book.reserve(candidate.symbol, policyDecision.size, clientOrderId);
    try {
      executed = await coinbaseBroker.place(
        { symbol: candidate.symbol, side, sizeUsd: policyDecision.size, type: 'market' },
        snapshot.mid,
        clientOrderId
      );
      book.openPosition(candidate.symbol, executed.sizeUsd, executed.price, {quantity:executed.baseQuantity,fees:executed.fees,sellTarget:snapshot.golden?.valid?snapshot.golden.sell_target:undefined});
    } catch (errorDetail: any) {
      if (errorDetail instanceof NotSubmittedError) book.release(clientOrderId);
      await logRejection({ id: candidate.id, check: 'broker', reason: errorDetail.message, clientOrderId, notSubmitted: errorDetail instanceof NotSubmittedError });
      err(errorDetail instanceof NotSubmittedError ? 'Live order rejected before execution:' : 'Live order unresolved; entries locked pending reconciliation:', errorDetail.message);
      return;
    }
    log('LIVE executed:', executed);
  } else {
    log(
      `Would ${policyDecision.action} ${policyDecision.size} — ${policyDecision.reason} | risk: ${riskCheck.veto || 'ok'} | mode=${MODE}`
    );
  }

  await logDecision({
    timestamp: new Date().toISOString(),
    mode: MODE,
    snapshot,
    questions: gamblerQuestions,
    answers,
    model,
    policyDecision,
    riskCheck,
    executed,
  });
}

async function reconcilePending() {
  const pending=book.getOpen();
  if(pending?.status!=='pending'||!pending.clientOrderId)return;
  try {
    const order=await coinbaseBroker.findPending(pending.clientOrderId,pending.symbol);
    if(!order){log('Pending order not found yet; retaining reconciliation lock');return;}
    const expectedSide=pending.pendingSide==='sell'?'SELL':'BUY';
    if(order.side!==expectedSide)throw Error('Pending order side mismatch');
    if(!['FILLED','CANCELLED','EXPIRED','FAILED','REJECTED'].includes(order.status))return;
    const quantity=Number(order.filled_size),value=Number(order.filled_value),fees=Number(order.total_fees),price=Number(order.average_filled_price);
    if(!Number.isFinite(quantity)||quantity<0)throw Error('Invalid reconciled quantity');
    if(quantity===0) {
      if(order.status==='FILLED')throw Error('Filled order has no confirmed quantity');
      book.release(pending.clientOrderId);log(`Confirmed unfilled terminal order: ${order.status}`);return;
    }
    if(![value,fees,price].every(Number.isFinite)||value<=0||price<=0||fees<0)throw Error('Invalid reconciled fill');
    if(expectedSide==='BUY')book.openPosition(pending.symbol,value,price,{quantity:order.filled_size,fees});
    else {
      if(!pending.quantity)throw Error('Missing owned quantity for reconciled sale');
      const pnl=value-fees-(pending.size+(pending.fees??0))*quantity/Number(pending.quantity);
      risk.recordPnl(pnl,order.order_id);book.applySale(order.filled_size);
    }
    await logExecution({timestamp:new Date().toISOString(),mode:MODE,strategy:'reconciliation',symbol:pending.symbol,orderId:order.order_id,status:order.status,quantity,value,fees});
    log(`Reconciled ${expectedSide} fill: ${pending.symbol}`);
  } catch(error:any) {err('Pending reconciliation failed; entries remain locked:',error.message);}
}

async function analyzeOwnedPosition() {
  const position=book.getOpen();
  if(!position||position.status!=='open')return;
  const snapshot=(await scanProducts([position.symbol], 'short_term'))[0];
  if(!snapshot?.venue_history||!snapshot.golden||!snapshot.bid) {
    log('Owned position: fresh market data unavailable');return;
  }
  await saveAnalysis([snapshot]);
  book.updateHigh(snapshot.bid);
  const signal=positionSignal(book.getOpen()!,snapshot.bid,snapshot.golden,snapshot.venue_history);
  await logExecution({timestamp:new Date().toISOString(),mode:MODE,strategy:'owned_position_exit',snapshot,position,exitSignal:signal});
  log(`Owned position ${position.symbol}: ${signal.action} — ${signal.reason}; estimated net ${signal.estimated_net_margin_bps.toFixed(1)} bps`);
  if(signal.action!=='sell'||!envBoolean('ENABLE_AUTO_SELL'))return;
  if(!position.quantity){log('Sale requires confirmed filled base quantity; reconcile legacy position first');return;}
  if(MODE==='paper') {
    const quantity=Number(position.quantity),proceeds=quantity*snapshot.bid;
    const pnl=proceeds*(1-envNumber('PAPER_FEE_BPS')/10000)-position.size-(position.fees??0);
    risk.recordPnl(pnl,`paper-exit-${position.entryTime}`);book.close();
    await logExecution({timestamp:new Date().toISOString(),mode:MODE,strategy:'paper_exit',symbol:position.symbol,quantity,proceeds,realizedPnl:pnl});log(`PAPER sale confirmed: ${position.symbol}`);return;
  }
  if(MODE!=='live'||!LIVE_ENABLED||!coinbaseBroker.isReady())return;
  if(!snapshot.base_increment)throw Error('Exchange base increment is missing');
  const clientOrderId=crypto.randomUUID();
  book.reserveExit(clientOrderId);
  try {
    const fill=await coinbaseBroker.sellOwned({symbol:position.symbol,quantity:position.quantity}, {bid:snapshot.bid,baseIncrement:snapshot.base_increment,minBase:snapshot.base_min_size??0,minQuote:snapshot.quote_min_size},clientOrderId);
    const fraction=Number(fill.baseQuantity)/Number(position.quantity);
    const pnl=fill.sizeUsd-fill.fees-(position.size+(position.fees??0))*fraction;
    risk.recordPnl(pnl,fill.orderId);book.applySale(fill.baseQuantity!);
    await logExecution({timestamp:new Date().toISOString(),mode:MODE,strategy:'live_exit',executed:fill,realizedPnl:pnl,exitSignal:signal});
    log(`LIVE sale confirmed: ${position.symbol}; realized P&L $${pnl.toFixed(4)}`);
  } catch(error:any) {
    if(error instanceof NotSubmittedError)book.release(clientOrderId);
    await logRejection({timestamp:new Date().toISOString(),check:'broker',reason:error.message,clientOrderId,notSubmitted:error instanceof NotSubmittedError});
    err('Sale failed or requires reconciliation:',error.message);
  }
}

async function main() {
  const release=claimRunner(path.join(process.cwd(),'state',`runner-${MODE}.pid`));
  process.once('exit',release);
  process.once('SIGTERM',()=>process.exit(0));
  process.once('SIGINT',()=>process.exit(0));
  if(!['deterministic','model'].includes(envText('DECISION_ENGINE')))throw Error('Invalid DECISION_ENGINE');
  if(!['shadow','paper','live'].includes(MODE))throw Error('Invalid MODE');
  if(POLL<=0)throw Error('POLL_INTERVAL_MS must be positive');
  entriesScheduled();
  log(`Trading desk starting in ${MODE} mode. Poll every ${POLL}ms`);
  if (MODE === 'live') {
    if (!LIVE_ENABLED) {
      log('LIVE mode requested but LIVE_TRADING is not true — falling back to shadow behavior.');
    } else if (!coinbaseBroker.isReady()) {
      log('LIVE mode but Coinbase keys missing — no orders will be sent.');
    } else {
      warn('WARNING: LIVE TRADING ENABLED. Real money at risk. Hard risk limits still apply.');
    }
  } else {
    log('Paper/shadow mode. No real orders.');
  }

  const run = async () => {
    try {
      await cycle();
      scheduleDatasetRefresh();
      scheduleCorrelationAgent();
    } catch (errorDetail: any) {
      err('Cycle failed:', errorDetail.message);
    }
    if (STOP_AFTER_PURCHASE && MODE === 'live' && book.getOpen()?.status === 'open') {
      log('Confirmed purchase persisted. STOP_AFTER_PURCHASE enabled; exiting.');
      process.exit(0);
    }
    setTimeout(run, POLL);
  };

  await run();
}

main().catch((errorDetail: any) => {err(errorDetail.message);process.exitCode=1;});

