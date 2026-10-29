import { envNumber } from '../policy/env.js';
import type { Bar, HistoryContext } from './history-context.js';

export function goldenAnalysis(bars: Bar[], ask: number, context: HistoryContext) {
  const lookback=envNumber('FIB_LOOKBACK_BARS');
  const phi=envNumber('GOLDEN_RATIO');
  if(!Number.isInteger(lookback)||lookback<2||phi<=1)throw Error('Invalid Fibonacci configuration');
  const window=bars.slice(-lookback);
  const lowBar=window.reduce((a,b)=>b.low<a.low?b:a);
  const afterLow=window.filter(b=>b.start>lowBar.start);
  const highBar=afterLow.length?afterLow.reduce((a,b)=>b.high>a.high?b:a):lowBar;
  const range=highBar.high-lowBar.low;
  const valid=afterLow.length>0&&range>0;
  const shallow=highBar.high-range/(phi*phi);
  const deep=highBar.high-range/phi;
  const target=highBar.high+range*(phi-1);
  const costBps=envNumber('ROUND_TRIP_FEE_BPS')+envNumber('SLIPPAGE_BUFFER_BPS');
  const gross=(target/ask-1)*10000;
  const net=gross-costBps;
  const buyTiming=valid?highBar.start+(highBar.start-lowBar.start)/phi:null;
  const timing=valid?highBar.start+(highBar.start-lowBar.start)*phi:null;
  return {
    valid, swing_low:lowBar.low,swing_high:highBar.high,
    buy_zone_low:deep,buy_zone_high:shallow,sell_target:target,
    in_buy_zone:valid&&ask>=deep&&ask<=shallow,
    near_buy_time:buyTiming!==null&&Math.abs(Date.parse(context.venues[0].receivedAt)-buyTiming*1000)<=envNumber('FIB_TIMING_TOLERANCE_MS'),
    projected_buy_timing_utc:buyTiming===null?null:new Date(buyTiming*1000).toISOString(),
    projected_sell_timing_utc:timing===null?null:new Date(timing*1000).toISOString(),
    projected_timing_utc:timing===null?null:new Date(timing*1000).toISOString(),
    timing_method:'swing duration multiplied by configured golden ratio; heuristic only',
    gross_target_margin_bps:gross,estimated_net_target_margin_bps:net,
    estimated_profit_usd_at_configured_size:envNumber('BASE_SIZE_USD')*net/10000,
    upward_venue_fraction:context.upward_fraction,
    costs_bps:costBps, target_is_projection:true,
  };
}

export function positionSignal(position: {size:number;entry:number;entryTime:string;quantity?:string;fees?:number;sellTarget?:number;high?:number}, bid: number, golden: ReturnType<typeof goldenAnalysis>, context: HistoryContext) {
  const gross=(bid/position.entry-1)*10000;
  const net=position.quantity && position.fees !== undefined
    ? ((Number(position.quantity)*bid*(1-envNumber('SELL_FEE_BPS')/10000-envNumber('SLIPPAGE_BUFFER_BPS')/10000))/(position.size+position.fees)-1)*10000
    : gross-envNumber('ROUND_TRIP_FEE_BPS')-envNumber('SLIPPAGE_BUFFER_BPS');
  const ageHours=(Date.now()-Date.parse(position.entryTime))/3600000;
  const target=(position.sellTarget!==undefined||golden.valid)&&bid>=(position.sellTarget??golden.sell_target)&&net>=envNumber('EXIT_MIN_PROFIT_BPS');
  const down=context.mean_return_5<0&&context.mean_return_15<0;
  const stop=gross<=-envNumber('EXIT_STOP_LOSS_PCT')*100;
  const trailing=bid/(position.high??position.entry)-1<=-envNumber('EXIT_TRAILING_PCT')/100;
  const timed=ageHours>=envNumber('EXIT_MAX_HOLD_HOURS');
  return {action:stop||trailing||timed||target||(down&&net>=envNumber('EXIT_MIN_PROFIT_BPS'))?'sell':'hold',
    reason:stop?'configured stop loss':trailing?'configured trailing stop':timed?'configured maximum hold':target?'Fibonacci extension target':down&&net>=envNumber('EXIT_MIN_PROFIT_BPS')?'profitable downward venue trend':'await exit signal',
    estimated_net_margin_bps:net,estimated_profit_usd:(position.size+(position.fees??0))*net/10000,
    age_hours:ageHours,projection_only:true};
}
