import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { brainDB } from "./db";
import { buildExplainPrompt, callGeminiForExplanation } from "./prompts";

export interface ExplainDecisionResponse {
  decisionId: string;
  explanation: {
    summary: string;
    keyFactors: string[];
    tradeOffs: string;
    confidenceAnalysis: string;
  };
}

// Explains a master decision.
export const explain = api<{ decisionId: string }, ExplainDecisionResponse>(
  { auth: true, expose: true, method: "GET", path: "/brain/explain/:decisionId" },
  async (req) => {
    const decision = await brainDB.queryRow`
      SELECT * FROM master_decisions WHERE id = ${req.decisionId}
    `;

    if (!decision) {
      throw APIError.notFound("Decision not found.");
    }

    const prompt = buildExplainPrompt(decision);
    const explanation = await callGeminiForExplanation(prompt);

    return {
      decisionId: req.decisionId,
      explanation,
    };
  }
);
