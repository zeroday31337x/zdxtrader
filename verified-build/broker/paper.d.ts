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
export declare class PaperBroker {
    private positions;
    private cash;
    place(order: Order, currentMid: number): Promise<Fill>;
    getPositions(): {
        [k: string]: {
            size: number;
            avgPrice: number;
        };
    };
    getCash(): number;
}
