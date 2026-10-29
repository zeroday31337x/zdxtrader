import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBars, fetchVenueHistory, combineHistories, summarizeVenue, collectHistoryContext } from '../verified-build/market/history-context.js';
import { goldenAnalysis } from '../verified-build/market/golden.js';
const end=Math.floor(Date.now()/60000)*60;
const bars=Array.from({length:61},(_,i)=>({start:end-(61-i)*60,close:100+i,high:101+i,low:99+i,volume:100}));
test('history validation rejects stale, gapped, duplicate and invalid OHLC bars',()=>{
 assert.equal(validateBars(bars,60,61).length,61);
 assert.throws(()=>validateBars(bars.slice(0,-1),60,60),/stale/);
 assert.throws(()=>validateBars(bars.map((b,i)=>i===3?{...b,start:b.start-60}:b),60,61),/discontinuous/);
 assert.throws(()=>validateBars(bars.map((b,i)=>i===3?{...b,low:999}:b),60,61),/Invalid/);
});
test('all three venue adapters use documented response formats and closed candles',async()=>{
 const original=globalThis.fetch;
 const unfinished={...bars.at(-1),start:end};
 const inputs=[...bars,unfinished];
 globalThis.fetch=async url=>{
  const crypto=String(url).includes('crypto.com');
  const candle=String(url).includes('klines')||String(url).includes('get-candlestick');
  let data;
  if(candle) {
   if(crypto) {
    assert.equal(new URL(url).searchParams.get('timeframe'),'1m');
    data={code:0,result:{data:inputs.map(b=>({t:b.start*1000,o:b.close,c:b.close,h:b.high,l:b.low,v:b.volume}))}};
   } else data=inputs.map(b=>[b.start*1000,b.close,b.high,b.low,b.close,b.volume]);
  } else data=crypto?{code:0,result:{data:[{bids:[['159','1','1']],asks:[['161','1','1']]}]}}:{bidPrice:'159',askPrice:'161'};
  return new Response(JSON.stringify(data),{status:200});
 };
 try {
  for(const exchange of ['binance.com','binance.us','crypto.com']) {
   const venue=await fetchVenueHistory(exchange,'TEST-USD',60,61);
   assert.equal(venue.candles.length,61);assert.equal(venue.bid,159);assert.equal(venue.quote,'USDT');
   assert.equal(venue.candles.at(-1).start,end-60);
  }
 } finally {globalThis.fetch=original;}
});
test('normalized aggregation does not average USD and USDT prices',()=>{
 const a=summarizeVenue('coinbase','TEST-USD','USD',159,161,bars);
 const b=summarizeVenue('binance.com','TESTUSDT','USDT',318,322,bars.map(b=>({...b,close:b.close*2,high:b.high*2,low:b.low*2})));
 const c=combineHistories([a,b]);
 assert.equal(c.source_count,2);assert.equal(c.upward_fraction,1);
 assert.equal(c.normalized_history[0].index,100);
 assert.equal(c.normalized_history.at(-1).index,160);
 assert.equal(c.mean_return_5,a.ret5);
});
test('unavailable venues remain explicit and are never replaced by fabricated observations',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('blocked');};
 try {
  const cb=summarizeVenue('coinbase','FAIL-USD','USD',159,161,bars);
  const c=await collectHistoryContext('FAIL-USD',cb,60,61);
  assert.equal(c.source_count,1);assert.equal(c.unavailable.length,3);
 } finally {globalThis.fetch=original;}
});
test('golden target and net margin include configured fees and slippage',()=>{
 const context=combineHistories([summarizeVenue('coinbase','TEST-USD','USD',159,161,bars)]);
 const g=goldenAnalysis(bars,161,context);
 assert.equal(g.valid,true);assert.ok(g.sell_target>g.swing_high);
 assert.ok(g.buy_zone_low<g.buy_zone_high);
 assert.equal(g.estimated_net_target_margin_bps,g.gross_target_margin_bps-g.costs_bps);
 assert.equal(g.target_is_projection,true);
 assert.ok(g.projected_timing_utc);
});
test('a descending window has no valid low-then-high swing',()=>{
 const falling=bars.map((b,i)=>({...b,close:200-i,high:201-i,low:199-i}));
 const context=combineHistories([summarizeVenue('coinbase','TEST-USD','USD',139,141,falling)]);
 assert.equal(goldenAnalysis(falling,141,context).valid,false);
});

