import { saveAnalysis } from '../reports/live-analysis.js';
import { collectHistoryContext, summarizeVenue } from '../market/history-context.js';
import { goldenAnalysis } from '../market/golden.js';
import { envNumber as setting, envText, envBoolean } from '../policy/env.js';
import dotenv from 'dotenv';
dotenv.config();
export const MEME_PRODUCTS = envText('MEME_PRODUCTS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
export const SHORT_PRODUCTS = envText('SCAN_PRODUCTS')
    .split(',')
    .map((s) => s.trim())
    .filter((symbol) => Boolean(symbol) && !MEME_PRODUCTS.includes(symbol));
const ROUND_TRIP_FEE_BPS = setting('ROUND_TRIP_FEE_BPS');
const MIN_EDGE_BUFFER_BPS = setting('MIN_EDGE_BUFFER_BPS');
const MIN_PROFIT_EDGE_BPS = setting('MIN_PROFIT_EDGE_BPS');
const MIN_MEME_VOLUME = setting('MEME_MIN_VOLUME_USD_24H');
const MAX_MEME_SPREAD = setting('MEME_MAX_SPREAD_BPS');
const timestamp = () => new Date().toISOString();
const log = (...args) => console.log(`[${timestamp()}]`, ...args);
const warn = (...args) => console.warn(`[${timestamp()}]`, ...args);
const error = (...args) => console.error(`[${timestamp()}]`, ...args);
const API = envText('COINBASE_MARKET_API');
let nextRequest = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getJSON(url, attempt = 0) {
    const now = Date.now();
    const waitMs = Math.max(0, nextRequest - now);
    if (waitMs > 0)
        await sleep(waitMs);
    nextRequest = Date.now() + setting('MARKET_REQUEST_INTERVAL_MS');
    const response = await fetch(url, { signal: AbortSignal.timeout(setting('MARKET_TIMEOUT_MS')) });
    if (response.status === 429) {
        if (attempt >= setting('MARKET_MAX_RETRIES'))
            throw Error('Market rate-limit retry budget exhausted');
        await sleep(setting('MARKET_RETRY_MS'));
        return getJSON(url, attempt + 1);
    }
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
export function completedCandles(raw, interval, count, now = Date.now()) {
    if (!Array.isArray(raw))
        throw new Error('Missing candle history');
    const end = Math.floor(now / 1000 / interval) * interval;
    const candles = raw
        .map((c) => ({
        start: Number(c.start),
        close: Number(c.close),
        high: Number(c.high ?? c.close),
        low: Number(c.low ?? c.close),
        volume: Number(c.volume),
    }))
        .filter((c) => c.start < end)
        .map((c) => {
        if (!Number.isFinite(c.start) || !Number.isFinite(c.close) || c.close <= 0 || !Number.isFinite(c.volume) || c.volume < 0 || !Number.isFinite(c.high) || !Number.isFinite(c.low) || c.low <= 0 || c.high < c.close || c.low > c.close)
            throw new Error('Invalid candle history');
        return c;
    })
        .sort((a, b) => a.start - b.start)
        .slice(-count);
    if (candles.length < count)
        throw new Error('Insufficient or stale history');
    const lastExpected = end - interval;
    if (candles.at(-1)?.start !== lastExpected)
        throw new Error('Insufficient or stale history');
    for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const curr = candles[i];
        if (curr.start - prev.start !== interval) {
            throw new Error('Invalid or discontinuous history');
        }
    }
    return candles;
}
export function historyFeatures(candles) {
    const last = candles.length - 1;
    const ret = (bars) => {
        if (bars <= 0 || bars >= candles.length)
            return 0;
        return candles[last].close / candles[last - bars].close - 1;
    };
    const vol = (bars) => {
        if (bars <= 0 || bars >= candles.length)
            return 0;
        const values = candles.slice(-bars).map((c) => Math.log(c.close));
        if (values.length < 2)
            return 0;
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        return Math.sqrt(variance);
    };
    return { ret, vol };
}
const candleCache = new Map();
async function getCandles(symbol, interval, granularity, count) {
    const end = Math.floor(Date.now() / 1000 / interval) * interval;
    const key = `${symbol}:${interval}`;
    const cached = candleCache.get(key);
    if (cached && cached.end === end)
        return cached.value;
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
function expectedReturnScore(s) {
    const trend = Math.abs(s.ret_5m ?? 0) * 10000;
    const microTrend = Math.abs(s.ret_15m ?? 0) * 10000;
    const crossConsensusBoost = (s.cross_exchange_sources ?? 1) * setting('EDGE_SOURCE_WEIGHT');
    const spreadPenalty = (s.spread_bps ?? s.cross_exchange_spread_bps ?? 0) * setting('EDGE_SPREAD_WEIGHT');
    const volatilityPenalty = (s.realized_vol_1m ?? 0) * 10000 * setting('EDGE_VOLATILITY_WEIGHT');
    const volumeBoost = Math.max(0, Math.log((s.volume_ratio_recent ?? s.volume_ratio_24h ?? 1) + 1) * setting('EDGE_VOLUME_WEIGHT'));
    const crossVenueDelta = Math.abs((s.cross_exchange_mid ?? s.mid ?? 0) - (s.mid ?? 0)) / Math.max(s.mid ?? 1, 1) * 10000;
    const imbalance = Math.abs(s.imbalance ?? s.cross_exchange_imbalance ?? 0) * setting('EDGE_IMBALANCE_WEIGHT');
    return Math.max(0, trend * setting('EDGE_TREND_WEIGHT') + microTrend * setting('EDGE_MICROTREND_WEIGHT') + imbalance + crossConsensusBoost + volumeBoost + crossVenueDelta - spreadPenalty - volatilityPenalty);
}
async function fetchProduct(symbol) {
    const data = await getJSON(`${API}/products/${encodeURIComponent(symbol)}`);
    return data;
}
async function fetchProductBook(symbol) {
    const data = await getJSON(`${API}/product_book?product_id=${encodeURIComponent(symbol)}&limit=10`);
    return data;
}
export async function scanProducts(products = SHORT_PRODUCTS, strategy = 'short_term') {
    const snapshots = [];
    for (const symbol of [...new Set(products)]) {
        try {
            const [meta, book] = await Promise.all([fetchProduct(symbol), fetchProductBook(symbol)]);
            if (!meta || !book)
                continue;
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
            const ask_depth_usd = asks.reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.size ?? 0), 0);
            const common = {
                mid,
                bid: bestBid, ask: bestAsk,
                base_increment: typeof meta.base_increment === 'string' ? meta.base_increment : undefined,
                base_min_size: Number(meta.base_min_size ?? 0),
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
                const candles = await getCandles(symbol, 60, 'ONE_MINUTE', setting('SHORT_HISTORY_BARS'));
                const venue_history = await collectHistoryContext(symbol, summarizeVenue('coinbase', symbol, 'USD', bestBid, bestAsk, candles), 60, candles.length);
                const golden = goldenAnalysis(candles, bestAsk, venue_history);
                const features = historyFeatures(candles);
                const ret_1m = features.ret(1);
                const ret_5m = features.ret(5);
                const ret_15m = features.ret(15);
                const window = setting('VOLUME_WINDOW_BARS');
                if (!Number.isInteger(window) || window < 1 || window >= candles.length)
                    throw Error('Invalid VOLUME_WINDOW_BARS');
                const recent = candles.slice(-window).reduce((sum, c) => sum + c.volume, 0) / window;
                const previous = candles.slice(0, -window).reduce((sum, c) => sum + c.volume, 0) / (candles.length - window);
                const volume_ratio_recent = previous > 0 ? recent / previous : 0;
                const score = expectedReturnScore({
                    ...common,
                    cross_exchange_sources: venue_history.source_count,
                    ret_5m: venue_history.mean_return_5,
                    ret_15m: venue_history.mean_return_15,
                    realized_vol_1m: features.vol(1),
                    realized_vol_5m: features.vol(5),
                    volume_ratio_recent,
                });
                snapshots.push({
                    ...common,
                    venue_history, golden,
                    cross_exchange_sources: venue_history.source_count,
                    volume_ratio_recent,
                    horizon: 'minutes',
                    ret_1m,
                    ret_5m,
                    ret_15m,
                    estimated_edge_bps: score,
                    realized_vol_1m: features.vol(1),
                    realized_vol_5m: features.vol(5),
                });
            }
            else {
                const candles = await getCandles(symbol, 3600, 'ONE_HOUR', setting('HOURLY_HISTORY_BARS'));
                const venue_history = await collectHistoryContext(symbol, summarizeVenue('coinbase', symbol, 'USD', bestBid, bestAsk, candles), 3600, candles.length);
                const golden = goldenAnalysis(candles, bestAsk, venue_history);
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
                    venue_history, golden,
                    cross_exchange_sources: venue_history.source_count,
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
        }
        catch (err) {
            log(`[${strategy}] Skip ${symbol}: ${err.message || 'market data unavailable'}`);
        }
    }
    return snapshots;
}
export function filterClearingFees(snapshots) {
    const threshold = Math.max(0, ROUND_TRIP_FEE_BPS + MIN_EDGE_BUFFER_BPS + MIN_PROFIT_EDGE_BPS);
    const sorted = [...snapshots].sort((a, b) => (b.estimated_edge_bps ?? 0) - (a.estimated_edge_bps ?? 0));
    if (sorted[0]) {
        log(`[short_term] Scanned ${snapshots.length} products`);
        log(`[short_term] Best edge proxy: ${sorted[0].symbol} ${sorted[0].estimated_edge_bps.toFixed(1)} bps (need ${threshold}; predictive score, not guaranteed profit)`);
    }
    const passing = sorted.filter((item) => item.estimated_edge_bps > threshold);
    if (envBoolean('FIB_BUY_PRIORITY'))
        passing.sort((a, b) => Number(Boolean(b.golden?.in_buy_zone)) - Number(Boolean(a.golden?.in_buy_zone)) || Number(Boolean(b.golden?.near_buy_time)) - Number(Boolean(a.golden?.near_buy_time)) || b.estimated_edge_bps - a.estimated_edge_bps);
    return passing;
}
export function filterMemeCandidates(snapshots) {
    return snapshots
        .filter((s) => s.strategy === 'meme_swing' && s.history_complete &&
        Number.isFinite(s.ret_6h) && (s.ret_6h ?? 0) > 0 &&
        Number.isFinite(s.ret_24h) && (s.ret_24h ?? 0) > 0 &&
        Number.isFinite(s.volume_usd_24h) && (s.volume_usd_24h ?? 0) >= MIN_MEME_VOLUME &&
        Number.isFinite(s.volume_ratio_24h) && (s.volume_ratio_24h ?? 0) >= 1 &&
        s.spread_bps <= MAX_MEME_SPREAD)
        .sort((a, b) => (b.volume_ratio_24h ?? 0) - (a.volume_ratio_24h ?? 0));
}
export async function buildCandidateSnapshots() {
    const snapshots = await scanProducts(SHORT_PRODUCTS, 'short_term');
    await saveAnalysis(snapshots);
    return filterClearingFees(snapshots);
}
export async function buildBestSnapshot() {
    const snapshots = await scanProducts(SHORT_PRODUCTS, 'short_term');
    return filterClearingFees(snapshots)[0] ?? null;
}
export async function buildBestMemeSnapshot() {
    const snapshots = await scanProducts(MEME_PRODUCTS, 'meme_swing');
    const passing = filterMemeCandidates(snapshots);
    return passing[0] ?? null;
}
//# sourceMappingURL=scanner.js.map