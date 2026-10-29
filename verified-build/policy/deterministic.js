import { envNumber, envBoolean } from './env.js';
import { assertTradeSize, MAX_TRADE_USD } from './limits.js';
/** Pure rule evaluation: identical completed data and configuration give identical decisions. */
export function decideDeterministic(s) {
    const skip = (reason) => ({ action: 'skip', size: 0, reason });
    const context = s.venue_history;
    if (!s.history_complete || !context)
        return skip('completed multi-venue history unavailable');
    if (context.source_count < envNumber('MIN_HISTORY_SOURCES'))
        return skip('insufficient history sources');
    if (![context.mean_return_5, context.mean_return_15, context.upward_fraction].every(Number.isFinite))
        return skip('invalid trend observations');
    if (context.mean_return_5 < envNumber('MIN_ENTRY_RETURN_5') || context.mean_return_15 < envNumber('MIN_ENTRY_RETURN_15'))
        return skip('aggregate trend below configured entry returns');
    if (context.upward_fraction < envNumber('DETERMINISTIC_MIN_UPWARD_FRACTION'))
        return skip('insufficient upward venue agreement');
    if (envBoolean('REQUIRE_FIB_BUY_ZONE') && !s.golden?.in_buy_zone)
        return skip('outside Fibonacci buy zone');
    if (envBoolean('REQUIRE_TARGET_MARGIN') && (!s.golden?.valid || !Number.isFinite(s.golden.estimated_net_target_margin_bps) || s.golden.estimated_net_target_margin_bps < envNumber('MIN_TARGET_NET_MARGIN_BPS')))
        return skip('Fibonacci target does not clear estimated costs');
    const size = Math.min(envNumber('BASE_SIZE_USD'), envNumber('MAX_POSITION_USD'), MAX_TRADE_USD);
    try {
        assertTradeSize(size);
    }
    catch {
        return skip('configured entry size is outside notional limits');
    }
    return { action: 'long', size, reason: 'deterministic trend and configured timing rules passed' };
}
//# sourceMappingURL=deterministic.js.map