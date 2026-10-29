export declare function logDecision(entry: {
    timestamp: string;
    mode: string;
    snapshot: any;
    questions: any;
    answers: any;
    model: string;
    policyDecision: any;
    riskCheck: any;
    executed?: any;
    outcome?: any;
}): Promise<void>;
export declare function logRejection(rejection: any): Promise<void>;
/** Execution and position analysis events have a separate schema from model entry decisions. */
export declare function logExecution(entry: Record<string, unknown>): Promise<void>;
