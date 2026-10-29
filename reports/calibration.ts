import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { scanProducts, type MarketSnapshot } from '../state/scanner.js';
import { envNumber, envBoolean } from '../policy/env.js';
import { claimRunner } from '../execution/ownership.js';

export type DatasetRow = {
  id:string; schema_version:2; timestamp:string|null; ingested_at:string;
  symbol:string; source:'decision'|'rejection'|'execution'|'live';
  action:string; entry_price:number|null; expected_return_bps:number|null;
  edge_proxy_bps:number|null; spread_bps:number|null; setup_quality:number|null;
  worth_trading:number|null; toxicity:number|null; prediction_confidence:number|null;
  stop_price:number|null; take_profit_1:number|null; take_profit_2:number|null;
  historical_context:Record<string,number|null>; venue_history:unknown; golden:unknown;
  reason:string|null; execution:unknown; realized_pnl_usd:number|null;
  source_ref:string; data_available:boolean;
};
const numeric=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;

function curate(entry:any,source:DatasetRow['source'],sourceRef:string,ingestedAt:string):DatasetRow {
  const snapshot=source==='live'?entry:entry.snapshot??{};
  const golden=snapshot.golden??null;
  const price=numeric(snapshot.mid)??(numeric(snapshot.bid)!==null&&numeric(snapshot.ask)!==null?(snapshot.bid+snapshot.ask)/2:null);
  const action=source==='live'?'neutral':entry.policyDecision?.action??entry.exitSignal?.action??entry.executed?.side??(source==='rejection'?'skip':'neutral');
  const context:Record<string,number|null>={};
  for(const field of ['ret_1m','ret_5m','ret_15m','ret_1h','ret_6h','ret_24h','realized_vol_1m','realized_vol_5m','volume_ratio_recent','volume_ratio_24h'])context[field]=numeric(snapshot[field]);
  const timestamp=typeof entry.timestamp==='string'?entry.timestamp:null;
  return {id:createHash('sha256').update(sourceRef+'\n'+JSON.stringify(entry)).digest('hex'),schema_version:2,timestamp,ingested_at:ingestedAt,
    symbol:String(snapshot.symbol??entry.symbol??entry.executed?.symbol??'UNKNOWN'),source,action,
    entry_price:price,expected_return_bps:numeric(snapshot.expected_return_bps),edge_proxy_bps:numeric(snapshot.estimated_edge_bps),spread_bps:numeric(snapshot.spread_bps),
    setup_quality:numeric(entry.answers?.setup_quality?.noul),worth_trading:numeric(entry.answers?.worth_trading?.noul),toxicity:numeric(entry.answers?.toxicity?.noul),prediction_confidence:numeric(snapshot.prediction_confidence),
    stop_price:price===null?null:price*(1-envNumber('EXIT_STOP_LOSS_PCT')/100),take_profit_1:numeric(golden?.swing_high),take_profit_2:numeric(golden?.sell_target),
    historical_context:context,venue_history:snapshot.venue_history??null,golden,
    reason:entry.policyDecision?.reason??entry.exitSignal?.reason??entry.reason??null,execution:entry.executed??null,realized_pnl_usd:numeric(entry.realizedPnl),source_ref:sourceRef,data_available:price!==null};
}

