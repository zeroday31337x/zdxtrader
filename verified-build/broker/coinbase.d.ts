export interface Order {
    symbol: string;
    side: 'buy' | 'sell';
    sizeUsd: number;
    type: 'market';
}
export interface Fill {
    orderId: string;
    symbol: string;
    side: string;
    sizeUsd: number;
    price: number;
    timestamp: string;
    fees: number;
}
/**
 * Live Coinbase broker.
 * Only used when MODE=live AND LIVE_TRADING=true AND keys are present.
 * Keys must be trading-only (no transfer / withdraw permissions).
 */
export declare class CoinbaseBroker {
    private client;
    constructor();
    isReady(): boolean;
    place(order: Order, currentMid: number, clientOrderId?: `${string}-${string}-${string}-${string}-${string}`): Promise<Fill>;
}
