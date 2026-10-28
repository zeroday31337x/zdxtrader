# Broader trade-type research

## Direct finding

Some individual coin/strategy combinations were historically profitable after modeled fees and slippage. None passed the minimum consistency screen for deployment. The most useful leads are slower spot swing trades, especially weekly breakouts; they need new forward paper evidence rather than activation.

Eight fixed strategy families were tested across fourteen current Coinbase USD spot products, making 112 per-coin combinations. Twenty-seven combinations were positive in the recent 60 days. The strongest displayed results are selected from that search and are exposed to multiple-testing and survivor bias.

## Positive historical examples

Recent period: 2026-08-29 02:00 UTC through 2026-10-28 02:00 UTC. Fixed $10 entry notional, $100 initial simulated cash, at most one position per independent simulation, no leverage. P&L includes current 0.90% taker fees on entry and exit and assumed 0.10% adverse slippage each side. Inference costs are excluded.

| Coin | Strategy | Earlier-period trades | Earlier-period net P&L | Recent trades | Recent net P&L | Recent stressed-cost P&L | Recent P&L without best trade |
|---|---|---:|---:|---:|---:|---:|---:|
| PEPE-USD | weekly_breakout | 5 | +$0.21 | 3 | +$1.57 | +$1.48 | −$0.98 |
| DOGE-USD | trend_dip | 3 | −$2.39 | 3 | +$1.56 | +$1.55 | +$0.60 |
| FARTCOIN-USD | weekly_breakout | 4 | +$2.04 | 1 | +$1.55 | +$1.52 | +$0.00 |
| WIF-USD | weekly_rotation | 2 | −$2.01 | 1 | +$1.30 | +$1.27 | +$0.00 |
| SOL-USD | weekly_breakout | 4 | +$1.94 | 1 | +$1.27 | +$1.24 | +$0.00 |
| PENGU-USD | weekly_breakout | 5 | −$1.69 | 2 | +$1.25 | +$1.19 | −$1.05 |
| WIF-USD | capitulation_rebound | 1 | −$1.09 | 2 | +$1.24 | +$0.34 | +$0.60 |
| PENGU-USD | weekly_rotation | 3 | +$1.76 | 1 | +$1.16 | +$1.12 | +$0.00 |

The earlier period is 2026-05-08 02:00 UTC through 2026-08-29 02:00 UTC, with historical warm-up drawn from May 1. It has a different duration from the recent period; dollar P&L is not a normalized period-return comparison.

PEPE weekly breakouts were also the development-selected winner for that family, but the three recent trades depended on one large winner: removing it changes +$1.57 to approximately −$0.98. DOGE trend dips were positive recently but negative earlier. FARTCOIN/SOL weekly breakout gains came from only one recent trade apiece. Those results establish historical examples, not dependable profit estimates.

## Portfolio-level market-entry results

Each strategy independently chose a single qualifying coin from its universe. Majors: BTC, ETH, SOL, XRP. Meme universe: DOGE, SHIB, PEPE, BONK, WIF, FLOKI, FARTCOIN, PENGU, TOSHI, TRUMP.

| Universe | Strategy | Recent trades | Recent net P&L |
|---|---|---:|---:|
| majors | rsi_rebound | 33 | −$6.55 |
| majors | range_reversion | 33 | −$6.40 |
| majors | capitulation_rebound | 0 | +$0.00 |
| majors | trend_dip | 5 | −$1.44 |
| majors | slow_trend | 20 | −$6.12 |
| majors | weekly_breakout | 3 | −$0.11 |
| majors | relative_reversion | 6 | −$1.08 |
| majors | weekly_rotation | 4 | −$1.11 |
| memes | rsi_rebound | 45 | −$6.47 |
| memes | range_reversion | 45 | −$8.21 |
| memes | capitulation_rebound | 8 | −$0.16 |
| memes | trend_dip | 12 | −$3.81 |
| memes | slow_trend | 17 | −$3.22 |
| memes | weekly_breakout | 6 | −$0.90 |
| memes | relative_reversion | 9 | −$3.78 |
| memes | weekly_rotation | 3 | −$1.56 |

None of the 16 market-entry strategy/universe combinations was positive in the recent 60 days or across the full available period after the seven-day warm-up. A zero result with zero trades is inactivity, not profitable trading.

