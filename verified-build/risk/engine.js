import fs from 'node:fs';
import path from 'node:path';
import { envNumber } from '../policy/env.js';
import { assertTradeSize, MIN_TRADE_USD, MAX_TRADE_USD } from '../policy/limits.js';
export class RiskEngine {
    file;
    dailyPnl = 0;
    dayStart = new Date().toISOString().slice(0, 10);
    seen = [];
    constructor(file) {
        this.file = file;
        if (file && fs.existsSync(file)) {
            const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Number.isFinite(saved.pnl) || !Array.isArray(saved.seen) || typeof saved.day !== 'string')
                throw Error('Invalid persisted risk ledger');
            this.dayStart = saved.day;
            this.dailyPnl = saved.pnl;
            this.seen = saved.seen;
        }
    }
    save() {
        if (!this.file)
            return;
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temp = this.file + '.tmp';
        const fd = fs.openSync(temp, 'w', 0o600);
        try {
            fs.writeFileSync(fd, JSON.stringify({ day: this.dayStart, pnl: this.dailyPnl, seen: this.seen }));
            fs.fsyncSync(fd);
        }
        finally {
            fs.closeSync(fd);
        }
        fs.renameSync(temp, this.file);
    }
    check(proposed, state) {
        if (new Date().toISOString().slice(0, 10) !== this.dayStart) {
            this.dailyPnl = 0;
            this.dayStart = new Date().toISOString().slice(0, 10);
        }
        const defaultAccountUsd = envNumber('ACCOUNT_BALANCE_FALLBACK_USD');
        const accountUsd = Number.isFinite(state?.account_balance_usd) ? Number(state.account_balance_usd) : defaultAccountUsd;
        let maxPos = MAX_TRADE_USD;
        if (process.env.MAX_POSITION_USD !== undefined) {
            const configured = Number(process.env.MAX_POSITION_USD);
            if (!Number.isFinite(configured) || configured <= 0)
                return { approved: false, veto: 'invalid MAX_POSITION_USD' };
            maxPos = Math.min(configured, MAX_TRADE_USD);
        }
        maxPos = Math.min(maxPos, Math.max(MIN_TRADE_USD, Math.min(MAX_TRADE_USD, accountUsd * envNumber('MAX_ACCOUNT_ALLOCATION'))));
        try {
            assertTradeSize(proposed.size);
        }
        catch {
            return { approved: false, veto: `entry order must be $${MIN_TRADE_USD}–$${MAX_TRADE_USD}` };
        }
        const dailyLimit = Number(process.env.DAILY_LOSS_LIMIT_USD);
        if (!Number.isFinite(dailyLimit) || dailyLimit <= 0)
            return { approved: false, veto: 'invalid DAILY_LOSS_LIMIT_USD' };
        if (!Number.isFinite(accountUsd) || accountUsd <= 0 || proposed.size > accountUsd)
            return { approved: false, veto: 'insufficient account balance' };
        if (Number.isFinite(state?.quote_min_size) && proposed.size < state.quote_min_size)
            return { approved: false, veto: 'below exchange minimum order value' };
        if (Number.isFinite(state?.quote_max_size) && proposed.size > state.quote_max_size)
            return { approved: false, veto: 'above exchange maximum order value' };
        if (proposed.size > maxPos)
            return { approved: false, veto: `max position exceeds $${maxPos.toFixed(2)}` };
        if (this.dailyPnl <= -dailyLimit)
            return { approved: false, veto: `daily loss limit (${dailyLimit.toFixed(2)})` };
        if (state?.drawdown_pct > envNumber('MAX_DRAWDOWN_PCT'))
            return { approved: false, veto: 'drawdown guard' };
        return { approved: true };
    }
    recordPnl(pnl, eventId) {
        if (eventId && this.seen.includes(eventId))
            return;
        if (!Number.isFinite(pnl))
            throw new Error('Invalid realized P&L');
        if (new Date().toISOString().slice(0, 10) !== this.dayStart) {
            this.dailyPnl = 0;
            this.dayStart = new Date().toISOString().slice(0, 10);
        }
        this.dailyPnl += pnl;
        if (eventId)
            this.seen.push(eventId);
        this.save();
    }
}
//# sourceMappingURL=engine.js.map