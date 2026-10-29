export type Evidence = {
    id: string;
    source: string;
    data: unknown;
};
export type CorrelationFinding = {
    hypothesis: string;
    symbols: string[];
    evidence_ids: string[];
    observed_relationship: string;
    limitations: string;
    validation_plan: string;
};
export type CorrelationAnalysis = {
    summary: string;
    findings: CorrelationFinding[];
    data_gaps: string[];
};
export interface AnalysisAdapter {
    analyze(evidence: Evidence[]): Promise<{
        analysis: CorrelationAnalysis;
        model: string;
        inputTokens: number;
        outputTokens: number;
        includedEvidenceIds: string[];
        omittedEvidence: number;
    }>;
}
