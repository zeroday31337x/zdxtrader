# Jev trading desk

Deterministic Coinbase spot purchases and owned-position sales, with Coinbase/Binance.com/Binance.US/Crypto.com price and candle analysis, configurable UTC schedules, curated trade datasets, and a separate Meta Muse Spark correlation research agent.

Copy `.env.example` to `.env` and configure credentials locally. Operational thresholds, sizes, costs, schedules and model settings come from `.env`; missing numeric configuration raises an error. `MODE=shadow` observes, `MODE=paper` simulates, and live execution requires `MODE=live`, `LIVE_TRADING=true` and Coinbase trading credentials. Entries and exits persist intent before submission and reconcile uncertain exchange outcomes.

| Command | Behavior |
|---|---|
| `npm run build` | Compile production code to `dist/` |
| `npm start` | Run the deterministic desk and background analysis/dataset/Meta schedules |
| `npm run verify` | Compile and run offline tests, including the real paper main-loop buy/sell integration |
| `npm run dataset` | Continuously regenerate curated data every `DATASET_REFRESH_MS` (600000 = ten minutes) |
| `npm run dataset:once` | Generate a single fresh dataset |
| `npm run analyze` | Fetch and save one four-exchange market analysis |
| `npm run analyze:meta` | Run one Meta correlation research pass on the curated/local evidence |

`logs/market-dataset.jsonl` contains curated historical events and separate current market rows. `reports/dataset-manifest.json` records freshness and counts. Current analysis and measured correlations are in `reports/latest-analysis.json` and `reports/correlations.json`. Meta's evidence-linked research is in `reports/meta-correlations.json`.

`DECISION_ENGINE=deterministic` removes model responses from execution decisions. `ENABLE_AUTO_SELL=true` enables exits for confirmed owned quantities. Entry windows use `TRADING_DAYS_UTC` and `TRADING_WINDOWS_UTC`; exits and reconciliation remain active outside entry windows. `STOP_AFTER_PURCHASE=false` permits continuing position management. Set it to true only for a single-purchase run, with PM2 autorestart disabled.

Meta uses `META_API_KEY`, `META_MODEL=muse-spark-1.3`, measured token counting and a one-million-input-token budget. Its scheduled ingestion/research job has no order tools. It reads curated data first, plus exchange history, research and trading events, subject to configured file/byte limits. Correlation findings and Fibonacci targets are hypotheses/projections, not guaranteed profits.

See [the runtime and purchase-gate audit](PURCHASE-GATE-AUDIT.md) for the execution sequence, corrected gates, configuration, existing pending-order limitation, tests and official API references. Never delete uncertain pending order state merely to unblock purchases; reconcile its client order ID against the exchange.


## Current research and sizing

Entry sizing is now $1–$5: confidence scores at or below 0.30 use $1, scores at or above 0.80 reach the configured maximum, and intermediate scores scale linearly. Deterministic confidence is a trend-strength/venue-agreement score, not a calibrated probability of profit. Missing confidence uses the minimum. `ZERO_FEE_ENTRIES_ONLY=true` rejects a positive verified spot taker fee; the single authorized manual connectivity test was a separate exception and filled successfully.

`npm run research:memes` collects the configured meme universe and BTC benchmark across all four exchanges, initially 72 hours of 15-minute bars and seven days of hourly bars. Archives grow across refreshes; incomplete histories are saved separately and excluded from signals. `reports/meme-research.json` ranks four-hour research candidates using percentage returns, benchmark-relative momentum, agreement, liquidity and verified account fee costs. The curated dataset and Meta evidence ingestion include these research results. Collection runs every ten minutes when enabled.

`npm run prediction:once`, `prediction:watch` and `prediction:study` collect public Kalshi BTC 15-minute contract books/settlements and test the resting-book contrarian hypothesis without placing prediction orders. Public Kalshi quotes and the user's reported Coinbase zero-fee experience are distinct sources; zero-fee scenarios are labelled rather than asserted as Kalshi execution costs.

Coinbase One Basic's simple-trade waiver does not cover the Advanced Trade API used by this bot. The verified spot taker fee was 0.90%; the manual API test filled 0.00001241 BTC with a $0.00890858 fee. Phone UI execution is not configured. Ghost in the Droid is being evaluated as a separate supervised device interface, not treated as a fee-waiver API.


## Route and response logging

`HTTP_LOG_ENABLED=true` emits JSON console events for requests, responses and errors across public market feeds, prediction research, inference and Coinbase SDK routes. Each pair shares an ID and includes provider/host, method, route, duration and actual HTTP status (or an explicit SDK-success label). `HTTP_LOG_RESPONSE_BODY` enables redacted previews, bounded by `HTTP_LOG_BODY_MAX_CHARS`, array/key limits and depth. Credentials, headers and request bodies are excluded; million-token model context is never dumped. HTTP 400 response previews retain exchange error codes and messages.

Crypto.com spot symbol overrides map FARTCOIN and TOSHI to their verified `_USD` instruments, with USD quote labels. Binance.com returned `-1121 Invalid symbol` and no matching spot listings for those assets at diagnosis time; missing data is retained as unavailable rather than substituted with futures data.

Development update: entries now require projected net proceeds to clear both `ENTRY_MIN_NET_PROFIT_USD` and `ENTRY_MIN_NET_MARGIN_BPS`, using verified taker fees on both legs and the configured slippage buffer. These are scenarios, not forecasts. The old `ZERO_FEE_ENTRIES_ONLY` flag is deprecated and no longer blocks entries. `ENTRY_COOLDOWN_MS` persists across restarts; the existing runner ownership and pending-order lock still prevent duplicate submissions. Timeout alone never proves an order was unfilled. These changes have not been deployed to the live process; live reservations and settings were not modified.

Fibonacci analysis supports `FIB_SWING_METHOD=confirmed` (or `legacy` for comparison). Confirmed mode requires completed candles on both sides of each pivot, rejects swings broken below their low, filters swing size in ATR units, and reports EMA trend and closed-candle rebound confirmation. With `REQUIRE_FIB_BUY_ZONE=true`, the deterministic entry policy requires `entry_ready`, rather than price proximity alone. `FIB_TARGET_MODE=nearest` selects the nearest configured resistance/extension level clearing estimated costs; `FIB_EXTENSION_POWERS=0,0.5,1` includes the prior high and two extensions. Entry targets remain fixed in owned positions. All parameters are in `.env.example`. Dataset rows preserve these fields through their `golden` context. Existing generated rows are not rewritten. No live process restart accompanies this development change.

The authenticated monitoring API runs separately with `npm run api:start`. See [PLATFORM-API.md](PLATFORM-API.md) for routes, settings staging, pause semantics, and zerodrivex.com backend proxy integration.

External HTTP traffic now goes to daily per-provider JSONL files under `logs/telemetry/http/`; complete validated external venue snapshots and histories go to `logs/telemetry/market-data/`. Writes are batched with a bounded queue; telemetry overflow or disk failure emits a rate-limited summary without changing the separate execution journal. `HTTP_LOG_CONSOLE_MODE=trading` keeps Coinbase order-route summaries and rate-limited errors in the console. Response bodies are captured asynchronously with byte/time/concurrency limits. `EXTERNAL_HISTORY_ASYNC=true` refreshes each venue independently and reads cached histories without waiting on remote requests. Expired, incomplete, or mismatched candle intervals are excluded, so minimum-source rules still apply during warm-up or outages. Settings are in `.env.example`; a process restart is required.
