import { envNumber } from '../policy/env.js';
import { floorQuantity } from '../execution/quantity.js';
import { assertTradeSize } from '../policy/limits.js';
import { CBAdvancedTradeClient } from 'coinbase-api';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
dotenv.config();
const readEnv = (name, fallbackName) => {
    const value = process.env[name] ?? process.env[fallbackName ?? name.toLowerCase()] ?? '';
    return typeof value === 'string' ? value.trim() : '';
};
/** Thrown only when the order provably did not reach the exchange. Safe to release the local lock. */
export class NotSubmittedError extends Error {
    constructor(message) { super(message); this.name = "NotSubmittedError"; }
}
/**
 * Live Coinbase broker.
 * Only used when MODE=live AND LIVE_TRADING=true AND keys are present.
 */
export class CoinbaseBroker {
    client = null;
    constructor() {
        const apiKey = readEnv('COINBASE_API_KEY', 'coinbase_api_key');
        const apiSecret = readEnv('COINBASE_API_SECRET', 'coinbase_api_secret').replace(/\r?\n/g, '\n');
        if (!apiKey || !apiSecret) {
            this.client = null;
            return;
        }
        this.client = new CBAdvancedTradeClient({
            apiKey,
            apiSecret,
        }, { timeout: envNumber('ORDER_TIMEOUT_MS') });
    }
    isReady() {
        return this.client !== null;
    }
    async place(order, currentMid, clientOrderId = randomUUID()) {
        try {
            assertTradeSize(order.sizeUsd);
        }
        catch (err) {
            throw new NotSubmittedError(err.message);
        }
        if (!this.client)
            throw new NotSubmittedError('Coinbase client not initialized — missing keys');
        if (order.side !== 'buy')
            throw new NotSubmittedError('Short entries are unsupported by this spot broker');
        if (!Number.isFinite(order.sizeUsd) || order.sizeUsd <= 0)
            throw new NotSubmittedError('Invalid order size');
        const side = order.side.toUpperCase();
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
        if (!result.success) {
            throw new NotSubmittedError(`Coinbase rejected order: ${result.error_response?.message || 'no confirmed order ID'}`);
        }
        if (!result.success_response?.order_id)
            throw new Error(`Coinbase accepted request without order ID for ${clientOrderId}; requires reconciliation`);
        const orderId = result.success_response.order_id;
        const { order: confirmed } = await this.client.getOrder({ order_id: orderId });
        const price = Number(confirmed.average_filled_price);
        const sizeUsd = Number(confirmed.filled_value);
        const fees = Number(confirmed.total_fees);
        if (confirmed.status !== 'FILLED' || !Number.isFinite(price) || price <= 0 ||
            !Number.isFinite(sizeUsd) || sizeUsd <= 0 || !Number.isFinite(fees) || fees < 0) {
            throw new Error(`Order ${orderId} requires reconciliation (status=${confirmed.status}); no further entries allowed`);
        }
        return {
            orderId,
            symbol: order.symbol,
            side: order.side,
            sizeUsd,
            price,
            timestamp: confirmed.last_fill_time || new Date().toISOString(),
            fees,
            baseQuantity: confirmed.filled_size,
        };
    }
    async tradingPermissions() {
        if (!this.client)
            throw Error('Coinbase client not initialized');
        const permissions = await this.client.getApiKeyPermissions();
        return { canView: permissions.can_view, canTrade: permissions.can_trade };
    }
    async availableUsd() {
        if (!this.client)
            throw Error('Coinbase client not initialized');
        let total = 0, cursor;
        for (let page = 0; page < envNumber('RECONCILE_MAX_PAGES'); page++) {
            const result = await this.client.getAccounts({ limit: envNumber('RECONCILE_PAGE_SIZE'), cursor });
            for (const account of result.accounts) {
                if (account.currency !== 'USD')
                    continue;
                const value = Number(account.available_balance.value);
                if (!Number.isFinite(value) || value < 0)
                    throw Error('Invalid verified USD balance');
                total += value;
            }
            if (!result.has_next)
                return total;
            if (!result.cursor)
                throw Error('Incomplete account pagination');
            cursor = result.cursor;
        }
        throw Error('Account pagination limit reached before balance verification');
    }
    /** Read-only lookup. A missing order never proves that submission failed. */
    async findPending(clientOrderId, symbol) {
        if (!this.client)
            throw Error('Coinbase client not initialized');
        let cursor;
        for (let page = 0; page < envNumber('RECONCILE_MAX_PAGES'); page++) {
            const result = await this.client.getOrders({ product_ids: [symbol], limit: envNumber('RECONCILE_PAGE_SIZE'), cursor });
            const order = result.orders.find(order => order.client_order_id === clientOrderId && order.product_id === symbol);
            if (order)
                return order;
            if (!result.has_next || !result.cursor)
                return null;
            cursor = result.cursor;
        }
        throw Error('Pending order history pagination incomplete; retaining lock');
    }
    async sellOwned(position, market, clientOrderId = randomUUID()) {
        if (!this.client)
            throw new NotSubmittedError('Coinbase client not initialized — missing keys');
        let quantity;
        try {
            quantity = floorQuantity(position.quantity, market.baseIncrement);
        }
        catch (error) {
            throw new NotSubmittedError(error.message);
        }
        const amount = Number(quantity);
        if (!Number.isFinite(market.bid) || market.bid <= 0 || !Number.isFinite(market.minBase) || !Number.isFinite(market.minQuote) || amount < market.minBase || amount * market.bid < market.minQuote)
            throw new NotSubmittedError('Owned holding is below exchange minimum sale size');
        const result = await this.client.submitOrder({ client_order_id: clientOrderId, product_id: position.symbol, side: 'SELL', order_configuration: { market_market_ioc: { base_size: quantity } } });
        if (!result.success)
            throw new NotSubmittedError(`Coinbase rejected sale: ${result.error_response?.message || 'no confirmed order ID'}`);
        if (!result.success_response?.order_id)
            throw Error('Sale accepted without order ID; requires reconciliation');
        const { order } = await this.client.getOrder({ order_id: result.success_response.order_id });
        const sold = Number(order.filled_size), price = Number(order.average_filled_price), value = Number(order.filled_value), fees = Number(order.total_fees);
        if (order.status !== 'FILLED' || ![sold, price, value, fees].every(Number.isFinite) || sold <= 0 || sold > amount || price <= 0 || value <= 0 || fees < 0)
            throw Error(`Sale ${result.success_response.order_id} requires reconciliation (status=${order.status})`);
        return { orderId: result.success_response.order_id, symbol: position.symbol, side: 'sell', sizeUsd: value, price, fees, baseQuantity: order.filled_size, timestamp: order.last_fill_time || new Date().toISOString() };
    }
}
//# sourceMappingURL=coinbase.js.map