import { measuredCorrelations } from '../inference/correlations.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { envNumber } from '../policy/env.js';
let nextAnalysis = 0;
/** Persist all scanned candidates, including the ones rejected by entry filters. */
export async function saveAnalysis(snapshots, now = Date.now()) {
    if (now < nextAnalysis)
        return;
    const report = { timestamp: new Date(now).toISOString(), method: 'equal-weight normalized completed-candle trends; Fibonacci projections are heuristic', products: snapshots.map(s => ({ symbol: s.symbol, bid: s.bid, ask: s.ask, edge_proxy_bps: s.estimated_edge_bps, source_count: s.venue_history?.source_count, unavailable: s.venue_history?.unavailable, trend_5: s.venue_history?.mean_return_5, trend_15: s.venue_history?.mean_return_15, upward_fraction: s.venue_history?.upward_fraction, golden: s.golden, venue_history: s.venue_history })) };
    const dir = path.join(process.cwd(), 'reports');
    await fs.mkdir(dir, { recursive: true });
    const correlations = measuredCorrelations(snapshots);
    await fs.writeFile(path.join(dir, 'correlations.json'), JSON.stringify({ timestamp: report.timestamp, ...correlations }, null, 2));
    const temp = path.join(dir, `latest-analysis.${process.pid}.tmp`);
    await fs.writeFile(temp, JSON.stringify(report, null, 2));
    await fs.rename(temp, path.join(dir, 'latest-analysis.json'));
    await fs.appendFile(path.join(dir, `analysis-${new Date(now).toISOString().slice(0, 10)}.jsonl`), JSON.stringify(report) + '\n');
    nextAnalysis = now + envNumber('ANALYSIS_INTERVAL_MS');
}
//# sourceMappingURL=live-analysis.js.map