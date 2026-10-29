import { loggedFetch } from '../logs/http.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { envNumber, envText, envBoolean } from '../policy/env.js';
import { claimRunner } from '../execution/ownership.js';

export type PredictionObservation={kind:'observation';timestamp:string;ticker:string;symbol:'BTC-USD';close_time:string;seconds_to_close:number;yes_ask:number|null;no_ask:number|null;resting_bid_imbalance:number|null;yes_bid_notional:number;no_bid_notional:number;reference:unknown;market:unknown;orderbook:unknown;fee_assumption:{per_contract_usd:number;slippage_per_contract_usd:number;source:string}};
export type PredictionSettlement={kind:'settlement';timestamp:string;ticker:string;result:'yes'|'no';close_time:string;market:unknown};
function levels(raw:unknown):[number,number][] {
  if(!Array.isArray(raw))return [];
  return raw.map(row=>[Number(row?.[0]),Number(row?.[1])] as [number,number]).filter(([p,q])=>Number.isFinite(p)&&p>0&&p<1&&Number.isFinite(q)&&q>0);
}
export function predictionBook(book:any) {
  const yes=levels(book?.orderbook_fp?.yes_dollars),no=levels(book?.orderbook_fp?.no_dollars);
  const bestYes=yes.length?Math.max(...yes.map(([p])=>p)):null,bestNo=no.length?Math.max(...no.map(([p])=>p)):null;
  const yesNotional=yes.reduce((sum,[p,q])=>sum+p*q,0),noNotional=no.reduce((sum,[p,q])=>sum+p*q,0);
  return {yes_ask:bestNo===null?null:1-bestNo,no_ask:bestYes===null?null:1-bestYes,yes_bid_notional:yesNotional,no_bid_notional:noNotional,resting_bid_imbalance:yesNotional+noNotional>0?(yesNotional-noNotional)/(yesNotional+noNotional):null};
}
async function get(route:string) {
  const res=await loggedFetch(envText('PREDICTION_API_BASE_URL').replace(/\/$/,'')+route,{signal:AbortSignal.timeout(envNumber('PREDICTION_TIMEOUT_MS'))});
  if(!res.ok)throw Error(`Prediction data HTTP ${res.status}`);return res.json();
}
export async function collectPredictionOnce() {
  const release=claimRunner(path.join(process.cwd(),'state/prediction-collector.pid'));
  try {
    const series=envText('PREDICTION_SERIES'),limit=envNumber('PREDICTION_MARKET_LIMIT');
    const [open,settled]=await Promise.all([get(`/markets?series_ticker=${encodeURIComponent(series)}&status=open&limit=${limit}`),get(`/markets?series_ticker=${encodeURIComponent(series)}&status=settled&limit=${limit}`)]);
    const now=Date.now(),timestamp=new Date(now).toISOString();
    let reference:any=null;
    try {const report=JSON.parse(await fs.readFile(path.join(process.cwd(),'reports/latest-analysis.json'),'utf8'));const btc=report.products?.find((p:any)=>p.symbol==='BTC-USD');reference={timestamp:report.timestamp,bid:btc?.bid??null,ask:btc?.ask??null,age_ms:now-Date.parse(report.timestamp),label:'Coinbase spot reference; not the settlement index'};}catch{/* Missing reference is explicitly null. */}
    const events:(PredictionObservation|PredictionSettlement)[]=[];
    const active=(open.markets??[]).filter((m:any)=>Date.parse(m.open_time)<=now&&Date.parse(m.close_time)>now).sort((a:any,b:any)=>Date.parse(a.close_time)-Date.parse(b.close_time)).slice(0,envNumber('PREDICTION_MAX_ACTIVE_MARKETS'));
    for(const market of active) {
      const book=await get(`/markets/${encodeURIComponent(market.ticker)}/orderbook?depth=${envNumber('PREDICTION_BOOK_DEPTH')}`);
      events.push({kind:'observation',timestamp:new Date().toISOString(),ticker:market.ticker,symbol:'BTC-USD',close_time:market.close_time,seconds_to_close:(Date.parse(market.close_time)-Date.now())/1000,...predictionBook(book),reference,market,orderbook:book,fee_assumption:{per_contract_usd:envNumber('PREDICTION_FEE_PER_CONTRACT_USD'),slippage_per_contract_usd:envNumber('PREDICTION_SLIPPAGE_PER_CONTRACT_USD'),source:envText('PREDICTION_FEE_ASSUMPTION_SOURCE')}});
    }
    const stateFile=path.join(process.cwd(),'state/prediction-collector.json');let seen:string[]=[];
    try {seen=JSON.parse(await fs.readFile(stateFile,'utf8')).seen??[];}catch(error:any){if(error.code!=='ENOENT')throw error;}
    for(const market of settled.markets??[])if(!seen.includes(market.ticker)&&['yes','no'].includes(market.result)) {events.push({kind:'settlement',timestamp,ticker:market.ticker,result:market.result,close_time:market.close_time,market});seen.push(market.ticker);}
    const logDir=path.join(process.cwd(),'logs');await fs.mkdir(logDir,{recursive:true});
    if(events.length)await fs.appendFile(path.join(logDir,`predictions-${timestamp.slice(0,10)}.jsonl`),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
    const temp=stateFile+'.tmp';await fs.writeFile(temp,JSON.stringify({seen:seen.slice(-envNumber('PREDICTION_SETTLEMENT_MEMORY'))}));await fs.rename(temp,stateFile);
    const report={timestamp,mode:'read_only',series,active_markets:active.length,observations:events.filter(e=>e.kind==='observation'),settlements_added:events.filter(e=>e.kind==='settlement').length,notes:['Resting bid imbalance is not total money bet on each outcome.','Kalshi public quotes are a research proxy; Coinbase execution quotes and fee waivers can differ.','Unknown and uncollected data are not backfilled as observations.']};
    await fs.mkdir(path.join(process.cwd(),'reports'),{recursive:true});const reportFile=path.join(process.cwd(),'reports/prediction-latest.json');await fs.writeFile(reportFile+'.tmp',JSON.stringify(report,null,2));await fs.rename(reportFile+'.tmp',reportFile);
    return report;
  }finally{release();}
}
export function startPredictionCollector() {
  if(!envBoolean('PREDICTION_RESEARCH_ENABLED'))return;
  const interval=envNumber('PREDICTION_POLL_INTERVAL_MS');if(interval<=0)throw Error('PREDICTION_POLL_INTERVAL_MS must be positive');
  const run=async()=>{try{await collectPredictionOnce();}catch(error:any){console.error('[prediction-research]',error.message);}finally{setTimeout(run,interval);}};
  void run();
}
