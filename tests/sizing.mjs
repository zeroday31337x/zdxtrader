import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeSize } from '../verified-build/policy/limits.js';
test('user sizing rule: 30% gets $1, medium confidence scales, high confidence caps at $5',()=>{
 const old=process.env.MAX_POSITION_USD;
 try {
  process.env.MAX_POSITION_USD='5';
  for(const [confidence,size] of [[0,1],[.3,1],[.4,1.8],[.55,3],[.7,4.2],[.8,5],[1,5]])assert.equal(tradeSize(confidence),size);
  assert.equal(tradeSize(),1);
  for(const value of [-1,NaN,Infinity,1.01])assert.throws(()=>tradeSize(value));
 }finally{process.env.MAX_POSITION_USD=old;}
});
