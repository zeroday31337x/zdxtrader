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
        this.open = { symbol, size, entry: 0, entryTime: new Date().toISOString(), status: 'pending', clientOrderId };
        this.save();
    }
    openPosition(symbol, size, entry) {
        if (this.open?.status === 'open')
            throw new Error('Already have open position');
        this.open = { ...this.open, symbol, size, entry, entryTime: new Date().toISOString(), status: 'open' };
        this.save();
    }
    close() { const closed = this.open; this.open = null; this.save(); return closed; }
    getOpen() { return this.open; }
}
//# sourceMappingURL=index.js.map