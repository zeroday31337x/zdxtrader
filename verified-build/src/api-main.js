import { createPlatformApi } from './platform-api.js';
import { envText, envNumber } from '../policy/env.js';
const port = envNumber('PLATFORM_API_PORT');
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('Invalid PLATFORM_API_PORT');
const app = createPlatformApi({ root: process.cwd(), token: envText('PLATFORM_API_TOKEN'), origins: envText('PLATFORM_API_ORIGINS').split(',').map(x => x.trim()) });
const server = app.listen(port, envText('PLATFORM_API_HOST'), () => console.log(`Trading desk API listening on ${envText('PLATFORM_API_HOST')}:${port}`));
server.on('error', () => { console.error('Trading desk API failed to bind'); process.exitCode = 1; });
process.on('SIGTERM', () => server.close());
//# sourceMappingURL=api-main.js.map