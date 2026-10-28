import dotenv from 'dotenv';
dotenv.config();

const readNumber = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export const MEME_PRODUCTS = (process.env.MEME_PRODUCTS || 'DOGE-USD,SHIB-USD,PEPE-USD,BONK-USD,WIF-USD,FLOKI-USD,FARTCOIN-USD,PENGU-USD,TOSHI-USD,TRUMP-USD').split(',').map(s => s.trim()).filter(Boolean);
const PRODUCTS = (process.env.SCAN_PRODUCTS || 'BTC-USD,ETH-USD,SOL-USD,XRP-USD').split(',').map(s => s.trim()).filter(Boolean);
export const SHORT_PRODUCTS = [...new Set(PRODUCTS)].filter(s => !MEME_PRODUCTS.includes(s));

const FEE_BPS = readNumber('ROUND_TRIP_FEE_BPS', 150);
const EDGE_BUFFER_BPS = readNumber('MIN_EDGE_BUFFER_BPS', 50);
const MIN_PROFIT_EDGE_BPS = readNumber('MIN_PROFIT_EDGE_BPS', 10);
const MIN_PROFIT_CONFIDENCE = readNumber('MIN_PROFIT_CONFIDENCE', 0.55);
const MIN_MEME_VOLUME = readNumber('MEME_MIN_VOLUME_USD_24H', 1000000);
const MAX_MEME_SPREAD = readNumber('MEME_MAX_SPREAD_BPS', 30);

export interface MarketSnapshot {
  mid: number;
  spread_bps: number;
  imbalance: number;
  realized_vol_1m?: number;
  realized_vol_5m?: number;
  ret_1m?: number;
  ret_5m?: number;
  ret_15m?: number;
  timestamp: string;
  symbol: string;
  estimated_edge_bps: number;
  expected_return_bps: number;
  prediction_confidence: number;
  predicted_direction: 'long' | 'short' | 'neutral';
  strategy: 'short_term' | 'meme_swing';
  horizon: string;
  history_complete: boolean;
  account_state_available: false;
  quote_min_size: number;
  quote_max_size: number;
  ask_depth_usd: number;
  ret_1h?: number;
  ret_6h?: number;
  ret_24h?: number;
  realized_vol_24h?: number;
  volume_usd_24h?: number;
  volume_ratio_24h?: number;
}

