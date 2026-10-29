import type { Bar } from './history-context.js';
/** Only pivots whose right-hand confirming candles already exist are eligible. */
export declare function confirmedSwing(bars: Bar[]): {
    low: Bar;
    high: Bar;
    confirmedAt: number;
    valid: boolean;
    invalidated: boolean;
    atr: number;
    zoneTolerance: number;
    fastEma: number;
    slowEma: number;
    trendUp: boolean;
    rebound: boolean;
    confirmationBars: number;
} | null;
