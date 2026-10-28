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
