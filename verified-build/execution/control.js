import fs from 'node:fs';
import path from 'node:path';
export function entriesPaused(root = process.cwd()) {
    const file = path.join(root, 'state', 'platform-control.json');
    if (!fs.existsSync(file))
        return false;
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof state.entriesPaused !== 'boolean')
        throw Error('Invalid platform control state');
    return state.entriesPaused;
}
//# sourceMappingURL=control.js.map