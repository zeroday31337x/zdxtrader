import test from 'node:test';
import assert from 'node:assert/strict';
import {memeMetrics} from '../verified-build/market/meme-research.js';
import {combineHistories,summarizeVenue} from '../verified-build/market/history-context.js';
import {measuredCorrelations} from '../verified-build/inference/correlations.js';
const make=(scale=1)=>{
 const bars=Array.from({length:288},(_,i)=>({start:i*900,close:(100+i)*scale,high:(101+i)*scale,low:(99+i)*scale,volume:100000/scale}));
 return combineHistories([summarizeVenue('coinbase','TEST-USD','USD',386*scale,388*scale,bars),summarizeVenue('binance.com','TESTUSDT','USDT',386*scale,388*scale,bars)]);
};
test('meme ranking uses percentage returns, not cheap token unit prices',()=>{
 const a=memeMetrics('TEST-USD',make(1),900,90,.01),b=memeMetrics('TEST-USD',make(.000001),900,90,.01);
 assert.ok(Math.abs(a.median_horizon_return_bps-b.median_horizon_return_bps)<1e-8);
 assert.ok(Math.abs(a.trailing_momentum_after_cost_proxy_bps-b.trailing_momentum_after_cost_proxy_bps)<1e-8);
 assert.equal(a.estimated_round_trip_cost_bps>180,true);assert.equal(a.not_a_profit_forecast,true);
});
test('missing Coinbase listings retain research but are not Coinbase purchase candidates',()=>{
 const context=make();context.venues=context.venues.filter(v=>v.exchange!=='coinbase');context.source_count=1;
 const result=memeMetrics('TEST-USD',context,900,90,0);assert.equal(result.research_candidate,false);assert.match(result.screen_reasons.join(','),/Coinbase intraday history/);
});
test('15-minute cross-asset correlations align timestamps using the supplied interval',()=>{
 const a=make(),b=make(.0001);const r=measuredCorrelations([{symbol:'A',venue_history:a},{symbol:'B',venue_history:b}],900);
 assert.ok(r.findings.some(f=>f.lag_bars===0&&f.samples===287&&f.pearson>.999));
});
