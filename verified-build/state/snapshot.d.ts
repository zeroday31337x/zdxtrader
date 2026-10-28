export interface MarketSnapshot {
    mid: number;
    spread_bps: number;
    imbalance: number;
    realized_vol_1m: number;
    realized_vol_5m: number;
    ret_1m: number;
    ret_5m: number;
    ret_15m: number;
    inventory_usd: number;
    drawdown_pct: number;
    timestamp: string;
    symbol: string;
}
/**
 * Builds a lean snapshot from live Coinbase public data.
 * No API key required. Only pre-decision numbers.
 */
export declare function buildSnapshot(): Promise<MarketSnapshot>;
