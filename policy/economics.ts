import { envNumber } from './env.js';

/** A projected target is a scenario, never a guaranteed return. */
export function entryEconomics(input: {sizeUsd:number;ask:number;target:number;takerFeeRate:number}) {
  const {sizeUsd,ask,target,takerFeeRate}=input;
  if(![sizeUsd,ask,target,takerFeeRate].every(Number.isFinite)||sizeUsd<=0||ask<=0||target<=0||takerFeeRate<0||takerFeeRate>=1)throw Error('Invalid entry economics inputs');
  const slippage=envNumber('SLIPPAGE_BUFFER_BPS')/10000;
  const minimumUsd=envNumber('ENTRY_MIN_NET_PROFIT_USD');
  const minimumBps=envNumber('ENTRY_MIN_NET_MARGIN_BPS');
  if(slippage<0||slippage>=1||minimumUsd<0||minimumBps<0)throw Error('Invalid entry economics configuration');
  const cost=sizeUsd*(1+takerFeeRate);
  const proceeds=sizeUsd/ask*target*(1-takerFeeRate)*(1-slippage);
  const projectedNetUsd=proceeds-cost;
  const projectedNetBps=projectedNetUsd/cost*10000;
  const breakEvenBid=cost/(sizeUsd/ask*(1-takerFeeRate)*(1-slippage));
  return {approved:projectedNetUsd>=minimumUsd&&projectedNetBps>=minimumBps,
    projectedNetUsd,projectedNetBps,breakEvenBid,takerFeeRate,minimumUsd,minimumBps,
    projectionOnly:true};
}
