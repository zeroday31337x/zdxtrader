import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { buildBestSnapshot, buildBestMemeSnapshot, type MarketSnapshot } from '../state/scanner.js';
import { gamblerQuestions } from '../questions/gambler.js';
import { memeQuestions } from '../questions/meme.js';
import { askJev } from '../judge/index.js';
import { decideGambler, decideMeme } from '../policy/index.js';
import { RiskEngine } from '../risk/engine.js';
import { PaperBroker } from '../broker/paper.js';
import { Filter } from '../filter/funnel.js';
import { Book } from '../book/index.js';
import { logDecision, logRejection } from '../logs/logger.js';

dotenv.config();
const MODE = process.env.MODE || 'shadow';
const POLL = Number(process.env.POLL_INTERVAL_MS ?? 30000);
const MEME_POLL = Number(process.env.MEME_SCAN_INTERVAL_MS ?? 300000);
if (!['shadow','paper','live'].includes(MODE)) throw new Error('Invalid MODE');
if (!Number.isFinite(POLL) || POLL < 1000 || !Number.isFinite(MEME_POLL) || MEME_POLL < 60000) throw new Error('Invalid scan interval');
const risk = new RiskEngine();
const paperBroker = new PaperBroker();
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
  // Market-only state: account state is explicitly unavailable, never fabricated as zero.
  const response = await askJev({secret:process.env.DESK_SECRET || '',state:snapshot as unknown as Record<string,unknown>,questions});
  const decision = strategy === 'meme_swing' ? decideMeme(response.answers,snapshot) : decideGambler(response.answers,snapshot);
  const riskCheck = decision.action === 'skip'
    ? { approved:false, veto:'not evaluated: policy skipped entry' }
    : risk.check({size:decision.size,symbol:snapshot.symbol},snapshot);
  if (book.hasOpen() && decision.action !== 'skip') {
    riskCheck.approved=false; riskCheck.veto='position open or order requires reconciliation';
  }
  // No live broker is reachable from this scan service until exits/account reconciliation exist.
  if (MODE === 'live' && decision.action !== 'skip') {
    riskCheck.approved=false;
    riskCheck.veto='live execution paused: exits and account reconciliation not implemented';
  }
  let executed = null;
  // New meme strategy is recommendations only, independent of the global mode.
  if (strategy === 'short_term' && decision.action !== 'skip' && riskCheck.approved && MODE === 'paper') {
    executed = await paperBroker.place({symbol:snapshot.symbol,side:decision.action === 'long'?'buy':'sell',sizeUsd:decision.size,type:'market'},snapshot.mid);
    book.openPosition(snapshot.symbol,executed.sizeUsd,executed.price);
  }
  const effectiveMode = strategy === 'meme_swing' ? 'shadow' : MODE;
  console.log(`[${strategy}] Would ${decision.action} $${decision.size.toFixed(2)} — ${decision.reason} | risk: ${riskCheck.veto || 'ok'} | mode=${effectiveMode}${strategy==='meme_swing'?' | outlook=24–72h':''}`);
  await logDecision({timestamp:new Date().toISOString(),mode:effectiveMode,snapshot,questions,answers:response.answers,model:response.model,policyDecision:decision,riskCheck,executed});
}
async function runStrategy(strategy:'short_term'|'meme_swing') {
  try {
    const snapshot = strategy === 'short_term' ? await buildBestSnapshot() : await buildBestMemeSnapshot();
    if (snapshot) await assess(snapshot);
    else console.log(`[${strategy}] No candidate passed data screen`);
  } catch(err:any) {
    console.error(`[${strategy}] Scan failed: ${err.message}`);
    await logRejection({strategy,check:'scan_or_judge',reason:err.message});
  }
}
async function cycle() {
  // Prioritize the longer-hold scan when due; keep the short-term opportunity watch running.
  if(Date.now()>=nextMemeScan) {
    try { await runStrategy('meme_swing'); }
    finally { nextMemeScan=Date.now()+MEME_POLL; }
  }
  await runStrategy('short_term');
}
async function main() {
  console.log(`Dual scanner starting: short_term=${MODE}; meme_swing=shadow (24–72h outlook); fixed planned entry $9; fees extra; one open position at a time.`);
  console.log('Live execution is paused until exits and account reconciliation are implemented.');
  const run=async()=>{
    try { await cycle(); } catch(err:any) { console.error('Cycle failed:',err.message); }
    setTimeout(run,POLL);
  };
  await run();
}
main().catch(err=>{ console.error(err.message); process.exitCode=1; });
