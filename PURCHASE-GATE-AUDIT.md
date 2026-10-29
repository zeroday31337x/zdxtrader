# Purchase, sale, ingestion and inference audit

The runtime entrypoint is `src/main.ts`. Its live broker is Coinbase spot. “Short-term” is a holding horizon; entries are BUY orders and exits sell recorded owned base quantities. The deterministic engine is independent of the optional research model.

## Findings cross-referenced to execution

| Finding | Evidence and consequence | Result |
|---|---|---|
| Edge minimum was misread as a maximum | `state/scanner.ts` accepts scores above the configured fee + buffer + profit threshold. The score uses absolute moves and other heuristics; it is not an executable profit margin. | Kept the explicit proxy label; target net margin is a separate fee/slippage estimate. |
| Market regime was converted into a short sale | `policy/index.ts` previously mapped trending-down to short, then rejected every short. Logs contained 20 such skips and 23 “no clear direction” skips in the inspected history. | Active `policy/deterministic.ts` buys on configured completed-history trends; model-mode uptrend gating is optional. |
| Highest-ranked rejection starved other products | The old cycle evaluated only one snapshot. | Fee-qualified candidates are now evaluated in sequence until a position/order is reserved. Fibonacci buy-zone/time proximity can influence candidate priority. |
| Risk checked skipped orders as $0 entries | The order-size check added an irrelevant $1–$9 warning after policy skipped. | Skips now explicitly show that risk was not evaluated. |
| Prior position lock hid valid signals | 24 logged policy approvals were blocked by an existing position/unresolved order. | Pending orders are queried against Coinbase and confirmed holdings get deterministic exit analysis. Dataset and market analysis continue while locked. |
| No sell path was connected to the main loop | The separate lifecycle module was tested but not called by `src/main.ts`. | Main loop now calls the owned-position sale path, persists its intent first, confirms exchange fills, retains partial/dust ownership, and records realized P&L. |
| Account balance could be an invented default | Scanner reports account state unavailable; old risk logic used $19.50. | Live entries now read available USD and reserve configured fees before risk approval. The fallback remains only for paper/offline use. |
| Daily loss state disappeared at restart | Risk P&L was held only in memory. | Main uses a persisted ledger, UTC day boundaries and exchange-order-ID deduplication. A single-process ownership lock protects order state. |
| Historical dataset was contaminated by current prices | Old `reports/calibration.ts` overwrote old decision prices/returns with values from its fresh scan. | Historical rows retain original observations. Fresh observations are separate rows. Unknowns remain null, and edge proxies are distinct from estimated/realized returns. |
| Dataset did not emit current-only rows | Fresh markets were only used to enrich old logs. | Dataset now emits decisions, rejections, execution/position events and current market rows, plus a manifest. |
| Cross-exchange module was disconnected | Old `market/exchange-aggregate.ts` was not called by the main scanner and had no historical data path. | Active `market/history-context.ts` collects Coinbase, Binance.com, Binance.US and Crypto.com histories and prices. Failed venues are reported explicitly. |

Counts above summarize the inspected log history, not a profitability study.

## Current deterministic path

