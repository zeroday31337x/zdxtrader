import { assertTradeSize, MAX_TRADE_USD } from '../policy/limits.js';
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

    let maxPos = MAX_TRADE_USD;
    if (process.env.MAX_POSITION_USD !== undefined) {
      const configured = Number(process.env.MAX_POSITION_USD);
      if (!Number.isFinite(configured) || configured <= 0) return { approved: false, veto: 'invalid MAX_POSITION_USD' };
      maxPos = Math.min(configured, MAX_TRADE_USD);
    }
    try { assertTradeSize(proposed.size); } catch { return { approved: false, veto: 'entry order must be $5–$9' }; }
    const dailyLimit = Number(process.env.DAILY_LOSS_LIMIT_USD) || 50;

    if (Number.isFinite(state.quote_min_size) && proposed.size < state.quote_min_size) return { approved: false, veto: 'below exchange minimum order value' };
    if (Number.isFinite(state.quote_max_size) && proposed.size > state.quote_max_size) return { approved: false, veto: 'above exchange maximum order value' };
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
