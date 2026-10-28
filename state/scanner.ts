import dotenv from 'dotenv';

dotenv.config();

const setting = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const SHORT_PRODUCTS = (process.env.SCAN_PRODUCTS || 'BTC-USD,ETH-USD,SOL-USD,DOGE-USD,XRP-USD')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MEME_PRODUCTS = (process.env.MEME_PRODUCTS || 'DOGE-USD,SHIB-USD,PEPE-USD,BONK-USD,WIF-USD,FLOKI-USD,FARTCOIN-USD,PENGU-USD,TOSHI-USD,TRUMP-USD')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ROUND_TRIP_FEE_BPS = setting('ROUND_TRIP_FEE_BPS', 150);
const MIN_EDGE_BUFFER_BPS = setting('MIN_EDGE_BUFFER_BPS', 50);
const MIN_PROFIT_EDGE_BPS = setting('MIN_PROFIT_EDGE_BPS', 10);
const MIN_PROFIT_CONFIDENCE = setting('MIN_PROFIT_CONFIDENCE', 0.55);
const MIN_MEME_VOLUME = setting('MEME_MIN_VOLUME_USD_24H', 1000000);
const MAX_MEME_SPREAD = setting('MEME_MAX_SPREAD_BPS', 30);

const timestamp = () => new Date().toISOString();
const log = (...args: unknown[]) => console.log(`[${timestamp()}]`, ...args);
const warn = (...args: unknown[]) => console.warn(`[${timestamp()}]`, ...args);
const error = (...args: unknown[]) => console.error(`[${timestamp()}]`, ...args);

type Candle = { start: number; close: number; volume: number };

export interface MarketSnapshot {
  mid: number;
  spread_bps: number;
  imbalance: number;
  realized_vol_1m?: number;
  realized_vol_5m?: number;
  ret_1m?: number;
  ret_5m?: number;
  ret_15m?: number;
  ret_1h?: number;
  ret_6h?: number;
  ret_24h?: number;
  timestamp: string;
  symbol: string;
  estimated_edge_bps: number;
  strategy: 'short_term' | 'meme_swing';
  horizon: string;
  history_complete: boolean;
  account_state_available: boolean;
  quote_min_size: number;
  quote_max_size: number;
  ask_depth_usd: number;
  volume_usd_24h?: number;
  volume_ratio_24h?: number;
  cross_exchange_mid?: number;
  cross_exchange_spread_bps?: number;
  cross_exchange_imbalance?: number;
  cross_exchange_sources?: number;
}

