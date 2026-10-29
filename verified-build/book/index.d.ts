export type Position = {
    quantity?: string;
    fees?: number;
    sellTarget?: number;
    high?: number;
    pendingSide?: 'buy' | 'sell';
    symbol: string;
    size: number;
    entry: number;
    entryTime: string;
    status: 'pending' | 'open';
    clientOrderId?: string;
};
export declare class Book {
    private file;
    private open;
    constructor(file?: string);
    private save;
    hasOpen(): boolean;
    reserve(symbol: string, size: number, clientOrderId: string): void;
    openPosition(symbol: string, size: number, entry: number, details?: {
        quantity?: string;
        fees?: number;
        sellTarget?: number;
    }): void;
    close(): Position | null;
    /** Clears a reservation only if still pending and matching this client order ID. */
    release(clientOrderId: string): boolean;
    reserveExit(clientOrderId: string): void;
    updateHigh(price: number): void;
    applySale(quantity: string): void;
    getOpen(): Position | null;
}
