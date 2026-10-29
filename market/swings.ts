import { envNumber } from '../policy/env.js';
import type { Bar } from './history-context.js';

/** Only pivots whose right-hand confirming candles already exist are eligible. */
export function confirmedSwing(bars:Bar[]) {
  const radius=envNumber('FIB_PIVOT_RADIUS');
  const atrPeriod=envNumber('FIB_ATR_PERIOD');
  const fast=envNumber('FIB_TREND_FAST_BARS'),slow=envNumber('FIB_TREND_SLOW_BARS');
  const minAtr=envNumber('FIB_MIN_SWING_ATR');
  const tolerance=envNumber('FIB_ZONE_TOLERANCE_ATR');
  if(![radius,atrPeriod,fast,slow].every(x=>Number.isInteger(x)&&x>0)||fast>=slow||minAtr<0||tolerance<0)throw Error('Invalid Fibonacci swing configuration');
  if(bars.length<Math.max(slow,atrPeriod+1,2*radius+1))return null;
  const lows:number[]=[],highs:number[]=[];
  for(let i=radius;i<bars.length-radius;i++) {
    const others=bars.slice(i-radius,i+radius+1).filter((_,j)=>j!==radius);
    if(others.every(b=>bars[i].low<b.low))lows.push(i);
    if(others.every(b=>bars[i].high>b.high))highs.push(i);
  }
  const ranges=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
  const atr=ranges.slice(-atrPeriod).reduce((a,b)=>a+b,0)/atrPeriod;
  const ema=(period:number)=>bars.reduce((value,b,i)=>i===0?b.close:value+2/(period+1)*(b.close-value),bars[0].close);
  const fastEma=ema(fast),slowEma=ema(slow);
  for(const hi of [...highs].reverse()) {
    const lo=lows.filter(i=>i<hi).at(-1);
    if(lo===undefined)continue;
    const low=bars[lo],high=bars[hi];
    const invalidated=bars.slice(hi+1).some(b=>b.low<=low.low);
    return {low,high,confirmedAt:bars[hi+radius].start,
      valid:!invalidated&&high.high-low.low>=atr*minAtr&&high.high>low.low,
      invalidated,atr,zoneTolerance:atr*tolerance,fastEma,slowEma,
      trendUp:fastEma>slowEma&&bars.at(-1)!.close>slowEma,
      rebound:bars.at(-1)!.close>bars.at(-2)!.close,
      confirmationBars:radius};
  }
  return null;
}
