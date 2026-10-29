import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTradingDataset, writeDatasetToFile } from '../verified-build/reports/calibration.js';

test('curation preserves historical prices and adds current observations as separate rows',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'desk-dataset-')),logs=path.join(root,'logs');await fs.mkdir(logs);
 try {
  const timestamp='2026-10-27T12:00:00Z';
  await fs.writeFile(path.join(logs,'decisions-test.jsonl'),JSON.stringify({timestamp,snapshot:{symbol:'BTC-USD',mid:100,spread_bps:2,ret_5m:.01,estimated_edge_bps:500},policyDecision:{action:'long',reason:'test'},executed:{side:'buy',price:100}})+'\n');
  await fs.writeFile(path.join(logs,'execution-test.jsonl'),JSON.stringify({timestamp:'2026-10-28T12:00:00Z',symbol:'BTC-USD',realizedPnl:1.25,executed:{side:'sell',price:110}})+'\n');
  const current={symbol:'BTC-USD',timestamp:'2026-10-28T13:00:00Z',mid:200,spread_bps:3,ret_5m:.02,estimated_edge_bps:600,history_complete:true};
  const rows=await buildTradingDataset(logs,[current]);
  assert.equal(rows.length,3);
  const historical=rows.find(r=>r.source==='decision');assert.equal(historical.entry_price,100);assert.equal(historical.historical_context.ret_5m,.01);assert.equal(historical.edge_proxy_bps,500);assert.equal(historical.expected_return_bps,null);
  assert.equal(rows.find(r=>r.source==='live').entry_price,200);
  assert.equal(rows.find(r=>r.source==='execution').realized_pnl_usd,1.25);
  const output=path.join(logs,'market-dataset.jsonl');await writeDatasetToFile(output,[current]);
  assert.equal((await fs.readFile(output,'utf8')).trim().split('\n').length,3);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'reports/dataset-manifest.json'),'utf8'));
  assert.equal(manifest.refresh_interval_ms,600000);assert.equal(manifest.counts.live,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('empty logs still produce fresh market rows and missing observations stay null',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'desk-empty-'));
 try {const rows=await buildTradingDataset(root,[{symbol:'TEST-USD',timestamp:new Date().toISOString(),mid:1}]);assert.equal(rows.length,1);assert.equal(rows[0].source,'live');assert.equal(rows[0].prediction_confidence,null);assert.equal(rows[0].historical_context.ret_5m,null);}finally{await fs.rm(root,{recursive:true,force:true});}
});
