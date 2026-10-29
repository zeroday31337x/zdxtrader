import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MetaAnalysisAdapter } from '../verified-build/inference/meta.js';
import { buildEvidence } from '../verified-build/inference/corpus.js';
import { measuredCorrelations } from '../verified-build/inference/correlations.js';

test('Meta adapter uses the configured model and exact count endpoint before inference',async()=>{
 const fetch=globalThis.fetch,oldKey=process.env.META_API_KEY;process.env.META_API_KEY='test-meta-secret';
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  assert.equal(options.headers.Authorization,'Bearer test-meta-secret');
  assert.equal(body.model,'muse-spark-1.3');
  const data=String(url).endsWith('count_tokens')?{input_tokens:120}:{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({summary:'Evidence reviewed',findings:[{hypothesis:'Sample relationship',symbols:['BTC-USD'],evidence_ids:['source1'],observed_relationship:'Measured in source1',limitations:'Exploratory',validation_plan:'Use held-out history'}],data_gaps:[]})}],usage:{output_tokens:45}};
  return new Response(JSON.stringify(data),{status:200});
 };
 try {
  const result=await new MetaAnalysisAdapter().analyze([{id:'source1',source:'sample',data:{price:1}}]);
  assert.equal(result.inputTokens,120);assert.equal(result.analysis.findings.length,1);
  assert.ok(calls[0].url.endsWith('/messages/count_tokens'));assert.ok(calls[1].url.endsWith('/messages'));
  assert.equal(calls[1].body.max_tokens,8192);
 } finally {globalThis.fetch=fetch;if(oldKey===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=oldKey;}
});
test('oversized evidence is reduced using measured tokens and omitted records are disclosed',async()=>{
 const fetch=globalThis.fetch,oldKey=process.env.META_API_KEY;process.env.META_API_KEY='test';
 globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body),n=JSON.parse(body.messages[0].content).evidence.length;
  return new Response(JSON.stringify(String(url).endsWith('count_tokens')?{input_tokens:n*600000}:{stop_reason:'end_turn',content:[{type:'text',text:'{"summary":"ok","findings":[],"data_gaps":[]}'}],usage:{output_tokens:10}}));
 };
 try {const r=await new MetaAnalysisAdapter().analyze([{id:'1',source:'a',data:1},{id:'2',source:'b',data:2}]);assert.equal(r.omittedEvidence,1);assert.equal(r.inputTokens,600000);}finally{globalThis.fetch=fetch;if(oldKey===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=oldKey;}
});
test('corpus ingestion excludes configuration, symlinks and credentials',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'meta-corpus-'));const old=process.env.META_API_KEY;process.env.META_API_KEY='private-test-key';
 try {
  await fs.mkdir(path.join(root,'reports'));await fs.writeFile(path.join(root,'.env'),'SECRET=do-not-ingest');
  await fs.writeFile(path.join(root,'reports/latest-analysis.json'),JSON.stringify({value:1,accidental:process.env.META_API_KEY}));
  await fs.symlink(path.join(root,'.env'),path.join(root,'reports/leak.json'));
  const evidence=await buildEvidence(root),text=JSON.stringify(evidence);
  assert.ok(evidence.length);assert.doesNotMatch(text,/private-test-key|do-not-ingest/);assert.match(text,/REDACTED/);
 } finally {await fs.rm(root,{recursive:true,force:true});if(old===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=old;}
});
test('measured correlations use aligned returns rather than correlated price levels',()=>{
 const make=(symbol,multiplier)=>({symbol,venue_history:{normalized_history:Array.from({length:61},(_,i)=>({start:i*60,index:100*Math.exp(multiplier*(.001*i+.00001*i*i)),sources:4}))}});
 const result=measuredCorrelations([make('A',1),make('B',2)]);
 const zero=result.findings.find(f=>f.lag_bars===0);
 assert.ok(zero);assert.ok(zero.pearson>.999);assert.equal(zero.samples,60);
});
