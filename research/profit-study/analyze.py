#!/usr/bin/env python3
"""Deterministic research only; contains no network or order-submission code."""
import json,math,statistics,datetime,csv,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
P=json.loads((ROOT/'protocol.json').read_text())
RULES={
 'momentum':'24h return >2%, close>SMA72, 24h volume ratio>=1, BTC 24h return>0',
 'relative_strength':'24h return>0 and >BTC24h+2%, close>SMA72, volume ratio>=1, BTC24h>0',
 'breakout':'close>previous24h high, current quote-volume>1.5x previous24h mean, BTC24h>0',
 'pullback':'close>SMA168, SMA24>SMA72, 6h return<0, 1h return>0, 24h return>BTC24h, BTC24h>0',
 'exit':'close loss>=5%, close gain>=10%, 72h maximum, or negative24h return after24h; next open execution',
}
# Frozen before the historical download completed.
rule_file=ROOT/'rules.json'
if not rule_file.exists():rule_file.write_text(json.dumps(RULES,indent=2))

def feature_rows(rows):
 result={};window=[]
 for row in rows:
  t,o,h,l,c,v=row
  if not all(math.isfinite(x) for x in row) or t%3600 or min(o,h,l,c)<=0 or v<0 or l>min(o,c) or h<max(o,c) or h<l:raise ValueError('Invalid OHLCV row')
  if window and t-window[-1][0]!=3600:window=[]
  window.append(row)
  if len(window)>169:window.pop(0)
  if len(window)<169:continue
  closes=[r[4] for r in window]
  vol=lambda arr:sum(r[4]*r[5] for r in arr)
  previous=vol(window[-48:-24])
  prevbarvol=vol(window[-25:-1])/24
  if previous<=0 or prevbarvol<=0:continue
  result[t]={'ret1':c/closes[-2]-1,'ret6':c/closes[-7]-1,'ret24':c/closes[-25]-1,'sma24':sum(closes[-24:])/24,'sma72':sum(closes[-72:])/72,'sma168':sum(closes[-168:])/168,'close':c,'vol_ratio':vol(window[-24:])/previous,'bar_vol_ratio':c*v/prevbarvol,'prior_high':max(r[2] for r in window[-25:-1])}
 return result

def qualifies(name,f,btc):
 if btc is None or btc['ret24']<=0:return False
 if name=='momentum':return f['ret24']>.02 and f['close']>f['sma72'] and f['vol_ratio']>=1
 if name=='relative_strength':return f['ret24']>0 and f['ret24']>btc['ret24']+.02 and f['close']>f['sma72'] and f['vol_ratio']>=1
 if name=='breakout':return f['close']>f['prior_high'] and f['bar_vol_ratio']>1.5
 if name=='pullback':return f['close']>f['sma168'] and f['sma24']>f['sma72'] and f['ret6']<0 and f['ret1']>0 and f['ret24']>btc['ret24']
 return False

def roundtrip(entry,exit,fee,slip,notional=10):
 qty=notional/(entry*(1+slip))
 return qty*exit*(1-slip)*(1-fee)-notional*(1+fee)

