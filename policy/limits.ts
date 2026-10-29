import { envNumber } from './env.js';
// Entry notional range is configured in .env.
export const MIN_TRADE_USD = envNumber('MIN_TRADE_USD');
export const MAX_TRADE_USD = envNumber('MAX_TRADE_USD');
if (MIN_TRADE_USD <= 0 || MAX_TRADE_USD < MIN_TRADE_USD) throw new Error('Invalid entry notional range');

export function tradeSize(quality: number): number {
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('Invalid sizing probability');

  const capped = MAX_TRADE_USD;
  return Number(capped.toFixed(2));
}

export function assertTradeSize(size: number): void {
  if (!Number.isFinite(size) || size < MIN_TRADE_USD || size > MAX_TRADE_USD) {
    throw new Error(`Order notional must be $${MIN_TRADE_USD}–$${MAX_TRADE_USD}`);
  }
}
