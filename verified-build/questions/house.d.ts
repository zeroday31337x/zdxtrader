/**
 * House bot: gets paid whatever the price does (market making / liquidity).
 */
export declare const houseQuestions: {
    inventory_risk: import("@typesafe-ai/sdk").NoulQuestion;
    spread_attractive: import("@typesafe-ai/sdk").NoulQuestion;
    regime_for_mm: import("@typesafe-ai/sdk").ChoiceQuestion<{
        readonly good: "Calm, mean-reverting, healthy flow";
        readonly caution: "Elevated vol or directional pressure";
        readonly avoid: "Toxic flow or extreme moves";
        readonly other: "Unclear";
    }>;
};
