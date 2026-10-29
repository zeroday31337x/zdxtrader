import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {loggedFetch,loggedApiCall,flushHttpLogs} from '../verified-build/logs/http.js';

test('remote responses return before telemetry capture finishes and do not flood the console',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-nonblocking-'));
 const saved={HTTP_LOG_ENABLED:process.env.HTTP_LOG_ENABLED,HTTP_LOG_CONSOLE_MODE:process.env.HTTP_LOG_CONSOLE_MODE,TELEMETRY_LOG_DIR:process.env.TELEMETRY_LOG_DIR};
 Object.assign(process.env,{HTTP_LOG_ENABLED:'true',HTTP_LOG_CONSOLE_MODE:'trading',TELEMETRY_LOG_DIR:dir});
 const oldFetch=globalThis.fetch,oldLog=console.log;let controller;const rows=[];
 const stream=new ReadableStream({start(value){controller=value;value.enqueue(new TextEncoder().encode('{"price":'));}});
 globalThis.fetch=async()=>new Response(stream);console.log=value=>rows.push(value);
 try {
  const response=await loggedFetch('https://api.binance.us/api/v3/ticker/price');
  assert.equal(response.status,200);
  assert.equal(rows.length,0);
  controller.enqueue(new TextEncoder().encode('100}'));controller.close();
  assert.equal((await response.json()).price,100);
  await flushHttpLogs();
  const records=(await fs.readFile(path.join(dir,'http',`api.binance.us-${new Date().toISOString().slice(0,10)}.jsonl`),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length,2);assert.equal(records[1].event,'response');assert.match(records[1].bodyPreview,/100/);
  assert.equal(rows.length,0);
 }finally{globalThis.fetch=oldFetch;console.log=oldLog;Object.assign(process.env,saved);await fs.rm(dir,{recursive:true,force:true});}
});

test('routes and responses are logged with correlation IDs while credentials and request bodies stay out',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-http-'));const previousDir=process.env.TELEMETRY_LOG_DIR,mode=process.env.HTTP_LOG_CONSOLE_MODE;process.env.TELEMETRY_LOG_DIR=dir;process.env.HTTP_LOG_CONSOLE_MODE='all';
 const oldFetch=globalThis.fetch,oldLog=console.log,enabled=process.env.HTTP_LOG_ENABLED,key=process.env.META_API_KEY;
 const rows=[];process.env.HTTP_LOG_ENABLED='true';process.env.META_API_KEY='private-meta-test-secret';console.log=line=>rows.push(JSON.parse(line));
 globalThis.fetch=async()=>new Response(JSON.stringify({code:-1121,msg:'Invalid symbol.',apiKey:process.env.META_API_KEY,nested:{authorization:'Bearer private-meta-test-secret',platform_api_token:'never-log-platform-token'}}),{status:400});
 try {
  const response=await loggedFetch('https://example.com/book?symbol=TOSHI&api_key=private-meta-test-secret',{method:'POST',body:'million-token-prompt-sentinel',headers:{Authorization:'Bearer private-meta-test-secret'}});
  assert.equal(response.status,400);assert.equal((await response.json()).code,-1121);
  await flushHttpLogs();
  assert.equal(rows[0].event,'request');assert.equal(rows[1].event,'response');assert.equal(rows[0].id,rows[1].id);assert.equal(rows[1].status,400);
  const serialized=await fs.readFile(path.join(dir,'http',`example.com-${new Date().toISOString().slice(0,10)}.jsonl`),'utf8');assert.doesNotMatch(serialized,/private-meta-test-secret|million-token-prompt-sentinel|never-log-platform-token/);assert.match(serialized,/Invalid symbol/);assert.match(serialized,/REDACTED/);
 }finally{await flushHttpLogs();process.env.TELEMETRY_LOG_DIR=previousDir;process.env.HTTP_LOG_CONSOLE_MODE=mode;await fs.rm(dir,{recursive:true,force:true});globalThis.fetch=oldFetch;console.log=oldLog;process.env.HTTP_LOG_ENABLED=enabled;if(key===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=key;}
});
test('SDK error logging preserves the original exception and records status without credentials',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desk-sdk-'));const previousDir=process.env.TELEMETRY_LOG_DIR,mode=process.env.HTTP_LOG_CONSOLE_MODE;process.env.TELEMETRY_LOG_DIR=dir;process.env.HTTP_LOG_CONSOLE_MODE='all';
 const enabled=process.env.HTTP_LOG_ENABLED,oldLog=console.log,rows=[];process.env.HTTP_LOG_ENABLED='true';console.log=line=>rows.push(JSON.parse(line));
 const error={code:403,message:'Forbidden',body:{apiSecret:'do-not-log',message:'denied'}};
 try {await assert.rejects(loggedApiCall('coinbase','POST','/orders',async()=>{throw error;}),e=>e===error);assert.equal(rows[1].status,403);assert.doesNotMatch(JSON.stringify(rows),/do-not-log/);}finally{await flushHttpLogs();process.env.TELEMETRY_LOG_DIR=previousDir;process.env.HTTP_LOG_CONSOLE_MODE=mode;await fs.rm(dir,{recursive:true,force:true});process.env.HTTP_LOG_ENABLED=enabled;console.log=oldLog;}
});
