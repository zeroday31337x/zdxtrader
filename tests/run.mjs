import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-env-'));
try {
 const file = path.join(dir, '.env'); fs.writeFileSync(file, '');
 const config = dotenv.parse(fs.readFileSync('.env.example'));
 Object.assign(config, {FIB_SWING_METHOD:'legacy', FIB_TARGET_MODE:'extension', MIN_SETUP_SCORE: '0.65', MIN_WORTH_TRADING_NOUL:'0.7', MAX_TOXICITY_NOUL:'0.3',MAX_TRADE_USD:'9',MAX_POSITION_USD:'9',BASE_SIZE_USD:'9'});
 const result = spawnSync(process.execPath, ['--test', 'tests/platform-api.mjs', 'tests/swings.mjs', 'tests/economics.mjs', 'tests/regression.mjs', 'verified-build/execution/lifecycle.test.js', 'tests/config.mjs', 'tests/market.mjs', 'tests/deterministic.mjs', 'tests/runner.mjs', 'tests/inference.mjs', 'tests/dataset.mjs', 'tests/sizing.mjs', 'tests/predictions.mjs', 'tests/meme-research.mjs', 'tests/http-logging.mjs'], {
  stdio: 'inherit', env: {...process.env, ...config, DOTENV_CONFIG_PATH: file}
 });
 if(result.error)throw result.error;
 process.exitCode = result.status ?? 1;
} finally {fs.rmSync(dir, {recursive:true, force:true});}
