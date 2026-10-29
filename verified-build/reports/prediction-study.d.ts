import type { PredictionObservation, PredictionSettlement } from '../market/predictions.js';
export declare function studyPredictions(events: (PredictionObservation | PredictionSettlement)[]): {
    generated_at: string;
    status: string;
    rule: string;
    training: {
        windows: number;
        wins: number;
        net_per_contract_sum_usd: number;
        mean_net_per_contract_usd: number | null;
        max_drawdown_per_contract_usd: number;
    };
    chronological_holdout: {
        windows: number;
        wins: number;
        net_per_contract_sum_usd: number;
        mean_net_per_contract_usd: number | null;
        max_drawdown_per_contract_usd: number;
    };
    trades: {
        ticker: string;
        close_time: string;
        side: string;
        price: number;
        win: boolean;
        net_per_contract_usd: number;
        cost_scenario: {
            per_contract_usd: number;
            slippage_per_contract_usd: number;
            source: string;
        };
        break_even_probability: number;
    }[];
    notes: string[];
};
export declare function writePredictionStudy(): Promise<{
    generated_at: string;
    status: string;
    rule: string;
    training: {
        windows: number;
        wins: number;
        net_per_contract_sum_usd: number;
        mean_net_per_contract_usd: number | null;
        max_drawdown_per_contract_usd: number;
    };
    chronological_holdout: {
        windows: number;
        wins: number;
        net_per_contract_sum_usd: number;
        mean_net_per_contract_usd: number | null;
        max_drawdown_per_contract_usd: number;
    };
    trades: {
        ticker: string;
        close_time: string;
        side: string;
        price: number;
        win: boolean;
        net_per_contract_usd: number;
        cost_scenario: {
            per_contract_usd: number;
            slippage_per_contract_usd: number;
            source: string;
        };
        break_even_probability: number;
    }[];
    notes: string[];
}>;
