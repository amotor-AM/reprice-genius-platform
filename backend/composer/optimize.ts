import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { composerDB } from "./db";
import { buildOptimizePrompt, callGeminiAPI, ParsedStrategy } from "./prompts";

export interface OptimizeStrategyRequest {
  strategyId: string;
}

export interface OptimizeStrategyResponse {
  optimizedStrategy: ParsedStrategy;
  suggestions: string[];
}

// Uses AI to optimize a composed strategy.
export const optimize = api<OptimizeStrategyRequest, OptimizeStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/composer/optimize" },
  async (req) => {
    const auth = getAuthData()!;
    const strategy = await composerDB.queryRow`
      SELECT * FROM composed_strategies WHERE id = ${req.strategyId} AND user_id = ${auth.userID}
    `;

    if (!strategy) {
      throw APIError.notFound("Strategy not found.");
    }

    const prompt = buildOptimizePrompt(strategy.parsed_strategy);
    const aiResponse = await callGeminiAPI(prompt);

    const response: OptimizeStrategyResponse = {
      optimizedStrategy: aiResponse.optimizedStrategy || strategy.parsed_strategy,
      suggestions: aiResponse.suggestions || [],
    };

    // Update the strategy with the optimized version
    await composerDB.exec`
      UPDATE composed_strategies
      SET parsed_strategy = ${JSON.stringify(response.optimizedStrategy)}, updated_at = NOW()
      WHERE id = ${req.strategyId}
    `;

    return response;
  }
);
