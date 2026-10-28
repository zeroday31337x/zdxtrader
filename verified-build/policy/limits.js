// User-authorized order notional range. Environment variables may only tighten it.
export const MIN_TRADE_USD = 5;
export const MAX_TRADE_USD = 9;
export function tradeSize(quality) {
    if (!Number.isFinite(quality) || quality < 0 || quality > 1)
        throw new Error('Invalid sizing probability');
    // Signal quality determines eligibility, never permission to exceed the fixed entry budget.
    return MAX_TRADE_USD;
}
export function assertTradeSize(size) {
    if (!Number.isFinite(size) || size < MIN_TRADE_USD || size > MAX_TRADE_USD) {
        throw new Error(`Order notional must be $${MIN_TRADE_USD}–$${MAX_TRADE_USD}`);
    }
}
//# sourceMappingURL=limits.js.map