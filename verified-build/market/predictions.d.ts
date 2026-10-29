export type PredictionObservation = {
    kind: 'observation';
    timestamp: string;
    ticker: string;
    symbol: 'BTC-USD';
    close_time: string;
    seconds_to_close: number;
    yes_ask: number | null;
    no_ask: number | null;
    resting_bid_imbalance: number | null;
    yes_bid_notional: number;
    no_bid_notional: number;
    reference: unknown;
    market: unknown;
    orderbook: unknown;
    fee_assumption: {
        per_contract_usd: number;
        slippage_per_contract_usd: number;
        source: string;
    };
};
export type PredictionSettlement = {
    kind: 'settlement';
    timestamp: string;
    ticker: string;
    result: 'yes' | 'no';
    close_time: string;
    market: unknown;
};
export declare function predictionBook(book: any): {
    yes_ask: number | null;
    no_ask: number | null;
    yes_bid_notional: number;
    no_bid_notional: number;
    resting_bid_imbalance: number | null;
};
export declare function collectPredictionOnce(): Promise<{
    timestamp: string;
    mode: string;
    series: string;
    active_markets: any;
    observations: PredictionObservation[];
    settlements_added: number;
    notes: string[];
}>;
export declare function startPredictionCollector(): void;
