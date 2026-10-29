import type { Bar, HistoryContext } from './history-context.js';
export declare function goldenAnalysis(bars: Bar[], ask: number, context: HistoryContext): {
    valid: boolean;
    swing_low: number;
    swing_high: number;
    buy_zone_low: number;
    buy_zone_high: number;
    sell_target: number;
    in_buy_zone: boolean;
    near_buy_time: boolean;
    projected_buy_timing_utc: string | null;
    projected_sell_timing_utc: string | null;
    projected_timing_utc: string | null;
    timing_method: string;
    gross_target_margin_bps: number;
    estimated_net_target_margin_bps: number;
    estimated_profit_usd_at_configured_size: number;
    upward_venue_fraction: number;
    costs_bps: number;
    target_is_projection: boolean;
};
export declare function positionSignal(position: {
    size: number;
    entry: number;
    entryTime: string;
    quantity?: string;
    fees?: number;
    sellTarget?: number;
    high?: number;
}, bid: number, golden: ReturnType<typeof goldenAnalysis>, context: HistoryContext): {
    action: string;
    reason: string;
    estimated_net_margin_bps: number;
    estimated_profit_usd: number;
    age_hours: number;
    projection_only: boolean;
};
