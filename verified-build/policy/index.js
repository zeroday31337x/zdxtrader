import { tradeSize, MAX_TRADE_USD } from './limits.js';
/**
 * Policy: thresholds and combination weights in code.
 * One threshold per action, scaled to what being wrong costs.
 * Edit coefficients here, not prompts.
 */
export const POLICY = {
    // Gambler
    min_setup_score: 0.65, // probability of a high-quality setup
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
    base_size_usd: 9,
    max_size_usd: MAX_TRADE_USD,
};
export function decideGambler(answers, state) {
    const probability = (answer) => answer?.type === 'noul' && typeof answer.noul === 'number' &&
        Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1
        ? answer.noul : null;
    const quality = probability(answers?.setup_quality);
    const worth = probability(answers?.worth_trading);
    const toxic = probability(answers?.toxicity);
    const failures = [];
    if (quality === null)
        failures.push('setup_quality: missing or invalid noul answer');
    else if (quality < POLICY.min_setup_score)
        failures.push(`setup_quality ${quality.toFixed(3)} < ${POLICY.min_setup_score}`);
    if (worth === null)
        failures.push('worth_trading: missing or invalid noul answer');
    else if (worth < POLICY.min_worth_trading_noul)
        failures.push(`worth_trading ${worth.toFixed(3)} < ${POLICY.min_worth_trading_noul}`);
    if (toxic === null)
        failures.push('toxicity: missing or invalid noul answer');
    else if (toxic > POLICY.max_toxicity_noul)
        failures.push(`toxicity ${toxic.toFixed(3)} > ${POLICY.max_toxicity_noul}`);
    if (failures.length)
        return { action: 'skip', size: 0, reason: failures.join('; ') };
    const direction = answers?.regime?.choice === 'trending_up' ? 'long' : answers?.regime?.choice === 'trending_down' ? 'short' : 'skip';
    if (direction === 'skip')
        return { action: 'skip', size: 0, reason: 'no clear direction' };
    const size = tradeSize(quality);
    return { action: direction, size, reason: 'policy approved' };
}
// Similar functions for house and spy would go here
export function decideSpy(answers) {
    if (answers.wallet_skill?.choice !== 'skilled')
        return { action: 'skip', size: 0, reason: 'not skilled' };
    if ((answers.move_consistent?.noul ?? 0) < POLICY.min_consistency)
        return { action: 'skip', size: 0, reason: 'inconsistent' };
    if ((answers.rug_risk?.noul ?? 1) > POLICY.max_rug_noul)
        return { action: 'skip', size: 0, reason: 'rug risk' };
    const mirror = answers.mirror_decision?.choice;
    if (mirror === 'skip')
        return { action: 'skip', size: 0, reason: 'choice skip' };
    const size = mirror === 'full' ? POLICY.base_size_usd : POLICY.base_size_usd * 0.5;
    if (size < 5)
        return { action: 'skip', size: 0, reason: 'sized entry below $5 minimum' };
    return { action: 'mirror', size, reason: 'approved' };
}
export function decideMeme(answers, state) {
    const decision = decideGambler(answers, state);
    return decision.action === 'short' ? { action: 'skip', size: 0, reason: 'meme strategy is spot long-only' } : decision;
}
//# sourceMappingURL=index.js.map