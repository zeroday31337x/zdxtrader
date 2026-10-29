import { loggedFetch } from '../logs/http.js';
import fs from 'node:fs/promises';
import { envText, envNumber } from '../policy/env.js';
const assets = ['FARTCOIN', 'TOSHI'];
const overrides = JSON.parse(envText('VENUE_SYMBOL_OVERRIDES'));
const probes = [];
async function request(exchange, route, url) {
    try {
        const res = await loggedFetch(url, { signal: AbortSignal.timeout(envNumber('EXTERNAL_MARKET_TIMEOUT_MS')) });
        let data;
        const raw = await res.text();
        try {
            data = JSON.parse(raw);
        }
        catch {
            data = { message: raw.slice(0, 250) };
        }
        const record = { exchange, route, httpStatus: res.status, code: data.code ?? null, message: data.msg ?? data.message ?? null };
        probes.push(record);
        return { record, data };
    }
    catch (error) {
        const record = { exchange, route, error: error.message };
        probes.push(record);
        return null;
    }
}
const binance = envText('BINANCE_COM_API').replace(/\/$/, '');
const crypto = envText('CRYPTO_COM_API').replace(/\/$/, '');
for (const asset of assets) {
    await request('binance.com', `${asset}USDT/book`, `${binance}/api/v3/ticker/bookTicker?symbol=${asset}USDT`);
    await request('crypto.com', `${asset}_USDT/book`, `${crypto}/public/get-book?instrument_name=${asset}_USDT&depth=10`);
    const mapping = overrides['crypto.com']?.[`${asset}-USD`];
    const pair = typeof mapping === 'string' ? mapping : mapping?.pair;
    if (pair && pair !== `${asset}_USDT`) {
        await request('crypto.com', `${pair}/configured-book`, `${crypto}/public/get-book?instrument_name=${pair}&depth=10`);
        await request('crypto.com', `${pair}/configured-candles`, `${crypto}/public/get-candlestick?instrument_name=${pair}&timeframe=15m&count=289`);
    }
}
const [binanceInfo, cryptoInfo] = await Promise.all([request('binance.com', 'exchangeInfo', `${binance}/api/v3/exchangeInfo`), request('crypto.com', 'get-instruments', `${crypto}/public/get-instruments`)]);
const listings = { binance: (binanceInfo?.data.symbols ?? []).filter((s) => assets.includes(s.baseAsset)).map((s) => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset, status: s.status })), crypto: (cryptoInfo?.data.result?.data ?? cryptoInfo?.data.result?.instruments ?? []).filter((s) => assets.includes(s.base_ccy) || assets.some(a => String(s.symbol ?? s.instrument_name).startsWith(a + '_'))).map((s) => ({ symbol: s.symbol ?? s.instrument_name, base: s.base_ccy, quote: s.quote_ccy, type: s.inst_type, tradable: s.tradable })) };
const report = { timestamp: new Date().toISOString(), probes, listings };
await fs.mkdir('reports', { recursive: true });
await fs.writeFile('reports/venue-diagnostics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
//# sourceMappingURL=diagnose-venues.js.map