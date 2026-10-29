import { envNumber, envText } from '../policy/env.js';
import { confirmedSwing } from './swings.js';
export function goldenAnalysis(bars, ask, context) {
    const lookback = envNumber('FIB_LOOKBACK_BARS');
    const phi = envNumber('GOLDEN_RATIO');
    if (!Number.isInteger(lookback) || lookback < 2 || phi <= 1)
        throw Error('Invalid Fibonacci configuration');
    const window = bars.slice(-lookback);
    if (!window.length || !Number.isFinite(ask) || ask <= 0)
        throw Error('Missing Fibonacci candles or valid ask');
    if (window.some((b, i) => ![b.start, b.close, b.low, b.high].every(Number.isFinite) || b.low <= 0 || b.high < b.low || b.close < b.low || b.close > b.high || (i > 0 && b.start <= window[i - 1].start)))
        throw Error('Invalid Fibonacci candles');
    const method = envText('FIB_SWING_METHOD');
    if (!['confirmed', 'legacy'].includes(method))
        throw Error('Invalid FIB_SWING_METHOD');
    const swing = method === 'confirmed' ? confirmedSwing(window) : null;
    const lowBar = swing?.low ?? window.reduce((a, b) => b.low < a.low ? b : a);
    const afterLow = window.filter(b => b.start > lowBar.start);
    const highBar = swing?.high ?? (afterLow.length ? afterLow.reduce((a, b) => b.high > a.high ? b : a) : lowBar);
    const range = highBar.high - lowBar.low;
    const valid = method === 'confirmed' ? Boolean(swing?.valid) : afterLow.length > 0 && range > 0;
    const shallow = highBar.high - range / (phi * phi);
    const deep = highBar.high - range / phi;
    const costBps = envNumber('ROUND_TRIP_FEE_BPS') + envNumber('SLIPPAGE_BUFFER_BPS');
    const targetMode = envText('FIB_TARGET_MODE');
    const powers = envText('FIB_EXTENSION_POWERS').split(',').map(Number);
    if (!['extension', 'nearest'].includes(targetMode) || !powers.length || powers.some((p, i) => !Number.isFinite(p) || p < 0 || (i > 0 && p <= powers[i - 1])))
        throw Error('Invalid Fibonacci target configuration');
    const levels = powers.map(power => ({ power, price: highBar.high + range * (phi ** power - 1) }));
    const eligible = levels.filter(level => (level.price / ask - 1) * 10000 - costBps >= envNumber('MIN_TARGET_NET_MARGIN_BPS'));
    const selected = targetMode === 'nearest' ? eligible[0] : undefined;
    const target = selected?.price ?? highBar.high + range * (phi - 1);
    const gross = (target / ask - 1) * 10000;
    const net = gross - costBps;
    const buyTiming = valid ? highBar.start + (highBar.start - lowBar.start) / phi : null;
    const timing = valid ? highBar.start + (highBar.start - lowBar.start) * phi : null;
    const inZone = valid && ask >= deep && ask <= shallow;
    const last = window.at(-1);
    const touchedZone = valid && last.low <= shallow + (swing?.zoneTolerance ?? 0) && last.high >= deep - (swing?.zoneTolerance ?? 0);
    const entryReady = method === 'confirmed' ? Boolean(valid && swing?.trendUp && swing.rebound && touchedZone && ask > lowBar.low && ask < highBar.high) : inZone;
    return {
        swing_method: method, confirmed_at: swing ? new Date(swing.confirmedAt * 1000).toISOString() : null,
        swing_confirmed: Boolean(swing), swing_invalidated: swing?.invalidated ?? false,
        atr: swing?.atr ?? null, trend_fast_ema: swing?.fastEma ?? null, trend_slow_ema: swing?.slowEma ?? null,
        trend_up: swing?.trendUp ?? false, rebound_confirmed: swing?.rebound ?? false,
        entry_ready: entryReady, zone_touched: touchedZone,
        entry_method: 'confirmed swing, volatility filter, EMA trend and closed-candle rebound; heuristic',
        sell_levels: levels, target_selection: targetMode,
        selected_target_power: selected?.power ?? 1,
        target_clears_configured_costs: eligible.some(level => level.price === target),
        structural_invalidation_price: lowBar.low,
        valid, swing_low: lowBar.low, swing_high: highBar.high,
        buy_zone_low: deep, buy_zone_high: shallow, sell_target: target,
        in_buy_zone: inZone,
        near_buy_time: buyTiming !== null && Math.abs(Date.parse(context.venues[0].receivedAt) - buyTiming * 1000) <= envNumber('FIB_TIMING_TOLERANCE_MS'),
        projected_buy_timing_utc: buyTiming === null ? null : new Date(buyTiming * 1000).toISOString(),
        projected_sell_timing_utc: timing === null ? null : new Date(timing * 1000).toISOString(),
        projected_timing_utc: timing === null ? null : new Date(timing * 1000).toISOString(),
        timing_method: 'swing duration multiplied by configured golden ratio; heuristic only',
        gross_target_margin_bps: gross, estimated_net_target_margin_bps: net,
        estimated_profit_usd_at_configured_size: envNumber('BASE_SIZE_USD') * net / 10000,
        upward_venue_fraction: context.upward_fraction,
        costs_bps: costBps, target_is_projection: true,
    };
}
export function positionSignal(position, bid, golden, context, sellFeeRate = envNumber('SELL_FEE_BPS') / 10000) {
    if (!Number.isFinite(sellFeeRate) || sellFeeRate < 0 || sellFeeRate >= 1)
        throw Error('Invalid sell fee rate');
    const gross = (bid / position.entry - 1) * 10000;
    const net = position.quantity && position.fees !== undefined
        ? ((Number(position.quantity) * bid * (1 - sellFeeRate) * (1 - envNumber('SLIPPAGE_BUFFER_BPS') / 10000)) / (position.size + position.fees) - 1) * 10000
        : gross - envNumber('ROUND_TRIP_FEE_BPS') - envNumber('SLIPPAGE_BUFFER_BPS');
    const ageHours = (Date.now() - Date.parse(position.entryTime)) / 3600000;
    const target = (position.sellTarget !== undefined || golden.valid) && bid >= (position.sellTarget ?? golden.sell_target) && net >= envNumber('EXIT_MIN_PROFIT_BPS');
    const down = context.mean_return_5 < 0 && context.mean_return_15 < 0;
    const stop = gross <= -envNumber('EXIT_STOP_LOSS_PCT') * 100;
    const trailing = bid / (position.high ?? position.entry) - 1 <= -envNumber('EXIT_TRAILING_PCT') / 100;
    const timed = ageHours >= envNumber('EXIT_MAX_HOLD_HOURS');
    return { action: stop || trailing || timed || target || (down && net >= envNumber('EXIT_MIN_PROFIT_BPS')) ? 'sell' : 'hold',
        reason: stop ? 'configured stop loss' : trailing ? 'configured trailing stop' : timed ? 'configured maximum hold' : target ? 'Fibonacci extension target' : down && net >= envNumber('EXIT_MIN_PROFIT_BPS') ? 'profitable downward venue trend' : 'await exit signal',
        estimated_net_margin_bps: net, estimated_profit_usd: (position.size + (position.fees ?? 0)) * net / 10000,
        age_hours: ageHours, projection_only: true };
}
//# sourceMappingURL=golden.js.map