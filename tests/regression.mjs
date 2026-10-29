import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideGambler } from '../verified-build/policy/index.js';
import { Book } from '../verified-build/book/index.js';
import { CoinbaseBroker } from '../verified-build/broker/coinbase.js';
const noul = n => ({ type: 'noul', noul: n });
const answers = () => ({ setup_quality: noul(.8), worth_trading: noul(.9), toxicity: noul(.1), regime: { type: 'choice', choice: 'trending_up' } });
test('valid setup passes and sizes from actual quality', () => {
 assert.deepEqual(decideGambler(answers(), {}), { action: 'long', size: 9, reason: 'policy approved' });
});
test('threshold equality passes', () => {
 const a=answers(); a.setup_quality=noul(.65); a.worth_trading=noul(.7); a.toxicity=noul(.3);
 assert.equal(decideGambler(a,{}).action,'long');
});
for (const [key,value,reason] of [['setup_quality',.64,'setup_quality'],['worth_trading',.69,'worth_trading'],['toxicity',.31,'toxicity']]) {
 test(`${key} fails with specific diagnostic`,()=>{const a=answers();a[key]=noul(value);const r=decideGambler(a,{});assert.equal(r.action,'skip');assert.match(r.reason,new RegExp(reason));});
}
for (const invalid of [undefined, null, noul(NaN), noul(Infinity), noul(-1), noul(1.1), noul('0.9'), {type:'choice',choice:'high',confidence:.99}]) {
 test(`invalid quality is rejected: ${JSON.stringify(invalid)}`,()=>{const a=answers();a.setup_quality=invalid;assert.match(decideGambler(a,{}).reason,/invalid/);});
}
test('missing answers safely skip',()=>assert.equal(decideGambler(undefined,{}).action,'skip'));
test('uptrend filter is optional and never produces a short sale',()=>{
 const old=process.env.REQUIRE_UPTREND;
 try {
  for (const regime of ['trending_down','ranging','volatile','trending_up']) {
   const a=answers();a.regime.choice=regime;
   process.env.REQUIRE_UPTREND='false';assert.equal(decideGambler(a,{}).action,'long');
   process.env.REQUIRE_UPTREND='true';assert.equal(decideGambler(a,{}).action,regime==='trending_up'?'long':'skip');
  }
 } finally {process.env.REQUIRE_UPTREND=old;}
});
test('pending and confirmed positions survive new Book instances',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jev-test-'));const file=path.join(dir,'position.json');
 try {const b=new Book(file);b.reserve('BTC-USD',16,'client-1');const restored=new Book(file);assert.equal(restored.hasOpen(),true);assert.equal(restored.getOpen().clientOrderId,'client-1');assert.throws(()=>restored.reserve('SOL-USD',16,'client-2'));restored.openPosition('BTC-USD',15.9,100);assert.equal(new Book(file).getOpen().status,'open');restored.close();assert.equal(new Book(file).hasOpen(),false);} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
const order={symbol:'BTC-USD',side:'buy',sizeUsd:8,type:'market'};
function broker(submit,confirmed){const b=Object.create(CoinbaseBroker.prototype);b.client={submitOrder:async()=>submit,getOrder:async()=>({order:confirmed})};return b;}
test('exchange rejection is not treated as execution',async()=>{await assert.rejects(broker({success:false,error_response:{message:'denied'}}).place(order,100,'test-id'),/rejected/);});
test('acceptance without fill is not treated as execution',async()=>{await assert.rejects(broker({success:true,success_response:{order_id:'o1'}},{status:'OPEN'}).place(order,100,'test-id'),/reconciliation/);});
test('partial fill requires reconciliation',async()=>{await assert.rejects(broker({success:true,success_response:{order_id:'o1'}},{status:'CANCELLED',filled_value:'4',average_filled_price:'99',total_fees:'.02'}).place(order,100,'test-id'),/reconciliation/);});
test('confirmed fill uses exchange price, value and fees',async()=>{const f=await broker({success:true,success_response:{order_id:'o1'}},{status:'FILLED',filled_value:'15.9',average_filled_price:'99',total_fees:'.08'}).place(order,100,'test-id');assert.equal(f.price,99);assert.equal(f.sizeUsd,15.9);assert.equal(f.fees,.08);});
test('spot short rejected before API submission',async()=>{await assert.rejects(broker({}).place({...order,side:'sell'},100,'test-id'),/unsupported/);});

import { tradeSize, assertTradeSize } from '../verified-build/policy/limits.js';
import { RiskEngine } from '../verified-build/risk/engine.js';
import { PaperBroker } from '../verified-build/broker/paper.js';
import { decideMeme } from '../verified-build/policy/index.js';
import { completedCandles, historyFeatures, filterMemeCandidates, scanProducts, SHORT_PRODUCTS, MEME_PRODUCTS } from '../verified-build/state/scanner.js';
for (const value of [0, .1, .5, .65, .8, 1]) test(`fixed $9 sizing for probability ${value}`,()=>{const n=tradeSize(value);assert.equal(n,9);});
for (const value of [NaN,Infinity,-1,0,.99,9.01,10,10.01,100]) {
 test(`all order entry boundaries reject ${value}`,async()=>{
  assert.throws(()=>assertTradeSize(value));
  assert.equal(new RiskEngine().check({size:value,symbol:'BTC-USD'},{}).approved,false);
  await assert.rejects(broker({}).place({...order,sizeUsd:value},100,'test-id'),/notional/);
  await assert.rejects(new PaperBroker().place({...order,sizeUsd:value},100),/notional/);
 });
}
test('MAX_POSITION_USD cannot raise the $9 hard ceiling',()=>{
 const old=process.env.MAX_POSITION_USD;process.env.MAX_POSITION_USD='1000';
 try {assert.equal(new RiskEngine().check({size:11,symbol:'BTC-USD'},{}).approved,false);} finally {if(old===undefined)delete process.env.MAX_POSITION_USD;else process.env.MAX_POSITION_USD=old;}
});
test('exchange minimum never causes oversizing',()=>assert.equal(new RiskEngine().check({size:6,symbol:'TEST-USD'},{quote_min_size:7}).approved,false));
test('meme strategy never recommends short',()=>{const a=answers();a.regime.choice='trending_down';assert.notEqual(decideMeme(a,{}).action,'short');});
test('meme and short-term universes do not overlap',()=>assert.ok(SHORT_PRODUCTS.every(p=>!MEME_PRODUCTS.includes(p))));
const clock=Date.UTC(2026,9,28,2,0,0),end=clock/1000;
const bars=Array.from({length:49},(_,i)=>({start:String(end-(49-i)*3600),close:String(100+i),volume:'1000'}));
test('closed hourly bars yield real 6h and 24h returns',()=>{const c=completedCandles(bars,3600,49,clock);const f=historyFeatures(c);assert.equal(f.ret(6),148/142-1);assert.equal(f.ret(24),148/124-1);assert.ok(f.vol(24)>0);});
test('unfinished candle excluded',()=>assert.equal(completedCandles([...bars,{start:String(end),close:'999',volume:'1'}],3600,49,clock).at(-1).close,148));
test('stale candle history rejected',()=>assert.throws(()=>completedCandles(bars.slice(0,-1),3600,48,clock),/stale/));
test('gapped candle history rejected',()=>{const bad=bars.map(b=>({...b}));bad[10].start=String(Number(bad[10].start)-1800);assert.throws(()=>completedCandles(bad,3600,49,clock),/discontinuous/);});
test('invalid prices rejected',()=>{const bad=bars.map(b=>({...b}));bad[10].close='NaN';assert.throws(()=>completedCandles(bad,3600,49,clock),/Invalid/);});
const meme={strategy:'meme_swing',history_complete:true,ret_6h:.01,ret_24h:.02,volume_usd_24h:2000000,volume_ratio_24h:1.2,spread_bps:10};
test('meme screen requires positive trend, volume and acceptable spread',()=>{
 assert.equal(filterMemeCandidates([meme]).length,1);
 for(const patch of [{ret_6h:-.01},{ret_24h:-.01},{volume_usd_24h:100},{volume_ratio_24h:.5},{spread_bps:100},{history_complete:false}]) assert.equal(filterMemeCandidates([{...meme,...patch}]).length,0);
});
test('unsupported product is skipped instead of fabricated',async()=>{
 const fetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({product_type:'SPOT',quote_currency_id:'USD',status:'offline'}),{status:200});
 try {assert.deepEqual(await scanProducts(['TEST-OFFLINE-USD'],'meme_swing'),[]);} finally {globalThis.fetch=fetch;}
});