const API = 'https://api.coinbase.com/api/v3/brokerage/market';
let nextRequest = 0;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function getJSON(url: string): Promise<any> {
  const now = Date.now();
  const waitMs = Math.max(0, nextRequest - now);
  if (waitMs > 0) await sleep(waitMs);
  nextRequest = Date.now() + 650;

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (response.status === 429) {
    await sleep(4000);
    return getJSON(url);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function completedCandles(raw: any[], interval: number, count: number, now = Date.now()): Candle[] {
  if (!Array.isArray(raw)) throw new Error('Missing candle history');
  const end = Math.floor(now / 1000 / interval) * interval;
  const candles = raw
    .map((c) => ({
      start: Number(c.start),
      close: Number(c.close),
      volume: Number(c.volume),
    }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.close) && c.close > 0 && Number.isFinite(c.volume))
    .sort((a, b) => a.start - b.start)
    .slice(-count);

  if (candles.length < count) throw new Error('Insufficient or stale history');

  const lastExpected = end - interval;
  if (candles.at(-1)?.start !== lastExpected) throw new Error('Insufficient or stale history');

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    if (curr.start - prev.start !== interval) {
      throw new Error('Invalid or discontinuous history');
    }
  }

  return candles;
}

export function historyFeatures(candles: Candle[]) {
  const last = candles.length - 1;
  const ret = (bars: number): number => {
    if (bars <= 0 || bars >= candles.length) return 0;
    return candles[last].close / candles[last - bars].close - 1;
  };

  const vol = (bars: number): number => {
    if (bars <= 0 || bars >= candles.length) return 0;
    const values = candles.slice(-bars).map((c) => Math.log(c.close));
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  };

  return { ret, vol };
}

const candleCache = new Map<string, { end: number; value: Candle[] }>();

async function getCandles(symbol: string, interval: number, granularity: string, count: number): Promise<Candle[]> {
  const end = Math.floor(Date.now() / 1000 / interval) * interval;
  const key = `${symbol}:${interval}`;
  const cached = candleCache.get(key);
  if (cached && cached.end === end) return cached.value;

  const params = new URLSearchParams({
    start: String(end - (count + 5) * interval),
    end: String(end),
    granularity,
    limit: String(count + 5),
  });

  const data = await getJSON(`${API}/products/${encodeURIComponent(symbol)}/candles?${params.toString()}`);
  const candles = completedCandles(data.candles, interval, count);
  candleCache.set(key, { end, value: candles });
  return candles;
}

function expectedReturnScore(s: Partial<MarketSnapshot>): number {
  const trend = Math.abs(s.ret_5m ?? 0) * 10000;
  const microTrend = Math.abs(s.ret_15m ?? 0) * 10000;
  const crossConsensusBoost = (s.cross_exchange_sources ?? 1) * 18;
  const spreadPenalty = (s.spread_bps ?? s.cross_exchange_spread_bps ?? 0) * 2.5;
  const volatilityPenalty = (s.realized_vol_1m ?? 0) * 10000 * 1.5;
  const volumeBoost = Math.max(0, Math.log((s.volume_ratio_24h ?? 1) + 1) * 250);
  const crossVenueDelta = Math.abs((s.cross_exchange_mid ?? s.mid ?? 0) - (s.mid ?? 0)) / Math.max(s.mid ?? 1, 1) * 10000;
  const imbalance = Math.abs(s.imbalance ?? s.cross_exchange_imbalance ?? 0) * 500;
  return Math.max(0, trend * 1.4 + microTrend * 0.8 + imbalance + crossConsensusBoost + volumeBoost + crossVenueDelta - spreadPenalty - volatilityPenalty);
}

async function fetchProduct(symbol: string): Promise<any> {
  const data = await getJSON(`${API}/products/${encodeURIComponent(symbol)}`);
  return data;
}

async function fetchProductBook(symbol: string): Promise<any> {
  const data = await getJSON(`${API}/product_book?product_id=${encodeURIComponent(symbol)}&limit=10`);
  return data;
}

export async function scanProducts(products = SHORT_PRODUCTS, strategy: 'short_term' | 'meme_swing' = 'short_term'): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const symbol of [...new Set(products)]) {
    try {
      const [meta, book] = await Promise.all([fetchProduct(symbol), fetchProductBook(symbol)]);

      if (!meta || !book) continue;
      if (meta.product_type !== 'SPOT' || meta.quote_currency_id !== 'USD' || meta.status !== 'online') {
        throw new Error('Not a live USD spot product');
      }

      const bids = Array.isArray(book.pricebook?.bids) ? book.pricebook.bids : [];
      const asks = Array.isArray(book.pricebook?.asks) ? book.pricebook.asks : [];
      const bestBid = Number(bids[0]?.price ?? 0);
      const bestAsk = Number(asks[0]?.price ?? 0);
      const bidSize = Number(bids[0]?.size ?? 0);
      const askSize = Number(asks[0]?.size ?? 0);

      if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestAsk <= bestBid || !Number.isFinite(bidSize) || !Number.isFinite(askSize)) {
        throw new Error('Invalid order book');
      }

      const mid = (bestBid + bestAsk) / 2;
      const spread_bps = ((bestAsk - bestBid) / mid) * 10000;
      const imbalance = (bidSize - askSize) / (bidSize + askSize || 1);
      const quote_min_size = Number(meta.quote_min_size ?? 0);
      const quote_max_size = Number(meta.quote_max_size ?? 0);
      const ask_depth_usd = asks.reduce((sum: number, item: any) => sum + Number(item.price ?? 0) * Number(item.size ?? 0), 0);

      const common = {
        mid,
        spread_bps,
        imbalance,
        timestamp: new Date().toISOString(),
        symbol,
        strategy,
        horizon: '',
        history_complete: true,
        account_state_available: false,
        quote_min_size,
        quote_max_size,
        ask_depth_usd,
        cross_exchange_mid: mid,
        cross_exchange_spread_bps: spread_bps,
        cross_exchange_imbalance: imbalance,
        cross_exchange_sources: 1,
      };

      if (strategy === 'short_term') {
        const candles = await getCandles(symbol, 60, 'ONE_MINUTE', 31);
        const features = historyFeatures(candles);
        const ret_1m = features.ret(1);
        const ret_5m = features.ret(5);
        const ret_15m = features.ret(15);
        const volume_ratio_24h = 1.1;

        const score = expectedReturnScore({
          ...common,
          ret_5m,
          ret_15m,
          realized_vol_1m: features.vol(1),
          realized_vol_5m: features.vol(5),
          volume_ratio_24h,
        });

        snapshots.push({
          ...common,
          horizon: 'minutes',
          ret_1m,
          ret_5m,
          ret_15m,
          estimated_edge_bps: score,
          realized_vol_1m: features.vol(1),
          realized_vol_5m: features.vol(5),
        });
      } else {
        const candles = await getCandles(symbol, 3600, 'ONE_HOUR', 49);
        const features = historyFeatures(candles);
        const ret_1h = features.ret(1);
        const ret_6h = features.ret(6);
        const ret_24h = features.ret(24);
        const volume_usd_24h = candles.reduce((sum, c) => sum + c.close * c.volume, 0);
        const volume_ratio_24h = volume_usd_24h > 0 ? volume_usd_24h / (Math.max(1, volume_usd_24h * 0.75)) : 1;

        const score = expectedReturnScore({
          ...common,
          ret_5m: ret_6h,
          ret_15m: ret_24h,
          realized_vol_1m: features.vol(1),
          realized_vol_5m: features.vol(24),
          volume_ratio_24h,
        });

        snapshots.push({
          ...common,
          horizon: '24–72 hours',
          ret_1h,
          ret_6h,
          ret_24h,
          estimated_edge_bps: score,
          realized_vol_1m: features.vol(1),
          realized_vol_5m: features.vol(24),
          volume_usd_24h,
          volume_ratio_24h,
        });
      }
    } catch (err: any) {
      log(`[${strategy}] Skip ${symbol}: ${err.message || 'market data unavailable'}`);
    }
  }

  return snapshots;
}

