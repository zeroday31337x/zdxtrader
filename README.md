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
