/**
 * Policy: thresholds are loaded from .env.
 * All operational policy values must come from env.
 */
export declare const POLICY: {
    min_setup_score: number;
    min_worth_trading_noul: number;
    max_toxicity_noul: number;
    max_inventory_risk_noul: number;
    min_spread_attractive: number;
    require_skilled: boolean;
    min_consistency: number;
    max_rug_noul: number;
    base_size_usd: number;
    max_size_usd: number;
};
export declare function decideGambler(answers: any, state: any): {
    action: string;
    size: number;
    reason: string;
};
export declare function decideSpy(answers: any): {
    action: string;
    size: number;
    reason: string;
};
export declare function decideMeme(answers: any, state: any): {
    action: string;
    size: number;
    reason: string;
};
