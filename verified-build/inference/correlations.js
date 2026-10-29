import { envNumber, envText } from '../policy/env.js';
export function measuredCorrelations(snapshots) {
    const minimum = envNumber('CORRELATION_MIN_SAMPLES');
    const lags = envText('CORRELATION_LAGS_BARS').split(',').map(Number);
    if (lags.some(l => !Number.isInteger(l) || l < 0))
        throw Error('Invalid CORRELATION_LAGS_BARS');
    const series = snapshots.map(s => {
        const levels = s.venue_history?.normalized_history ?? [];
        const returns = new Map();
        for (let i = 1; i < levels.length; i++)
            if (levels[i].start - levels[i - 1].start === 60 && levels[i].index > 0 && levels[i - 1].index > 0 && levels[i].sources === levels[i - 1].sources)
                returns.set(levels[i].start, Math.log(levels[i].index / levels[i - 1].index));
        return { symbol: s.symbol, returns };
    });
    const findings = [];
    for (let a = 0; a < series.length; a++)
        for (let b = 0; b < series.length; b++)
            if (a !== b)
                for (const lag of lags) {
                    if (lag === 0 && b < a)
                        continue;
                    const pairs = [...series[a].returns].flatMap(([time, x]) => { const y = series[b].returns.get(time + lag * 60); return y === undefined ? [] : [[x, y]]; });
                    if (pairs.length < minimum)
                        continue;
                    const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length, my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
                    let cov = 0, vx = 0, vy = 0;
                    for (const [x, y] of pairs) {
                        cov += (x - mx) * (y - my);
                        vx += (x - mx) ** 2;
                        vy += (y - my) ** 2;
                    }
                    if (vx === 0 || vy === 0)
                        continue;
                    findings.push({ leader: series[a].symbol, follower: series[b].symbol, lag_bars: lag, samples: pairs.length, pearson: Math.max(-1, Math.min(1, cov / Math.sqrt(vx * vy))) });
                }
    return { method: 'Pearson correlation of aligned one-minute log returns; positive lag means leader precedes follower; unadjusted exploratory estimates', minimum_samples: minimum, findings };
}
//# sourceMappingURL=correlations.js.map