import { positionSignal } from '../verified-build/market/golden.js';
import { floorQuantity } from '../verified-build/execution/quantity.js';
import { CoinbaseBroker, NotSubmittedError } from '../verified-build/broker/coinbase.js';
import { Book } from '../verified-build/book/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('decimal sales round down exactly without selling more than owned',()=>{
 assert.equal(floorQuantity('0.123456789','0.0001'),'0.123400000');
 assert.equal(floorQuantity('12.999','1'),'12.000');
 assert.throws(()=>floorQuantity('0.00001','0.001'));
 assert.throws(()=>floorQuantity('1','0'));
});
function saleBroker(status='FILLED') {
 const b=Object.create(CoinbaseBroker.prototype);let submitted;
 b.client={submitOrder:async order=>{submitted=order;return {success:true,success_response:{order_id:'exit'}};},getOrder:async()=>({order:{status,filled_size:'0.1234',filled_value:'12.34',average_filled_price:'100',total_fees:'.01'}})};
 return {b,submitted:()=>submitted};
}
test('owned sale submits base quantity and does not apply entry notional minimum',async()=>{
 const {b,submitted}=saleBroker();
 const fill=await b.sellOwned({symbol:'TEST-USD',quantity:'0.123456789'},{bid:100,baseIncrement:'0.0001',minBase:.001,minQuote:1},'sale');
 assert.equal(fill.side,'sell');assert.equal(fill.baseQuantity,'0.1234');
 assert.equal(submitted().side,'SELL');assert.equal(submitted().order_configuration.market_market_ioc.base_size,'0.123400000');
 assert.equal(submitted().order_configuration.market_market_ioc.quote_size,undefined);
});
test('unresolved sale retains uncertainty instead of reporting a fill',async()=>{
 const {b}=saleBroker('OPEN');
 await assert.rejects(b.sellOwned({symbol:'TEST-USD',quantity:'0.123456789'},{bid:100,baseIncrement:'0.0001',minBase:.001,minQuote:1}),/reconciliation/);
});
test('rejected exit restores ownership and a confirmed sale retains residual dust',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-exit-'));
 try {
  const file=path.join(dir,'position.json');const b=new Book(file);
  b.openPosition('TEST-USD',9,100,{quantity:'0.09',fees:.01,sellTarget:110});
  b.reserveExit('exit');assert.equal(new Book(file).getOpen().pendingSide,'sell');
  assert.equal(b.release('exit'),true);assert.equal(new Book(file).getOpen().status,'open');
  assert.equal(b.getOpen().quantity,'0.09');
  b.reserveExit('next');b.applySale('0.08');assert.equal(b.getOpen().status,'open');
  assert.ok(Math.abs(Number(b.getOpen().quantity)-.01)<1e-14);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('owned exit signal uses entry fees and a fixed entry target',()=>{
 const ctx=combineHistories([summarizeVenue('coinbase','TEST-USD','USD',159,161,bars)]);
 const golden=goldenAnalysis(bars,161,ctx);
 const signal=positionSignal({size:9,entry:100,quantity:'.09',fees:.1,sellTarget:110,high:120,entryTime:new Date().toISOString()},120,golden,ctx);
 assert.equal(signal.action,'sell');assert.equal(signal.reason,'Fibonacci extension target');
 assert.ok(signal.estimated_net_margin_bps<2000);
});

test('explicit Forbidden rejection does not leave an uncertain submission',async()=>{
 const b=Object.create(CoinbaseBroker.prototype);b.client={submitOrder:async()=>{throw {code:403,message:'Forbidden'};}};
 await assert.rejects(b.place({symbol:'TEST-USD',side:'buy',sizeUsd:1,type:'market'},100),error=>error instanceof NotSubmittedError&&/403/.test(error.message));
});
test('network timeout remains uncertain and is never classified as a rejected order',async()=>{
 const b=Object.create(CoinbaseBroker.prototype);const timeout=Object.assign(Error('timeout'),{code:'ETIMEDOUT'});b.client={submitOrder:async()=>{throw timeout;}};
 await assert.rejects(b.place({symbol:'TEST-USD',side:'buy',sizeUsd:1,type:'market'},100),error=>error===timeout&&!(error instanceof NotSubmittedError));
});

test('reconciliation recognizes SDK-prefixed IDs from legacy reservations',async()=>{
 const b=Object.create(CoinbaseBroker.prototype);b.client={getOrders:async()=>({orders:[{client_order_id:'cbnodelegacy-id',product_id:'TEST-USD',status:'FILLED'}],has_next:false})};
 const found=await b.findPending('legacy-id','TEST-USD');assert.equal(found.status,'FILLED');
});
test('new live reservations use the SDK order ID unchanged',()=>{
 const b=Object.create(CoinbaseBroker.prototype);b.client={generateNewOrderId:()=> 'cbnode-sdk-id'};
 assert.equal(b.newClientOrderId(),'cbnode-sdk-id');
});

test('deprecated zero-fee flag no longer blocks submission',async()=>{
 const old=process.env.ZERO_FEE_ENTRIES_ONLY;process.env.ZERO_FEE_ENTRIES_ONLY='true';
 let submitted=false;const b=Object.create(CoinbaseBroker.prototype);
 b.client={getTransactionSummary:async()=>({fee_tier:{taker_fee_rate:'.009'}}),submitOrder:async()=>{submitted=true;return {};}};
 try{await assert.rejects(b.place({symbol:'TEST-USD',side:'buy',sizeUsd:1,type:'market'},100),/Coinbase rejected order/);assert.equal(submitted,true);}finally{process.env.ZERO_FEE_ENTRIES_ONLY=old;}
});

test('Crypto.com USD overrides keep the correct native quote currency',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  assert.equal(new URL(url).searchParams.get('instrument_name'),'TOSHI_USD');
  const candles=String(url).includes('get-candlestick');
  return new Response(JSON.stringify(candles?{code:0,result:{data:bars.map(b=>({t:b.start*1000,o:b.close,c:b.close,h:b.high,l:b.low,v:b.volume}))}}:{code:0,result:{data:[{bids:[['159','1']],asks:[['161','1']]}]}}));
 };
 try{const v=await fetchVenueHistory('crypto.com','TOSHI-USD',60,61);assert.equal(v.pair,'TOSHI_USD');assert.equal(v.quote,'USD');}finally{globalThis.fetch=original;}
});
test('venue failures preserve the exchange error code and explanation',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({code:-1121,msg:'Invalid symbol.'}),{status:400});
 try{await assert.rejects(fetchVenueHistory('binance.com','INVALID-USD',60,61),/HTTP 400 \[-1121\]: Invalid symbol/);}finally{globalThis.fetch=original;}
});
