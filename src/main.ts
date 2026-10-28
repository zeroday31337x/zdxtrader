import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { buildBestSnapshot, buildBestMemeSnapshot, type MarketSnapshot } from '../state/scanner.js';
import { gamblerQuestions } from '../questions/gambler.js';
import { memeQuestions } from '../questions/meme.js';
import { askJev } from '../judge/index.js';
import { decideGambler, decideMeme } from '../policy/index.js';
import { RiskEngine } from '../risk/engine.js';
import { PaperBroker } from '../broker/paper.js';
import { CoinbaseBroker } from '../broker/coinbase.js';
import { Filter } from '../filter/funnel.js';
import { Book } from '../book/index.js';
import { logDecision, logRejection } from '../logs/logger.js';

dotenv.config();

const readEnv = (name: string, fallbackName?: string): string => {
  const value = process.env[name] ?? process.env[fallbackName ?? name.toLowerCase()] ?? '';
  return typeof value === 'string' ? value.trim() : '';
};

const MODE = (readEnv('MODE', 'mode') || 'paper').toLowerCase();
const LIVE_TRADING = (readEnv('LIVE_TRADING', 'live_trading') || 'false').toLowerCase() === 'true';
const POLL = Number(readEnv('POLL_INTERVAL_MS')) || 30000;
const MEME_POLL = Number(readEnv('MEME_SCAN_INTERVAL_MS')) || 300000;

if (!['shadow', 'paper', 'live'].includes(MODE)) {
  throw new Error(`Invalid MODE: ${MODE}`);
}
if (!Number.isFinite(POLL) || POLL < 1000 || !Number.isFinite(MEME_POLL) || MEME_POLL < 60000) {
  throw new Error('Invalid scan interval');
}

const risk = new RiskEngine();
const paperBroker = new PaperBroker();
const coinbaseBroker = new CoinbaseBroker();
const filter = new Filter();
const book = new Book();
let nextMemeScan = 0;

async function assess(snapshot: MarketSnapshot) {
  const strategy = snapshot.strategy;
  const candidate = { id: `${strategy}-${randomUUID()}`, symbol: snapshot.symbol, data: snapshot, flags: [] as string[] };
  const funnel = await filter.pass(candidate, snapshot);
  if (!funnel.ok) {
    await logRejection({ id: candidate.id, strategy, reason: funnel.reason, check: 'funnel' });
    console.log(`[${strategy}] Rejected: ${funnel.reason}`);
    return;
  }

  const questions = strategy === 'meme_swing' ? memeQuestions : gamblerQuestions;
  const response = await askJev({
    secret: readEnv('DESK_SECRET', 'desk_secret'),
    state: snapshot as unknown as Record<string, unknown>,
    questions,
  });

  const decision = strategy === 'meme_swing' ? decideMeme(response.answers, snapshot) : decideGambler(response.answers, snapshot);
  const riskCheck = decision.action === 'skip'
    ? { approved: false, veto: 'not evaluated: policy skipped entry' }
    : risk.check({ size: decision.size, symbol: snapshot.symbol }, snapshot);

  if (book.hasOpen() && decision.action !== 'skip') {
    riskCheck.approved = false;
    riskCheck.veto = 'position open or order requires reconciliation';
  }

  let executed = null;

  if (strategy === 'short_term' && decision.action !== 'skip' && riskCheck.approved && MODE === 'paper') {
    executed = await paperBroker.place(
      { symbol: snapshot.symbol, side: decision.action === 'long' ? 'buy' : 'sell', sizeUsd: decision.size, type: 'market' },
      snapshot.mid,
    );
    book.openPosition(snapshot.symbol, executed.sizeUsd, executed.price);
  }

  if (strategy === 'short_term' && decision.action !== 'skip' && riskCheck.approved && MODE === 'live' && LIVE_TRADING && coinbaseBroker.isReady()) {
    const clientOrderId = randomUUID();
    book.reserve(snapshot.symbol, decision.size, clientOrderId);
    try {
      executed = await coinbaseBroker.place(
        { symbol: snapshot.symbol, side: decision.action === 'long' ? 'buy' : 'sell', sizeUsd: decision.size, type: 'market' },
        snapshot.mid,
        clientOrderId,
      );
      book.openPosition(snapshot.symbol, executed.sizeUsd, executed.price);
    } catch (err: any) {
      await logRejection({ id: candidate.id, strategy, check: 'broker', reason: err.message, clientOrderId });
      console.error(`[${strategy}] Live order unresolved; entries locked pending reconciliation:`, err.message);
      return;
    }
  }

  const effectiveMode = strategy === 'meme_swing' ? 'shadow' : MODE;
  const modeSummary = MODE === 'live' && !LIVE_TRADING
    ? 'live disabled by LIVE_TRADING=false'
    : MODE === 'live' && !coinbaseBroker.isReady()
      ? 'live pending credentials'
      : `mode=${effectiveMode}`;

  console.log(`[${strategy}] ${decision.action === 'skip' ? 'Skip' : `Would ${decision.action}`} $${decision.size.toFixed(2)} — ${decision.reason} | risk: ${riskCheck.veto || 'ok'} | ${modeSummary}`);
  await logDecision({
    timestamp: new Date().toISOString(),
    mode: effectiveMode,
    snapshot,
    questions,
    answers: response.answers,
    model: response.model,
    policyDecision: decision,
    riskCheck,
    executed,
  });
}

async function runStrategy(strategy: 'short_term' | 'meme_swing') {
  try {
    const snapshot = strategy === 'short_term' ? await buildBestSnapshot() : await buildBestMemeSnapshot();
    if (snapshot) await assess(snapshot);
    else console.log(`[${strategy}] No candidate passed data screen`);
  } catch (err: any) {
    console.error(`[${strategy}] Scan failed:`, err.message);
    await logRejection({ strategy, check: 'scan_or_judge', reason: err.message });
  }
}

async function cycle() {
  if (Date.now() >= nextMemeScan) {
    try {
      await runStrategy('meme_swing');
    } finally {
      nextMemeScan = Date.now() + MEME_POLL;
    }
  }
  await runStrategy('short_term');
}

async function main() {
  console.log(`Dual scanner starting: short_term=${MODE}; meme_swing=shadow; live_trading=${LIVE_TRADING}; Coinbase ready=${coinbaseBroker.isReady()}`);

  if (MODE === 'live') {
    if (!LIVE_TRADING) {
      console.log('LIVE mode requested but LIVE_TRADING is not true — no real orders will be executed.');
    } else if (!coinbaseBroker.isReady()) {
      console.log('LIVE mode has no valid Coinbase credentials — no real orders will be executed.');
    } else {
      console.log('WARNING: LIVE TRADING ENABLED. Real money at risk. Hard risk limits still apply.');
    }
  } else {
    console.log('Paper/shadow mode. No real orders.');
  }

  const run = async () => {
    try {
      await cycle();
    } catch (err: any) {
      console.error('Cycle failed:', err.message);
    }
    setTimeout(run, POLL);
  };

  await run();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
