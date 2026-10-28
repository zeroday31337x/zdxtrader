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

const risk = new RiskEngine();
const paperBroker = new PaperBroker();
const coinbaseBroker = new CoinbaseBroker();
const filter = new Filter();
const book = new Book();

async function cycle() {
  if (book.hasOpen()) {
    console.log('Position open — skipping scan');
    return;
  }

  const snapshot = await buildBestSnapshot();
  if (!snapshot) {
    console.log('No product cleared fee + edge threshold — skipping');
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
    console.log(`Rejected by funnel: ${funnelResult.reason}`);
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
  } catch (err: any) {
    console.error('Jev call failed:', err.message);
    return;
  }

  const policyDecision = decideGambler(answers, snapshot);
  const riskCheck = risk.check({ size: policyDecision.size, symbol: candidate.symbol }, snapshot);

  let executed = null;
  const canExecute = policyDecision.action !== 'skip' && riskCheck.approved;

  if (canExecute && MODE === 'paper') {
    const side = policyDecision.action === 'long' ? 'buy' : 'sell';
    executed = await paperBroker.place(
      { symbol: candidate.symbol, side, sizeUsd: policyDecision.size, type: 'market' },
      snapshot.mid
    );
    book.openPosition(candidate.symbol, policyDecision.size, snapshot.mid);
    console.log('Paper executed:', executed);
  } else if (canExecute && MODE === 'live' && LIVE_ENABLED && coinbaseBroker.isReady()) {
    const side = policyDecision.action === 'long' ? 'buy' : 'sell';
    executed = await coinbaseBroker.place(
      { symbol: candidate.symbol, side, sizeUsd: policyDecision.size, type: 'market' },
      snapshot.mid
    );
    book.openPosition(candidate.symbol, policyDecision.size, snapshot.mid);
    console.log('LIVE executed:', executed);
  } else {
    console.log(
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
  console.log(`Trading desk starting in ${MODE} mode. Poll every ${POLL}ms`);
  if (MODE === 'live') {
    if (!LIVE_ENABLED) {
      console.log('LIVE mode requested but LIVE_TRADING is not true — falling back to shadow behavior.');
    } else if (!coinbaseBroker.isReady()) {
      console.log('LIVE mode but Coinbase keys missing — no orders will be sent.');
    } else {
      console.log('WARNING: LIVE TRADING ENABLED. Real money at risk. Hard risk limits still apply.');
    }
  } else {
    console.log('Paper/shadow mode. No real orders.');
  }

  setInterval(cycle, POLL);
  await cycle();
}

main().catch(console.error);
