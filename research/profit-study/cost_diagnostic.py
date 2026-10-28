import json
from pathlib import Path
from analyze import P,feature_rows,simulate
R=Path(__file__).resolve().parent
D=json.loads((R/'results.json').read_text());bars={};features={}
for s in P['symbols']:
 rows=json.loads((R/'candles'/f'{s}.json').read_text());bars[s]={r[0]:r for r in rows};features[s]=feature_rows(rows)
groups={'majors':['BTC-USD','ETH-USD','SOL-USD','XRP-USD'],'memes':[s for s in P['symbols'] if s not in ['BTC-USD','ETH-USD','SOL-USD','XRP-USD']]}
out=[]
for group,symbols in groups.items():
 for name in P['strategies']:
  gross=simulate(name,symbols,P['split'],P['end'],0,0,bars,features)
  actual=next(r for r in D['results'] if r['period']=='validation' and r['universe']==group and r['strategy']==name and r['scenario']=='verified_taker_10bps_slippage')
  assert gross['trades']==actual['trades']
  out.append({'universe':group,'strategy':name,'trades':gross['trades'],'cost_free_pnl':gross['pnl_usd'],'after_cost_pnl':actual['pnl_usd'],'total_cost_drag':gross['pnl_usd']-actual['pnl_usd']})
(R/'cost-diagnostic.json').write_text(json.dumps(out,indent=2));print(json.dumps(out,indent=2))
report=R/'REPORT.md';s=report.read_text();s+='\n## Cost diagnostic (not a new strategy test)\n\nThe same entries/exits were recalculated with zero fees and zero slippage to separate price movement from costs. This is not an achievable execution scenario. No strategy rules changed.\n\n| Universe | Strategy | Cost-free P&L | After-cost P&L | Cost drag |\n|---|---|---:|---:|---:|\n'
for r in out:s+=f"| {r['universe']} | {r['strategy']} | ${r['cost_free_pnl']:.2f} | ${r['after_cost_pnl']:.2f} | ${r['total_cost_drag']:.2f} |\n"
report.write_text(s)
