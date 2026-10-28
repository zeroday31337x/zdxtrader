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
 assert.deepEqual(decideGambler(answers(), {}), { action: 'long', size: 16, reason: 'policy approved' });
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
test('ranging does not produce an entry',()=>{const a=answers();a.regime.choice='ranging';assert.equal(decideGambler(a,{}).reason,'no clear direction');});
test('pending and confirmed positions survive new Book instances',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jev-test-'));const file=path.join(dir,'position.json');
 try {const b=new Book(file);b.reserve('BTC-USD',16,'client-1');const restored=new Book(file);assert.equal(restored.hasOpen(),true);assert.equal(restored.getOpen().clientOrderId,'client-1');assert.throws(()=>restored.reserve('SOL-USD',16,'client-2'));restored.openPosition('BTC-USD',15.9,100);assert.equal(new Book(file).getOpen().status,'open');restored.close();assert.equal(new Book(file).hasOpen(),false);} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
const order={symbol:'BTC-USD',side:'buy',sizeUsd:16,type:'market'};
function broker(submit,confirmed){const b=Object.create(CoinbaseBroker.prototype);b.client={submitOrder:async()=>submit,getOrder:async()=>({order:confirmed})};return b;}
test('exchange rejection is not treated as execution',async()=>{await assert.rejects(broker({success:false,error_response:{message:'denied'}}).place(order,100,'test-id'),/rejected/);});
test('acceptance without fill is not treated as execution',async()=>{await assert.rejects(broker({success:true,success_response:{order_id:'o1'}},{status:'OPEN'}).place(order,100,'test-id'),/reconciliation/);});
test('partial fill requires reconciliation',async()=>{await assert.rejects(broker({success:true,success_response:{order_id:'o1'}},{status:'CANCELLED',filled_value:'4',average_filled_price:'99',total_fees:'.02'}).place(order,100,'test-id'),/reconciliation/);});
test('confirmed fill uses exchange price, value and fees',async()=>{const f=await broker({success:true,success_response:{order_id:'o1'}},{status:'FILLED',filled_value:'15.9',average_filled_price:'99',total_fees:'.08'}).place(order,100,'test-id');assert.equal(f.price,99);assert.equal(f.sizeUsd,15.9);assert.equal(f.fees,.08);});
test('spot short rejected before API submission',async()=>{await assert.rejects(broker({}).place({...order,side:'sell'},100,'test-id'),/unsupported/);});
