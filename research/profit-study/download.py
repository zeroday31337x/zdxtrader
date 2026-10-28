#!/usr/bin/env python3
"""Public candles only. No exchange credentials or order API."""
import json,time,urllib.request,urllib.parse,urllib.error,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SYMBOLS=['BTC-USD','ETH-USD','SOL-USD','XRP-USD','DOGE-USD','SHIB-USD','PEPE-USD','BONK-USD','WIF-USD','FLOKI-USD','FARTCOIN-USD','PENGU-USD','TOSHI-USD','TRUMP-USD']
protocol_file=ROOT/'protocol.json'
if protocol_file.exists(): protocol=json.loads(protocol_file.read_text())
else:
 end=int(time.time())//3600*3600
 protocol={'end':end,'start':end-180*86400,'split':end-60*86400,'symbols':SYMBOLS,'bar_seconds':3600,'strategies':['momentum','relative_strength','breakout','pullback'],'notional':10,'starting_cash':100,'taker_fee':.009,'maker_sensitivity_fee':.005,'slippage_per_side':.001,'stress_slippage_per_side':.0025,'max_hold_hours':72,'stop_close_return':-.05,'target_close_return':.10,'selection':'one global position; highest relative 24h return among qualifiers; lexical ties','execution':'signal on completed hourly bar; trade at next hourly open with adverse slippage; close-based exit rules; no intrabar fill assumptions','primary':'fixed rules; validation last 60 days; no parameter tuning','limitations':['current watchlist survivorship and historical availability bias','historical spread/depth unavailable; slippage scenario only','no inference cost included; deterministic strategy test','maker case sensitivity only; no maker fill simulation','no tick-level stops; gap risk reflected in next open','not a forecast or proof of future profitability']}
 protocol_file.write_text(json.dumps(protocol,indent=2))
(ROOT/'candles').mkdir(exist_ok=True)
manifest=[]
for symbol in protocol['symbols']:
 dest=ROOT/'candles'/f'{symbol}.json'
 if dest.exists():
  rows=json.loads(dest.read_text());print(symbol,'cached',len(rows),flush=True)
 else:
  rows={};errors=[]
  for start in range(protocol['start'],protocol['end'],300*3600):
   end=min(start+300*3600,protocol['end'])
   q=urllib.parse.urlencode({'start':start,'end':end,'granularity':'ONE_HOUR','limit':350})
   url=f'https://api.coinbase.com/api/v3/brokerage/market/products/{symbol}/candles?{q}'
   data=None
   for attempt in range(4):
    time.sleep(1)
    try:
     with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Jev-Offline-Research/1.0'}),timeout=20) as r:data=json.load(r)
     break
    except urllib.error.HTTPError as e:
     if e.code==429:time.sleep(min(30,5*2**attempt));continue
     errors.append({'start':start,'http':e.code});break
    except (OSError,ValueError) as e:
     if attempt==3:errors.append({'start':start,'error':type(e).__name__})
   if data is None:continue
   for c in data.get('candles',[]):
    try:
     t=int(c['start']); row=[t]+[float(c[k]) for k in ['open','high','low','close','volume']]
     if start<=t<end:rows[t]=row
    except (KeyError,TypeError,ValueError):pass
  rows=sorted(rows.values());dest.write_text(json.dumps(rows,separators=(',',':')))
  (ROOT/'candles'/f'{symbol}.errors.json').write_text(json.dumps(errors))
  print(symbol,'downloaded',len(rows),'request_errors',len(errors),flush=True)
 manifest.append({'symbol':symbol,'bars':len(rows),'expected':(protocol['end']-protocol['start'])//3600,'first':rows[0][0] if rows else None,'last':rows[-1][0] if rows else None,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
 (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Download complete',flush=True)
