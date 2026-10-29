import type { MarketSnapshot } from '../state/scanner.js';
/** Persist all scanned candidates, including the ones rejected by entry filters. */
export declare function saveAnalysis(snapshots: MarketSnapshot[], now?: number): Promise<void>;
