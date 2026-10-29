export type Bar = {
    start: number;
    close: number;
    high: number;
    low: number;
    volume: number;
};
export type VenueHistory = {
    exchange: string;
    pair: string;
    quote: string;
    bid: number;
    ask: number;
    receivedAt: string;
    candles: Bar[];
    ret5: number;
    ret15: number;
};
export type HistoryContext = {
    venues: VenueHistory[];
    unavailable: {
        exchange: string;
        reason: string;
    }[];
    source_count: number;
    upward_fraction: number;
    mean_return_5: number;
    mean_return_15: number;
    normalized_history: {
        start: number;
        index: number;
        sources: number;
    }[];
};
export declare function validateBars(raw: Bar[], interval: number, count: number, now?: number): Bar[];
export declare function summarizeVenue(exchange: string, pair: string, quote: string, bid: number, ask: number, candles: Bar[]): VenueHistory;
export declare function fetchVenueHistory(exchange: string, symbol: string, interval: number, count: number): Promise<VenueHistory>;
export declare function combineHistories(venues: VenueHistory[], unavailable?: HistoryContext['unavailable']): HistoryContext;
export declare function collectHistoryContext(symbol: string, coinbase: VenueHistory, interval: number, count: number): Promise<HistoryContext>;
