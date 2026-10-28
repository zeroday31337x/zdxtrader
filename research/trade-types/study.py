#!/usr/bin/env python3
"""Offline-only exploratory screen. No broker or network imports."""
import json,math,statistics,datetime,csv
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OLD=ROOT.parent/'profit-study'
P=json.loads((OLD/'protocol.json').read_text())
PROTOCOL=json.loads((ROOT/'protocol.json').read_text())
STRATEGIES=list(PROTOCOL['strategies'])

def features(rows,btc_rows):
 btc={r[0]:r for r in btc_rows};out={};window=[];previous_rsi=None
 for r in rows:
  t,o,h,l,c,v=r
  if not all(math.isfinite(x) for x in r) or t%3600 or min(o,h,l,c)<=0 or v<0 or h<max(o,c) or l>min(o,c):raise ValueError('Invalid OHLCV')
  if window and t-window[-1][0]!=3600:window=[];previous_rsi=None
  window.append(r)
  if len(window)>169:window.pop(0)
  if len(window)<169:continue
  closes=[x[4] for x in window];mean=lambda n:sum(closes[-n:])/n
  avg=mean(24);sd=math.sqrt(sum((x-avg)**2 for x in closes[-24:])/24)
  changes=[b-a for a,b in zip(closes[-15:-1],closes[-14:])]
  gain=sum(max(x,0) for x in changes)/14;loss=sum(max(-x,0) for x in changes)/14
  rsi=100 if loss==0 and gain>0 else 50 if loss==0 else 100-100/(1+gain/loss)
  vol=lambda a:sum(x[4]*x[5] for x in a)
  pv=vol(window[-48:-24]);ratios=[x[4]/btc[x[0]][4] for x in window[-72:] if x[0] in btc]
  zratio=None
  if len(ratios)==72:
   m=statistics.mean(ratios);s=statistics.pstdev(ratios);zratio=(ratios[-1]-m)/s if s else 0
  out[t]={'close':c,'rsi':rsi,'previous_rsi':previous_rsi,'z24':(c-avg)/sd if sd else 0,'sma24':avg,'sma72':mean(72),'sma168':mean(168),'ret1':c/closes[-2]-1,'ret24':c/closes[-25]-1,'ret168':c/closes[-169]-1,'vol_ratio':vol(window[-24:])/pv if pv>0 else 0,'high168':max(x[2] for x in window[:-1]),'relative_z72':zratio}
  previous_rsi=rsi
 return out

def signal(name,f,b):
 if name=='rsi_rebound':return f['previous_rsi'] is not None and f['previous_rsi']<30<=f['rsi']
 if name=='range_reversion':return b is not None and f['z24']<-1.5 and f['ret1']>0 and abs(b['ret24'])<.03
 if name=='capitulation_rebound':return f['ret24']<=-.08 and f['ret1']>0 and f['vol_ratio']>=1.5
 if name=='trend_dip':return f['close']>f['sma168'] and f['ret24']<-.03 and f['ret1']>0
 if name=='slow_trend':return b is not None and f['close']>f['sma168'] and f['sma72']>f['sma168'] and b['close']>b['sma168']
 if name=='weekly_breakout':return b is not None and f['close']>f['high168'] and f['vol_ratio']>=1 and b['close']>b['sma168']
 if name=='relative_reversion':return b is not None and f['relative_z72'] is not None and f['relative_z72']<-2 and f['ret1']>0 and b['ret24']>0
 if name=='weekly_rotation':return b is not None and b['ret168']>0 and f['ret168']>0
 return False

def score(name,f):
 if name in ['rsi_rebound','range_reversion','relative_reversion']:return -f['ret24']
 if name=='capitulation_rebound':return -f['ret24']
 return f['ret168']

def should_exit(name,pos,f,age):
 r=f['close']/pos['reference']-1
 peak=max(pos['peak'],f['close']);pos['peak']=peak
 if name=='weekly_rotation':return None
 stop={'rsi_rebound':-.06,'range_reversion':-.06,'capitulation_rebound':-.08,'trend_dip':-.06,'slow_trend':-.08,'weekly_breakout':-.08,'relative_reversion':-.06}[name]
 if r<=stop:return 'close_stop'
 maxhold={'rsi_rebound':120,'range_reversion':72,'capitulation_rebound':120,'trend_dip':168,'slow_trend':336,'weekly_breakout':336,'relative_reversion':120}[name]
 if age>=maxhold:return 'max_hold'
 if name=='rsi_rebound' and f['rsi']>=60:return 'rsi_recovery'
 if name=='range_reversion' and f['close']>=f['sma24']:return 'mean_recovery'
 if name in ['capitulation_rebound','trend_dip'] and r>=.08:return 'target'
 if name=='slow_trend' and age>=24 and f['close']<f['sma72']:return 'trend_exit'
 if name=='weekly_breakout' and f['close']/peak-1<=-.10:return 'trailing_close'
 if name=='relative_reversion' and f['relative_z72'] is not None and f['relative_z72']>=0:return 'relative_recovery'
 return None

