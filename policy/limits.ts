// User-authorized order notional range. Environment variables may only tighten it.
export const MIN_TRADE_USD = 5;
export const MAX_TRADE_USD = 9.5;

export function tradeSize(quality: number): number {
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('Invalid sizing probability');

  const capped = Math.min(MAX_TRADE_USD, Math.max(MIN_TRADE_USD, MAX_TRADE_USD * quality));
  return Number(capped.toFixed(2));
}

export function assertTradeSize(size: number): void {
  if (!Number.isFinite(size) || size < MIN_TRADE_USD || size > MAX_TRADE_USD) {
    throw new Error(`Order notional must be $${MIN_TRADE_USD}–$${MAX_TRADE_USD}`);
  }
}
