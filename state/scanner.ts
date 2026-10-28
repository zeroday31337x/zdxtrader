import dotenv from 'dotenv';
dotenv.config();

export const MEME_PRODUCTS = (process.env.MEME_PRODUCTS || 'DOGE-USD,SHIB-USD,PEPE-USD,BONK-USD,WIF-USD,FLOKI-USD,FARTCOIN-USD,PENGU-USD,TOSHI-USD,TRUMP-USD').split(',').map(s=>s.trim()).filter(Boolean);
const PRODUCTS = (process.env.SCAN_PRODUCTS || 'BTC-USD,ETH-USD,SOL-USD,XRP-USD').split(',').map(s=>s.trim()).filter(Boolean);
export const SHORT_PRODUCTS = [...new Set(PRODUCTS)].filter(s=>!MEME_PRODUCTS.includes(s));
function setting(name: string, fallback: number) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}
const FEE_BPS = setting('ROUND_TRIP_FEE_BPS',150);
const EDGE_BUFFER_BPS = setting('MIN_EDGE_BUFFER_BPS',50);
const MIN_MEME_VOLUME = setting('MEME_MIN_VOLUME_USD_24H',1000000);
const MAX_MEME_SPREAD = setting('MEME_MAX_SPREAD_BPS',30);

export interface MarketSnapshot {
  mid: number; spread_bps: number; imbalance: number;
  realized_vol_1m?: number; realized_vol_5m?: number;
  ret_1m?: number; ret_5m?: number; ret_15m?: number;
  timestamp: string; symbol: string; estimated_edge_bps: number;
  strategy: 'short_term' | 'meme_swing'; horizon: string;
  history_complete: boolean; account_state_available: false;
  quote_min_size: number; quote_max_size: number; ask_depth_usd: number;
  ret_1h?: number; ret_6h?: number; ret_24h?: number;
  realized_vol_24h?: number; volume_usd_24h?: number; volume_ratio_24h?: number;
}
type Candle = {start:number;close:number;volume:number};
const API='https://api.coinbase.com/api/v3/brokerage/market';
// Shared pacing covers metadata, books and both candle timeframes.
let nextRequest = 0;
const delay = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
async function get(url: string): Promise<any> {
  for(let attempt=0;attempt<3;attempt++) {
    const slot=Math.max(Date.now(),nextRequest);
    nextRequest=slot+600; // <= 1.7 public requests/sec across both strategies
    await delay(Math.max(0,slot-Date.now()));
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(response.status===429) {
      const retry=Number(response.headers.get('retry-after'));
      const backoff=Number.isFinite(retry)&&retry>0?retry*1000:5000*2**attempt;
      nextRequest=Math.max(nextRequest,Date.now()+Math.min(60000,backoff));
      await response.body?.cancel();
      if(attempt===2) throw new Error('Rate limited; retry budget exhausted');
      continue;
    }
    if (!response.ok) throw new Error(`Market data HTTP ${response.status}`);
    return response.json();
  }
  throw new Error('Market data unavailable');
}