## Order types and execution

- Market entry and market exit: directly tested with taker fees and adverse slippage. No reliable portfolio-level positive result.
- Hypothetical post-only limit entry and market exit: entry limit 0.25% below the last closed price, with next-hour open above the limit and the hourly low at least 0.10% below it. Fee model uses 0.50% maker entry and 0.90% taker exit. This is a conditional-fill assumption, not confirmation of queue position or fills. No same-hour exit is allowed.
- Only one of the 16 full-period conditional limit portfolios was positive: major-coin capitulation rebound, +$0.09 from one trade. None was positive in the recent period. This does not establish a maker-order advantage.
- Arbitrage, market making, genuine long/short pairs, transfer-driven signals and derivatives were not tested: historical order books, executable multi-venue quotes, funding, borrow costs, or transfer data are missing. Candle results cannot establish their profitability.

## Fixed strategy families

- RSI rebound: simple-mean 14-hour RSI crosses upward through 30; exit at RSI 60, 6% close-based stop, or five-day maximum.
- Range reversion: 24-hour price z-score below −1.5 with a positive last-hour return while BTC's absolute 24-hour return is below 3%; exit at the mean, 6% close-based stop, or three-day maximum.
- Capitulation rebound: 24-hour loss of at least 8%, a positive last hour and volume ratio at least 1.5; exit at 8% gain/loss or five days.
- Trend dip: price above its seven-day mean, 24-hour loss greater than 3%, positive last hour; exit at 8% gain, 6% close-based loss, or seven days.
- Slow trend: price and three-day mean above the seven-day mean with BTC above its seven-day mean; exit on trend loss after 24 hours, 8% close-based loss, or fourteen days.
- Weekly breakout: close above the preceding seven-day high with increasing volume and BTC above its seven-day mean; exit at 10% trailing closing drawdown, 8% close-based loss, or fourteen days.
- Relative reversion: coin/BTC price-ratio z-score below −2 with a coin rebound and positive BTC daily return; spot-long coin only, no hedged short; exit on ratio recovery, 6% close-based loss, or five days.
- Weekly rotation: once weekly hold the strongest positive seven-day return while BTC's seven-day return is positive; retain an unchanged holding without extra trading fees, otherwise switch or go to cash.

Signals use completed candles and earliest next-hour execution. Stops use closes and next-hour execution, so they are not guaranteed intrabar stop prices. Missing hourly bars reset history rather than being filled with synthetic observations.

## Consistency checks and selection

No per-coin combination passed all of: at least ten earlier and ten recent trades; positive net P&L in both periods; positive recent P&L under 0.25% adverse slippage each side; and positive recent P&L after removing its best trade.

A chronological selector chose a strategy using only the preceding 60 days when that training window had positive after-cost P&L and at least five trades, otherwise stayed in cash. Across four subsequent 30-day folds, the major-coin selector totaled −$0.95 and the meme selector −$2.92. This is an exploratory walk-forward construction on previously observed history, not independent untouched validation.

Seven methodology tests passed against a local copy of the research code: future-data isolation, gap resets, next-open prices and both fees, post-only trade-through requirements, rejected marketable limit assumptions, no same-hour limit exits, and no extra fees when weekly rotation keeps the same coin.

## Limits and action

The same 180-day dataset was examined in the preceding study. These are new exploratory rules on reused history, not an independent confirmation set. The current watchlist omits delisted/failed coins; historic product eligibility/minimum sizes and tick increments are not reconstructed. Hourly OHLCV cannot establish historical spread, queue position, partial fills or executable depth. Assumed slippage can understate real costs. Current fees are applied as a cost scenario across the historical period. The model itself was not backtested.

Keep the production scanner in shadow mode. The historical positives justify tracking weekly breakouts and trend pullbacks as research candidates; they do not justify adding leverage, increasing capital, or enabling automated execution. New forward paper observations must preserve the frozen rules and include all candidates and costs.

Research source, raw ledgers and result files are on aws1 under /home/ubuntu/jev-trading-desk/research/trade-types. No live orders, production strategy edits, or production restarts were performed during this study. The remote command interface became unavailable after calculation; final method verification was completed locally using the copied source, while stored result files remained readable.
