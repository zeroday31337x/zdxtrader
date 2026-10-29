import fs from 'node:fs';
import path from 'node:path';
// Persist intent BEFORE submitting. Uncertain outcomes remain locked for reconciliation.
export class Book {
    file;
    open = null;
    constructor(file = path.join(process.cwd(), 'state', `position-${process.env.MODE || 'shadow'}.json`)) {
        this.file = file;
        if (fs.existsSync(file)) {
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (value !== null && (!value.symbol || !['pending', 'open'].includes(value.status)))
                throw new Error('Invalid persisted position; reconcile before starting');
            this.open = value;
        }
    }
    save() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        const fd = fs.openSync(tmp, 'w', 0o600);
        try {
            fs.writeFileSync(fd, JSON.stringify(this.open));
            fs.fsyncSync(fd);
        }
        finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tmp, this.file);
        const dir = fs.openSync(path.dirname(this.file), 'r');
        try {
            fs.fsyncSync(dir);
        }
        finally {
            fs.closeSync(dir);
        }
    }
    hasOpen() { return this.open !== null; }
    reserve(symbol, size, clientOrderId) {
        if (this.hasOpen())
            throw new Error('Position or unresolved order already exists');
        this.open = { symbol, size, entry: 0, entryTime: new Date().toISOString(), status: 'pending', pendingSide: 'buy', clientOrderId };
        this.save();
    }
    openPosition(symbol, size, entry, details = {}) {
        if (this.open?.status === 'open')
            throw new Error('Already have open position');
        this.open = { ...this.open, ...details, symbol, size, entry, high: entry, pendingSide: undefined, entryTime: new Date().toISOString(), status: 'open' };
        this.save();
    }
    close() { const closed = this.open; this.open = null; this.save(); return closed; }
    /** Clears a reservation only if still pending and matching this client order ID. */
    release(clientOrderId) {
        if (this.open?.status !== "pending" || this.open.clientOrderId !== clientOrderId)
            return false;
        this.open = this.open.pendingSide === 'sell' ? { ...this.open, status: 'open', pendingSide: undefined, clientOrderId: undefined } : null;
        this.save();
        return true;
    }
    reserveExit(clientOrderId) {
        if (this.open?.status !== 'open' || !this.open.quantity)
            throw Error('Confirmed owned quantity required for sale');
        this.open = { ...this.open, status: 'pending', pendingSide: 'sell', clientOrderId };
        this.save();
    }
    updateHigh(price) {
        if (this.open?.status !== 'open' || !Number.isFinite(price) || price <= 0)
            throw Error('Open position and valid price required');
        this.open.high = Math.max(this.open.high ?? this.open.entry, price);
        this.save();
    }
    applySale(quantity) {
        if (this.open?.status !== 'pending' || this.open.pendingSide !== 'sell' || !this.open.quantity)
            throw Error('Pending owned sale required');
        const before = Number(this.open.quantity), remaining = before - Number(quantity);
        if (!Number.isFinite(remaining) || remaining < 0)
            throw Error('Invalid confirmed sale quantity');
        if (remaining === 0) {
            this.close();
            return;
        }
        this.open = { ...this.open, quantity: remaining.toFixed(18), size: this.open.size * remaining / before, fees: (this.open.fees ?? 0) * remaining / before, status: 'open', pendingSide: undefined, clientOrderId: undefined };
        this.save();
    }
    getOpen() { return this.open; }
}
//# sourceMappingURL=index.js.map