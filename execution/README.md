# Execution work — staged, not wired to production

Lifecycle implements durable intent before submission, unresolved-order blocking, terminal partial fills, proportional cost basis, fees on both sides, restart-safe realized P&L, one position, fixed $9 entries, UTC daily loss guards and quote-validated stop/target/trailing/time exits. It uses an injected adapter and cannot contact Coinbase itself.

Remaining engineering before calling the application ready:
- Coinbase adapter must reconcile open/rejected/partial orders by durable client ID, enumerate all account/order pages, verify portfolio balances and precision/minimums, and distinguish a confirmed missing order from an uncertain lookup. Never blindly retry submissions.
- Add process ownership/locking so concurrent workers cannot share state; reconcile existing exchange holdings before the first entry.
- Integrate lifecycle into a separate management loop that monitors positions even when scans/model calls fail. Persist and validate exit policy per position.
- Test actual product increments, dust, rejected exits, account permissions, fee changes, outages and restart/crash recovery using a simulated adapter and read-only exchange checks.

Do not remove the existing live block or treat this module as an activation switch. Production remains shadow. This is a foundation, not a completed execution system.
