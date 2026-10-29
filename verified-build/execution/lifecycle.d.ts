export type Fill = {
    orderId: string;
    quantity: number;
    price: number;
    fees: number;
    terminal: boolean;
};
export type Intent = {
    clientId: string;
    symbol: string;
    side: 'buy' | 'sell';
    quoteUsd?: number;
    quantity?: number;
};
export interface ExecutionAdapter {
    submit(intent: Intent): Promise<void>;
    reconcile(intent: Intent): Promise<Fill | null>;
}
type Position = {
    symbol: string;
    quantity: number;
    cost: number;
    entryTime: number;
    high: number;
};
type State = {
    version: 1;
    position: Position | null;
    pending: Intent | null;
    day: string;
    realized: number;
    seen: string[];
    events: any[];
};
/** Offline-testable execution state machine. Never instantiates an exchange client. */
export declare class Lifecycle {
    private file;
    private adapter;
    private now;
    private state;
    constructor(file: string, adapter: ExecutionAdapter, now?: () => number);
    snapshot(): State;
    private save;
    private rollDay;
    enter(symbol: string, availableUsd: number, entryFeeRate: number, dailyLossLimit: number): Promise<void>;
    reconcile(): Promise<void>;
    exitIfNeeded(price: number, quoteTime: number, rules: {
        stop: number;
        target: number;
        maxHoldHours: number;
        trailing: number;
    }): Promise<void>;
}
export {};
