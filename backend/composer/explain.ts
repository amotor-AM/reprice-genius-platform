import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { composerDB } from "./db";
import { buildExplainPrompt, callGeminiAPI } from "./prompts";

export interface ExplainStrategyRequest {
  strategyId: string;
}

export interface ExplainStrategyResponse {
  explanation: string;
  strategyName: string;
}

// Explains a composed strategy in plain English.
export const explain = api<ExplainStrategyRequest, ExplainStrategyResponse>(
  { auth: true, expose: true, method: "GET", path: "/composer/explain/:strategyId" },
  async (req) => {
    const auth = getAuthData()!;
    const strategy = await composerDB.queryRow`
      SELECT * FROM composed_strategies WHERE id = ${req.strategyId} AND user_id = ${auth.userID}
    `;

    if (!strategy) {
      throw APIError.notFound("Strategy not found.");
    }

    const prompt = buildExplainPrompt(strategy.parsed_strategy);
    const aiResponse = await callGeminiAPI(prompt);

    return {
      explanation: aiResponse.explanation || "Could not generate explanation.",
      strategyName: strategy.name,
    };
  }
);
