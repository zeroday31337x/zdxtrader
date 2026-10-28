import { assertTradeSize } from '../policy/limits.js';
/**
 * Paper broker. Same interface a live one would use.
 * Never touches real funds.
 */

export interface Order {
  symbol: string;
  side: 'buy' | 'sell';
  sizeUsd: number;
  type: 'market';
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: string;
  sizeUsd: number;
  price: number;
  timestamp: string;
  fees: number;
}

export class PaperBroker {
  private positions = new Map<string, { size: number; avgPrice: number }>();
  private cash = 10000; // starting paper balance

  async place(order: Order, currentMid: number): Promise<Fill> {
    assertTradeSize(order.sizeUsd);
    const price = currentMid; // assume mid fill for simplicity
    const qty = order.sizeUsd / price;
    const fees = order.sizeUsd * 0.001; // 10 bps

    // Update position (simplified long-only for skeleton)
    const existing = this.positions.get(order.symbol) || { size: 0, avgPrice: 0 };
    if (order.side === 'buy') {
      const newSize = existing.size + qty;
      existing.avgPrice = (existing.avgPrice * existing.size + price * qty) / newSize;
      existing.size = newSize;
      this.cash -= order.sizeUsd + fees;
    } else {
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
