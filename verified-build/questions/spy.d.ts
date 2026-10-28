/**
 * Spy bot: copies wallets that already have an edge.
 */
export declare const spyQuestions: {
    wallet_skill: import("@typesafe-ai/sdk").ChoiceQuestion<{
        readonly skilled: "Consistent edge beyond luck";
        readonly lucky: "Positive results that look like variance";
        readonly bot_like: "Automated, mechanical patterns";
        readonly insider_like: "Suspicious timing or information edge";
        readonly other: "Does not fit";
    }>;
    move_consistent: import("@typesafe-ai/sdk").NoulQuestion;
    mirror_decision: import("@typesafe-ai/sdk").ChoiceQuestion<{
        readonly full: "Full size";
        readonly partial: "Reduced size";
        readonly skip: "Do not mirror";
    }>;
    rug_risk: import("@typesafe-ai/sdk").NoulQuestion;
};
