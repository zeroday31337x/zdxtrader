import fs from 'node:fs/promises';
import { CoinbaseBroker } from '../broker/coinbase.js';
import { envNumber, envText } from '../policy/env.js';
const broker=new CoinbaseBroker();
const [balance,fee,permissions]=await Promise.all([broker.availableUsd(),broker.spotTakerFeeRate(),broker.tradingPermissions()]);
let position:any=null;try{position=JSON.parse(await fs.readFile(`state/position-${envText('MODE')}.json`,'utf8'));}catch(error:any){if(error.code!=='ENOENT')throw error;}
console.log(JSON.stringify({mode:envText('MODE'),verified_spot_available_usd:balance,spot_taker_fee_bps:fee*10000,permissions,zero_fee_gate_enabled:false,entry_min_net_profit_usd:envNumber('ENTRY_MIN_NET_PROFIT_USD'),entry_min_net_margin_bps:envNumber('ENTRY_MIN_NET_MARGIN_BPS'),entry_cooldown_ms:envNumber('ENTRY_COOLDOWN_MS'),target_usd:envNumber('TRADING_TARGET_BALANCE_USD'),position_status:position?.status??'empty',prediction_execution_adapter:'not configured'}));
