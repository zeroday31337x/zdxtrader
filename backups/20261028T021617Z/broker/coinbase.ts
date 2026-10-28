import { CBAdvancedTradeClient } from 'coinbase-api';
import dotenv from 'dotenv';

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

  async place(order: Order, currentMid: number): Promise<Fill> {
    if (!this.client) throw new Error('Coinbase client not initialized — missing keys');

    const clientOrderId = `desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    const orderId = (result as any).order_id || (result as any).success_response?.order_id || clientOrderId;

    return {
      orderId,
      symbol: order.symbol,
      side: order.side,
      sizeUsd: order.sizeUsd,
      price: currentMid,
      timestamp: new Date().toISOString(),
      fees: order.sizeUsd * 0.006,
    };
  }
}
