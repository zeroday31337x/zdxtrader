import test from 'node:test';
import assert from 'node:assert/strict';
import { entryEconomics } from '../verified-build/policy/economics.js';
import { EntryCooldown } from '../verified-build/execution/cooldown.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('entry cooldown survives restart, rejects duplicates and expires at boundary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-cooldown-'));
 try {
  const file=path.join(dir,'cooldown.json');
  new EntryCooldown(file,60000).claim(100000);
  const restored=new EntryCooldown(file,60000);
  assert.equal(restored.remaining(110000),50000);
  assert.throws(()=>restored.claim(159999),/cooldown active/);
  assert.throws(()=>restored.remaining(99999),/clock/);
  restored.claim(160000);
  assert.equal(restored.remaining(160001),59999);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('positive price moves can lose money after verified fees',()=>{
 const result=entryEconomics({sizeUsd:1,ask:100,target:101,takerFeeRate:.009});
 assert.equal(result.approved,false);
 assert.ok(result.projectedNetUsd<0);
 assert.ok(result.breakEvenBid>101);
});
test('dollar and percentage profit minima both apply',()=>{
 const small=entryEconomics({sizeUsd:1,ask:100,target:102.5,takerFeeRate:.009});
 const larger=entryEconomics({sizeUsd:5,ask:100,target:102.5,takerFeeRate:.009});
 assert.ok(small.projectedNetUsd>0);
 assert.equal(small.approved,false);
 assert.equal(larger.approved,true);
 assert.ok(Math.abs(larger.projectedNetUsd-small.projectedNetUsd*5)<1e-12);
 assert.equal(larger.projectionOnly,true);
});
test('invalid market inputs and costs fail closed',()=>{
 for(const patch of [{ask:0},{target:NaN},{takerFeeRate:-.1},{takerFeeRate:1}])
  assert.throws(()=>entryEconomics({sizeUsd:1,ask:100,target:105,takerFeeRate:.009,...patch}));
});