test('valid budget is exactly $9 for both strategies',()=>{assert.equal(decideGambler(answers(),{}).size,9);assert.equal(decideMeme(answers(),{}).size,9);});
test('broker risk ceiling cannot exceed $9',()=>{assert.throws(()=>assertTradeSize(9.01));assert.doesNotThrow(()=>assertTradeSize(9));});

test('daily loss boundary blocks entries and invalid P&L is rejected',()=>{
 const previous=process.env.DAILY_LOSS_LIMIT_USD;
 try {
  process.env.DAILY_LOSS_LIMIT_USD='1';
  const risk=new RiskEngine();risk.recordPnl(-1);
  assert.equal(risk.check({size:9,symbol:'BTC-USD'},{}).approved,false);
  assert.throws(()=>risk.recordPnl(NaN),/Invalid/);
  for(const value of ['NaN','0','-1']) {
   process.env.DAILY_LOSS_LIMIT_USD=value;
   assert.equal(new RiskEngine().check({size:9,symbol:'BTC-USD'},{}).approved,false);
  }
 } finally {if(previous===undefined)delete process.env.DAILY_LOSS_LIMIT_USD;else process.env.DAILY_LOSS_LIMIT_USD=previous;}
});
test('zero verified balance cannot authorize an entry',()=>{
 assert.equal(new RiskEngine().check({size:5,symbol:'BTC-USD'},{account_balance_usd:0}).approved,false);
});
test('reservation release requires matching pending intent and survives restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jev-release-'));const file=path.join(dir,'position.json');
 try {
  const book=new Book(file);book.reserve('BTC-USD',9,'client');
  assert.equal(book.release('other'),false);assert.equal(new Book(file).hasOpen(),true);
  assert.equal(book.release('client'),true);assert.equal(new Book(file).hasOpen(),false);
  book.openPosition('BTC-USD',9,100);assert.equal(book.release('client'),false);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

import { flushFailedReservation } from '../verified-build/book/recovery.js';
test('five-minute cleanup requires proof and never clears uncertain or filled orders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jev-ttl-'));const file=path.join(dir,'position.json');
 try {
  const b=new Book(file);b.reserve('BTC-USD',9,'ttl-id');
  const created=Date.parse(b.getOpen().entryTime);
  const proof={clientOrderId:'ttl-id',check:'broker',notSubmitted:true,timestamp:new Date(created).toISOString()};
  assert.equal(flushFailedReservation(b,[proof],created+299999),false);
  assert.equal(flushFailedReservation(b,[],created+300000),false);
  assert.equal(flushFailedReservation(b,[{...proof,notSubmitted:false}],created+300000),false);
  assert.equal(flushFailedReservation(b,[{...proof,clientOrderId:'other'}],created+300000),false);
  assert.equal(flushFailedReservation(b,[proof],created+300000),true);
  assert.equal(new Book(file).hasOpen(),false);
  b.openPosition('BTC-USD',9,100);
  assert.equal(flushFailedReservation(b,[proof],created+600000),false);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('$1 entries meet the application minimum',async()=>{
 assert.doesNotThrow(()=>assertTradeSize(1));
 assert.equal(new RiskEngine().check({size:1,symbol:'BTC-USD'},{quote_min_size:1}).approved,true);
 const fill=await new PaperBroker().place({...order,sizeUsd:1},100);
 assert.equal(fill.sizeUsd,1);
});
