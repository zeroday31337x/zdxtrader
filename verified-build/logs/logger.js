import fs from 'fs/promises';
import path from 'path';
const LOG_DIR = path.join(process.cwd(), 'logs');
async function ensureDir() {
    await fs.mkdir(LOG_DIR, { recursive: true });
}
export async function logDecision(entry) {
    await ensureDir();
    const file = path.join(LOG_DIR, `decisions-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await fs.appendFile(file, JSON.stringify(entry) + '\n');
}
export async function logRejection(rejection) {
    await ensureDir();
    const file = path.join(LOG_DIR, `rejections-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await fs.appendFile(file, JSON.stringify({ ...rejection, timestamp: new Date().toISOString() }) + '\n');
}
//# sourceMappingURL=logger.js.map