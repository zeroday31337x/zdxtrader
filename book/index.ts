import fs from 'node:fs';
import path from 'node:path';

type Position = { symbol: string; size: number; entry: number; entryTime: string; status: 'pending' | 'open'; clientOrderId?: string };

// Persist intent BEFORE submitting. Uncertain outcomes remain locked for reconciliation.
export class Book {
  private open: Position | null = null;
  constructor(private file = path.join(process.cwd(), 'state', `position-${process.env.MODE || 'shadow'}.json`)) {
    if (fs.existsSync(file)) {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value !== null && (!value.symbol || !['pending', 'open'].includes(value.status))) throw new Error('Invalid persisted position; reconcile before starting');
      this.open = value;
    }
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.open)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
    const dir = fs.openSync(path.dirname(this.file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
  hasOpen(): boolean { return this.open !== null; }
  reserve(symbol: string, size: number, clientOrderId: string) {
    if (this.hasOpen()) throw new Error('Position or unresolved order already exists');
    this.open = { symbol, size, entry: 0, entryTime: new Date().toISOString(), status: 'pending', clientOrderId };
    this.save();
  }
  openPosition(symbol: string, size: number, entry: number) {
    if (this.open?.status === 'open') throw new Error('Already have open position');
    this.open = { ...this.open, symbol, size, entry, entryTime: new Date().toISOString(), status: 'open' };
    this.save();
  }
  close() { const closed = this.open; this.open = null; this.save(); return closed; }
  /** Clears a reservation only if still pending and matching this client order ID. */
  release(clientOrderId: string): boolean {
    if (this.open?.status !== "pending" || this.open.clientOrderId !== clientOrderId) return false;
    this.open = null; this.save(); return true;
  }
  getOpen() { return this.open; }
}