type Candle = { start: number; close: number; volume: number };
const API = 'https://api.coinbase.com/api/v3/brokerage/market';
let nextRequest = 0;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function get(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const slot = Math.max(Date.now(), nextRequest);
    nextRequest = slot + 600;
    await delay(Math.max(0, slot - Date.now()));
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 5000 * 2 ** attempt;
      nextRequest = Math.max(nextRequest, Date.now() + Math.min(60000, backoff));
      await response.body?.cancel();
      if (attempt === 2) throw new Error('Rate limited; retry budget exhausted');
      continue;
    }
    if (!response.ok) throw new Error(`Market data HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('Market data unavailable');
}

export function completedCandles(raw: any[], interval: number, count: number, now = Date.now()): Candle[] {
  if (!Array.isArray(raw)) throw new Error('Missing candle history');
  const end = Math.floor(now / 1000 / interval) * interval;
  const candles = raw
    .map(c => ({ start: Number(c.start), close: Number(c.close), volume: Number(c.volume) }))
    .filter(c => c.start < end)
    .sort((a, b) => a.start - b.start)
    .slice(-count);

  if (candles.length < count || candles.at(-1)!.start !== end - interval) throw new Error('Insufficient or stale history');

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!Number.isFinite(c.start) || !Number.isFinite(c.close) || c.close <= 0 || !Number.isFinite(c.volume) || c.volume < 0 || c.start % interval !== 0 || (i > 0 && c.start - candles[i - 1].start !== interval)) {
      throw new Error('Invalid or discontinuous history');
    }
  }
  return candles;
}

export function historyFeatures(c: Candle[]) {
  const last = c.length - 1;
  const ret = (bars: number) => c[last].close / c[last - bars].close - 1;
  const vol = (bars: number) => {
    const r = c.slice(-bars - 1).slice(1).map((v, i) => Math.log(v.close / c[c.length - bars - 1 + i].close));
    return Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  };
  return { ret, vol };
}

const candleCache = new Map<string, { end: number; value: Candle[] }>();
async function candles(symbol: string, interval: number, granularity: string, count: number) {
  const end = Math.floor(Date.now() / 1000 / interval) * interval;
  const key = `${symbol}:${interval}`;
  const cached = candleCache.get(key);
  if (cached?.end === end) return cached.value;
  const query = new URLSearchParams({ start: String(end - (count + 5) * interval), end: String(end), granularity, limit: String(count + 5) });
  const data = await get(`${API}/products/${encodeURIComponent(symbol)}/candles?${query}`);
  const value = completedCandles(data.candles, interval, count);
  candleCache.set(key, { end, value });
  return value;
}

const metadata = new Map<string, { expires: number; value: any }>();
async function product(symbol: string) {
  const cached = metadata.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await get(`${API}/products/${encodeURIComponent(symbol)}`);
  metadata.set(symbol, { expires: Date.now() + 300000, value });
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function expectedReturnScore(s: Partial<MarketSnapshot>): { expected_return_bps: number; prediction_confidence: number; predicted_direction: 'long' | 'short' | 'neutral' } {
  const trend = Math.abs(s.ret_5m ?? 0) * 10000;
  const microTrend = Math.abs(s.ret_15m ?? 0) * 10000;
  const imbalance = Math.abs(s.imbalance ?? 0) * 500;
  const spreadPenalty = (s.spread_bps ?? 0) * 2.5;
  const volatilityPenalty = (s.realized_vol_1m ?? 0) * 10000 * 1.5;
  const volumeBoost = Math.max(0, Math.log((s.volume_ratio_24h ?? 1) + 1) * 250);

  const expected = Math.max(0, trend * 1.4 + microTrend * 0.8 + imbalance + volumeBoost - spreadPenalty - volatilityPenalty);
  const rawConfidence = clamp(((Math.abs(s.ret_5m ?? 0) + Math.abs(s.ret_15m ?? 0) + Math.abs(s.imbalance ?? 0)) / 0.12), 0, 1);
  const direction = (s.ret_5m ?? 0) >= 0 ? 'long' : 'short';

  return {
    expected_return_bps: Number.isFinite(expected) ? expected : 0,
    prediction_confidence: Number.isFinite(rawConfidence) ? rawConfidence : 0,
    predicted_direction: direction,
  };
}

export async function scanProducts(products = SHORT_PRODUCTS, strategy: 'short_term' | 'meme_swing' = 'short_term'): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];
  for (const symbol of [...new Set(products)]) {
    try {
      const [info, book] = await Promise.all([product(symbol), get(`${API}/product_book?product_id=${encodeURIComponent(symbol)}&limit=10`)]);
      if (info.product_type !== 'SPOT' || info.quote_currency_id !== 'USD' || info.status !== 'online' || info.trading_disabled || info.is_disabled || info.view_only || info.cancel_only || info.limit_only || info.post_only) {
        throw new Error('Not a live USD spot product');
      }
      const bids = book.pricebook?.bids;
      const asks = book.pricebook?.asks;
      const bid = Number(bids?.[0]?.price), ask = Number(asks?.[0]?.price);
      const bidSize = Number(bids?.[0]?.size), askSize = Number(asks?.[0]?.size);
      if (![bid, ask, bidSize, askSize].every(v => Number.isFinite(v) && v > 0) || ask < bid) throw new Error('Invalid order book');
      const time = Date.parse(book.pricebook?.time);
      if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 60000) throw new Error('Stale order book');
      const mid = (bid + ask) / 2;
      const spread_bps = (ask - bid) / mid * 10000;
      const quote_min_size = Number(info.quote_min_size), quote_max_size = Number(info.quote_max_size);
      const ask_depth_usd = asks.reduce((sum: number, a: any) => sum + Number(a.price) * Number(a.size), 0);
      if (!Number.isFinite(quote_min_size) || quote_min_size < 0 || !Number.isFinite(quote_max_size) || quote_max_size < 5 || quote_min_size > 10 || !Number.isFinite(ask_depth_usd) || ask_depth_usd < 1000) {
        throw new Error('Quote or depth invalid');
      }

      const common = {
        mid,
        spread_bps,
        imbalance: (bidSize - askSize) / (bidSize + askSize),
        timestamp: new Date().toISOString(),
        symbol,
        strategy,
        horizon: '',
        history_complete: true,
        account_state_available: false as const,
        quote_min_size,
        quote_max_size,
        ask_depth_usd,
      };

      if (strategy === 'short_term') {
        const c = await candles(symbol, 60, 'ONE_MINUTE', 31);
        const f = historyFeatures(c);
        const ret_1m = f.ret(1), ret_5m = f.ret(5), ret_15m = f.ret(15);
        const realized_vol_1m = f.vol(1), realized_vol_5m = f.vol(5);
        const score = expectedReturnScore({
          ...common,
          ret_5m,
          ret_15m,
          realized_vol_1m,
          realized_vol_5m,
          spread_bps,
          volume_ratio_24h: 1.1,
        });
        snapshots.push({
          ...common,
          horizon: 'minutes',
          realized_vol_1m,
          realized_vol_5m,
          ret_1m,
          ret_5m,
          ret_15m,
          estimated_edge_bps: score.expected_return_bps,
          expected_return_bps: score.expected_return_bps,
          prediction_confidence: score.prediction_confidence,
          predicted_direction: score.predicted_direction,
        });
      } else {
        const c = await candles(symbol, 3600, 'ONE_HOUR', 49);
        const f = historyFeatures(c);
        const volume = (bars: Candle[]) => bars.reduce((sum, v) => sum + v.close * v.volume, 0);
        const volume_usd_24h = volume(c.slice(-24));
        const previous = volume(c.slice(-48, -24));
        const ret_1h = f.ret(1), ret_6h = f.ret(6), ret_24h = f.ret(24);
        if (previous <= 0) throw new Error('Missing previous-day volume');
        const score = expectedReturnScore({
          ...common,
          ret_5m: ret_6h,
          ret_15m: ret_24h,
          realized_vol_1m: f.vol(1),
          realized_vol_5m: f.vol(24),
          spread_bps,
          volume_ratio_24h: volume_usd_24h / previous,
        });
        snapshots.push({
          ...common,
          horizon: '24–72 hours; momentum screening',
          ret_1h,
          ret_6h,
          ret_24h,
          realized_vol_24h: f.vol(24),
          volume_usd_24h,
          volume_ratio_24h: volume_usd_24h / previous,
          estimated_edge_bps: score.expected_return_bps,
          expected_return_bps: score.expected_return_bps,
          prediction_confidence: score.prediction_confidence,
          predicted_direction: score.predicted_direction,
        });
      }
    } catch (err: any) {
      console.log(`[${strategy}] Skip ${symbol}: ${err.message}`);
    }
  }
  return snapshots;
}

export function filterClearingFees(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  const threshold = Math.max(0, MIN_PROFIT_EDGE_BPS + FEE_BPS + EDGE_BUFFER_BPS);
  const sorted = [...snapshots].sort((a, b) => b.expected_return_bps - a.expected_return_bps);
  console.log(`[short_term] Scanned ${snapshots.length} products`);
  if (sorted[0]) console.log(`[short_term] Best edge proxy: ${sorted[0].symbol} ${sorted[0].expected_return_bps.toFixed(1)} bps (need ${threshold}; predictive score, not guaranteed profit)`);
  return sorted.filter(s => s.expected_return_bps > threshold && s.prediction_confidence >= MIN_PROFIT_CONFIDENCE);
}

export function filterMemeCandidates(snapshots: MarketSnapshot[]): MarketSnapshot[] {
  return snapshots.filter(s => s.strategy === 'meme_swing' && s.history_complete &&
    Number.isFinite(s.ret_6h) && s.ret_6h! > 0 &&
    Number.isFinite(s.ret_24h) && s.ret_24h! > 0 &&
    Number.isFinite(s.volume_usd_24h) && s.volume_usd_24h! >= MIN_MEME_VOLUME &&
    Number.isFinite(s.volume_ratio_24h) && s.volume_ratio_24h! >= 1 &&
    s.spread_bps <= MAX_MEME_SPREAD &&
    s.prediction_confidence >= MIN_PROFIT_CONFIDENCE)
    .sort((a, b) => (b.volume_ratio_24h ?? 0) - (a.volume_ratio_24h ?? 0));
}

export async function buildBestSnapshot(): Promise<MarketSnapshot | null> {
  return filterClearingFees(await scanProducts())[0] || null;
}

export async function buildBestMemeSnapshot(): Promise<MarketSnapshot | null> {
  const all = await scanProducts(MEME_PRODUCTS, 'meme_swing');
  const passing = filterMemeCandidates(all);
  console.log(`[meme_swing] Scanned ${all.length}/${MEME_PRODUCTS.length}; ${passing.length} passed positive momentum and confidence screen`);
  return passing[0] || null;
}

