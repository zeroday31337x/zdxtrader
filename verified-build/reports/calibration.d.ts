import { type MarketSnapshot } from '../state/scanner.js';
export type DatasetRow = {
    id: string;
    schema_version: 2;
    timestamp: string | null;
    ingested_at: string;
    symbol: string;
    source: 'decision' | 'rejection' | 'execution' | 'live';
    action: string;
    entry_price: number | null;
    expected_return_bps: number | null;
    edge_proxy_bps: number | null;
    spread_bps: number | null;
    setup_quality: number | null;
    worth_trading: number | null;
    toxicity: number | null;
    prediction_confidence: number | null;
    stop_price: number | null;
    take_profit_1: number | null;
    take_profit_2: number | null;
    historical_context: Record<string, number | null>;
    venue_history: unknown;
    golden: unknown;
    reason: string | null;
    execution: unknown;
    realized_pnl_usd: number | null;
    source_ref: string;
    data_available: boolean;
};
/** Historical rows retain their original observations; fresh prices are separate live rows. */
export declare function buildTradingDataset(logDir?: string, snapshots?: MarketSnapshot[]): Promise<DatasetRow[]>;
export declare function writeDatasetToFile(outputPath?: string, snapshots?: MarketSnapshot[]): Promise<DatasetRow[]>;
export declare function refreshDatasetOnce(force?: boolean): Promise<DatasetRow[] | undefined>;
/** Shared persistent schedule avoids duplicate refreshes between the desk and CLI worker. */
export declare function scheduleDatasetRefresh(now?: number): void;
export declare function refreshDatasetLoop(): Promise<void>;
