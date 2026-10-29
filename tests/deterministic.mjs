import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideDeterministic } from '../verified-build/policy/deterministic.js';
import { entriesScheduled } from '../verified-build/execution/schedule.js';
import { RiskEngine } from '../verified-build/risk/engine.js';
import { claimRunner } from '../verified-build/execution/ownership.js';
const snapshot=()=>({history_complete:true,venue_history:{source_count:4,mean_return_5:.01,mean_return_15:.02,upward_fraction:.75},golden:{valid:true,in_buy_zone:true,estimated_net_target_margin_bps:200}});
test('deterministic purchases repeat exactly and need no model answers',()=>{
 const a=decideDeterministic(snapshot());assert.equal(a.action,'long');
 assert.deepEqual(a,decideDeterministic(snapshot()));
 for(const patch of [{source_count:1},{mean_return_5:-.01},{mean_return_15:-.01},{upward_fraction:.1}])assert.equal(decideDeterministic({...snapshot(),venue_history:{...snapshot().venue_history,...patch}}).action,'skip');
});
test('UTC windows support all-day, closed boundaries and overnight weekdays',()=>{
 const days=process.env.TRADING_DAYS_UTC,windows=process.env.TRADING_WINDOWS_UTC;
 try {
  process.env.TRADING_DAYS_UTC='1';process.env.TRADING_WINDOWS_UTC='22:00-02:00';
  assert.equal(entriesScheduled(new Date('2026-10-26T23:00:00Z')),true);
  assert.equal(entriesScheduled(new Date('2026-10-27T01:00:00Z')),true);
  assert.equal(entriesScheduled(new Date('2026-10-27T02:00:00Z')),false);
  assert.equal(entriesScheduled(new Date('2026-10-27T23:00:00Z')),false);
  process.env.TRADING_WINDOWS_UTC='bad';assert.throws(()=>entriesScheduled());
 } finally {process.env.TRADING_DAYS_UTC=days;process.env.TRADING_WINDOWS_UTC=windows;}
});
test('daily loss and duplicate realized fills survive process restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-risk-'));
 const previous=process.env.DAILY_LOSS_LIMIT_USD;
 try {
  process.env.DAILY_LOSS_LIMIT_USD='1';const file=path.join(dir,'risk.json');
  new RiskEngine(file).recordPnl(-1,'order');
  const restored=new RiskEngine(file);restored.recordPnl(-1,'order');
  assert.equal(JSON.parse(fs.readFileSync(file)).pnl,-1);
  assert.equal(restored.check({size:9,symbol:'BTC-USD'},{}).approved,false);
 } finally {process.env.DAILY_LOSS_LIMIT_USD=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
test('a second runner cannot own the same position state',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-owner-'));const file=path.join(dir,'runner.pid');
 try {const release=claimRunner(file);assert.throws(()=>claimRunner(file),/already owned/);release();const again=claimRunner(file);again();} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
