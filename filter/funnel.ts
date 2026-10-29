import { envNumber } from '../policy/env.js';
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

export class Filter {
  private bench = new Map<string, Rejection>();

  async pass(candidate: Candidate, state: any): Promise<{ ok: boolean; reason?: string }> {
    // 1. Free cuts on data already in hand
    if (candidate.flags?.includes('honeypot')) {
      this.benchIt(candidate.id, 'honeypot', 'hard_fact', envNumber('HARD_FACT_BENCH_MS'));
      return { ok: false, reason: 'honeypot' };
    }
    if (candidate.flags?.includes('open_mint')) {
      this.benchIt(candidate.id, 'open_mint', 'hard_fact', envNumber('HARD_FACT_BENCH_MS'));
      return { ok: false, reason: 'open mint authority' };
    }

    // 2. One-call checks (example)
    if (state.spread_bps > envNumber('MAX_SPREAD_BPS')) {
      this.benchIt(candidate.id, 'wide_spread', 'data_check', envNumber('SPREAD_BENCH_MS'));
      return { ok: false, reason: 'spread too wide' };
    }

    // 3. Then Jev (caller does this)
    return { ok: true };
  }

  private benchIt(id: string, reason: string, check: string, durationMs: number) {
    this.bench.set(id, {
      id,
      reason,
      check,
      benchedUntil: Date.now() + durationMs,
    });
  }

  isBenched(id: string): boolean {
    const b = this.bench.get(id);
    if (!b) return false;
    if (b.benchedUntil && Date.now() > b.benchedUntil) {
      this.bench.delete(id);
      return false;
    }
    return true;
  }

  getRejections(): Rejection[] {
    return Array.from(this.bench.values());
  }
}
