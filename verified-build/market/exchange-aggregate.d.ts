export interface ExchangeBookSnapshot {
    exchange: 'binance' | 'kraken' | 'crypto.com';
    mid: number;
    spread_bps: number;
    imbalance: number;
    bid: number;
    ask: number;
    bidSize: number;
    askSize: number;
}
export interface ExchangeAggregate {
    mid: number;
    spread_bps: number;
    imbalance: number;
    source_count: number;
    exchanges: string[];
}
export declare function aggregateExchangeContext(symbol: string): Promise<ExchangeAggregate | null>;