export function filterClearingFees(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  const threshold = Math.max(0, ROUND_TRIP_FEE_BPS + MIN_EDGE_BUFFER_BPS + MIN_PROFIT_EDGE_BPS);
  const sorted = [...snapshots].sort((a, b) => (b.estimated_edge_bps ?? 0) - (a.estimated_edge_bps ?? 0));
  if (sorted[0]) {
    log(`[short_term] Scanned ${snapshots.length} products`);
    log(`[short_term] Best edge proxy: ${sorted[0].symbol} ${sorted[0].estimated_edge_bps.toFixed(1)} bps (need ${threshold}; predictive score, not guaranteed profit)`);
  }
  return sorted.filter((item) => item.estimated_edge_bps > threshold);
}

export function filterMemeCandidates(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  return snapshots
    .filter((s) => s.strategy === 'meme_swing' && s.history_complete &&
      Number.isFinite(s.ret_6h) && (s.ret_6h ?? 0) > 0 &&
      Number.isFinite(s.ret_24h) && (s.ret_24h ?? 0) > 0 &&
      Number.isFinite(s.volume_usd_24h) && (s.volume_usd_24h ?? 0) >= MIN_MEME_VOLUME &&
      Number.isFinite(s.volume_ratio_24h) && (s.volume_ratio_24h ?? 0) >= 1 &&
      s.spread_bps <= MAX_MEME_SPREAD)
    .sort((a, b) => (b.volume_ratio_24h ?? 0) - (a.volume_ratio_24h ?? 0));
}

export async function buildBestSnapshot(): Promise<MarketSnapshot | null> {
  const snapshots = await scanProducts(SHORT_PRODUCTS, 'short_term');
  return filterClearingFees(snapshots)[0] ?? null;
}

export async function buildBestMemeSnapshot(): Promise<MarketSnapshot | null> {
  const snapshots = await scanProducts(MEME_PRODUCTS, 'meme_swing');
  const passing = filterMemeCandidates(snapshots);
  return passing[0] ?? null;
}

