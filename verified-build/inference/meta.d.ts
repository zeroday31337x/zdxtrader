import type { AnalysisAdapter, Evidence, CorrelationAnalysis } from './types.js';
export declare class MetaAnalysisAdapter implements AnalysisAdapter {
    private request;
    analyze(evidence: Evidence[]): Promise<{
        analysis: CorrelationAnalysis;
        model: string;
        inputTokens: number;
        outputTokens: number;
        includedEvidenceIds: string[];
        omittedEvidence: number;
    }>;
}