1. Load operational settings from `.env`. Missing/invalid numeric settings fail instead of silently selecting code defaults. `.env` takes precedence over stale process-manager environment values.
2. Reconcile pending exchange orders. A terminal empty order can release its matching reservation. A confirmed partial/complete fill becomes actual ownership. Missing or uncertain orders remain locked.
3. Collect completed candles and per-venue bid/ask quotes. Validate continuous, fresh history. Aggregate normalized percentage moves and measured one-minute log-return correlations; never average USD and USDT absolute prices.
4. Save analysis on `ANALYSIS_INTERVAL_MS`; run the curated dataset scheduler on `DATASET_REFRESH_MS` even while holding or reconciling.
5. Allow entries only inside `TRADING_DAYS_UTC` / `TRADING_WINDOWS_UTC`. Reconciliation and exits operate outside entry windows too.
6. Apply fee/edge proxy screen, configured spread screen, source count, aggregate 5/15-bar returns and upward-venue quorum. Optional Fibonacci buy-zone / projected-margin requirements are explicit environment settings.
7. Verify live available USD including configured fee reserve, order notional range, account allocation, exchange minimum/maximum and daily loss limit.
8. Persist client order ID before the broker submits a BUY. Record actual price, quantity and fees only after exchange confirmation. Uncertain/partial nonterminal outcomes stay locked for reconciliation.
9. For owned positions, compare executable Coinbase bid against the entry Fibonacci target, stop, trailing high, maximum hold and profitable downward-trend rule. Persist sale intent, submit base quantity rounded down to exchange increment, and record confirmed proceeds, fees and proportional cost basis.

Current `.env` retains the $1 entry size and $9 maximum notional; `MAX_POSITION_USD=1` is still the tighter position cap. Automatic exits are enabled and stop-after-first-purchase is disabled for the requested ongoing operation. Entry polling is 30 seconds after cycle completion; entry windows currently cover all UTC days/hours. Analysis refreshes every five minutes, dataset every ten minutes and Meta research hourly.

## Curated data and agents

`npm run dataset` is a continuous ten-minute worker. `npm run dataset:once` generates one dataset. The desk also schedules the same job; shared disk scheduling and a job lock prevent simultaneous refreshes. Output is atomically replaced at `logs/market-dataset.jsonl`, with metadata at `reports/dataset-manifest.json`. Original event timestamps, source file/line references, stable record IDs, raw venue histories, projected targets, actual fills and realized P&L remain distinguishable.

`reports/latest-analysis.json` contains the current market analysis. `reports/correlations.json` contains measured Pearson correlations on aligned minute log returns with configured lags and sample counts. They are exploratory estimates without claims of causal or out-of-sample predictive power.

The Meta adapter is registered separately in `inference/index.ts`. `META_API_KEY` authenticates `muse-spark-1.3`. It ingests the curated dataset first, plus market analysis, research history and trade events, within explicit byte/file limits. It excludes configuration/source files and symlinks, redacts known credentials, and records evidence IDs and omitted chunks. Meta's count-tokens endpoint measures input before inference; input is limited to one million tokens with room reserved for output within the 1,048,576-token context. Returned findings must reference supplied evidence IDs. Reports are written to `reports/meta-correlations.json`; they cannot place orders or alter trading configuration. Background inference cannot delay deterministic reconciliation/execution, and its schedule survives restarts.

Fibonacci retracements/extensions and swing-duration projections use `GOLDEN_RATIO` from `.env`. They are heuristics, not established guarantees of timing or profit. Profit estimates use Coinbase execution prices and configured fees/slippage; actual fees come from confirmed fills.

## Legacy order ID mismatch and existing live reservation

The SDK was also found to silently prefix raw client UUIDs with `cbnode`, while the old reservation stored the raw UUID. New orders now reserve the SDK-generated ID unchanged, and reconciliation recognizes both exact and legacy-prefixed IDs.

The inspected pending reservation has a logged `Forbidden` error marked `notSubmitted=false`. Read-only Coinbase account checks subsequently succeeded, API permissions report view/trade enabled, and an order-history lookup returned no matching client order ID. That absence does not by itself establish a terminal exchange outcome. The implementation preserves the uncertain reservation rather than opening a duplicate position. No live order was submitted as a verification test. Future explicit HTTP 400/401/403/404/405/413/422/429 submission rejections are classified as not submitted; ambiguous transport errors and 5xx responses remain unresolved. Legacy errors do not gain that proof retroactively.

## Coverage and limits

Runtime review covered the main loop, scanner, policy, funnel, risk, books/recovery, Coinbase/paper brokers, execution lifecycle, logging, dataset, schedules and inference. Offline research studies and legacy snapshot/Kraken aggregation utilities are not execution paths. Meme-specific screening helpers remain separate from the configured short-term entry universe.