// Validate only completed bars; missing, stale or discontinuous data cannot create a signal.
export function completedCandles(raw: any[], interval: number, count: number, now=Date.now()): Candle[] {
  if (!Array.isArray(raw)) throw new Error('Missing candle history');
  const end=Math.floor(now/1000/interval)*interval;
  const candles=raw.map(c=>({start:Number(c.start),close:Number(c.close),volume:Number(c.volume)}))
    .filter(c=>c.start<end).sort((a,b)=>a.start-b.start).slice(-count);
  if(candles.length<count || candles.at(-1)!.start!==end-interval) throw new Error('Insufficient or stale history');
  for(let i=0;i<candles.length;i++) {
    const c=candles[i];
    if(!Number.isFinite(c.start)||!Number.isFinite(c.close)||c.close<=0||!Number.isFinite(c.volume)||c.volume<0||c.start%interval!==0 || (i>0 && c.start-candles[i-1].start!==interval)) throw new Error('Invalid or discontinuous history');
  }
  return candles;
}
export function historyFeatures(c: Candle[]) {
  const last=c.length-1;
  const ret=(bars:number)=>c[last].close/c[last-bars].close-1;
  const vol=(bars:number)=>{
    const r=c.slice(-bars-1).slice(1).map((v,i)=>Math.log(v.close/c[c.length-bars-1+i].close));
    return Math.sqrt(r.reduce((s,v)=>s+v*v,0));
  };
  return {ret,vol};
}
const candleCache=new Map<string,{end:number;value:Candle[]}>();
async function candles(symbol:string, interval:number, granularity:string, count:number) {
  const end=Math.floor(Date.now()/1000/interval)*interval;
  const key=`${symbol}:${interval}`;
  const cached=candleCache.get(key);
  if(cached?.end===end) return cached.value;
  const query=new URLSearchParams({start:String(end-(count+5)*interval),end:String(end),granularity,limit:String(count+5)});
  const data=await get(`${API}/products/${encodeURIComponent(symbol)}/candles?${query}`);
  const value=completedCandles(data.candles,interval,count);
  candleCache.set(key,{end,value});
  return value;
}
const metadata=new Map<string,{expires:number;value:any}>();
async function product(symbol:string) {
  const cached=metadata.get(symbol);
  if(cached && cached.expires>Date.now()) return cached.value;
  const value=await get(`${API}/products/${encodeURIComponent(symbol)}`);
  metadata.set(symbol,{expires:Date.now()+300000,value});
  return value;
}
export async function scanProducts(products=SHORT_PRODUCTS, strategy:'short_term'|'meme_swing'='short_term'):Promise<MarketSnapshot[]> {
  const snapshots:MarketSnapshot[]=[];
  for(const symbol of [...new Set(products)]) {
    try {
      const [info,book]=await Promise.all([product(symbol),get(`${API}/product_book?product_id=${encodeURIComponent(symbol)}&limit=10`)]);
      if(info.product_type!=='SPOT'||info.quote_currency_id!=='USD'||info.status!=='online'||info.trading_disabled||info.is_disabled||info.view_only||info.cancel_only||info.limit_only||info.post_only||info.auction_mode) throw new Error('Product unavailable for USD spot market orders');
      const bids=book.pricebook?.bids, asks=book.pricebook?.asks;
      const bid=Number(bids?.[0]?.price),ask=Number(asks?.[0]?.price);
      const bidSize=Number(bids?.[0]?.size),askSize=Number(asks?.[0]?.size);
      if(![bid,ask,bidSize,askSize].every(v=>Number.isFinite(v)&&v>0)||ask<bid) throw new Error('Invalid order book');
      const time=Date.parse(book.pricebook?.time);
      if(!Number.isFinite(time)||Math.abs(Date.now()-time)>60000) throw new Error('Stale order book');
      const mid=(bid+ask)/2,spread_bps=(ask-bid)/mid*10000;
      const quote_min_size=Number(info.quote_min_size),quote_max_size=Number(info.quote_max_size);
      const ask_depth_usd=asks.reduce((sum:number,a:any)=>sum+Number(a.price)*Number(a.size),0);
      if(!Number.isFinite(quote_min_size)||quote_min_size<0||!Number.isFinite(quote_max_size)||quote_max_size<5||quote_min_size>10||!Number.isFinite(ask_depth_usd)||ask_depth_usd<1000) throw new Error('Order size or visible liquidity unsuitable for $5–$10 entries');
      const common={mid,spread_bps,imbalance:(bidSize-askSize)/(bidSize+askSize),timestamp:new Date().toISOString(),symbol,strategy,history_complete:true,account_state_available:false as const,quote_min_size,quote_max_size,ask_depth_usd};
      if(strategy==='short_term') {
        const c=await candles(symbol,60,'ONE_MINUTE',31), f=historyFeatures(c);
        const ret_1m=f.ret(1),ret_5m=f.ret(5),ret_15m=f.ret(15);
        snapshots.push({...common,horizon:'minutes',realized_vol_1m:f.vol(1),realized_vol_5m:f.vol(5),ret_1m,ret_5m,ret_15m,estimated_edge_bps:Math.max(0,Math.abs(common.imbalance)*20+Math.abs(ret_5m)*10000-spread_bps)});
      } else {
        const c=await candles(symbol,3600,'ONE_HOUR',49),f=historyFeatures(c);
        const volume=(bars:Candle[])=>bars.reduce((sum,v)=>sum+v.close*v.volume,0);
        const volume_usd_24h=volume(c.slice(-24)),previous=volume(c.slice(-48,-24));
        const ret_1h=f.ret(1),ret_6h=f.ret(6),ret_24h=f.ret(24);
        if(previous<=0) throw new Error('Missing previous-day volume');
        snapshots.push({...common,horizon:'24–72 hours; shadow recommendations only',ret_1h,ret_6h,ret_24h,realized_vol_24h:f.vol(24),volume_usd_24h,volume_ratio_24h:volume_usd_24h/previous,estimated_edge_bps:0});
      }
    } catch(err:any) { console.log(`[${strategy}] Skip ${symbol}: ${err.message}`); }
  }
  return snapshots;
}
export function filterClearingFees(snapshots:MarketSnapshot[]):MarketSnapshot[] {
  const threshold=FEE_BPS+EDGE_BUFFER_BPS;
  const sorted=[...snapshots].sort((a,b)=>b.estimated_edge_bps-a.estimated_edge_bps);
  console.log(`[short_term] Scanned ${snapshots.length} products`);
  if(sorted[0]) console.log(`[short_term] Best edge proxy: ${sorted[0].symbol} ${sorted[0].estimated_edge_bps.toFixed(1)} bps (need ${threshold}; heuristic, not predicted profit)`);
  return sorted.filter(s=>s.estimated_edge_bps>threshold);
}
export function filterMemeCandidates(snapshots:MarketSnapshot[]):MarketSnapshot[] {
  // Transparent screening rules, not an expected-return estimate. No short recommendations.
  return snapshots.filter(s=>s.strategy==='meme_swing'&&s.history_complete &&
    Number.isFinite(s.ret_6h)&&s.ret_6h!>0 && Number.isFinite(s.ret_24h)&&s.ret_24h!>0 &&
    Number.isFinite(s.volume_usd_24h)&&s.volume_usd_24h!>=MIN_MEME_VOLUME &&
    Number.isFinite(s.volume_ratio_24h)&&s.volume_ratio_24h!>=1 && s.spread_bps<=MAX_MEME_SPREAD)
    .sort((a,b)=>b.volume_ratio_24h!-a.volume_ratio_24h!);
}
export async function buildBestSnapshot():Promise<MarketSnapshot|null> {
  return filterClearingFees(await scanProducts())[0]||null;
}
export async function buildBestMemeSnapshot():Promise<MarketSnapshot|null> {
  const all=await scanProducts(MEME_PRODUCTS,'meme_swing');
  const passing=filterMemeCandidates(all);
  console.log(`[meme_swing] Scanned ${all.length}/${MEME_PRODUCTS.length}; ${passing.length} passed positive 6h/24h momentum, volume and spread screen`);
  return passing[0]||null;
}
