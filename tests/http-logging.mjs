import test from 'node:test';
import assert from 'node:assert/strict';
import {loggedFetch,loggedApiCall} from '../verified-build/logs/http.js';

test('routes and responses are logged with correlation IDs while credentials and request bodies stay out',async()=>{
 const oldFetch=globalThis.fetch,oldLog=console.log,enabled=process.env.HTTP_LOG_ENABLED,key=process.env.META_API_KEY;
 const rows=[];process.env.HTTP_LOG_ENABLED='true';process.env.META_API_KEY='private-meta-test-secret';console.log=line=>rows.push(JSON.parse(line));
 globalThis.fetch=async()=>new Response(JSON.stringify({code:-1121,msg:'Invalid symbol.',apiKey:process.env.META_API_KEY,nested:{authorization:'Bearer private-meta-test-secret'}}),{status:400});
 try {
  const response=await loggedFetch('https://example.com/book?symbol=TOSHI&api_key=private-meta-test-secret',{method:'POST',body:'million-token-prompt-sentinel',headers:{Authorization:'Bearer private-meta-test-secret'}});
  assert.equal(response.status,400);assert.equal((await response.json()).code,-1121);
  assert.equal(rows[0].event,'request');assert.equal(rows[1].event,'response');assert.equal(rows[0].id,rows[1].id);assert.equal(rows[1].status,400);
  const serialized=JSON.stringify(rows);assert.doesNotMatch(serialized,/private-meta-test-secret|million-token-prompt-sentinel/);assert.match(serialized,/Invalid symbol/);assert.match(serialized,/REDACTED/);
 }finally{globalThis.fetch=oldFetch;console.log=oldLog;process.env.HTTP_LOG_ENABLED=enabled;if(key===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=key;}
});
test('SDK error logging preserves the original exception and records status without credentials',async()=>{
 const enabled=process.env.HTTP_LOG_ENABLED,oldLog=console.log,rows=[];process.env.HTTP_LOG_ENABLED='true';console.log=line=>rows.push(JSON.parse(line));
 const error={code:403,message:'Forbidden',body:{apiSecret:'do-not-log',message:'denied'}};
 try {await assert.rejects(loggedApiCall('coinbase','POST','/orders',async()=>{throw error;}),e=>e===error);assert.equal(rows[1].status,403);assert.doesNotMatch(JSON.stringify(rows),/do-not-log/);}finally{process.env.HTTP_LOG_ENABLED=enabled;console.log=oldLog;}
});
