import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { envNumber } from '../policy/env.js';
/** Explicit data directories and formats only; configuration and source code are never ingested. */
export async function buildEvidence(root = process.cwd()) {
    const maxBytes = envNumber('META_MAX_CORPUS_BYTES'), maxFiles = envNumber('META_HISTORY_MAX_FILES'), chunkSize = envNumber('META_CHUNK_CHARS'), maxFileBytes = envNumber('META_MAX_FILE_BYTES');
    if (![maxBytes, maxFiles, chunkSize, maxFileBytes].every(x => Number.isInteger(x) && x > 0))
        throw Error('Invalid Meta corpus limits');
    const candidates = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw error;
        }
        for (const entry of entries) {
            if (entry.isSymbolicLink() || entry.name.startsWith('.'))
                continue;
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(file);
                continue;
            }
            if (!/\.(json|jsonl|csv)$/.test(entry.name) || /meta-|correlation-agent|rejections-|protocol/.test(entry.name))
                continue;
            if (dir === 'logs' && !/^(decisions|execution)-/.test(entry.name) && entry.name !== 'market-dataset.jsonl')
                continue;
            const stat = await fs.stat(path.join(root, file));
            candidates.push({ file, modified: stat.mtimeMs, priority: entry.name === 'market-dataset.jsonl' || entry.name === 'dataset-manifest.json' ? 0 : entry.name === 'latest-analysis.json' || entry.name === 'correlations.json' ? 1 : 2 });
        }
    }
    await walk('reports');
    await walk('research');
    await walk('logs');
    candidates.sort((a, b) => a.priority - b.priority || b.modified - a.modified || a.file.localeCompare(b.file));
    const evidence = [];
    let bytes = 0, files = 0;
    const secrets = Object.entries(process.env).filter(([key, value]) => /API_KEY|API_SECRET|DESK_SECRET|PRIVATE_KEY/.test(key) && value && value.length >= 8).map(([, value]) => value);
    for (const item of candidates) {
        if (files >= maxFiles || bytes >= maxBytes)
            break;
        const handle = await fs.open(path.join(root, item.file), 'r');
        let text;
        try {
            const stat = await handle.stat();
            const size = Math.min(stat.size, maxBytes - bytes, maxFileBytes);
            const buffer = Buffer.alloc(size);
            const read = await handle.read(buffer, 0, size, item.file.endsWith('.jsonl') ? Math.max(0, stat.size - size) : 0);
            text = buffer.subarray(0, read.bytesRead).toString('utf8');
        }
        finally {
            await handle.close();
        }
        for (const secret of secrets)
            text = text.split(secret).join('[REDACTED]');
        text = text.replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');
        const digest = createHash('sha256').update(text).digest('hex').slice(0, 12);
        for (let offset = 0; offset < text.length; offset += chunkSize)
            evidence.push({ id: `${digest}:${offset}`, source: `${item.file}:${offset}`, data: { text: text.slice(offset, offset + chunkSize), chunk_offset: offset, latest_tail: item.file.endsWith('.jsonl'), file_may_be_truncated: Buffer.byteLength(text) >= maxFileBytes } });
        bytes += Buffer.byteLength(text);
        files++;
    }
    return evidence;
}
//# sourceMappingURL=corpus.js.map