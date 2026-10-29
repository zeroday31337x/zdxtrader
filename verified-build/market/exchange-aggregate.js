const symbolMap = {
    'BTC-USD': { binance: 'BTCUSDT', kraken: 'XBTUSD', crypto: 'BTC_USDT' },
    'ETH-USD': { binance: 'ETHUSDT', kraken: 'ETHUSD', crypto: 'ETH_USDT' },
    'SOL-USD': { binance: 'SOLUSDT', kraken: 'SOLUSD', crypto: 'SOL_USDT' },
    'XRP-USD': { binance: 'XRPUSDT', kraken: 'XRPUSD', crypto: 'XRP_USDT' },
    'DOGE-USD': { binance: 'DOGEUSDT', kraken: 'DOGEUSD', crypto: 'DOGE_USDT' },
    'ADA-USD': { binance: 'ADAUSDT', kraken: 'ADAUSD', crypto: 'ADA_USDT' },
    'AVAX-USD': { binance: 'AVAXUSDT', kraken: 'AVAXUSD', crypto: 'AVAX_USDT' },
    'LINK-USD': { binance: 'LINKUSDT', kraken: 'LINKUSD', crypto: 'LINK_USDT' },
    'NEAR-USD': { binance: 'NEARUSDT', kraken: 'NEARUSD', crypto: 'NEAR_USDT' },
    'SUI-USD': { binance: 'SUIUSDT', kraken: 'SUIUSD', crypto: 'SUI_USDT' },
    'SEI-USD': { binance: 'SEIUSDT', kraken: 'SEIUSD', crypto: 'SEI_USDT' },
    'APT-USD': { binance: 'APTUSDT', kraken: 'APTUSD', crypto: 'APT_USDT' },
    'FET-USD': { binance: 'FETUSDT', kraken: 'FETUSD', crypto: 'FET_USDT' },
    'WLD-USD': { binance: 'WLDUSDT', kraken: 'WLDUSD', crypto: 'WLD_USDT' },
    'ONDO-USD': { binance: 'ONDOUSDT', kraken: 'ONDOUSD', crypto: 'ONDO_USDT' },
    'RENDER-USD': { binance: 'RENDERUSDT', kraken: 'RENDERUSD', crypto: 'RNDR_USDT' },
    'ZRO-USD': { binance: 'ZROUSDT', kraken: 'ZROUSD', crypto: 'ZRO_USDT' },
    'AERO-USD': { binance: 'AERUSDT', kraken: 'AEROUSD', crypto: 'AERO_USDT' },
    'SHIB-USD': { binance: 'SHIBUSDT', kraken: 'SHIBUSD', crypto: 'SHIB_USDT' },
    'PEPE-USD': { binance: 'PEPEUSDT', kraken: 'PEPEUSD', crypto: 'PEPE_USDT' },
    'BONK-USD': { binance: 'BONKUSDT', kraken: 'BONKUSD', crypto: 'BONK_USDT' },
    'WIF-USD': { binance: 'WIFUSDT', kraken: 'WIFUSD', crypto: 'WIF_USDT' },
    'FLOKI-USD': { binance: 'FLOKIUSDT', kraken: 'FLOKIUSD', crypto: 'FLOKI_USDT' },
    'PENGU-USD': { binance: 'PENGUSDT', kraken: 'PENGUSD', crypto: 'PENGU_USDT' },
    'TOSHI-USD': { binance: 'TOSHIUSDT', kraken: 'TOSHIUSD', crypto: 'TOSHI_USDT' },
    'TRUMP-USD': { binance: 'TRUMPUSDT', kraken: 'TRUMPUSD', crypto: 'TRUMP_USDT' },
    'FARTCOIN-USD': { binance: 'FARTCOINUSDT', kraken: 'FARTCOINUSD', crypto: 'FARTCOIN_USDT' },
};
function mapSymbol(symbol, exchange) {
    const mapping = symbolMap[symbol];
    if (!mapping)
        return symbol.replace(/-/g, '').replace(/USD$/i, 'USDT');
    return mapping[exchange === 'crypto.com' ? 'crypto' : exchange];
}
async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
async function fetchBinanceBook(symbol) {
    try {
        const pair = mapSymbol(symbol, 'binance');
        const data = await fetchJson(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(pair)}`);
        const bid = Number(data.bidPrice), ask = Number(data.askPrice);
        const bidSize = Number(data.bidQty), askSize = Number(data.askQty);
        if (![bid, ask, bidSize, askSize].every(value => Number.isFinite(value) && value > 0))
            return null;
        const mid = (bid + ask) / 2;
        const spread_bps = ((ask - bid) / mid) * 10000;
        const imbalance = (bidSize - askSize) / (bidSize + askSize);
        return { exchange: 'binance', mid, spread_bps, imbalance, bid, ask, bidSize, askSize };
    }
    catch {
        return null;
    }
}
async function fetchKrakenBook(symbol) {
    try {
        const pair = mapSymbol(symbol, 'kraken');
        const data = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
        const pairKey = Object.keys(data?.result ?? {}).find(key => key.toUpperCase() === pair.toUpperCase());
        const result = pairKey ? data.result[pairKey] : null;
        if (!result)
            return null;
        const bid = Number(result.b?.[0]), ask = Number(result.a?.[0]);
        const bidSize = Number(result.b?.[1]), askSize = Number(result.a?.[1]);
        if (![bid, ask, bidSize, askSize].every(value => Number.isFinite(value) && value > 0))
            return null;
        const mid = (bid + ask) / 2;
        const spread_bps = ((ask - bid) / mid) * 10000;
        const imbalance = (bidSize - askSize) / (bidSize + askSize);
        return { exchange: 'kraken', mid, spread_bps, imbalance, bid, ask, bidSize, askSize };
    }
    catch {
        return null;
    }
}
async function fetchCryptoBook(symbol) {
    try {
        const pair = mapSymbol(symbol, 'crypto.com');
        const body = JSON.stringify({ method: 'public/get-book', params: { instrument_name: pair }, id: 1 });
        const response = await fetch('https://api.crypto.com/v2/public/get-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        const book = data?.result;
        if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks))
            return null;
        const bid = Number(book.bids[0]?.[0]), ask = Number(book.asks[0]?.[0]);
        const bidSize = Number(book.bids[0]?.[1]), askSize = Number(book.asks[0]?.[1]);
        if (![bid, ask, bidSize, askSize].every(value => Number.isFinite(value) && value > 0))
            return null;
        const mid = (bid + ask) / 2;
        const spread_bps = ((ask - bid) / mid) * 10000;
        const imbalance = (bidSize - askSize) / (bidSize + askSize);
        return { exchange: 'crypto.com', mid, spread_bps, imbalance, bid, ask, bidSize, askSize };
    }
    catch {
        return null;
    }
}
export async function aggregateExchangeContext(symbol) {
    const snapshots = await Promise.all([
        fetchBinanceBook(symbol),
        fetchKrakenBook(symbol),
        fetchCryptoBook(symbol),
    ]);
    const valid = snapshots.filter((item) => Boolean(item));
    if (!valid.length)
        return null;
    const count = valid.length;
    const weightedMid = valid.reduce((sum, item) => sum + item.mid, 0) / count;
    const weightedSpread = valid.reduce((sum, item) => sum + item.spread_bps, 0) / count;
    const weightedImbalance = valid.reduce((sum, item) => sum + item.imbalance, 0) / count;
    return {
        mid: weightedMid,
        spread_bps: weightedSpread,
        imbalance: weightedImbalance,
        source_count: count,
        exchanges: valid.map(item => item.exchange),
    };
}
//# sourceMappingURL=exchange-aggregate.js.map