/**
 * Hard risk engine. Checked before every order.
 * No model can override these.
 */
export interface RiskCheckResult {
    approved: boolean;
    veto?: string;
}
export declare class RiskEngine {
    private file?;
    private dailyPnl;
    private dayStart;
    private seen;
    constructor(file?: string | undefined);
    private save;
    check(proposed: {
        size: number;
        symbol: string;
    }, state: any): RiskCheckResult;
    recordPnl(pnl: number, eventId?: string): void;
}
