import type { MarketSnapshot } from '../state/scanner.js';
export declare function measuredCorrelations(snapshots: MarketSnapshot[]): {
    method: string;
    minimum_samples: number;
    findings: {
        leader: string;
        follower: string;
        lag_bars: number;
        samples: number;
        pearson: number;
    }[];
};
