import { loggedFetch } from '../logs/http.js';
import { envNumber, envText } from '../policy/env.js';

export type Bar = { open?: number; start: number; close: number; high: number; low: number; volume: number };
export type VenueHistory = {
  exchange: string; pair: string; quote: string; bid: number; ask: number;
  receivedAt: string; candles: Bar[]; ret5: number; ret15: number;
};
export type HistoryContext = {
  venues: VenueHistory[]; unavailable: { exchange: string; reason: string }[];
  source_count: number; upward_fraction: number; mean_return_5: number; mean_return_15: number;
  // Compare normalized returns, never average USD and USDT absolute prices.
  normalized_history: { start: number; index: number; sources: number }[];
};

export function validateBars(raw: Bar[], interval: number, count: number, now = Date.now()): Bar[] {
  const end = Math.floor(now / 1000 / interval) * interval;
  const bars = raw.filter(b => b.start < end).sort((a,b) => a.start-b.start).slice(-count);
  if (bars.length !== count || bars.at(-1)?.start !== end-interval) throw Error('Missing or stale completed history');
  bars.forEach((b,i) => {
    if (![b.start,b.close,b.high,b.low,b.volume].every(Number.isFinite) || b.low <= 0 || b.high < b.low || b.close < b.low || b.close > b.high || b.volume < 0 || (b.open!==undefined&&(!Number.isFinite(b.open)||b.open<b.low||b.open>b.high)) || (i>0 && b.start-bars[i-1].start !== interval)) throw Error('Invalid or discontinuous history');
  });
  return bars;
}
export function summarizeVenue(exchange: string, pair: string, quote: string, bid: number, ask: number, candles: Bar[]): VenueHistory {
  if (![bid,ask].every(x=>Number.isFinite(x)&&x>0) || ask<bid) throw Error('Invalid executable quote');
  const last=candles.length-1;
  return {exchange,pair,quote,bid,ask,candles,receivedAt:new Date().toISOString(),ret5:candles[last].close/candles[last-5].close-1,ret15:candles[last].close/candles[last-15].close-1};
}
const cache = new Map<string,{end:number;bars:Bar[]}>();
async function json(url: string): Promise<any> {
  const response=await loggedFetch(url,{signal:AbortSignal.timeout(envNumber('EXTERNAL_MARKET_TIMEOUT_MS'))});
  const raw=await response.text();
  let data:any;try{data=JSON.parse(raw);}catch{throw Error(`HTTP ${response.status}: invalid JSON response`);}
  const detail=String(data.msg??data.message??'').slice(0,250);
  if(!response.ok)throw Error(`HTTP ${response.status}${data.code!==undefined?` [${data.code}]`:''}${detail?`: ${detail}`:''}`);
  if(data.code!==undefined&&data.code!==0)throw Error(`Exchange error ${data.code}${detail?`: ${detail}`:''}`);
  return data;
}
export async function fetchVenueHistory(exchange: string, symbol: string, interval: number, count: number): Promise<VenueHistory> {
  const baseAsset=symbol.replace(/-USD$/,'');
  if (baseAsset===symbol) throw Error('Expected Coinbase USD product');
  const crypto=exchange==='crypto.com';
  const defaultQuote=envText(exchange==='binance.us'?'BINANCE_US_QUOTE':crypto?'CRYPTO_COM_QUOTE':'BINANCE_COM_QUOTE');
  const overrides=JSON.parse(envText('VENUE_SYMBOL_OVERRIDES'));
  const override=overrides[exchange]?.[symbol];
  const pair=typeof override==='string'?override:override?.pair??(crypto?`${baseAsset}_${defaultQuote}`:`${baseAsset}${defaultQuote}`);
  const quote=typeof override==='object'&&override?.quote?override.quote:crypto?String(pair).split('_').at(-1)!:defaultQuote;
  const api=envText(exchange==='binance.us'?'BINANCE_US_API':crypto?'CRYPTO_COM_API':'BINANCE_COM_API');
  const end=Math.floor(Date.now()/1000/interval)*interval;
  const key=`${exchange}:${pair}:${interval}:${count}`;
  const prior=cache.get(key);
  const cached=prior?.end===end?prior.bars:undefined;
  const period=interval===60?'1m':interval===900?'15m':'1h';
  if(interval!==60&&interval!==900&&interval!==3600)throw Error('Unsupported history interval');
  const bookUrl=crypto?`${api}/public/get-book?instrument_name=${encodeURIComponent(pair)}&depth=10`:`${api}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(pair)}`;
  const candleUrl=crypto?`${api}/public/get-candlestick?instrument_name=${encodeURIComponent(pair)}&timeframe=${period}&count=${count+1}`:`${api}/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${period}&limit=${count+1}`;
  const [book,history]=await Promise.all([json(bookUrl),cached?Promise.resolve(null):json(candleUrl)]);
  const bars=cached ?? validateBars(crypto ? (history.result?.data??[]).map((c:any)=>({open:Number(c.o),start:Number(c.t)/1000,close:Number(c.c),high:Number(c.h),low:Number(c.l),volume:Number(c.v)})) : history.map((c:any[])=>({open:Number(c[1]),start:Number(c[0])/1000,high:Number(c[2]),low:Number(c[3]),close:Number(c[4]),volume:Number(c[5])})),interval,count);
  cache.set(key,{end,bars});
  const b=crypto?book.result?.data?.[0]:book;
  return summarizeVenue(exchange,pair,quote,Number(crypto?b?.bids?.[0]?.[0]:b?.bidPrice),Number(crypto?b?.asks?.[0]?.[0]:b?.askPrice),bars);
}
export function combineHistories(venues: VenueHistory[], unavailable: HistoryContext['unavailable'] = []): HistoryContext {
  if(!venues.length)throw Error('No valid venue histories');
  const times=venues[0].candles.map(b=>b.start);
  const aligned=times.map(start=>{
    const indices=venues.flatMap(v=>{const bar=v.candles.find(b=>b.start===start);return bar?[bar.close/v.candles[0].close*100]:[];});
    return {start,index:indices.reduce((a,b)=>a+b,0)/indices.length,sources:indices.length};
  });
  return {venues,unavailable,source_count:venues.length,upward_fraction:venues.filter(v=>v.ret5>0&&v.ret15>0).length/venues.length,mean_return_5:venues.reduce((s,v)=>s+v.ret5,0)/venues.length,mean_return_15:venues.reduce((s,v)=>s+v.ret15,0)/venues.length,normalized_history:aligned};
}
export async function collectHistoryContext(symbol: string, coinbase: VenueHistory, interval: number, count: number): Promise<HistoryContext> {
  const enabled=envText('ANALYSIS_EXCHANGES').split(',').map(s=>s.trim()).filter(Boolean);
  const allowed=['binance.com','binance.us','crypto.com'];
  if(enabled.some(e=>!allowed.includes(e)))throw Error('Unsupported ANALYSIS_EXCHANGES value');
  const results=await Promise.allSettled(enabled.map(exchange=>fetchVenueHistory(exchange,symbol,interval,count)));
  const venues=[coinbase],unavailable:HistoryContext['unavailable']=[];
  results.forEach((r,i)=>{if(r.status==='fulfilled')venues.push(r.value);else unavailable.push({exchange:enabled[i],reason:String(r.reason?.message??r.reason)});});
  return combineHistories(venues,unavailable);
}
