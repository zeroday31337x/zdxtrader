import type { MarketSnapshot } from '../state/scanner.js';
export type EntryDecision = {
    action: 'long' | 'skip';
    size: number;
    reason: string;
    confidence?: number;
    confidence_source?: string;
};
/** Pure rule evaluation: identical completed data and configuration give identical decisions. */
export declare function decideDeterministic(s: MarketSnapshot): EntryDecision;
