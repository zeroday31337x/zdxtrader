import { loggedFetch } from '../logs/http.js';
import dotenv from 'dotenv';

dotenv.config();

export interface MarketSnapshot {
  mid: number;
  spread_bps: number;
  imbalance: number;
  realized_vol_1m: number;
  realized_vol_5m: number;
  ret_1m: number;
  ret_5m: number;
  ret_15m: number;
  inventory_usd: number;
  drawdown_pct: number;
  timestamp: string;
  symbol: string;
}

const PRODUCT = process.env.PRODUCT_ID || 'BTC-USD';

async function fetchPublicTicker(productId: string) {
  const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/ticker`;
  const res = await loggedFetch(url);
  if (!res.ok) throw new Error(`Ticker fetch failed: ${res.status}`);
  return res.json();
}

async function fetchPublicBook(productId: string) {
  const url = `https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${productId}&limit=10`;
  const res = await loggedFetch(url);
  if (!res.ok) throw new Error(`Book fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Builds a lean snapshot from live Coinbase public data.
 * No API key required. Only pre-decision numbers.
 */
export async function buildSnapshot(): Promise<MarketSnapshot> {
  try {
    const [ticker, book] = await Promise.all([
      fetchPublicTicker(PRODUCT),
      fetchPublicBook(PRODUCT),
    ]);

    const mid = parseFloat(ticker.price || book.mid_market || '0');
    const bestBid = parseFloat(book.pricebook?.bids?.[0]?.price || '0');
    const bestAsk = parseFloat(book.pricebook?.asks?.[0]?.price || '0');
    const spread = bestAsk - bestBid;
    const spread_bps = mid > 0 ? (spread / mid) * 10000 : 0;

    // Simple imbalance from top of book
    const bidSize = parseFloat(book.pricebook?.bids?.[0]?.size || '0');
    const askSize = parseFloat(book.pricebook?.asks?.[0]?.size || '0');
    const imbalance = (bidSize + askSize) > 0 ? (bidSize - askSize) / (bidSize + askSize) : 0;

    // Returns and vol are still approximate — expand with candles if needed
    return {
      mid,
      spread_bps,
      imbalance,
      realized_vol_1m: 0.02, // placeholder until candle history is wired
      realized_vol_5m: 0.015,
      ret_1m: 0,
      ret_5m: 0,
      ret_15m: 0,
      inventory_usd: 0,
      drawdown_pct: 0,
      timestamp: new Date().toISOString(),
      symbol: PRODUCT,
    };
  } catch (err) {
    console.error('Market data fetch failed, using last-known or zero:', err);
    return {
      mid: 0,
      spread_bps: 999,
      imbalance: 0,
      realized_vol_1m: 0,
      realized_vol_5m: 0,
      ret_1m: 0,
      ret_5m: 0,
      ret_15m: 0,
      inventory_usd: 0,
      drawdown_pct: 0,
      timestamp: new Date().toISOString(),
      symbol: PRODUCT,
    };
  }
}
