export declare function runCorrelationAgent(): Promise<{
    evidence_manifest: {
        id: string;
        source: string;
    }[];
    analysis: import("./types.js").CorrelationAnalysis;
    model: string;
    inputTokens: number;
    outputTokens: number;
    includedEvidenceIds: string[];
    omittedEvidence: number;
    timestamp: string;
    provider: string;
    role: string;
}>;
/** Launch in the background so inference latency never delays reconciliation or sales. */
export declare function scheduleCorrelationAgent(now?: number): void;