/** Historical rows retain their original observations; fresh prices are separate live rows. */
export async function buildTradingDataset(logDir=path.join(process.cwd(),'logs'),snapshots?:MarketSnapshot[]):Promise<DatasetRow[]> {
  const ingestedAt=new Date().toISOString(),rows:DatasetRow[]=[];
  let files:string[]=[];try{files=await fs.readdir(logDir);}catch(error:any){if(error.code!=='ENOENT')throw error;}
  for(const file of files.sort()) {
    const match=/^(decisions|rejections|execution)-.*\.jsonl$/.exec(file);if(!match)continue;
    const source=match[1]==='decisions'?'decision':match[1]==='rejections'?'rejection':'execution';
    const lines=(await fs.readFile(path.join(logDir,file),'utf8')).split('\n');
    lines.forEach((line,index)=>{if(!line.trim())return;let record;try{record=JSON.parse(line);}catch{return;}
      if(record&&typeof record==='object')rows.push(curate(record,source,`${file}:${index+1}`,ingestedAt));
    });
  }
  const live=snapshots??await scanProducts();
  for(const snapshot of live)rows.push(curate(snapshot,'live',`market:${snapshot.symbol}:${snapshot.timestamp}`,ingestedAt));
  return rows.sort((a,b)=>(a.timestamp??'').localeCompare(b.timestamp??'')||a.id.localeCompare(b.id));
}
export async function writeDatasetToFile(outputPath=path.join(process.cwd(),'logs','market-dataset.jsonl'),snapshots?:MarketSnapshot[]) {
  const dataset=await buildTradingDataset(path.dirname(outputPath),snapshots);
  await fs.mkdir(path.dirname(outputPath),{recursive:true});
  const temp=`${outputPath}.${process.pid}.tmp`;
  await fs.writeFile(temp,dataset.map(row=>JSON.stringify(row)).join('\n')+(dataset.length?'\n':''));await fs.rename(temp,outputPath);
  const counts=Object.fromEntries(['decision','rejection','execution','live'].map(source=>[source,dataset.filter(row=>row.source===source).length]));
  const manifest={schema_version:2,generated_at:new Date().toISOString(),refresh_interval_ms:envNumber('DATASET_REFRESH_MS'),path:outputPath,row_count:dataset.length,counts,notes:['Historical observations are never overwritten with current prices.','Unknown values remain null. Edge proxy and projected margin are not realized returns.','All trade outcomes are exchange-confirmed or explicitly paper-mode events.'],current_symbols:dataset.filter(row=>row.source==='live').map(row=>row.symbol)};
  const dir=path.join(path.dirname(path.dirname(outputPath)),'reports');await fs.mkdir(dir,{recursive:true});
  const manifestTemp=path.join(dir,`dataset-manifest.${process.pid}.tmp`);await fs.writeFile(manifestTemp,JSON.stringify(manifest,null,2));await fs.rename(manifestTemp,path.join(dir,'dataset-manifest.json'));
  return dataset;
}
let running=false,nextRun=0;
export async function refreshDatasetOnce(force=false) {
  const interval=envNumber('DATASET_REFRESH_MS');if(interval<=0)throw Error('DATASET_REFRESH_MS must be positive');
  const stateFile=path.join(process.cwd(),'state/dataset-schedule.json');
  if(!force) {try {const state=JSON.parse(await fs.readFile(stateFile,'utf8'));if(state.nextRun>Date.now()){nextRun=state.nextRun;return;}}catch(error:any){if(error.code!=='ENOENT')throw error;}}
  const release=claimRunner(path.join(process.cwd(),'state/dataset-refresh.pid'));
  try {
    const dataset=await writeDatasetToFile();
    nextRun=Math.floor(Date.now()/interval)*interval+interval;
    await fs.writeFile(stateFile,JSON.stringify({nextRun}));
    console.log(`[dataset] Refreshed ${dataset.length} curated rows; next ${new Date(nextRun).toISOString()}`);
    return dataset;
  } finally {release();}
}
/** Shared persistent schedule avoids duplicate refreshes between the desk and CLI worker. */
export function scheduleDatasetRefresh(now=Date.now()) {
  if(!envBoolean('DATASET_ENABLED')||running||now<nextRun)return;
  running=true;
  void refreshDatasetOnce().catch(error=>console.error('[dataset]',error.message)).finally(()=>{running=false;});
}
export async function refreshDatasetLoop() {
  const run=async()=>{try{await refreshDatasetOnce();}catch(error:any){console.error('[dataset]',error.message);}finally {const interval=envNumber('DATASET_REFRESH_MS');setTimeout(run,Math.max(1,interval-Date.now()%interval));}};
  await run();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const job=process.argv.includes('--once')?refreshDatasetOnce(true):refreshDatasetLoop();
  void job.catch(error=>{console.error('[dataset]',error.message);process.exitCode=1;});
}
