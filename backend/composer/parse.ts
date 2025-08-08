import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { buildParsePrompt, callGeminiAPI, ParsedStrategy } from "./prompts";

export interface ParseStrategyRequest {
  description: string;
}

export interface ParseStrategyResponse {
  parsedStrategy: ParsedStrategy;
}

// Parses a natural language strategy description into a structured format.
export const parse = api<ParseStrategyRequest, ParseStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/composer/parse" },
  async (req) => {
    if (!req.description) {
      throw APIError.invalidArgument("Strategy description cannot be empty.");
    }

    const prompt = buildParsePrompt(req.description);
    const aiResponse = await callGeminiAPI(prompt);

    // Basic validation of the parsed structure
    if (!aiResponse.objective || !aiResponse.rules || !aiResponse.constraints) {
      throw APIError.internal("Failed to parse strategy into a valid structure.");
    }

    return {
      parsedStrategy: aiResponse,
    };
  }
);
