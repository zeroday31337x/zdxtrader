"""Exploratory per-coin breakdown, with selection based only on the earlier period."""
import json
from pathlib import Path
from study import ROOT,OLD,P,STRATEGIES,features,simulate
rows={s:json.loads((OLD/'candles'/f'{s}.json').read_text()) for s in P['symbols']}
bars={s:{r[0]:r for r in v} for s,v in rows.items()};F={s:features(v,rows['BTC-USD']) for s,v in rows.items()}
results=[]
for name in STRATEGIES:
 for symbol in P['symbols']:
  group={}
  for period,start,end in [('development',P['start']+7*86400,P['split']),('recent60',P['split'],P['end'])]:
   r=simulate(name,[symbol],start,end,bars,F);r['symbol']=symbol;r['period']=period
   stress=simulate(name,[symbol],start,end,bars,F,slip=.0025)
   r['stress_pnl']=stress['pnl'];group[period]=r
  results.append(group)
selected=[]
for name in STRATEGIES:
 options=[r for r in results if r['development']['strategy']==name and r['development']['trades']>=5 and r['development']['pnl']>0]
 if options:
  best=max(options,key=lambda r:r['development']['pnl']);selected.append(best)
# Candidate screen is intentionally stringent; no live recommendation follows automatically.
passing=[]
for r in results:
 d,v=r['development'],r['recent60']
 if d['trades']>=10 and v['trades']>=10 and d['pnl']>0 and v['pnl']>0 and v['stress_pnl']>0 and v['without_best_trade']>0:passing.append(r)
out={'search_space':'112 fixed strategy/coin combinations; same previously observed history; exploratory only','results':results,'development_selected':selected,'screen_passes':passing}
(ROOT/'per-coin-results.json').write_text(json.dumps(out,indent=2))
compact=lambda r:{'strategy':r['development']['strategy'],'symbol':r['development']['symbol'],'development_trades':r['development']['trades'],'development_pnl':r['development']['pnl'],'recent_trades':r['recent60']['trades'],'recent_pnl':r['recent60']['pnl'],'recent_stress_pnl':r['recent60']['stress_pnl'],'recent_without_best':r['recent60']['without_best_trade']}
print('DEVELOPMENT_SELECTED',json.dumps([compact(r) for r in selected]),flush=True)
print('SCREEN_PASSES',json.dumps([compact(r) for r in passing]),flush=True)
print('RECENT_POSITIVE_COUNT',sum(r['recent60']['pnl']>0 for r in results),'of',len(results),flush=True)
print('RECENT_TOP',json.dumps([compact(r) for r in sorted(results,key=lambda r:r['recent60']['pnl'],reverse=True)[:8]]),flush=True)
