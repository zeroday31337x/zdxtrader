import { randomUUID } from 'node:crypto';
import { appendTelemetry, flushTelemetry } from './stream.js';
import { envBoolean, envNumber, envText } from '../policy/env.js';
const sensitive = /(authorization|api[-_]?key|api[-_]?secret|private[-_]?key|password|secret|access[-_]?token|refresh[-_]?token|(?:^|[-_])token$|signature|cookie)/i;
export function redactHttp(value, depth = 0) {
    if (depth > envNumber('HTTP_LOG_MAX_DEPTH'))
        return '[depth limited]';
    if (typeof value === 'string') {
        let result = value.replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
        for (const [key, secret] of Object.entries(process.env))
            if (sensitive.test(key) && secret && secret.length >= 6)
                result = result.split(secret).join('[REDACTED]');
        return result;
    }
    if (Array.isArray(value)) {
        const limit = envNumber('HTTP_LOG_ARRAY_ITEMS');
        const items = value.slice(0, limit).map(v => redactHttp(v, depth + 1));
        return value.length > limit ? { items, omitted: value.length - limit } : items;
    }
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).slice(0, envNumber('HTTP_LOG_OBJECT_KEYS')).map(([key, v]) => [key, sensitive.test(key) ? '[REDACTED]' : redactHttp(v, depth + 1)]));
    return value;
}
function preview(value) {
    if (!envBoolean('HTTP_LOG_RESPONSE_BODY'))
        return undefined;
    const text = JSON.stringify(redactHttp(value)) ?? String(value), max = envNumber('HTTP_LOG_BODY_MAX_CHARS');
    return text.length > max ? text.slice(0, max) + '…[truncated]' : text;
}
function routeInfo(input) {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()])
        if (sensitive.test(key))
            url.searchParams.set(key, '[REDACTED]');
    return { host: url.host, route: url.pathname + (url.search ? url.search : '') };
}
const captures = new Set();
let lastConsoleError = 0;
function emit(event, fields) {
    const row = { timestamp: new Date().toISOString(), component: 'http', event, ...fields };
    const provider = String(fields.provider ?? fields.host ?? 'unknown');
    appendTelemetry('http', provider, row);
    const mode = envText('HTTP_LOG_CONSOLE_MODE');
    const trading = (provider === 'coinbase' || provider === 'api.coinbase.com') && String(fields.route).includes('/orders');
    const error = event === 'error' || (typeof fields.status === 'number' && fields.status >= 400);
    if (mode === 'all' || (mode === 'trading' && trading) || ((mode === 'trading' || mode === 'errors') && error && Date.now() - lastConsoleError >= envNumber('TELEMETRY_WARNING_INTERVAL_MS'))) {
        if (error)
            lastConsoleError = Date.now();
        const { bodyPreview, ...summary } = row;
        console.log(JSON.stringify(summary));
    }
}
async function boundedBody(response) {
    const reader = response.body?.getReader();
    if (!reader)
        return null;
    const chunks = [];
    let total = 0;
    const limit = envNumber('HTTP_LOG_CAPTURE_MAX_BYTES');
    const timeout = setTimeout(() => { void reader.cancel().catch(() => { }); }, envNumber('HTTP_LOG_CAPTURE_TIMEOUT_MS'));
    try {
        while (total < limit) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = value.subarray(0, limit - total);
            chunks.push(chunk);
            total += chunk.length;
        }
    }
    finally {
        clearTimeout(timeout);
        void reader.cancel().catch(() => { });
    }
    const text = Buffer.concat(chunks).toString('utf8');
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
export async function flushHttpLogs() { await Promise.allSettled([...captures]); await flushTelemetry(); }
/** Request bodies and headers are deliberately excluded, including model context and credentials. */
export async function loggedFetch(input, init) {
    if (!envBoolean('HTTP_LOG_ENABLED'))
        return fetch(input, init);
    const id = randomUUID(), start = Date.now(), route = routeInfo(input), method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    emit('request', { id, method, ...route });
    try {
        const response = await fetch(input, init);
        const fields = { id, method, ...route, status: response.status, ok: response.ok, duration_ms: Date.now() - start };
        if (envBoolean('HTTP_LOG_RESPONSE_BODY') && captures.size < envNumber('HTTP_LOG_MAX_CAPTURES')) {
            const clone = response.clone();
            const task = boundedBody(clone).then(body => { emit('response', { ...fields, bodyPreview: preview(body) }); }).catch(() => { emit('response', { ...fields, bodyPreview: '[capture unavailable]' }); });
            captures.add(task);
            void task.finally(() => captures.delete(task));
        }
        else
            emit('response', { ...fields, bodyCaptureSkipped: envBoolean('HTTP_LOG_RESPONSE_BODY') });
        return response;
    }
    catch (error) {
        emit('error', { id, method, ...route, duration_ms: Date.now() - start, error: redactHttp({ name: error?.name, message: error?.message, code: error?.code, cause: error?.cause?.code }) });
        throw error;
    }
}
/** SDK transport returns parsed data, so success is labelled rather than inventing an HTTP status. */
export async function loggedApiCall(provider, method, route, operation) {
    if (!envBoolean('HTTP_LOG_ENABLED'))
        return operation();
    const id = randomUUID(), start = Date.now();
    emit('request', { id, provider, method, route });
    try {
        const result = await operation();
        emit('response', { id, provider, method, route, status: 'sdk_success', duration_ms: Date.now() - start, bodyPreview: preview(result) });
        return result;
    }
    catch (error) {
        const code = Number(error?.code ?? error?.response?.status);
        emit('error', { id, provider, method, route, status: Number.isFinite(code) ? code : 'sdk_error', duration_ms: Date.now() - start, error: redactHttp({ message: error?.message ?? String(error), body: error?.body, code: error?.code }) });
        throw error;
    }
}
//# sourceMappingURL=http.js.map