import fs from 'node:fs/promises';
import path from 'node:path';
import { envBoolean, envNumber, envText } from '../policy/env.js';
import { buildEvidence } from './corpus.js';
import { analysisAdapter } from './index.js';
import { claimRunner } from '../execution/ownership.js';
let running = false, nextRun = 0;
export async function runCorrelationAgent() {
    const release = claimRunner(path.join(process.cwd(), 'state/meta-agent.pid'));
    try {
        const stateFile = path.join(process.cwd(), 'state/meta-agent-schedule.json');
        await fs.writeFile(stateFile, JSON.stringify({ nextRun: Date.now() + envNumber('META_ANALYSIS_INTERVAL_MS') }));
        const evidence = await buildEvidence();
        const result = await analysisAdapter().analyze(evidence);
        const report = { timestamp: new Date().toISOString(), provider: 'meta', role: 'research_only', ...result, evidence_manifest: evidence.filter(e => result.includedEvidenceIds.includes(e.id)).map(e => ({ id: e.id, source: e.source })) };
        const dir = path.join(process.cwd(), 'reports');
        await fs.mkdir(dir, { recursive: true });
        const temp = path.join(dir, `meta-correlations.${process.pid}.tmp`);
        await fs.writeFile(temp, JSON.stringify(report, null, 2));
        await fs.rename(temp, path.join(dir, 'meta-correlations.json'));
        await fs.appendFile(path.join(dir, 'meta-agent.jsonl'), JSON.stringify(report) + '\n');
        return report;
    }
    finally {
        release();
    }
}
/** Launch in the background so inference latency never delays reconciliation or sales. */
export function scheduleCorrelationAgent(now = Date.now()) {
    if (!envBoolean('META_ANALYSIS_ENABLED') || running || now < nextRun)
        return;
    if (!process.env.META_API_KEY?.trim())
        return;
    running = true;
    nextRun = now + envNumber('META_ANALYSIS_INTERVAL_MS');
    void (async () => {
        try {
            const state = JSON.parse(await fs.readFile(path.join(process.cwd(), 'state/meta-agent-schedule.json'), 'utf8'));
            if (Number.isFinite(state.nextRun) && state.nextRun > now) {
                nextRun = state.nextRun;
                return null;
            }
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        return runCorrelationAgent();
    })().then(result => result && console.log(`[meta-analysis] ${result.model}: ${result.inputTokens} input tokens; ${result.analysis.findings.length} findings`)).catch(async (error) => {
        const message = String(error?.message ?? 'Meta correlation analysis failed');
        console.error(`[meta-analysis] ${message}`);
        await fs.mkdir(path.join(process.cwd(), 'reports'), { recursive: true });
        await fs.writeFile(path.join(process.cwd(), 'reports/meta-agent-status.json'), JSON.stringify({ timestamp: new Date().toISOString(), model: envText('META_MODEL'), status: 'error', error: message }));
    }).catch(() => { }).finally(() => { running = false; });
}
//# sourceMappingURL=agent.js.map