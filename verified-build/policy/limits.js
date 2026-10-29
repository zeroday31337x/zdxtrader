import { envNumber } from './env.js';
// Entry notional range is configured in .env.
export const MIN_TRADE_USD = envNumber('MIN_TRADE_USD');
export const MAX_TRADE_USD = envNumber('MAX_TRADE_USD');
if (MIN_TRADE_USD <= 0 || MAX_TRADE_USD < MIN_TRADE_USD)
    throw new Error('Invalid entry notional range');
export function tradeSize(confidence) {
    if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1))
        throw Error('Invalid sizing confidence');
    const low = envNumber('LOW_CONFIDENCE_THRESHOLD'), high = envNumber('HIGH_CONFIDENCE_THRESHOLD');
    if (low < 0 || high > 1 || high <= low)
        throw Error('Invalid confidence sizing thresholds');
    const ceiling = Math.min(MAX_TRADE_USD, envNumber('MAX_POSITION_USD'));
    if (ceiling < MIN_TRADE_USD)
        throw Error('Configured position maximum is below minimum entry');
    const fraction = confidence === undefined ? 0 : Math.max(0, Math.min(1, (confidence - low) / (high - low)));
    return Math.floor((MIN_TRADE_USD + (ceiling - MIN_TRADE_USD) * fraction) * 100 + 1e-8) / 100;
}
export function assertTradeSize(size) {
    if (!Number.isFinite(size) || size < MIN_TRADE_USD || size > MAX_TRADE_USD) {
        throw new Error(`Order notional must be $${MIN_TRADE_USD}–$${MAX_TRADE_USD}`);
    }
}
//# sourceMappingURL=limits.js.map