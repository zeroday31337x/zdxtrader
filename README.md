# Jev Trading Desk Skeleton

Autonomous paper-trading desk following the strict architecture:

- **Code** owns all arithmetic, prices, spreads, vol, inventory, drawdown, position size, stops, hard limits.
- **Jev** (TypeSafe System One) owns regime, toxicity, setup quality, skilled/lucky, keep/kill judgments. One judgment per question. Lean state.
- **You** own anything that signs, moves real funds, or changes a risk limit.
- **Grok Bot / this process** runs the desk: roles, routines, reports, handoffs.

Paper trading only in this skeleton. Never places a live order.

## Structure

- `state/` — deterministic snapshot builder (<400 tokens, only pre-decision data)
- `questions/` — one file per bot type (gambler, house, spy). One judgment per question. Every Choice has "other".
- `policy/` — thresholds and combination weights in code
- `risk/` — hard vetoes (position size, daily loss, leverage, fees+gas, model version)
- `broker/` — paper broker with same interface as live
- `filter/` — funnel: cheapest checks first, log every rejection with reason
- `book/` — one open position at a time + bench (reason sets duration)
- `logs/` — every snapshot, question, answer (with probs), outcome for calibration
- `judge/` — small service that holds the Jev key. Bots call it with DESK_SECRET. Returns raw answers. Makes no trading decisions.
- `src/main.ts` — orchestrator loop (shadow or paper mode)

## Setup on AWS VPS (EC2)

1. Launch Ubuntu 22.04+ EC2. Open only SSH (22) and any monitoring port. No public trading ports needed for paper.
2. SSH in, update:
   ```bash
   sudo apt update && sudo apt upgrade -y
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs git
   node -v  # must be >=20
   ```
3. Clone or upload this folder (scp -r or git).
4. `cd jev-trading-desk && npm install`
5. `cp .env.example .env` and edit with your TYPESAFE_API_KEY (from console.typesafe.ai) and a random DESK_SECRET.
6. Build: `npm run build`
7. Run with PM2 (recommended for 24/7):
   ```bash
   sudo npm install -g pm2
   pm2 start dist/src/main.js --name trading-desk
   pm2 save
   pm2 startup
   ```
8. Logs: `pm2 logs trading-desk`
9. Reports: `npm run report` (after some decisions)

## Modes

- `MODE=shadow`: Jev labels every decision, policy logs what it *would* have done, nothing executes.
- `MODE=paper`: policy executes against the paper broker.

## Rules enforced

- Math stays in code. State is named numbers only.
- One judgment per question.
- Lean state. Missing is not neutral.
- Choice is relative (always picks a winner); Noul is absolute (can be low for all).
- Facts kill before judgments. Hard contract/risk flags veto before Jev is asked.
- No agent holds a private key. Judge service is the only thing that talks to Jev.
- Every rejection logged with the check that fired.
- Pin model version. Log exact version string.
- If decision not back before next cycle, hold. Back off on rate limits.

## Next steps (after paper proves calibration)

- Wire real market data feed (Binance public, Solana RPC, etc.).
- Add your specific strategies into the three bots.
- Calibration report: predicted vs actual, Brier score.
- Only after weeks of good paper results and your explicit approval: consider live with trading-only keys (withdrawals disabled), fresh wallet you are willing to lose, and human APPROVE for any signature.

**This is not financial advice. Past paper results do not predict future performance. You can lose money.**

Get your Jev key: https://console.typesafe.ai
SDK docs: https://typesafe.ai or the official @typesafe-ai/sdk.