def simulate(name,symbols,start,end,bars,F,model='market',slip=.001,fee=.009):
 cash=100.;pos=None;ledger=[];peak=100.;dd=0.;attempts=0;filled=0;exposure=0;mark=100.
 def close(t,price,reason):
  nonlocal cash,pos
  proceeds=pos['qty']*price*(1-slip)*(1-fee);pnl=proceeds-pos['cost'];cash+=proceeds
  ledger.append({'symbol':pos['symbol'],'entry_time':pos['time'],'exit_time':t,'entry_price':pos['price'],'exit_price_before_slippage':price,'pnl':pnl,'hours':(t-pos['time'])/3600,'reason':reason});pos=None
 for t in range(start,end,3600):
  b=F['BTC-USD'].get(t-3600)
  candidates=[]
  is_week=(t-start)%(168*3600)==0
  if name!='weekly_rotation' or is_week:
   for s in symbols:
    f=F[s].get(t-3600)
    if f and t in bars[s] and signal(name,f,b):candidates.append((score(name,f),s))
  selected=sorted(candidates,key=lambda x:(-x[0],x[1]))[0][1] if candidates else None
  if pos:
   s=pos['symbol'];f=F[s].get(t-3600);current=bars[s].get(t)
   # An open position always retains its raw close stop/max-hold even if a gap invalidates rolling features.
   prev=bars[s].get(t-3600)
   if f is None and prev:
    f={'close':prev[4],'rsi':0,'sma24':float('inf'),'sma72':0,'relative_z72':None}
   if current and f:
    age=(t-pos['time'])/3600
    reason=('rotation' if is_week and selected!=s else None) if name=='weekly_rotation' else should_exit(name,pos,f,age)
    if reason:close(t,current[1],reason)
  if pos is None and selected is not None:
   s=selected;current=bars[s][t];f=F[s][t-3600];entry_fee=fee
   attempts+=1
   if model=='post_only':
    limit=f['close']*.9975
    if not(current[1]>limit and current[3]<=limit*.999):continue
    price=limit;entry_fee=.005
   else:price=current[1]*(1+slip)
   if cash>=10*(1+entry_fee):
    filled+=1;pos={'symbol':s,'time':t,'reference':price,'price':price,'qty':10/price,'cost':10*(1+entry_fee),'peak':price};cash-=pos['cost']
  mark=cash
  if pos:
   exposure+=1;current=bars[pos['symbol']].get(t)
   # For market entries mark at this hour's open; for conditional intrabar limit fills use entry price to avoid before-entry marks.
   price=pos['price'] if pos['time']==t else (current[1] if current else pos['last_mark'])
   pos['last_mark']=price;mark+=pos['qty']*price*(1-slip)*(1-fee)
  peak=max(peak,mark);dd=max(dd,(peak-mark)/peak)
 if pos:
  s=pos['symbol'];last=max((r for t,r in bars[s].items() if pos['time']<=t<end),key=lambda r:r[0]);close(end,last[4],'period_end')
  peak=max(peak,cash);dd=max(dd,(peak-cash)/peak)
 pnls=[x['pnl'] for x in ledger]
 return {'strategy':name,'model':model,'trades':len(ledger),'pnl':cash-100,'average_pnl':statistics.mean(pnls) if pnls else None,'win_rate':sum(p>0 for p in pnls)/len(pnls) if pnls else None,'median_hours':statistics.median([x['hours'] for x in ledger]) if ledger else None,'max_drawdown_pct':100*dd,'without_best_trade':sum(pnls)-(max(pnls) if pnls else 0),'attempts':attempts,'filled':filled,'exposure_pct':exposure/((end-start)/3600)*100,'ledger':ledger}

def main():
 rows={s:json.loads((OLD/'candles'/f'{s}.json').read_text()) for s in P['symbols']};bars={s:{r[0]:r for r in v} for s,v in rows.items()};F={s:features(v,rows['BTC-USD']) for s,v in rows.items()}
 groups={'majors':['BTC-USD','ETH-USD','SOL-USD','XRP-USD'],'memes':P['symbols'][4:]}
 out=[]
 for group,symbols in groups.items():
  for name in STRATEGIES:
   for period,(start,end) in {'full':(P['start']+7*86400,P['end']),'recent60':(P['split'],P['end'])}.items():
    for model,slip,fee in [('market',.001,.009),('market_stress',.0025,.009),('post_only',.001,.009),('cost_free',0,0)]:
     r=simulate(name,symbols,start,end,bars,F,model,slip,fee);r.update({'group':group,'period':period});out.append(r)
 folds=[]
 for group,symbols in groups.items():
  for day in [60,90,120,150]:
   start=P['start']+day*86400;end=start+30*86400
   train=[simulate(name,symbols,start-60*86400,start,bars,F) for name in STRATEGIES]
   eligible=[r for r in train if r['trades']>=5 and r['pnl']>0]
   pick=max(eligible,key=lambda r:r['pnl']) if eligible else None
   result=simulate(pick['strategy'],symbols,start,end,bars,F) if pick else {'strategy':'cash','trades':0,'pnl':0,'ledger':[]}
   folds.append({'group':group,'start':start,'end':end,'selected':result['strategy'],'training_pnl':pick['pnl'] if pick else None,'test_pnl':result['pnl'],'test_trades':result['trades']})
 result={'protocol':PROTOCOL,'source_protocol':P,'feature_counts':{s:len(f) for s,f in F.items()},'results':out,'walk_forward_selector':folds}
 (ROOT/'results.json').write_text(json.dumps(result,indent=2))
 for r in out:
  if r['model']=='market':print(json.dumps({k:r[k] for k in ['group','strategy','period','trades','pnl','average_pnl','win_rate','without_best_trade','median_hours']}),flush=True)
 print('WALK_FORWARD',json.dumps(folds),flush=True)
if __name__=='__main__':main()
