import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

test('real main loop buys, persists ownership, deterministically sells, and saves analysis offline', {timeout:15000}, async()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-integration-'));
 const config={...dotenv.parse(fs.readFileSync('.env.example')),MODE:'paper',EXTERNAL_HISTORY_ASYNC:'false',FIB_SWING_METHOD:'legacy',FIB_TARGET_MODE:'extension',DECISION_ENGINE:'deterministic',LIVE_TRADING:'false',ENABLE_AUTO_SELL:'true',STOP_AFTER_PURCHASE:'false',SCAN_PRODUCTS:'TEST-USD',MEME_PRODUCTS:'OTHER-USD',POLL_INTERVAL_MS:'10',MARKET_REQUEST_INTERVAL_MS:'0',ANALYSIS_INTERVAL_MS:'1',ROUND_TRIP_FEE_BPS:'0',MIN_EDGE_BUFFER_BPS:'0',MIN_PROFIT_EDGE_BPS:'0',REQUIRE_TARGET_MARGIN:'false',TYPESAFE_API_KEY:''};
 const file=path.join(dir,'.env');fs.writeFileSync(file,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n'));
 const childEnv={...process.env,DOTENV_CONFIG_PATH:file};delete childEnv.NODE_TEST_CONTEXT;
 const child=spawn(process.execPath,['--import',path.join(root,'tests/fake-market.mjs'),path.join(root,'verified-build/src/main.js')],{cwd:dir,env:childEnv,stdio:['ignore','pipe','pipe']});
 let output='';
 try {
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error(`Integration timed out: ${output}`)),10000);
   child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('PAPER sale confirmed')){clearTimeout(timer);resolve();}});
   child.stderr.on('data',chunk=>{output+=chunk;});
   child.once('exit',code=>{clearTimeout(timer);reject(Error(`Main exited ${code}: ${output}`));});
  });
  child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));
  assert.match(output,/Paper executed/);assert.match(output,/PAPER sale confirmed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'state/position-paper.json'))),null);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'reports/latest-analysis.json')));
  assert.equal(report.products[0].source_count,4);
  const events=fs.readdirSync(path.join(dir,'logs')).filter(f=>f.startsWith('execution-')).flatMap(f=>fs.readFileSync(path.join(dir,'logs',f),'utf8').trim().split('\n').map(JSON.parse));
  assert.equal(events.filter(e=>e.strategy==='paper_exit').length,1);
  assert.ok(events.find(e=>e.strategy==='paper_exit').realizedPnl>0);
 } finally {child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
