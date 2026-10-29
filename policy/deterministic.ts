import { envNumber, envBoolean } from './env.js';
import { assertTradeSize, tradeSize } from './limits.js';
import type { MarketSnapshot } from '../state/scanner.js';
export type EntryDecision = {action:'long'|'skip';size:number;reason:string;confidence?:number;confidence_source?:string};

/** Pure rule evaluation: identical completed data and configuration give identical decisions. */
export function decideDeterministic(s: MarketSnapshot): EntryDecision {
  const skip=(reason:string):EntryDecision=>({action:'skip',size:0,reason});
  const context=s.venue_history;
  if(!s.history_complete||!context)return skip('completed multi-venue history unavailable');
  if(context.source_count<envNumber('MIN_HISTORY_SOURCES'))return skip('insufficient history sources');
  if(![context.mean_return_5,context.mean_return_15,context.upward_fraction].every(Number.isFinite))return skip('invalid trend observations');
  if(context.mean_return_5<envNumber('MIN_ENTRY_RETURN_5')||context.mean_return_15<envNumber('MIN_ENTRY_RETURN_15'))return skip('aggregate trend below configured entry returns');
  if(context.upward_fraction<envNumber('DETERMINISTIC_MIN_UPWARD_FRACTION'))return skip('insufficient upward venue agreement');
  if(envBoolean('REQUIRE_FIB_BUY_ZONE')&&!s.golden?.entry_ready)return skip('Fibonacci swing, trend or rebound confirmation unavailable');
  if(envBoolean('REQUIRE_TARGET_MARGIN')&&(!s.golden?.valid||!Number.isFinite(s.golden.estimated_net_target_margin_bps)||s.golden.estimated_net_target_margin_bps<envNumber('MIN_TARGET_NET_MARGIN_BPS')))return skip('Fibonacci target does not clear estimated costs');
  const strength5=envNumber('CONFIDENCE_RETURN_SCALE_5'),strength15=envNumber('CONFIDENCE_RETURN_SCALE_15');
  if(strength5<=0||strength15<=0)return skip('invalid confidence trend scales');
  const strength=(Math.max(0,Math.min(1,context.mean_return_5/strength5))+Math.max(0,Math.min(1,context.mean_return_15/strength15)))/2;
  const confidence=Math.max(0,Math.min(1,context.upward_fraction*strength));
  const size=tradeSize(confidence);
  try {assertTradeSize(size);}catch{return skip('configured entry size is outside notional limits');}
  return {action:'long',size,confidence,confidence_source:'deterministic trend strength and venue agreement; not a calibrated win probability',reason:'deterministic trend and configured timing rules passed'};
}
