import dotenv from 'dotenv';

dotenv.config();

const PRODUCTS = (process.env.SCAN_PRODUCTS || 'BTC-USD,ETH-USD,SOL-USD,DOGE-USD,XRP-USD')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Approximate round-trip taker fee (entry tier). Tune if your fee tier is lower.
const ROUND_TRIP_FEE_BPS = Number(process.env.ROUND_TRIP_FEE_BPS) || 150; // 1.5%
const MIN_EDGE_BUFFER_BPS = Number(process.env.MIN_EDGE_BUFFER_BPS) || 50; // extra 0.5% required

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
  estimated_edge_bps: number;
}

async function fetchTicker(productId: string) {
  const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/ticker`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  // Actual response is { trades: [{ price, ... }] }
  const price = data.trades?.[0]?.price || data.price;
  return price ? { price } : null;
}

async function fetchBook(productId: string) {
  const url = `https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${productId}&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function scoreEdge(snapshot: Omit<MarketSnapshot, 'estimated_edge_bps'>): number {
  // Simple proxy: absolute imbalance + recent return strength, minus spread.
  // This is a crude filter, not a real alpha model.
  const imbalanceEdge = Math.abs(snapshot.imbalance) * 20; // scale
  const returnEdge = Math.abs(snapshot.ret_5m) * 10000; // bps
  const spreadPenalty = snapshot.spread_bps;
  return Math.max(0, imbalanceEdge + returnEdge - spreadPenalty);
}

export async function scanProducts(): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const product of PRODUCTS) {
    try {
      const [ticker, book] = await Promise.all([fetchTicker(product), fetchBook(product)]);
      if (!ticker || !book) continue;

      const mid = parseFloat(ticker.price || '0');
      if (mid <= 0) continue;

      const bestBid = parseFloat(book.pricebook?.bids?.[0]?.price || '0');
      const bestAsk = parseFloat(book.pricebook?.asks?.[0]?.price || '0');
      const spread = bestAsk - bestBid;
      const spread_bps = mid > 0 ? (spread / mid) * 10000 : 0;

      const bidSize = parseFloat(book.pricebook?.bids?.[0]?.size || '0');
      const askSize = parseFloat(book.pricebook?.asks?.[0]?.size || '0');
      const imbalance = (bidSize + askSize) > 0 ? (bidSize - askSize) / (bidSize + askSize) : 0;

      const base = {
        mid,
        spread_bps,
        imbalance,
        realized_vol_1m: 0.02,
        realized_vol_5m: 0.015,
        ret_1m: 0,
        ret_5m: 0,
        ret_15m: 0,
        inventory_usd: 0,
        drawdown_pct: 0,
        timestamp: new Date().toISOString(),
        symbol: product,
      };

      const estimated_edge_bps = scoreEdge(base);
      snapshots.push({ ...base, estimated_edge_bps });
    } catch {
      // skip failed product
    }
  }

  return snapshots;
}

/**
 * Returns only candidates whose estimated edge exceeds fees + buffer.
 */
export function filterClearingFees(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  console.log(`Scanned ${snapshots.length} products`);
  const threshold = ROUND_TRIP_FEE_BPS + MIN_EDGE_BUFFER_BPS;
  const sorted = [...snapshots].sort((a, b) => b.estimated_edge_bps - a.estimated_edge_bps);
  if (sorted[0]) {
    console.log(`Best edge: ${sorted[0].symbol} ${sorted[0].estimated_edge_bps.toFixed(1)} bps (need ${threshold})`);
  }
  return sorted.filter(s => s.estimated_edge_bps > threshold);
}

export async function buildBestSnapshot(): Promise<MarketSnapshot | null> {
  const all = await scanProducts();
  const clearing = filterClearingFees(all);
  return clearing[0] || null;
}
