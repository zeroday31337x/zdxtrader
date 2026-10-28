# Trading strategy research — fixed $10 entries

Data: 2026-05-01 02:00 UTC to 2026-10-28 02:00 UTC. Validation: 2026-08-29 02:00 UTC to 2026-10-28 02:00 UTC.

## Result

0 of 8 strategy/universe combinations met every prespecified evidence check. A positive historical result alone is insufficient to activate live trading.

## Verified costs

Account fee tier: Intro. Taker 0.90% and maker 0.50% per side, verified with the read-only transaction summary endpoint. Primary simulation uses taker fees plus 0.10% adverse slippage each side. Stress uses 0.25% slippage each side. Fees are charged on entry and exit; current fees are applied throughout history as an execution-cost scenario. Inference costs are excluded.

## Validation results

| Universe | Strategy | Trades | Net P&L | Mean per $10 entry | Win rate | Max drawdown on $100 cash | Stress P&L |
|---|---|---:|---:|---:|---:|---:|---:|
| majors | momentum | 23 | $-5.73 | $-0.249 | 13.0% | 5.93% | $-6.41 |
| majors | relative_strength | 14 | $-3.01 | $-0.215 | 28.6% | 3.01% | $-3.43 |
| majors | breakout | 21 | $-5.03 | $-0.239 | 14.3% | 5.23% | $-5.65 |
| majors | pullback | 15 | $-5.15 | $-0.344 | 6.7% | 5.21% | $-5.59 |
| memes | momentum | 34 | $-10.19 | $-0.300 | 17.6% | 10.52% | $-11.19 |
| memes | relative_strength | 34 | $-10.46 | $-0.308 | 17.6% | 10.79% | $-11.46 |
| memes | breakout | 26 | $-3.22 | $-0.124 | 23.1% | 4.88% | $-3.99 |
| memes | pullback | 25 | $-3.51 | $-0.140 | 20.0% | 5.11% | $-4.25 |

P&L uses $100 starting cash, one $10 position at a time per independently simulated strategy, no compounding of order size, and includes final liquidation. These are simulations, not actual fills. Low drawdown on total cash also reflects leaving roughly 90% in cash.

## Development-selected candidates

| Universe | Development winner | Development P&L | Validation P&L | Validation trades |
|---|---|---:|---:|---:|
| majors | relative_strength | $-1.63 | $-3.01 | 14 |
| memes | breakout | $-4.43 | $-3.22 | 26 |

## Buy-and-hold and cash baselines

- majors: cash P&L $0; equal-weight buy-and-hold with $10 total invested: $-0.34. Eligible start/end assets: BTC-USD, ETH-USD, SOL-USD, XRP-USD.
- memes: cash P&L $0; equal-weight buy-and-hold with $10 total invested: $-1.06. Eligible start/end assets: DOGE-USD, SHIB-USD, PEPE-USD, BONK-USD, WIF-USD, FLOKI-USD, FARTCOIN-USD, PENGU-USD, TOSHI-USD, TRUMP-USD.

Buy-and-hold invests $10 total, matching one-position strategy exposure rather than buying $10 of every coin. Transaction costs are included.

## Fixed rules and execution assumptions

- momentum: 24h return >2%, close>SMA72, 24h volume ratio>=1, BTC 24h return>0.
- relative_strength: 24h return>0 and >BTC24h+2%, close>SMA72, volume ratio>=1, BTC24h>0.
- breakout: close>previous24h high, current quote-volume>1.5x previous24h mean, BTC24h>0.
- pullback: close>SMA168, SMA24>SMA72, 6h return<0, 1h return>0, 24h return>BTC24h, BTC24h>0.
- exit: close loss>=5%, close gain>=10%, 72h maximum, or negative24h return after24h; next open execution.

Signals use only completed hourly candles and next-hour opens, with adverse slippage. Stops and targets are close-based; intrabar fills are not assumed. No strategy may hold overlapping positions in its own simulation. Current symbols form two fixed universes: BTC/ETH/SOL/XRP and ten meme assets.

## Data quality

| Symbol | Hourly bars | Required bars | Feature-ready bars |
|---|---:|---:|---:|
| BTC-USD | 4315 | 4320 | 3979 |
| ETH-USD | 4315 | 4320 | 3979 |
| SOL-USD | 4315 | 4320 | 3979 |
| XRP-USD | 4315 | 4320 | 3979 |
| DOGE-USD | 4315 | 4320 | 3979 |
| SHIB-USD | 4315 | 4320 | 3979 |
| PEPE-USD | 4314 | 4320 | 3978 |
| BONK-USD | 4315 | 4320 | 3979 |
| WIF-USD | 4261 | 4320 | 2033 |
| FLOKI-USD | 4114 | 4320 | 1532 |
| FARTCOIN-USD | 4315 | 4320 | 3979 |
| PENGU-USD | 4315 | 4320 | 3979 |
| TOSHI-USD | 4315 | 4320 | 3979 |
| TRUMP-USD | 4295 | 4320 | 2612 |

Missing hourly bars reset the 169-bar feature window. Missing prices/volumes are not filled or fabricated. Source pages, protocol, raw candles, file hashes, exact trade ledgers, summary CSV and scripts are retained in the research/profit-study directory on aws1. Nine methodology regression tests passed.

## Evidence checks

At least 30 validation trades; positive development and validation P&L; both validation halves positive; positive under stressed slippage; positive after removing the best trade. These are screening criteria, not statistical proof.

- majors/momentum: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- majors/relative_strength: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- majors/breakout: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- majors/pullback: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- memes/momentum: FAIL; failed checks: development_positive, validation_positive, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- memes/relative_strength: FAIL; failed checks: development_positive, validation_positive, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- memes/breakout: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.
- memes/pullback: FAIL; failed checks: development_positive, validation_positive, minimum_30_validation_trades, both_validation_halves_positive, stress_positive, positive_without_best_trade.

## Limits

This is a historical screen of four deterministic strategies, not a backtest of the model or historical order-book imbalance. The current watchlist creates survivorship and selection bias; delisted/failed coins are absent, and historical regional eligibility is not verified. Slippage is an assumption because historical bid/ask/depth are unavailable. Maker results in results.json are fee sensitivity only and do not establish maker fills. Choosing the best among eight validation results adds selection risk; development-selected results are shown separately. No parameters were tuned after viewing validation. No statistical confidence or future profitability is claimed. Any candidate requires new forward paper results and complete execution/exit/account controls.

No live configuration, production strategy, or order submission was changed for this research.

## Cost diagnostic (not a new strategy test)

The same entries/exits were recalculated with zero fees and zero slippage to separate price movement from costs. This is not an achievable execution scenario. No strategy rules changed.

| Universe | Strategy | Cost-free P&L | After-cost P&L | Cost drag |
|---|---|---:|---:|---:|
| majors | momentum | $-1.14 | $-5.73 | $4.58 |
| majors | relative_strength | $-0.22 | $-3.01 | $2.79 |
| majors | breakout | $-0.84 | $-5.03 | $4.19 |
| majors | pullback | $-2.18 | $-5.15 | $2.97 |
| memes | momentum | $-3.43 | $-10.19 | $6.76 |
| memes | relative_strength | $-3.71 | $-10.46 | $6.75 |
| memes | breakout | $2.00 | $-3.22 | $5.22 |
| memes | pullback | $1.50 | $-3.51 | $5.01 |
