/**
 * Funnel: cheapest check first.
 * Facts kill before judgments.
 * Every rejection logged with the check that fired.
 * Bench by reason, not by token.
 */
export interface Candidate {
    id: string;
    symbol: string;
    data: any;
    flags?: string[];
}
export interface Rejection {
    id: string;
    reason: string;
    check: string;
    benchedUntil?: number;
}
export declare class Filter {
    private bench;
    pass(candidate: Candidate, state: any): Promise<{
        ok: boolean;
        reason?: string;
    }>;
    private benchIt;
    isBenched(id: string): boolean;
    getRejections(): Rejection[];
}