def simulate(name,universe,start,end,fee,slip,bars,features):
 cash=100.;pos=None;trades=[];equity=[];peak=100.;dd=0;exposure=0;forced=False
 for t in range(start,end,3600):
  if pos:
   s=pos['symbol'];prev=bars[s].get(t-3600);current=bars[s].get(t);f=features[s].get(t-3600)
   if prev and current:
    raw_return=prev[4]/pos['entry']-1;age=(t-pos['time'])/3600
    reason='stop' if raw_return<=-.05 else 'target' if raw_return>=.10 else 'max_hold' if age>=72 else 'trend_exit' if age>=24 and f and f['ret24']<0 else None
    if reason:
     proceeds=pos['qty']*current[1]*(1-slip)*(1-fee)
     pnl=proceeds-pos['cost'];cash+=proceeds
     trades.append({'symbol':s,'entry_time':pos['time'],'exit_time':t,'pnl':pnl,'net_pct':pnl/pos['cost']*100,'hold_hours':age,'reason':reason})
     pos=None
  if pos is None:
   btc=features['BTC-USD'].get(t-3600);candidates=[]
   for s in universe:
    f=features[s].get(t-3600)
    if f and t in bars[s] and qualifies(name,f,btc):candidates.append((f['ret24']-(btc or {}).get('ret24',0),s))
   if candidates:
    _,s=sorted(candidates,key=lambda v:(-v[0],v[1]))[0]
    entry=bars[s][t][1];cost=10*(1+fee)
    if cash>=cost:
     pos={'symbol':s,'time':t,'entry':entry,'qty':10/(entry*(1+slip)),'cost':cost};cash-=cost
  value=cash
  if pos:
   exposure+=1
   s=pos['symbol'];current=bars[s].get(t)
   mark=current[1] if current else next((bars[s][q][4] for q in range(t-3600,start-3600,-3600) if q in bars[s]),pos['entry'])
   value+=pos['qty']*mark*(1-slip)*(1-fee)
  peak=max(peak,value);dd=max(dd,(peak-value)/peak);equity.append((t,value))
 if pos:
  s=pos['symbol'];available=[(t,r) for t,r in bars[s].items() if pos['time']<=t<end]
  t,last=max(available)
  proceeds=pos['qty']*last[4]*(1-slip)*(1-fee);pnl=proceeds-pos['cost'];cash+=proceeds
  trades.append({'symbol':s,'entry_time':pos['time'],'exit_time':end,'pnl':pnl,'net_pct':pnl/pos['cost']*100,'hold_hours':(end-pos['time'])/3600,'reason':'end_liquidation'})
  forced=True
  peak=max(peak,cash);dd=max(dd,(peak-cash)/peak)
 pnls=[r['pnl'] for r in trades];wins=sum(p>0 for p in pnls)
 gains=sum(p for p in pnls if p>0);losses=-sum(p for p in pnls if p<0)
 bycoin={s:sum(r['pnl'] for r in trades if r['symbol']==s) for s in universe}
 half=start+(end-start)//2//3600*3600
 halves=[sum(r['pnl'] for r in trades if (r['exit_time']<=half if part==0 else r['exit_time']>half)) for part in range(2)]
 return {'strategy':name,'start':start,'end':end,'trades':len(trades),'pnl_usd':cash-100,'return_on_100_pct':cash-100,'mean_pnl_per_10_trade':statistics.mean(pnls) if pnls else None,'win_rate':wins/len(pnls) if pnls else None,'profit_factor':gains/losses if losses else (None if gains==0 else 'no_losses'),'max_drawdown_pct':dd*100,'exposure_pct':exposure/max(1,len(equity))*100,'median_hold_hours':statistics.median([r['hold_hours'] for r in trades]) if trades else None,'best_trade_usd':max(pnls) if pnls else None,'pnl_excluding_best_trade':sum(pnls)-(max(pnls) if pnls else 0),'by_coin':bycoin,'half_period_pnl':halves,'end_liquidation':forced,'ledger':trades}

def baselines(universe,start,end,fee,slip,bars):
 results={}
 for s in universe:
  rows=[r for t,r in sorted(bars[s].items()) if start<=t<end]
  # Require the period's first bar for comparable start-of-period holdings.
  if not rows or rows[0][0]!=start or rows[-1][0]!=end-3600:continue
  results[s]=roundtrip(rows[0][1],rows[-1][4],fee,slip)
 return {'cash_pnl':0,'btc_buy_hold_10_usd_pnl':results.get('BTC-USD'),'equal_weight_buy_hold_10_total_usd_pnl':statistics.mean(results.values()) if results else None,'eligible_symbols':list(results),'individual_buy_hold_10_usd_pnl':results}

def main():
 bars={};features={};quality=[]
 for s in P['symbols']:
  rows=json.loads((ROOT/'candles'/f'{s}.json').read_text());bars[s]={int(r[0]):r for r in rows};features[s]=feature_rows(rows)
  quality.append({'symbol':s,'bars':len(rows),'expected':4320,'feature_bars':len(features[s]),'duplicates':len(rows)-len(bars[s]),'first':rows[0][0] if rows else None,'last':rows[-1][0] if rows else None})
 universe={'majors':['BTC-USD','ETH-USD','SOL-USD','XRP-USD'],'memes':[s for s in P['symbols'] if s not in ['BTC-USD','ETH-USD','SOL-USD','XRP-USD']]}
 periods={'development':(P['start']+7*86400,P['split']),'validation':(P['split'],P['end'])}
 scenarios={'verified_taker_10bps_slippage':(.009,.001),'verified_taker_25bps_slippage':(.009,.0025),'maker_fee_only_sensitivity':(.005,.001)}
 results=[];baseline=[]
 for period,(start,end) in periods.items():
  for group,symbols in universe.items():
   baseline.append({'period':period,'universe':group,**baselines(symbols,start,end,.009,.001,bars)})
   for scenario,(fee,slip) in scenarios.items():
    for name in P['strategies']:
     r=simulate(name,symbols,start,end,fee,slip,bars,features);r.update({'period':period,'universe':group,'scenario':scenario});results.append(r)
 out={'protocol':P,'rules':RULES,'quality':quality,'baselines':baseline,'results':results,'calculated_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (ROOT/'results.json').write_text(json.dumps(out,indent=2))
 columns=['period','universe','scenario','strategy','trades','pnl_usd','mean_pnl_per_10_trade','win_rate','profit_factor','max_drawdown_pct','pnl_excluding_best_trade']
 with open(ROOT/'summary.csv','w') as f:
  w=csv.DictWriter(f,fieldnames=columns,extrasaction='ignore');w.writeheader();w.writerows(results)
 for r in results:
  if r['period']=='validation' and r['scenario']=='verified_taker_10bps_slippage': print(json.dumps({k:r[k] for k in columns}),flush=True)
 print('BASELINES',json.dumps([b for b in baseline if b['period']=='validation']),flush=True)
if __name__=='__main__':main()
