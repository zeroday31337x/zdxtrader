import { type HistoryContext } from './history-context.js';
export declare function memeMetrics(symbol: string, context: HistoryContext, interval: number, feeBps: number, benchmarkReturn: number | null): {
    symbol: string;
    horizon_hours: number;
    source_count: number;
    venues: {
        exchange: string;
        pair: string;
        quote: string;
        bid: number;
        ask: number;
        received_at: string;
    }[];
    unavailable: {
        exchange: string;
        reason: string;
    }[];
    median_horizon_return_bps: number | null;
    relative_to_btc_bps: number | null;
    upward_agreement: number;
    coinbase_spread_bps: number | null;
    coinbase_24h_quote_turnover_estimate_usd: number | null;
    estimated_round_trip_cost_bps: number | null;
    trailing_momentum_after_cost_proxy_bps: number | null;
    fibonacci_projection: {
        buy_zone_low: number;
        buy_zone_high: number;
        extension_target: number;
        heuristic: boolean;
    } | null;
    historical_scenario: {
        method: string;
        total_signals: number;
        holdout_signals: number;
        mean_holdout_net_bps: number | null;
        holdout_win_fraction: number | null;
        status: string;
    };
    research_candidate: boolean;
    screen_reasons: string[];
    execution_blockers: string[];
    not_a_profit_forecast: boolean;
};
export declare function researchMemes(): Promise<{
    timestamp: string;
    horizon_hours: number;
    fee_bps_per_side: number;
    fee_source: string;
    benchmark: string;
    candidates: {
        symbol: string;
        horizon_hours: number;
        source_count: number;
        venues: {
            exchange: string;
            pair: string;
            quote: string;
            bid: number;
            ask: number;
            received_at: string;
        }[];
        unavailable: {
            exchange: string;
            reason: string;
        }[];
        median_horizon_return_bps: number | null;
        relative_to_btc_bps: number | null;
        upward_agreement: number;
        coinbase_spread_bps: number | null;
        coinbase_24h_quote_turnover_estimate_usd: number | null;
        estimated_round_trip_cost_bps: number | null;
        trailing_momentum_after_cost_proxy_bps: number | null;
        fibonacci_projection: {
            buy_zone_low: number;
            buy_zone_high: number;
            extension_target: number;
            heuristic: boolean;
        } | null;
        historical_scenario: {
            method: string;
            total_signals: number;
            holdout_signals: number;
            mean_holdout_net_bps: number | null;
            holdout_win_fraction: number | null;
            status: string;
        };
        research_candidate: boolean;
        screen_reasons: string[];
        execution_blockers: string[];
        not_a_profit_forecast: boolean;
    }[];
    coverage: {
        symbol: string;
        intervals: string[];
        failures: unknown[];
    }[];
    correlations: {
        method: string;
        minimum_samples: number;
        findings: {
            leader: string;
            follower: string;
            lag_bars: number;
            samples: number;
            pearson: number;
        }[];
    };
    notes: string[];
}>;
export declare function scheduleMemeResearch(): void;
