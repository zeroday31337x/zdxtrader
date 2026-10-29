import test from 'node:test';
import assert from 'node:assert/strict';
import {predictionBook} from '../verified-build/market/predictions.js';
import {studyPredictions} from '../verified-build/reports/prediction-study.js';
test('binary asks use opposing bids and missing books remain unknown',()=>{
 const b=predictionBook({orderbook_fp:{yes_dollars:[['0.6','10'],['0.7','20']],no_dollars:[['0.2','5']]}});
 assert.ok(Math.abs(b.yes_ask-.8)<1e-12);assert.ok(Math.abs(b.no_ask-.3)<1e-12);
 assert.equal(b.yes_bid_notional,20);assert.equal(b.no_bid_notional,1);
 assert.equal(predictionBook({}).yes_ask,null);assert.equal(predictionBook({}).resting_bid_imbalance,null);
});
test('study uses one pre-close observation per contract and excludes settlement-only history',()=>{
 const close='2026-10-29T12:15:00Z';
 const o={kind:'observation',ticker:'m1',timestamp:'2026-10-29T12:10:00Z',close_time:close,seconds_to_close:300,resting_bid_imbalance:.8,yes_ask:.8,no_ask:.25,fee_assumption:{per_contract_usd:0,slippage_per_contract_usd:.01,source:'user_report_scenario'}};
 const s={kind:'settlement',ticker:'m1',close_time:close,result:'no'};
 const r=studyPredictions([o,{...o,seconds_to_close:310},s,{...s,ticker:'unobserved'}]);
 assert.equal(r.trades.length,1);assert.equal(r.trades[0].side,'no');assert.equal(r.trades[0].net_per_contract_usd,.74);
 assert.equal(r.status,'insufficient_forward_windows');
 assert.equal(studyPredictions([{...o,timestamp:'2026-10-29T12:16:00Z'},s]).trades.length,0);
});
