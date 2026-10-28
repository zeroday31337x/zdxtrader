/**
 * Book: one open position at a time.
 * No scan while one is open.
 * Bench for rejected candidates.
 */

export class Book {
  private open: { symbol: string; size: number; entry: number; entryTime: string } | null = null;

  hasOpen(): boolean {
    return this.open !== null;
  }

  openPosition(symbol: string, size: number, entry: number) {
    if (this.hasOpen()) throw new Error('Already have open position');
    this.open = { symbol, size, entry, entryTime: new Date().toISOString() };
  }

  close() {
    const closed = this.open;
    this.open = null;
    return closed;
  }

  getOpen() {
    return this.open;
  }
}
