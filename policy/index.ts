import { tradeSize, MAX_TRADE_USD } from './limits.js';

/**
 * Policy: thresholds and combination weights in code.
 * All operational policy values must come from env.
 */
const envNumber = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export const POLICY = {
  min_setup_score: envNumber('MIN_SETUP_SCORE', 0.2),
  min_worth_trading_noul: envNumber('MIN_WORTH_TRADING_NOUL', 0.3),
  max_toxicity_noul: envNumber('MAX_TOXICITY_NOUL', 0.6),
  max_inventory_risk_noul: envNumber('MAX_INVENTORY_RISK_NOUL', 0.4),
  min_spread_attractive: envNumber('MIN_SPREAD_ATTRACTIVE', 0.6),
  require_skilled: true,
  min_consistency: envNumber('MIN_CONSISTENCY', 0.75),
  max_rug_noul: envNumber('MAX_RUG_NOUL', 0.2),
  base_size_usd: envNumber('BASE_SIZE_USD', 5),
  max_size_usd: Math.min(MAX_TRADE_USD, envNumber('MAX_POSITION_USD', MAX_TRADE_USD)),
};

export function decideGambler(answers: any, state: any): { action: string; size: number; reason: string } {
  const probability = (answer: any): number | null =>
    answer?.type === 'noul' && typeof answer.noul === 'number' &&
    Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1
      ? answer.noul
      : null;

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

  const direction = answers?.regime?.choice === 'trending_up' ? 'long'
    : answers?.regime?.choice === 'trending_down' ? 'short'
    : 'skip';

  if (direction === 'skip') return { action: 'skip', size: 0, reason: 'no clear direction' };

  // Coinbase spot is long-only for this trading desk.
  if (direction === 'short') {
    return { action: 'skip', size: 0, reason: 'spot broker long-only; short entries disabled' };
  }

  const size = Math.min(POLICY.base_size_usd, POLICY.max_size_usd);
  return { action: 'long', size, reason: 'policy approved' };
}

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
  const decision = decideGambler(answers, state);
  return decision.action === 'short' ? { action: 'skip', size: 0, reason: 'meme strategy is spot long-only' } : decision;
}

