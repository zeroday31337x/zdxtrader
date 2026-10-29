import { envNumber } from '../policy/env.js';
import { assertTradeSize } from '../policy/limits.js';
export class PaperBroker {
    positions = new Map();
    cash = envNumber('PAPER_START_BALANCE_USD'); // starting paper balance
    async place(order, currentMid) {
        assertTradeSize(order.sizeUsd);
        const price = currentMid; // assume mid fill for simplicity
        const qty = order.sizeUsd / price;
        const fees = order.sizeUsd * envNumber('PAPER_FEE_BPS') / 10000; // 10 bps
        // Update position (simplified long-only for skeleton)
        const existing = this.positions.get(order.symbol) || { size: 0, avgPrice: 0 };
        if (order.side === 'buy') {
            const newSize = existing.size + qty;
            existing.avgPrice = (existing.avgPrice * existing.size + price * qty) / newSize;
            existing.size = newSize;
            this.cash -= order.sizeUsd + fees;
        }
        else {
            existing.size -= qty;
            this.cash += order.sizeUsd - fees;
        }
        this.positions.set(order.symbol, existing);
        return {
            orderId: `paper-${Date.now()}`,
            symbol: order.symbol,
            side: order.side,
            sizeUsd: order.sizeUsd,
            price,
            timestamp: new Date().toISOString(),
            fees,
        };
    }
    getPositions() {
        return Object.fromEntries(this.positions);
    }
    getCash() {
        return this.cash;
    }
}
//# sourceMappingURL=paper.js.map