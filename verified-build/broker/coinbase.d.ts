export interface Order {
    symbol: string;
    side: 'buy' | 'sell';
    sizeUsd: number;
    type: 'market';
}
/** Thrown only when the order provably did not reach the exchange. Safe to release the local lock. */
export declare class NotSubmittedError extends Error {
    constructor(message: string);
}
export interface Fill {
    orderId: string;
    symbol: string;
    side: string;
    sizeUsd: number;
    price: number;
    timestamp: string;
    fees: number;
    baseQuantity?: string;
}
/**
 * Live Coinbase broker.
 * Only used when MODE=live AND LIVE_TRADING=true AND keys are present.
 */
export declare class CoinbaseBroker {
    private client;
    constructor();
    isReady(): boolean;
    place(order: Order, currentMid: number, clientOrderId?: `${string}-${string}-${string}-${string}-${string}`): Promise<Fill>;
    tradingPermissions(): Promise<{
        canView: boolean;
        canTrade: boolean;
    }>;
    availableUsd(): Promise<number>;
    /** Read-only lookup. A missing order never proves that submission failed. */
    findPending(clientOrderId: string, symbol: string): Promise<{
        order_id: string;
        product_id: string;
        client_order_id: string;
        side: 'BUY' | 'SELL';
        status: string;
        filled_size: string;
        filled_value: string;
        total_fees: string;
        average_filled_price: string;
    } | null>;
    sellOwned(position: {
        symbol: string;
        quantity: string;
    }, market: {
        bid: number;
        baseIncrement: string;
        minBase: number;
        minQuote: number;
    }, clientOrderId?: `${string}-${string}-${string}-${string}-${string}`): Promise<Fill>;
}
