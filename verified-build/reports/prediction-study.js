import fs from 'node:fs/promises';
import path from 'node:path';
import { envNumber } from '../policy/env.js';
export function studyPredictions(events) {
    const window = envNumber('PREDICTION_TEST_SECONDS_BEFORE_CLOSE'), tolerance = envNumber('PREDICTION_TEST_TOLERANCE_SECONDS'), threshold = envNumber('PREDICTION_MIN_IMBALANCE');
    const selected = new Map(), settlements = new Map();
    for (const event of events) {
        if (event.kind === 'settlement') {
            settlements.set(event.ticker, event);
            continue;
        }
        if (event.kind !== 'observation' || event.seconds_to_close <= 0 || Math.abs(event.seconds_to_close - window) > tolerance || Date.parse(event.timestamp) >= Date.parse(event.close_time))
            continue;
        const prior = selected.get(event.ticker);
        if (!prior || Math.abs(event.seconds_to_close - window) < Math.abs(prior.seconds_to_close - window))
            selected.set(event.ticker, event);
    }
    const trades = [...selected.values()].sort((a, b) => a.close_time.localeCompare(b.close_time)).flatMap(observation => {
        const settlement = settlements.get(observation.ticker);
        if (!settlement || observation.resting_bid_imbalance === null || Math.abs(observation.resting_bid_imbalance) < threshold)
            return [];
        const side = observation.resting_bid_imbalance > 0 ? 'no' : 'yes', price = side === 'yes' ? observation.yes_ask : observation.no_ask;
        if (price === null || price <= 0 || price >= 1)
            return [];
        const cost = observation.fee_assumption.per_contract_usd + observation.fee_assumption.slippage_per_contract_usd, win = settlement.result === side;
        return [{ ticker: observation.ticker, close_time: observation.close_time, side, price, win, net_per_contract_usd: (win ? 1 : 0) - price - cost, cost_scenario: observation.fee_assumption, break_even_probability: price + cost }];
    });
    const fraction = envNumber('PREDICTION_TEST_HOLDOUT_FRACTION');
    if (fraction <= 0 || fraction >= 1)
        throw Error('Invalid prediction holdout fraction');
    const split = Math.floor(trades.length * (1 - fraction)), train = trades.slice(0, split), test = trades.slice(split);
    const metrics = (rows) => { let equity = 0, peak = 0, maxDrawdown = 0; for (const r of rows) {
        equity += r.net_per_contract_usd;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.max(maxDrawdown, peak - equity);
    } return { windows: rows.length, wins: rows.filter(r => r.win).length, net_per_contract_sum_usd: equity, mean_net_per_contract_usd: rows.length ? equity / rows.length : null, max_drawdown_per_contract_usd: maxDrawdown }; };
    return { generated_at: new Date().toISOString(), status: test.length >= envNumber('PREDICTION_MIN_TEST_WINDOWS') ? 'exploratory_holdout_available' : 'insufficient_forward_windows', rule: 'One observation per contract near the configured pre-close time; fade the larger resting bid notional. No tuning on holdout.', training: metrics(train), chronological_holdout: metrics(test), trades, notes: ['A measured pattern is not proof of manipulation.', 'P&L is a one-contract quote/cost scenario, not executed Coinbase returns.', 'Displayed resting orders can be cancelled; they are not a count of all positions.', 'Historical settlements without prior observations are excluded.'] };
}
export async function writePredictionStudy() {
    const dir = path.join(process.cwd(), 'logs');
    let files = [];
    try {
        files = await fs.readdir(dir);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    const events = [];
    for (const file of files.filter(f => /^predictions-.*\.jsonl$/.test(f)).sort())
        for (const line of (await fs.readFile(path.join(dir, file), 'utf8')).split('\n'))
            try {
                events.push(JSON.parse(line));
            }
            catch { /* incomplete lines excluded */ }
    const report = studyPredictions(events);
    await fs.mkdir(path.join(process.cwd(), 'reports'), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), 'reports/prediction-study.json'), JSON.stringify(report, null, 2));
    return report;
}
//# sourceMappingURL=prediction-study.js.map