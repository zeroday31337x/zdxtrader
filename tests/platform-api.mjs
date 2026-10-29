import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPlatformApi } from '../verified-build/src/platform-api.js';
import { entriesPaused } from '../verified-build/execution/control.js';

test('platform API authenticates, bounds history, protects secrets, stages settings and persists pause',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'desk-api-'));
 const token='a'.repeat(48);
 await fs.mkdir(path.join(root,'state'));await fs.mkdir(path.join(root,'logs'));
 const env='MODE=paper\nLIVE_TRADING=false\nMIN_TRADE_USD=1\nMAX_TRADE_USD=5\nMAX_POSITION_USD=5\nPOLL_INTERVAL_MS=30000\nMETA_API_KEY=never-expose\n';
 await fs.writeFile(path.join(root,'.env'),env);
 await fs.writeFile(path.join(root,'state/position-paper.json'),JSON.stringify({status:'open',symbol:'TEST-USD',quantity:'1'}));
 const rows=[{strategy:'paper_exit',realizedPnl:.1},{strategy:'owned_position_exit',snapshot:{secret:'nope'}},{executed:{orderId:'buy1',side:'buy',api_key:'never-expose'}}];
 await fs.writeFile(path.join(root,'logs/execution-2026-10-29.jsonl'),rows.map(JSON.stringify).join('\n')+'\n{unfinished');
 const server=createPlatformApi({root,token,origins:['https://zerodrivex.com']}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/v1`;
 const call=(route,options={})=>fetch(base+route,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers}});
 try {
  assert.equal((await fetch(base+'/health')).status,401);
  assert.equal((await call('/health',{headers:{Origin:'https://evil.example'}})).status,403);
  const health=await call('/health',{headers:{Origin:'https://zerodrivex.com'}});
  assert.equal(health.headers.get('Access-Control-Allow-Origin'),'https://zerodrivex.com');
  assert.equal(health.headers.get('Cache-Control'),'no-store');
  const trades=await (await call('/trades?limit=1')).json();
  assert.equal(trades.items.length,1);assert.equal(trades.nextOffset,1);assert.equal(trades.items[0].executed.orderId,'buy1');
  assert.equal(JSON.stringify(trades).includes('never-expose'),false);
  const second=await (await call('/trades?limit=1&offset=1')).json();assert.equal(second.items[0].strategy,'paper_exit');
  assert.equal((await call('/trades?limit=10000')).status,400);
  const positions=await (await call('/positions')).json();assert.equal(positions.items[0].symbol,'TEST-USD');
  const settings=await (await call('/settings')).json();assert.equal(JSON.stringify(settings).includes('META_API_KEY'),false);
  assert.equal((await call('/settings',{method:'PATCH',body:JSON.stringify({LIVE_TRADING:true})})).status,400);
  assert.equal((await call('/settings',{method:'PATCH',body:JSON.stringify({MAX_TRADE_USD:10})})).status,400);
  const staged=await (await call('/settings',{method:'PATCH',body:JSON.stringify({ENTRY_COOLDOWN_MS:90000})})).json();assert.equal(staged.applied,false);
  assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),env);
  assert.equal(entriesPaused(root),false);
  assert.equal((await call('/control/pause',{method:'POST',body:'{}'})).status,200);
  assert.equal(entriesPaused(root),true);
  const telemetry=await (await call('/telemetry')).json();assert.equal(telemetry.runtimeStale,true);assert.equal(telemetry.control.entriesPaused,true);
  assert.equal((await call('/control/resume',{method:'POST',body:'{}'})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}
});
