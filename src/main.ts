import dotenv from 'dotenv';
import { buildBestSnapshot } from '../state/scanner.js';
import { gamblerQuestions } from '../questions/gambler.js';
import { askJev } from '../judge/index.js';
import { decideGambler } from '../policy/index.js';
import { RiskEngine } from '../risk/engine.js';
import { PaperBroker } from '../broker/paper.js';
import { CoinbaseBroker } from '../broker/coinbase.js';
import { Filter } from '../filter/funnel.js';
import { Book } from '../book/index.js';
import { logDecision, logRejection } from '../logs/logger.js';

dotenv.config();

const MODE = process.env.MODE || 'shadow';
const LIVE_ENABLED = process.env.LIVE_TRADING === 'true';
const POLL = Number(process.env.POLL_INTERVAL_MS) || 30000;
const DESK_SECRET = process.env.DESK_SECRET || '';

const timestamp = () => new Date().toISOString();
const log = (...args: unknown[]) => console.log(`[${timestamp()}]`, ...args);
const warn = (...args: unknown[]) => console.warn(`[${timestamp()}]`, ...args);
const err = (...args: unknown[]) => console.error(`[${timestamp()}]`, ...args);

const risk = new RiskEngine();
const paperBroker = new PaperBroker();
const coinbaseBroker = new CoinbaseBroker();
const filter = new Filter();
const book = new Book();

async function cycle() {
  if (book.hasOpen()) {
    log('Position open or order awaiting reconciliation — skipping scan');
    return;
  }

  const snapshot = await buildBestSnapshot();
  if (!snapshot) {
    log('No product cleared fee + edge threshold — skipping');
    return;
  }

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

  let answers, model;
  try {
    const resp = await askJev({
      secret: DESK_SECRET,
      state: snapshot as unknown as Record<string, unknown>,
      questions: gamblerQuestions,
    });
    answers = resp.answers;
    model = resp.model;
  } catch (errorDetail: any) {
    err('Jev call failed:', errorDetail.message);
    return;
  }

  const policyDecision = decideGambler(answers, snapshot);
  const riskCheck = risk.check({ size: policyDecision.size, symbol: candidate.symbol }, snapshot);

  if (MODE === 'live' && policyDecision.action === 'short') {
    riskCheck.approved = false;
    riskCheck.veto = 'short entries unsupported by spot broker';
  }

  let executed = null;
  const canExecute = policyDecision.action !== 'skip' && riskCheck.approved;

  if (canExecute && MODE === 'paper') {
    const side = policyDecision.action === 'long' ? 'buy' : 'sell';
    executed = await paperBroker.place(
      { symbol: candidate.symbol, side, sizeUsd: policyDecision.size, type: 'market' },
      snapshot.mid
    );
    book.openPosition(candidate.symbol, policyDecision.size, snapshot.mid);
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
      book.openPosition(candidate.symbol, executed.sizeUsd, executed.price);
    } catch (errorDetail: any) {
      await logRejection({ id: candidate.id, check: 'broker', reason: errorDetail.message, clientOrderId });
      err('Live order unresolved; entries locked pending reconciliation:', errorDetail.message);
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

async function main() {
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
    } catch (errorDetail: any) {
      err('Cycle failed:', errorDetail.message);
    }
    setTimeout(run, POLL);
  };

  await run();
}

main().catch((errorDetail: any) => err(errorDetail));

