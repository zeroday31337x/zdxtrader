/**
 * Hard risk engine. Checked before every order.
 * No model can override these.
 */

export interface RiskCheckResult {
  approved: boolean;
  veto?: string;
}

export class RiskEngine {
  private dailyPnl = 0;
  private dayStart = new Date().toDateString();

  check(proposed: { size: number; symbol: string }, state: any): RiskCheckResult {
    // Reset daily if new day
    if (new Date().toDateString() !== this.dayStart) {
      this.dailyPnl = 0;
      this.dayStart = new Date().toDateString();
    }

    const maxPos = Number(process.env.MAX_POSITION_USD) || 100;
    const dailyLimit = Number(process.env.DAILY_LOSS_LIMIT_USD) || 50;

    if (proposed.size > maxPos) return { approved: false, veto: 'max position' };
    if (this.dailyPnl < -dailyLimit) return { approved: false, veto: 'daily loss limit' };
    if (state.drawdown_pct > 10) return { approved: false, veto: 'drawdown guard' };
    // Add: leverage cap, range guard, fees+gas, model version check, etc.

    return { approved: true };
  }

  recordPnl(pnl: number) {
    this.dailyPnl += pnl;
  }
}