Tests cover actual paper main-loop buy → persist → deterministic sale → dataset/report generation; broker rejection/unknown/partial fills; quantity rounding; preserved ownership; restart/daily-loss idempotence; UTC schedules; per-exchange parsing; history integrity; correlation calculations; historical dataset integrity; Meta exact token budgets and credential exclusion. Public-feed checks returned prices and 61 completed candles from all three added venues. Live order placement and profitability are not claimed by these checks.

## Official API references

- [Binance market-data-only endpoints](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md)
- [Binance.US REST documentation](https://docs.binance.us/)
- [Crypto.com Exchange v1 REST reference](https://exchange-developer.crypto.com/exchange/v1/docs/api/rest-single-page/)
- [Meta Model API overview and context window](https://dev.meta.ai/docs/overview)
- [Meta Messages API and token counting](https://dev.meta.ai/docs/protocols/messages)

## Verified delivery

The offline suite passed 88 checks, including the real paper main-loop buy/persist/sale path and dataset integrity. The first curated dataset contained 260 rows. A real Meta Muse Spark 1.3 pass used 993,064 measured input tokens and 5,863 output tokens, returned five evidence-linked findings, and disclosed 30 omitted evidence chunks. Findings are stored in `reports/meta-correlations.json`. This validates the API adapter and near-million-token ingestion path, not a predictive-profit claim.


## Subsequent live verification and user updates

The user explicitly authorized one $1 spot connection test after being told spot fees apply. The preview succeeded, one SDK-generated client ID was submitted, and Coinbase confirmed a fill (0.00001241 BTC, filled value $0.9898419524, fees $0.0089085775716). This proves spot API execution works. The test has its own durable journal and execution event; the prior unresolved reservation was preserved. The bot's zero-fee-only instruction remains in force.

The user subsequently reported $16 available and requested $1–$5 confidence sizing (30% -> $1; high confidence -> up to $5). The new sizing is configured in `.env`; unknown confidence uses the minimum, and heuristic confidence is labelled as uncalibrated. Coinbase One Basic's $500 simple-trade monthly waiver excludes Coinbase Advanced/API execution, as verified against Coinbase disclosures. Do not infer zero API fees from the subscription.

Meme research now archives validated 15-minute/hourly histories for ten configured meme coins plus BTC across Coinbase, Binance.com, Binance.US and Crypto.com. The first scan collected 16,512 validated candles. Partial Coinbase histories are retained separately with explicit quality flags. Current research screens incorporate verified per-side API fees and explicitly distinguish historical scenarios, trailing momentum proxies and actual fills. No investment-profit claim or additional live buy follows from this ranking.


## Per-route diagnostics and instrument corrections

All active public HTTP adapters now emit paired JSON request/response console events with a correlation ID, method, host/route, duration, status and a bounded redacted response preview. Coinbase SDK and TypeSafe operations emit equivalent parsed-operation events, using `sdk_success` rather than inventing an HTTP status. Authorization headers, private keys and request bodies are not logged. Tests verify redaction and preservation of the original error object.

Public diagnostics confirmed Binance.com returns `-1121 Invalid symbol` for the requested FARTCOINUSDT and TOSHIUSDT spot symbols; its current spot instrument list had no matching base assets. Crypto.com returns `40004 Invalid instrument_name` for their `_USDT` variants but lists `_USD` spot instruments. The adapter now supports native-quote overrides; both corrected Crypto.com books and 15-minute candle routes returned HTTP 200. Futures contracts were not substituted for spot data.

The subsequent suite passed 98 offline checks, including the $1–$5 sizing rule, positive-fee entry rejection, prediction research, meme-history statistics, native-USD overrides and route/response redaction. `HTTP_LOG_ENABLED` and preview limits are controlled in `.env`.
