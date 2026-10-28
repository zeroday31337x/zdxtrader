/**
 * Gambler bot: bets on direction.
 * One judgment per question. Every Choice has "other".
 * Send only the fields the questions read.
 */
export declare const gamblerQuestions: {
    regime: import("@typesafe-ai/sdk").ChoiceQuestion<{
        readonly trending_up: "Clear directional move higher";
        readonly trending_down: "Clear directional move lower";
        readonly ranging: "Sideways, mean-reverting";
        readonly volatile: "High vol, no clear direction";
        readonly other: "Does not fit the above";
    }>;
    setup_quality: import("@typesafe-ai/sdk").NoulQuestion;
    worth_trading: import("@typesafe-ai/sdk").NoulQuestion;
    toxicity: import("@typesafe-ai/sdk").NoulQuestion;
};
