/**
 * Policy: thresholds and combination weights in code.
 * One threshold per action, scaled to what being wrong costs.
 * Edit coefficients here, not prompts.
 */

export const POLICY = {
  // Gambler
  min_setup_score: 0.65,          // from score answer
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
  base_size_usd: 20,
  max_size_usd: 100,
};

export function decideGambler(answers: any, state: any): { action: string; size: number; reason: string } {
  const quality = answers.setup_quality?.score ?? 0; // assuming score returns probability or value
  const worth = answers.worth_trading?.noul ?? 0;
  const toxic = answers.toxicity?.noul ?? 1;

  if (worth < POLICY.min_worth_trading_noul || toxic > POLICY.max_toxicity_noul || quality < POLICY.min_setup_score) {
    return { action: 'skip', size: 0, reason: 'thresholds not met' };
  }

  const direction = answers.regime?.choice === 'trending_up' ? 'long' : answers.regime?.choice === 'trending_down' ? 'short' : 'skip';
  if (direction === 'skip') return { action: 'skip', size: 0, reason: 'no clear direction' };

  const size = Math.min(POLICY.base_size_usd * (quality || 1), POLICY.max_size_usd);
  return { action: direction, size, reason: 'policy approved' };
}

// Similar functions for house and spy would go here
export function decideSpy(answers: any): { action: string; size: number; reason: string } {
  if (answers.wallet_skill?.choice !== 'skilled') return { action: 'skip', size: 0, reason: 'not skilled' };
  if ((answers.move_consistent?.noul ?? 0) < POLICY.min_consistency) return { action: 'skip', size: 0, reason: 'inconsistent' };
  if ((answers.rug_risk?.noul ?? 1) > POLICY.max_rug_noul) return { action: 'skip', size: 0, reason: 'rug risk' };

  const mirror = answers.mirror_decision?.choice;
  if (mirror === 'skip') return { action: 'skip', size: 0, reason: 'choice skip' };
  const size = mirror === 'full' ? POLICY.base_size_usd : POLICY.base_size_usd * 0.5;
  return { action: 'mirror', size, reason: 'approved' };
}
