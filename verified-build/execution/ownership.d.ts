/** One process owns the persistent order state. Stale PID files can be reclaimed. */
export declare function claimRunner(file: string): () => void;
