import { envNumber, envBoolean } from './env.js';
import { MAX_TRADE_USD, tradeSize } from './limits.js';
/**
 * Policy: thresholds are loaded from .env.
 * All operational policy values must come from env.
 */
export const POLICY = {
    min_setup_score: envNumber('MIN_SETUP_SCORE'),
    min_worth_trading_noul: envNumber('MIN_WORTH_TRADING_NOUL'),
    max_toxicity_noul: envNumber('MAX_TOXICITY_NOUL'),
    max_inventory_risk_noul: envNumber('MAX_INVENTORY_RISK_NOUL'),
    min_spread_attractive: envNumber('MIN_SPREAD_ATTRACTIVE'),
    require_skilled: envBoolean('REQUIRE_SKILLED'),
    min_consistency: envNumber('MIN_CONSISTENCY'),
    max_rug_noul: envNumber('MAX_RUG_NOUL'),
    base_size_usd: envNumber('BASE_SIZE_USD'),
    max_size_usd: Math.min(MAX_TRADE_USD, envNumber('MAX_POSITION_USD')),
};
export function decideGambler(answers, state) {
    const probability = (answer) => answer?.type === 'noul' && typeof answer.noul === 'number' &&
        Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1
        ? answer.noul
        : null;
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
    // Short-term describes the holding horizon. All entry orders are purchases.
    if (envBoolean('REQUIRE_UPTREND') && answers?.regime?.choice !== 'trending_up') {
        return { action: 'skip', size: 0, reason: 'uptrend required by REQUIRE_UPTREND' };
    }
    if (envBoolean('REQUIRE_FIB_BUY_ZONE') && !state?.golden?.in_buy_zone) {
        return { action: 'skip', size: 0, reason: 'outside configured Fibonacci buy zone' };
    }
    if ((state?.venue_history?.upward_fraction ?? 0) < envNumber('MIN_UPWARD_VENUE_FRACTION')) {
        return { action: 'skip', size: 0, reason: 'insufficient upward venue agreement' };
    }
    if (envBoolean('REQUIRE_TARGET_MARGIN') && (!state?.golden?.valid || state.golden.estimated_net_target_margin_bps < envNumber('MIN_TARGET_NET_MARGIN_BPS'))) {
        return { action: 'skip', size: 0, reason: 'projected target does not clear configured net margin' };
    }
    const confidence = probability(answers?.confidence);
    const size = tradeSize(confidence ?? undefined);
    return { action: 'long', size, reason: 'policy approved' };
}
export function decideSpy(answers) {
    if (POLICY.require_skilled && answers.wallet_skill?.choice !== 'skilled')
        return { action: 'skip', size: 0, reason: 'not skilled' };
    if ((answers.move_consistent?.noul ?? 0) < POLICY.min_consistency)
        return { action: 'skip', size: 0, reason: 'inconsistent' };
    if ((answers.rug_risk?.noul ?? 1) > POLICY.max_rug_noul)
        return { action: 'skip', size: 0, reason: 'rug risk' };
    const mirror = answers.mirror_decision?.choice;
    if (mirror === 'skip')
        return { action: 'skip', size: 0, reason: 'choice skip' };
    const size = mirror === 'full' ? POLICY.base_size_usd : POLICY.base_size_usd * 0.5;
    if (size < envNumber('MIN_TRADE_USD'))
        return { action: 'skip', size: 0, reason: 'sized entry below MIN_TRADE_USD' };
    return { action: 'mirror', size, reason: 'approved' };
}
export function decideMeme(answers, state) {
    const decision = decideGambler(answers, state);
    return decision.action === 'short' ? { action: 'skip', size: 0, reason: 'meme strategy is spot long-only' } : decision;
}
//# sourceMappingURL=index.js.map