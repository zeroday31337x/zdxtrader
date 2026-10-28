# Trading decision and execution fixes

Source changes are verified in `verified-build/`. The original fix was subsequently incorporated into the dual scanner, built to `dist/`, and deployed in shadow mode. See DUAL-SCAN-NOTES.md. No real orders were sent during verification.

Run `npm run verify` to compile the candidate and run offline regression tests.

- Setup quality now requests a Noul probability, matching the existing 0.65 minimum. This changes the question contract rather than assigning arbitrary numeric values to choice labels. Worth >= 0.70 and toxicity <= 0.30 remain unchanged.
- Invalid, missing and non-finite model probabilities fail closed; rejection messages identify every failed check.
- Async cycles run sequentially, with errors caught at the cycle boundary.
- Live entries persist intent and client ID before submission. Rejected, partially filled or uncertain outcomes keep a lock for manual exchange reconciliation; they are not automatically retried.
- Broker success requires an exchange order ID and confirmed FILLED order. Price, filled value and fees come from the exchange.
- Position state survives restart and is separated by mode. This is for a single worker; do not run multiple replicas.
- Spot short entries are rejected instead of being submitted as sells.

## Remaining before activating live trading

The scanner still has placeholder returns, volatility, inventory and drawdown. The edge metric is an uncalibrated imbalance heuristic. Real market/account history, position exits, startup reconciliation against the exchange, and realized-P&L accounting must be implemented and verified. The persistent book does not import any preexisting exchange positions. Existing historical decisions may be below thresholds independently of the corrected setup answer.

Do not clear a pending position file without first checking the exchange by its recorded client order ID. An accepted IOC may not be fully settled when first queried; the candidate deliberately requires reconciliation in that case.

Original source is in the timestamped backups directory.
