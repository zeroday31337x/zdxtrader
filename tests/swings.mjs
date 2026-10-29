import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSwing } from '../verified-build/market/swings.js';
import { goldenAnalysis } from '../verified-build/market/golden.js';

const candles=()=>[105,104,103,102,101,100,102,104,106,108,110,112,114,116,118,120,118,116,114,112,110,112,113,114,115,116].map((close,i)=>({start:1000+i*60,close,low:close-.2,high:close+.2,volume:100}));
test('swing peaks only become available after right-hand confirmation',()=>{
 const bars=candles();
 assert.equal(confirmedSwing(bars.slice(0,16)),null);
 const swing=confirmedSwing(bars);
 assert.equal(swing.low.start,bars[5].start);
 assert.equal(swing.high.start,bars[15].start);
 assert.equal(swing.confirmedAt,bars[17].start);
 assert.equal(swing.valid,true);
 assert.ok(swing.atr>0);
});
test('nearest target chooses prior resistance and advances when costs exceed it',()=>{
 const before={FIB_SWING_METHOD:process.env.FIB_SWING_METHOD,FIB_TARGET_MODE:process.env.FIB_TARGET_MODE};
 Object.assign(process.env,{FIB_SWING_METHOD:'confirmed',FIB_TARGET_MODE:'nearest'});
 try {
  const context={venues:[{receivedAt:'2026-10-29T00:00:00Z'}],upward_fraction:.75};
  const first=goldenAnalysis(candles(),110,context);
  assert.equal(first.sell_target,first.swing_high);
  assert.equal(first.selected_target_power,0);
  const next=goldenAnalysis(candles(),121,context);
  assert.ok(next.sell_target>next.swing_high);
  assert.ok(next.selected_target_power>0);
  assert.equal(next.target_clears_configured_costs,true);
 }finally{Object.assign(process.env,before);}
});
test('a break below swing support invalidates that swing',()=>{
 const bars=candles();bars[bars.length-1]={...bars.at(-1),close:99,low:98,high:100};
 const swing=confirmedSwing(bars);
 assert.equal(swing.invalidated,true);
 assert.equal(swing.valid,false);
});
test('confirmed mode rejects monotonic candles without confirmed pivots',()=>{
 const previous=process.env.FIB_SWING_METHOD;process.env.FIB_SWING_METHOD='confirmed';
 try {
  const bars=Array.from({length:30},(_,i)=>({start:1000+i*60,close:100+i,low:99+i,high:101+i,volume:100}));
  const result=goldenAnalysis(bars,130,{venues:[{receivedAt:new Date().toISOString()}],upward_fraction:1});
  assert.equal(result.valid,false);assert.equal(result.entry_ready,false);
  assert.equal(result.swing_confirmed,false);
 }finally{process.env.FIB_SWING_METHOD=previous;}
});
test('closed-candle confirmation and trend fields are deterministic',()=>{
 const previous=process.env.FIB_SWING_METHOD;process.env.FIB_SWING_METHOD='confirmed';
 try {
  const context={venues:[{receivedAt:'2026-10-29T00:00:00Z'}],upward_fraction:.75};
  const a=goldenAnalysis(candles(),116,context);
  assert.equal(a.valid,true);assert.equal(a.swing_confirmed,true);
  assert.equal(a.rebound_confirmed,true);
  assert.deepEqual(a,goldenAnalysis(candles(),116,context));
  assert.throws(()=>goldenAnalysis([],116,context),/Missing/);
 }finally{process.env.FIB_SWING_METHOD=previous;}
});
