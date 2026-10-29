# Trading desk admin API

The API runs separately from the trading runner. Version prefix: `/api/v1`.
It monitors local records; it does not query a complete exchange account portfolio.

Set `PLATFORM_API_HOST=127.0.0.1`, `PLATFORM_API_PORT=8787`,
`PLATFORM_API_ORIGINS=https://zerodrivex.com`, and a random
`PLATFORM_API_TOKEN` of at least 32 characters in `.env`.
Generate a token with `openssl rand -hex 32` and keep it server-side.

Run `npm run build`, then `npm run api:start` (or `npm run api` during development).
The trading runner must also load the new build for pause and heartbeat support.
An existing dataset generator can continue running independently.

Have the zerodrivex.com admin **backend** proxy requests to this local API,
adding `Authorization: Bearer <PLATFORM_API_TOKEN>`. The proxy should require
your existing admin session and CSRF protection for writes. Do not put the
bearer token in browser JavaScript, public environment variables, or URLs.
Keep the API port off the public internet. Use an SSH tunnel/private link if
the admin backend runs on a different host. CORS is not authentication.

| Method | Route | Response / action |
| --- | --- | --- |
| GET | `/health` | Authenticated API health and UTC time |
| GET | `/telemetry` | Configured mode, runtime heartbeat, staleness, entry pause, risk ledger, dataset manifest |
| GET | `/positions` | Bot-managed local position, including pending status; separate manual API test journal |
| GET | `/trades` | Recorded fills and sale/reconciliation events |
| GET | `/executions` | All execution events, including position analysis |
| GET | `/decisions` | Candidate decisions and reasons |
| GET | `/rejections` | Gates and broker rejection reasons |
| GET | `/analysis` | Latest saved market analysis, or null |
| GET | `/settings` | Allowlisted configured values, editable schema, staged changes |
| PATCH | `/settings` | Validate and save a staged settings object; does not alter `.env` or active execution |
| GET | `/control` | Persisted entry pause status |
| POST | `/control/pause` | Pause new entries; keep exits and reconciliation active |

History routes accept `?limit=50&offset=0` (limit 1–200, offset 0–10000).
Responses contain `items`, `nextOffset`, `truncated`, and `scannedBytes`.
Reads use a bounded 2 MiB tail of daily log files; `truncated=true` means older
history was not fully scanned. Incomplete JSONL writes are ignored until complete.
Offset pagination can shift when new events arrive; deduplicate by order ID and
timestamp in the frontend. Poll telemetry/positions every 5–10 seconds.

Trade events retain the existing journal schema: confirmed orders appear under
`executed`; reconciled fills have top-level order fields; paper exits carry
`realizedPnl`. There is no fabricated aggregate balance or exchange P&L.
`configuredLiveTrading` describes the file; `runtime.liveExecutionEnabled`
describes the most recently reporting runner. A missing or stale heartbeat
must be displayed as unknown, not offline or disabled with certainty.

Example settings body: `{"ENTRY_COOLDOWN_MS":90000,"REQUIRE_FIB_BUY_ZONE":true}`.
The response has `applied:false`; changes are stored in
`state/platform-settings-staged.json` for local review/application.
Credentials, live activation, order submission, position deletion, and PM2 shell
commands are not exposed. A pause may allow an already in-flight submission to
finish. To clear the pause, stop the runner and locally remove
`state/platform-control.json`, then restart after reviewing settings.

All responses have `Cache-Control: no-store` and `X-Request-ID`. Request logs
record route, status and duration, never request headers or bodies. Authentication
errors return 401, blocked origins 403, invalid input 400, large JSON bodies 413,
and unexpected failures a generic 500 without filesystem paths or stack traces.
