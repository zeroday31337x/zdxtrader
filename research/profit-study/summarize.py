import json,datetime,statistics
from pathlib import Path
R=Path(__file__).resolve().parent
D=json.loads((R/'results.json').read_text());rows=D['results']
def find(period,group,strategy,scenario='verified_taker_10bps_slippage'):
 return next(r for r in rows if r['period']==period and r['universe']==group and r['strategy']==strategy and r['scenario']==scenario)
selected=[];candidates=[]
for group in ['majors','memes']:
 dev=sorted([r for r in rows if r['period']=='development' and r['universe']==group and r['scenario']=='verified_taker_10bps_slippage'],key=lambda r:r['pnl_usd'],reverse=True)
 pick=dev[0];validation=find('validation',group,pick['strategy']);selected.append({'universe':group,'selected_from_development':pick['strategy'],'development_pnl':pick['pnl_usd'],'validation_pnl':validation['pnl_usd'],'validation_trades':validation['trades']})
 for name in D['protocol']['strategies']:
  v=find('validation',group,name);development=find('development',group,name);stress=find('validation',group,name,'verified_taker_25bps_slippage')
  checks={'development_positive':development['pnl_usd']>0,'validation_positive':v['pnl_usd']>0,'minimum_30_validation_trades':v['trades']>=30,'both_validation_halves_positive':all(x>0 for x in v['half_period_pnl']),'stress_positive':stress['pnl_usd']>0,'positive_without_best_trade':v['pnl_excluding_best_trade']>0}
  candidates.append({'universe':group,'strategy':name,'checks':checks,'passes_all':all(checks.values()),'validation_pnl':v['pnl_usd'],'validation_trades':v['trades']})
P=D['protocol'];date=lambda t:datetime.datetime.fromtimestamp(t,datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
lines=['# Trading strategy research — fixed $10 entries','',f"Data: {date(P['start'])} to {date(P['end'])}. Validation: {date(P['split'])} to {date(P['end'])}.",'','## Result','',f"{sum(c['passes_all'] for c in candidates)} of 8 strategy/universe combinations met every prespecified evidence check. A positive historical result alone is insufficient to activate live trading.",'','## Verified costs','', 'Account fee tier: Intro. Taker 0.90% and maker 0.50% per side, verified with the read-only transaction summary endpoint. Primary simulation uses taker fees plus 0.10% adverse slippage each side. Stress uses 0.25% slippage each side. Fees are charged on entry and exit; current fees are applied throughout history as an execution-cost scenario. Inference costs are excluded.','', '## Validation results','', '| Universe | Strategy | Trades | Net P&L | Mean per $10 entry | Win rate | Max drawdown on $100 cash | Stress P&L |','|---|---|---:|---:|---:|---:|---:|---:|']
for group in ['majors','memes']:
 for name in P['strategies']:
  v=find('validation',group,name);stress=find('validation',group,name,'verified_taker_25bps_slippage')
  mean=v['mean_pnl_per_10_trade'] or 0;win=v['win_rate'] or 0
  lines.append(f"| {group} | {name} | {v['trades']} | ${v['pnl_usd']:.2f} | ${mean:.3f} | {win:.1%} | {v['max_drawdown_pct']:.2f}% | ${stress['pnl_usd']:.2f} |")
lines+=['','P&L uses $100 starting cash, one $10 position at a time per independently simulated strategy, no compounding of order size, and includes final liquidation. These are simulations, not actual fills. Low drawdown on total cash also reflects leaving roughly 90% in cash.','', '## Development-selected candidates','', '| Universe | Development winner | Development P&L | Validation P&L | Validation trades |','|---|---|---:|---:|---:|']
for s in selected:lines.append(f"| {s['universe']} | {s['selected_from_development']} | ${s['development_pnl']:.2f} | ${s['validation_pnl']:.2f} | {s['validation_trades']} |")
lines+=['','## Buy-and-hold and cash baselines','']
for b in D['baselines']:
 if b['period']=='validation':lines.append(f"- {b['universe']}: cash P&L $0; equal-weight buy-and-hold with $10 total invested: ${b['equal_weight_buy_hold_10_total_usd_pnl']:.2f}. Eligible start/end assets: {', '.join(b['eligible_symbols'])}.")
lines+=['','Buy-and-hold invests $10 total, matching one-position strategy exposure rather than buying $10 of every coin. Transaction costs are included.','', '## Fixed rules and execution assumptions','']
for k,v in D['rules'].items():lines.append(f'- {k}: {v}.')
lines+=['','Signals use only completed hourly candles and next-hour opens, with adverse slippage. Stops and targets are close-based; intrabar fills are not assumed. No strategy may hold overlapping positions in its own simulation. Current symbols form two fixed universes: BTC/ETH/SOL/XRP and ten meme assets.','', '## Data quality','', '| Symbol | Hourly bars | Required bars | Feature-ready bars |','|---|---:|---:|---:|']
for q in D['quality']:lines.append(f"| {q['symbol']} | {q['bars']} | {q['expected']} | {q['feature_bars']} |")
lines+=['','Missing hourly bars reset the 169-bar feature window. Missing prices/volumes are not filled or fabricated. Source pages, protocol, raw candles, file hashes, exact trade ledgers, summary CSV and scripts are retained in the research/profit-study directory on aws1. Nine methodology regression tests passed.','', '## Evidence checks','', 'At least 30 validation trades; positive development and validation P&L; both validation halves positive; positive under stressed slippage; positive after removing the best trade. These are screening criteria, not statistical proof.','']
for c in candidates:lines.append(f"- {c['universe']}/{c['strategy']}: {'PASS' if c['passes_all'] else 'FAIL'}; failed checks: {', '.join(k for k,v in c['checks'].items() if not v) or 'none'}.")
lines+=['','## Limits','', 'This is a historical screen of four deterministic strategies, not a backtest of the model or historical order-book imbalance. The current watchlist creates survivorship and selection bias; delisted/failed coins are absent, and historical regional eligibility is not verified. Slippage is an assumption because historical bid/ask/depth are unavailable. Maker results in results.json are fee sensitivity only and do not establish maker fills. Choosing the best among eight validation results adds selection risk; development-selected results are shown separately. No parameters were tuned after viewing validation. No statistical confidence or future profitability is claimed. Any candidate requires new forward paper results and complete execution/exit/account controls.','', 'No live configuration, production strategy, or order submission was changed for this research.']
(R/'REPORT.md').write_text('\n'.join(lines)+'\n')
(R/'assessment.json').write_text(json.dumps({'selected':selected,'candidates':candidates},indent=2))
print(json.dumps({'selected':selected,'candidates':candidates},indent=2))
