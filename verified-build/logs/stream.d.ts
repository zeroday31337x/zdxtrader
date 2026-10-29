/** Bounded background writes: disk latency never blocks the market/order request. */
export declare function appendTelemetry(category: string, provider: string, value: unknown): void;
export declare function flushTelemetry(): Promise<void>;
