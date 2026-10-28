# Dual strategy scanner

Both strategies run sequentially in the same service. The deployment uses MODE=shadow and LIVE_TRADING=false in PM2; the previous .env live settings are preserved. The main scan service has no live broker submission path until account reconciliation, exits and realized-loss accounting exist.

## Entry size

All strategy entry sizing uses $5–$10 order notional, rounded down to cents. The policy, risk check, paper broker and live broker all enforce the hard range. Fees are additional. MAX_POSITION_USD can reduce the maximum but cannot raise the $10 ceiling. Products requiring a minimum above the proposed size are skipped; sizing never increases to meet an exchange minimum.

## Short-term

Existing SCAN_PRODUCTS excluding the meme allowlist. Completed minute candles supply real 1m, 5m and 15m returns and realized log-return volatility. The existing heuristic edge filter remains; it is explicitly labeled a proxy, not a predicted return.

## Meme swing

MEME_PRODUCTS defaults to DOGE, SHIB, PEPE, BONK, WIF, FLOKI, FARTCOIN, PENGU, TOSHI and TRUMP against USD. This is an explicit editable watchlist, not automatic meme classification or a token safety assessment. Only currently online USD spot products supporting market orders are considered. Symbols absent from Coinbase are logged and skipped.

Every five minutes, fetch 49 completed hourly bars. Require positive 6h/24h returns, at least $1 million approximate 24h quote turnover, current 24h turnover at least the preceding 24h, and spread <=30 bps. These are uncalibrated screening rules, not evidence of profitability. Hourly close * base volume estimates quote turnover. Rank passing candidates by volume ratio and send the best candidate to the model for the existing quality/worth/toxicity thresholds. Only long recommendations are allowed. Outlook is 24–72 hours; no holding duration is promised and no position is automatically opened or closed by this strategy.

Both paths reject missing, stale, non-finite or discontinuous data. Book depth must show at least $1,000 on the visible ask side. Minute fields are omitted from hourly model state; account data is explicitly unavailable rather than made-up inventory/drawdown values.

Logs identify short_term versus meme_swing, decision size, reason, effective mode and outlook. Both continue scanning even while the persistent book is locked. A candidate passing a model threshold is still only a shadow recommendation.

## Verification and operations

npm run verify compiles verified-build and runs offline regressions. npm run build produces dist. pm2 logs trading-desk shows both screens. No tests submit real orders. Original source and dist are in the timestamped *-dual-scan backup directory.

Before restoring real trading, implement exchange reconciliation, complete entry/exit lifecycle and realized P&L, and verify actual account fees. The current fee config of 10 bps round-trip is an unverified user setting. The public product endpoint cannot confirm account-specific fee tiers or regional eligibility.

Public requests are paced globally at one per 600 ms, with bounded retries and shared backoff for HTTP 429. Product metadata is cached for five minutes and completed candle history for its current time bucket. These controls apply to both scans.

## Current small-account budget update

User-reported available balance: $19.50. Eligible policy entries now use fixed $9 order notional for both strategies; the hard broker/risk ceiling is $9. Existing exchange minimum checks still apply. Signal thresholds are unchanged. One global persistent position/order lock remains. At the verified 0.90% taker entry fee, a $9 entry costs about $9.081 before price/rounding effects and would leave about $10.419 from the reported balance. This is a budget calculation, not an assertion of available account funds; live account reconciliation remains missing and live submission remains disabled.

The existing 24–72h meme outlook runs first when its five-minute scan is due. Short-term scanning remains active as an opportunity watch. Both run in shadow mode; no real position is opened by this change. Longer weekly-breakout/trend-dip research candidates are not silently activated as new production strategies.
