import { loggedFetch } from '../logs/http.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { envNumber, envText, envBoolean } from '../policy/env.js';
import { validateBars, summarizeVenue, fetchVenueHistory, combineHistories } from './history-context.js';
import { measuredCorrelations } from '../inference/correlations.js';
import { CoinbaseBroker } from '../broker/coinbase.js';
import { claimRunner } from '../execution/ownership.js';
async function json(url) {
    await delay(envNumber('MEME_RESEARCH_REQUEST_INTERVAL_MS'));
    const response = await loggedFetch(url, { signal: AbortSignal.timeout(envNumber('MARKET_TIMEOUT_MS')) });
    if (!response.ok)
        throw Error(`HTTP ${response.status}`);
    return response.json();
}
async function coinbaseHistory(symbol, interval, count) {
    const api = envText('COINBASE_MARKET_API'), granularity = interval === 900 ? 'FIFTEEN_MINUTE' : interval === 3600 ? 'ONE_HOUR' : 'ONE_MINUTE';
    if (count + 1 > 350)
        throw Error('Coinbase research count exceeds one-page limit');
    const end = Math.floor(Date.now() / 1000 / interval) * interval;
    const meta = await json(`${api}/products/${encodeURIComponent(symbol)}`);
    if (meta.product_type !== 'SPOT' || meta.quote_currency_id !== 'USD' || meta.status !== 'online')
        throw Error('Unavailable Coinbase USD spot product');
    const params = new URLSearchParams({ start: String(end - (count + 1) * interval), end: String(end), granularity, limit: String(count + 1) });
    const [book, data] = await Promise.all([json(`${api}/product_book?product_id=${encodeURIComponent(symbol)}&limit=10`), json(`${api}/products/${encodeURIComponent(symbol)}/candles?${params}`)]);
    const raw = (data.candles ?? []).map((b) => ({ start: Number(b.start), open: Number(b.open), close: Number(b.close), high: Number(b.high), low: Number(b.low), volume: Number(b.volume) }));
    let bars;
    try {
        bars = validateBars(raw, interval, count);
    }
    catch (error) {
        const dir = path.join(process.cwd(), 'research/meme-live/partial', symbol);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `coinbase-${interval}.json`), JSON.stringify({ symbol, exchange: 'coinbase', interval_seconds: interval, quality: 'incomplete_or_stale_not_used_for_signals', reason: error.message, received_at: new Date().toISOString(), candles: raw }));
        throw error;
    }
    return summarizeVenue('coinbase', symbol, 'USD', Number(book.pricebook?.bids?.[0]?.price), Number(book.pricebook?.asks?.[0]?.price), bars);
}
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : null; };
const ret = (bars, n) => bars.length > n ? bars.at(-1).close / bars[bars.length - 1 - n].close - 1 : null;
export function memeMetrics(symbol, context, interval, feeBps, benchmarkReturn) {
    const horizon = envNumber('MEME_RESEARCH_HORIZON_HOURS') * 3600 / interval;
    if (!Number.isInteger(horizon) || horizon < 1)
        throw Error('Horizon must contain a whole number of research bars');
    const returns = context.venues.flatMap(v => { const value = ret(v.candles, horizon); return value === null ? [] : [value]; });
    const momentum = median(returns), agreement = returns.length ? returns.filter(v => v > 0).length / returns.length : 0;
    const cb = context.venues.find(v => v.exchange === 'coinbase');
    const spread = cb ? (cb.ask - cb.bid) / ((cb.ask + cb.bid) / 2) * 10000 : null;
    const costs = spread === null ? null : feeBps * 2 + envNumber('SLIPPAGE_BUFFER_BPS') + spread;
    const volume = cb ? cb.candles.slice(-Math.round(86400 / interval)).reduce((sum, b) => sum + b.close * b.volume, 0) : null;
    const forward = [];
    if (cb)
        for (let i = horizon; i + horizon < cb.candles.length; i += horizon) {
            if (cb.candles[i].close > cb.candles[i - horizon].close)
                forward.push((cb.candles[i + horizon].close / cb.candles[i].close - 1) * 10000 - (costs ?? 0));
        }
    const split = Math.floor(forward.length * (1 - envNumber('MEME_RESEARCH_HOLDOUT_FRACTION'))), test = forward.slice(split);
    const reasons = [];
    if (!cb)
        reasons.push('Coinbase intraday history/quote unavailable for this screen');
    if (context.source_count < envNumber('MIN_HISTORY_SOURCES'))
        reasons.push('insufficient venue history coverage');
    if (volume === null || volume < envNumber('MEME_MIN_VOLUME_USD_24H'))
        reasons.push('Coinbase quote-volume screen failed');
    if (agreement < envNumber('DETERMINISTIC_MIN_UPWARD_FRACTION'))
        reasons.push('insufficient upward agreement');
    if (momentum === null || costs === null || momentum * 10000 <= costs)
        reasons.push('trailing momentum does not clear current estimated costs');
    const phi = envNumber('GOLDEN_RATIO'), recent = cb?.candles.slice(-envNumber('FIB_LOOKBACK_BARS')) ?? [];
    const low = recent.length ? Math.min(...recent.map(b => b.low)) : null, high = recent.length ? Math.max(...recent.map(b => b.high)) : null;
    return { symbol, horizon_hours: envNumber('MEME_RESEARCH_HORIZON_HOURS'), source_count: context.source_count, venues: context.venues.map(v => ({ exchange: v.exchange, pair: v.pair, quote: v.quote, bid: v.bid, ask: v.ask, received_at: v.receivedAt })), unavailable: context.unavailable,
        median_horizon_return_bps: momentum === null ? null : momentum * 10000, relative_to_btc_bps: momentum === null || benchmarkReturn === null ? null : (momentum - benchmarkReturn) * 10000, upward_agreement: agreement, coinbase_spread_bps: spread, coinbase_24h_quote_turnover_estimate_usd: volume, estimated_round_trip_cost_bps: costs,
        trailing_momentum_after_cost_proxy_bps: momentum === null || costs === null ? null : momentum * 10000 - costs,
        fibonacci_projection: low === null || high === null ? null : { buy_zone_low: high - (high - low) / phi, buy_zone_high: high - (high - low) / (phi * phi), extension_target: high + (high - low) * (phi - 1), heuristic: true },
        historical_scenario: { method: 'Non-overlapping forward horizon returns after a positive trailing horizon; chronological split; current spread/fees used as a cost scenario, not reconstructed historical executions', total_signals: forward.length, holdout_signals: test.length, mean_holdout_net_bps: test.length ? test.reduce((a, b) => a + b, 0) / test.length : null, holdout_win_fraction: test.length ? test.filter(v => v > 0).length / test.length : null, status: test.length >= envNumber('MEME_RESEARCH_MIN_HOLDOUT_SIGNALS') ? 'exploratory' : 'insufficient_samples' },
        research_candidate: reasons.length === 0, screen_reasons: reasons, execution_blockers: envBoolean('ZERO_FEE_ENTRIES_ONLY') && feeBps > 0 ? ['Verified Coinbase API fees are positive; zero-fee entry instruction blocks execution'] : [], not_a_profit_forecast: true };
}
async function archive(symbol, interval, venue) {
    const dir = path.join(process.cwd(), 'research/meme-live/history', symbol, venue.exchange);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${interval}.json`);
    let prior = [];
    try {
        prior = JSON.parse(await fs.readFile(file, 'utf8')).candles ?? [];
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const bars = new Map(prior.map(b => [b.start, b]));
    for (const b of venue.candles)
        bars.set(b.start, b);
    const data = { symbol, exchange: venue.exchange, pair: venue.pair, quote: venue.quote, interval_seconds: interval, updated_at: new Date().toISOString(), candles: [...bars.values()].sort((a, b) => a.start - b.start).slice(-envNumber('MEME_RESEARCH_MAX_ARCHIVE_BARS')) };
    await fs.writeFile(file + '.tmp', JSON.stringify(data));
    await fs.rename(file + '.tmp', file);
}
export async function researchMemes() {
    const release = claimRunner(path.join(process.cwd(), 'state/meme-research.pid'));
    try {
        const symbols = [...new Set([...envText('MEME_PRODUCTS').split(','), envText('MEME_BENCHMARK_PRODUCT')].map(s => s.trim()).filter(Boolean))];
        if (symbols.some(s => !/^\w+-USD$/.test(s)))
            throw Error('Invalid meme research symbol');
        const windows = envText('MEME_RESEARCH_WINDOWS').split(',').map(s => s.split(':').map(Number));
        if (windows.some(([i, n]) => ![60, 900, 3600].includes(i) || !Number.isInteger(n) || n < 32 || n > 349))
            throw Error('Invalid meme history windows');
        const exchanges = ['coinbase', ...envText('ANALYSIS_EXCHANGES').split(',').map(s => s.trim()).filter(Boolean)];
        if (exchanges.some(e => !['coinbase', 'binance.com', 'binance.us', 'crypto.com'].includes(e)))
            throw Error('Invalid meme research venue');
        let feeBps, feeSource;
        try {
            feeBps = await new CoinbaseBroker().spotTakerFeeRate() * 10000;
            feeSource = 'verified Coinbase account spot taker fee';
        }
        catch {
            feeBps = envNumber('BUY_FEE_BPS');
            feeSource = 'configured unverified fee fallback';
        }
        const records = [];
        for (const symbol of symbols) {
            const contexts = {}, failures = [];
            for (const [interval, count] of windows) {
                const results = await Promise.allSettled(exchanges.map(exchange => exchange === 'coinbase' ? coinbaseHistory(symbol, interval, count) : fetchVenueHistory(exchange, symbol, interval, count)));
                const venues = [], unavailable = [];
                for (let i = 0; i < results.length; i++) {
                    const r = results[i];
                    if (r.status === 'fulfilled') {
                        venues.push(r.value);
                        await archive(symbol, interval, r.value);
                    }
                    else
                        unavailable.push({ exchange: exchanges[i], reason: String(r.reason?.message ?? r.reason) });
                }
                if (venues.length)
                    contexts[String(interval)] = combineHistories(venues, unavailable);
                else
                    failures.push({ interval, unavailable });
            }
            records.push({ symbol, contexts, failures });
            console.log(`[meme-research] ${symbol}: ${Object.values(contexts).reduce((n, c) => n + c.venues.reduce((sum, v) => sum + v.candles.length, 0), 0)} validated candles`);
        }
        const primary = windows[0][0], benchmark = records.find(r => r.symbol === envText('MEME_BENCHMARK_PRODUCT'))?.contexts[String(primary)];
        const horizon = envNumber('MEME_RESEARCH_HORIZON_HOURS') * 3600 / primary;
        const benchmarkReturn = benchmark ? median(benchmark.venues.flatMap(v => { const r = ret(v.candles, horizon); return r === null ? [] : [r]; })) : null;
        const candidates = records.filter(r => r.symbol !== envText('MEME_BENCHMARK_PRODUCT') && r.contexts[String(primary)]).map(r => memeMetrics(r.symbol, r.contexts[String(primary)], primary, feeBps, benchmarkReturn)).sort((a, b) => Number(b.research_candidate) - Number(a.research_candidate) || (b.relative_to_btc_bps ?? -Infinity) - (a.relative_to_btc_bps ?? -Infinity) || (b.trailing_momentum_after_cost_proxy_bps ?? -Infinity) - (a.trailing_momentum_after_cost_proxy_bps ?? -Infinity));
        const correlations = measuredCorrelations(records.filter(r => r.contexts[String(primary)]).map(r => ({ symbol: r.symbol, venue_history: r.contexts[String(primary)] })), primary);
        const report = { timestamp: new Date().toISOString(), horizon_hours: envNumber('MEME_RESEARCH_HORIZON_HOURS'), fee_bps_per_side: feeBps, fee_source: feeSource, benchmark: envText('MEME_BENCHMARK_PRODUCT'), candidates, coverage: records.map(r => ({ symbol: r.symbol, intervals: Object.keys(r.contexts), failures: r.failures })), correlations, notes: ['Research ranking, not a recommendation or profit guarantee.', 'Token unit price is not used to rank returns.', 'Native USD and USDT prices are labelled separately; normalized returns are compared.', 'Missing venues remain explicit; no fabricated prices or histories.'] };
        const dir = path.join(process.cwd(), 'reports');
        await fs.mkdir(dir, { recursive: true });
        const file = path.join(dir, 'meme-research.json');
        await fs.writeFile(file + '.tmp', JSON.stringify(report, null, 2));
        await fs.rename(file + '.tmp', file);
        const state = path.join(process.cwd(), 'state/meme-research-schedule.json');
        await fs.writeFile(state, JSON.stringify({ nextRun: Date.now() + envNumber('MEME_RESEARCH_INTERVAL_MS') }));
        return report;
    }
    finally {
        release();
    }
}
let running = false, next = 0;
export function scheduleMemeResearch() {
    if (!envBoolean('MEME_RESEARCH_ENABLED') || running || Date.now() < next)
        return;
    running = true;
    next = Date.now() + envNumber('MEME_RESEARCH_INTERVAL_MS');
    void (async () => { try {
        const state = JSON.parse(await fs.readFile(path.join(process.cwd(), 'state/meme-research-schedule.json'), 'utf8'));
        if (state.nextRun > Date.now()) {
            next = state.nextRun;
            return;
        }
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    } const report = await researchMemes(); console.log(`[meme-research] ${report.candidates.length} candidates saved`); })().catch(error => console.error('[meme-research]', error.message)).finally(() => { running = false; });
}
//# sourceMappingURL=meme-research.js.map