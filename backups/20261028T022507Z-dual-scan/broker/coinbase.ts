import { CBAdvancedTradeClient } from 'coinbase-api';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config();

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

/**
 * Live Coinbase broker.
 * Only used when MODE=live AND LIVE_TRADING=true AND keys are present.
 * Keys must be trading-only (no transfer / withdraw permissions).
 */
export class CoinbaseBroker {
  private client: CBAdvancedTradeClient | null = null;

  constructor() {
    const apiKey = process.env.COINBASE_API_KEY;
    const apiSecret = process.env.COINBASE_API_SECRET;
    if (apiKey && apiSecret) {
      this.client = new CBAdvancedTradeClient({
        apiKey,
        apiSecret,
      });
    }
  }

  isReady(): boolean {
    return this.client !== null;
  }

  async place(order: Order, currentMid: number, clientOrderId = randomUUID()): Promise<Fill> {
    if (!this.client) throw new Error('Coinbase client not initialized — missing keys');

    if (order.side !== 'buy') throw new Error('Short entries are unsupported by this spot broker');
    if (!Number.isFinite(order.sizeUsd) || order.sizeUsd <= 0) throw new Error('Invalid order size');
    const side = order.side.toUpperCase() as 'BUY' | 'SELL';

    const result = await this.client.submitOrder({
      client_order_id: clientOrderId,
      product_id: order.symbol,
      side,
      order_configuration: {
        market_market_ioc: {
          quote_size: order.sizeUsd.toFixed(2),
        },
      },
    });

    if (!result.success || !result.success_response?.order_id) {
      throw new Error(`Coinbase rejected order: ${result.error_response?.message || 'no confirmed order ID'}`);
    }
    const orderId = result.success_response.order_id;
    // Acceptance is not a fill. An unresolved/partial order leaves the persistent lock in place.
    const { order: confirmed } = await this.client.getOrder({ order_id: orderId });
    const price = Number(confirmed.average_filled_price);
    const sizeUsd = Number(confirmed.filled_value);
    const fees = Number(confirmed.total_fees);
    if (confirmed.status !== 'FILLED' || !Number.isFinite(price) || price <= 0 ||
        !Number.isFinite(sizeUsd) || sizeUsd <= 0 || !Number.isFinite(fees) || fees < 0) {
      throw new Error(`Order ${orderId} requires reconciliation (status=${confirmed.status}); no further entries allowed`);
    }
    return {
      orderId, symbol: order.symbol, side: order.side, sizeUsd, price,
      timestamp: confirmed.last_fill_time || new Date().toISOString(), fees,
    };
  }
}
