import { tradeSize, MAX_TRADE_USD } from './limits.js';
/**
 * Policy: thresholds and combination weights in code.
 * One threshold per action, scaled to what being wrong costs.
 * Edit coefficients here, not prompts.
 */

export const POLICY = {
  // Gambler
  min_setup_score: 0.65,
  min_worth_trading_noul: 0.7,
  max_toxicity_noul: 0.3,
  // House
  max_inventory_risk_noul: 0.4,
  min_spread_attractive: 0.6,
  // Spy
  require_skilled: true,
  min_consistency: 0.75,
  max_rug_noul: 0.2,
  // Sizing (code owns this)
  base_size_usd: 5,
  max_size_usd: MAX_TRADE_USD,
};

function probability(answer: any): number | null {
  return answer?.type === 'noul' && typeof answer.noul === 'number' &&
    Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1
    ? answer.noul
    : null;
}

function marketBias(state: any): { direction: 'long' | 'short' | 'skip'; score: number; reason: string } {
  const ret5m = Number(state?.ret_5m ?? 0);
  const ret15m = Number(state?.ret_15m ?? 0);
  const imbalance = Number(state?.imbalance ?? 0);
  const spreadBps = Number(state?.spread_bps ?? 0);
  const retScore = (ret5m * 200) + (ret15m * 100) + (imbalance * 80);

  if (spreadBps > 18) return { direction: 'skip', score: 0, reason: 'spread too wide for clean entry' };

  if (retScore > 0.012) return { direction: 'long', score: retScore, reason: 'momentum breakout bias' };
  if (retScore < -0.012) return { direction: 'short', score: retScore, reason: 'momentum breakdown bias' };

  const rangeScore = (Number(state?.ret_1m ?? 0) * 120) - (spreadBps * 0.04);
  if (rangeScore > 0.008) return { direction: 'long', score: rangeScore, reason: 'short-term mean reversion recovery' };
  if (rangeScore < -0.008) return { direction: 'short', score: rangeScore, reason: 'mean reversion pullback' };

  return { direction: 'skip', score: 0, reason: 'no clear momentum or reversion edge' };
}

export function decideAdaptive(answers: any, state: any): { action: string; size: number; reason: string } {
  const quality = probability(answers?.setup_quality);
  const worth = probability(answers?.worth_trading);
  const toxic = probability(answers?.toxicity);
  const failures: string[] = [];

  if (quality === null) failures.push('setup_quality: missing or invalid noul answer');
  else if (quality < POLICY.min_setup_score) failures.push(`setup_quality ${quality.toFixed(3)} < ${POLICY.min_setup_score}`);

  if (worth === null) failures.push('worth_trading: missing or invalid noul answer');
  else if (worth < POLICY.min_worth_trading_noul) failures.push(`worth_trading ${worth.toFixed(3)} < ${POLICY.min_worth_trading_noul}`);

  if (toxic === null) failures.push('toxicity: missing or invalid noul answer');
  else if (toxic > POLICY.max_toxicity_noul) failures.push(`toxicity ${toxic.toFixed(3)} > ${POLICY.max_toxicity_noul}`);

  if (failures.length) return { action: 'skip', size: 0, reason: failures.join('; ') };

  const bias = marketBias(state);
  if (bias.direction === 'skip') return { action: 'skip', size: 0, reason: bias.reason };

  const direction = bias.direction;
  const qualityScale = Math.min(1, Math.max(0.7, Number(quality ?? 0.7)));
  const size = tradeSize(qualityScale * 0.9 + Math.min(0.2, Math.abs(bias.score) * 20));

  return {
    action: direction,
    size,
    reason: `${bias.reason}; quality=${quality?.toFixed(3) ?? 'n/a'}`,
  };
}

export function decideGambler(answers: any, state: any): { action: string; size: number; reason: string } {
  return decideAdaptive(answers, state);
}

// Similar functions for house and spy would go here
export function decideSpy(answers: any): { action: string; size: number; reason: string } {
  if (answers.wallet_skill?.choice !== 'skilled') return { action: 'skip', size: 0, reason: 'not skilled' };
  if ((answers.move_consistent?.noul ?? 0) < POLICY.min_consistency) return { action: 'skip', size: 0, reason: 'inconsistent' };
  if ((answers.rug_risk?.noul ?? 1) > POLICY.max_rug_noul) return { action: 'skip', size: 0, reason: 'rug risk' };

  const mirror = answers.mirror_decision?.choice;
  if (mirror === 'skip') return { action: 'skip', size: 0, reason: 'choice skip' };
  const size = mirror === 'full' ? POLICY.base_size_usd : POLICY.base_size_usd * 0.5;
  if (size < 5) return { action: 'skip', size: 0, reason: 'sized entry below $5 minimum' };
  return { action: 'mirror', size, reason: 'approved' };
}

export function decideMeme(answers: any, state: any) {
  const decision = decideAdaptive(answers, state);
  return decision.action === 'short' ? { action: 'skip', size: 0, reason: 'meme strategy is spot long-only' } : decision;
}
