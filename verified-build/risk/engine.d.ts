/**
 * Hard risk engine. Checked before every order.
 * No model can override these.
 */
export interface RiskCheckResult {
    approved: boolean;
    veto?: string;
}
export declare class RiskEngine {
    private dailyPnl;
    private dayStart;
    check(proposed: {
        size: number;
        symbol: string;
    }, state: any): RiskCheckResult;
    recordPnl(pnl: number): void;
}
