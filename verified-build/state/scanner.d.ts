export declare const MEME_PRODUCTS: string[];
export declare const SHORT_PRODUCTS: string[];
export interface MarketSnapshot {
    mid: number;
    spread_bps: number;
    imbalance: number;
    realized_vol_1m?: number;
    realized_vol_5m?: number;
    ret_1m?: number;
    ret_5m?: number;
    ret_15m?: number;
    timestamp: string;
    symbol: string;
    estimated_edge_bps: number;
    strategy: 'short_term' | 'meme_swing';
    horizon: string;
    history_complete: boolean;
    account_state_available: false;
    quote_min_size: number;
    quote_max_size: number;
    ask_depth_usd: number;
    ret_1h?: number;
    ret_6h?: number;
    ret_24h?: number;
    realized_vol_24h?: number;
    volume_usd_24h?: number;
    volume_ratio_24h?: number;
}
type Candle = {
    start: number;
    close: number;
    volume: number;
};
export declare function completedCandles(raw: any[], interval: number, count: number, now?: number): Candle[];
export declare function historyFeatures(c: Candle[]): {
    ret: (bars: number) => number;
    vol: (bars: number) => number;
};
export declare function scanProducts(products?: string[], strategy?: 'short_term' | 'meme_swing'): Promise<MarketSnapshot[]>;
export declare function filterClearingFees(snapshots: MarketSnapshot[]): MarketSnapshot[];
export declare function filterMemeCandidates(snapshots: MarketSnapshot[]): MarketSnapshot[];
export declare function buildBestSnapshot(): Promise<MarketSnapshot | null>;
export declare function buildBestMemeSnapshot(): Promise<MarketSnapshot | null>;
export {};
