import fs from 'node:fs';
import path from 'node:path';
/** One process owns the persistent order state. Stale PID files can be reclaimed. */
export function claimRunner(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let fd;
    try {
        fd = fs.openSync(file, 'wx', 0o600);
    }
    catch (error) {
        if (error.code !== 'EEXIST')
            throw error;
        const pid = Number(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(pid) || pid <= 0)
            throw Error('Invalid runner lock; inspect before starting');
        try {
            process.kill(pid, 0);
            throw Error(`Trading state already owned by PID ${pid}`);
        }
        catch (probe) {
            if (probe.code !== 'ESRCH')
                throw probe;
        }
        fs.unlinkSync(file);
        fd = fs.openSync(file, 'wx', 0o600);
    }
    fs.writeFileSync(fd, String(process.pid));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return () => { try {
        if (fs.readFileSync(file, 'utf8') === String(process.pid))
            fs.unlinkSync(file);
    }
    catch { /* Already released. */ } };
}
//# sourceMappingURL=ownership.js.map