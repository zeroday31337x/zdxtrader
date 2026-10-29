import { choice, noul } from '../judge/index.js';
/**
 * Gambler bot: bets on direction.
 * One judgment per question. Every Choice has "other".
 * Send only the fields the questions read.
 */
export const gamblerQuestions = {
    confidence: noul('How strong is the supplied evidence supporting this purchase? This is a sizing confidence score, not an established probability of profit.'),
    regime: choice('Using venue_history from Coinbase, Binance.com, Binance.US and Crypto.com when available, compare completed candle trends and identify the current regime. Missing venues are not agreement. USD and USDT quotes are distinct.', {
        trending_up: 'Clear directional move higher',
        trending_down: 'Clear directional move lower',
        ranging: 'Sideways, mean-reverting',
        volatile: 'High vol, no clear direction',
        other: 'Does not fit the above',
    }),
    setup_quality: noul('Is this a high-quality spot purchase setup using the supplied multi-venue histories, upward trend agreement, Fibonacci buy zone and golden-ratio timing projections? Projections are heuristics, not guaranteed outcomes.'),
    worth_trading: noul('Is this short-duration spot BUY worth taking given trend agreement and golden.estimated_net_target_margin_bps after fees and slippage? The edge score is not realized or guaranteed profit. Short-term never means a short sale.'),
    toxicity: noul('Does this look toxic (adverse selection, manipulation, or trap)?'),
};
//# sourceMappingURL=gambler.js.map