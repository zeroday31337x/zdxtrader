export declare const memeQuestions: {
    regime: import("@typesafe-ai/sdk").ChoiceQuestion<{
        readonly trending_up: "Upward trend supported by price and volume";
        readonly ranging: "Sideways or insufficient trend evidence";
        readonly trending_down: "Downward trend";
        readonly other: "Insufficient data or unclear regime";
    }>;
    setup_quality: import("@typesafe-ai/sdk").NoulQuestion;
    worth_trading: import("@typesafe-ai/sdk").NoulQuestion;
    toxicity: import("@typesafe-ai/sdk").NoulQuestion;
};
