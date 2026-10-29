/** A projected target is a scenario, never a guaranteed return. */
export declare function entryEconomics(input: {
    sizeUsd: number;
    ask: number;
    target: number;
    takerFeeRate: number;
}): {
    approved: boolean;
    projectedNetUsd: number;
    projectedNetBps: number;
    breakEvenBid: number;
    takerFeeRate: number;
    minimumUsd: number;
    minimumBps: number;
    projectionOnly: boolean;
};
