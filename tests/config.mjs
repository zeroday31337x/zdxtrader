import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { envNumber, envBoolean } from '../verified-build/policy/env.js';
import { Filter } from '../verified-build/filter/funnel.js';

test('invalid and missing configuration never silently uses a code default', () => {
 for (const value of ['', 'NaN', 'Infinity']) {
  process.env.TEST_NUMBER = value;
  assert.throws(() => envNumber('TEST_NUMBER'));
 }
 delete process.env.TEST_NUMBER;
 assert.throws(() => envNumber('TEST_NUMBER'));
 process.env.TEST_BOOLEAN = 'yes';
 assert.throws(() => envBoolean('TEST_BOOLEAN'));
 delete process.env.TEST_BOOLEAN;
});
test('entry limits and policy size follow environment in a fresh process', () => {
 const childEnv={...process.env,MIN_TRADE_USD:'2',MAX_TRADE_USD:'12',MAX_POSITION_USD:'12',BASE_SIZE_USD:'12',REQUIRE_UPTREND:'false'};delete childEnv.NODE_TEST_CONTEXT;
 const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { assertTradeSize } from './verified-build/policy/limits.js';
  import { decideGambler } from './verified-build/policy/index.js';
  const n = noul => ({type:'noul',noul});
  assertTradeSize(12); assert.throws(() => assertTradeSize(13));
  assert.equal(decideGambler({setup_quality:n(.8),worth_trading:n(.9),toxicity:n(.1),regime:{choice:'ranging'}},{}).size,12);
 `], {encoding:'utf8',env:childEnv});
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
});
test('spread gate reads the configured threshold', async () => {
 const old = process.env.MAX_SPREAD_BPS;
 try {
  process.env.MAX_SPREAD_BPS = '100';
  assert.equal((await new Filter().pass({id:'a',symbol:'BTC-USD',data:{}},{spread_bps:75})).ok,true);
  process.env.MAX_SPREAD_BPS = '50';
  assert.equal((await new Filter().pass({id:'b',symbol:'BTC-USD',data:{}},{spread_bps:75})).ok,false);
 } finally {process.env.MAX_SPREAD_BPS=old;}
});
