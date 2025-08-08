import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { learningDB } from "./db";
import { v4 as uuidv4 } from 'uuid';
import { callGeminiAPI } from "../brain/prompts"; // Re-using the Gemini caller

const geminiApiKey = secret("GeminiApiKey");

export interface GenerateHypothesisRequest {
  categoryId?: string;
  brandId?: string;
  observation: string; // e.g., "Sales for brand X have dropped by 15% this month"
}

export interface Hypothesis {
  id: string;
  description: string;
  testableAction: string;
  expectedOutcome: string;
  requiredMetrics: string[];
  confidence: number;
}

export interface GenerateHypothesisResponse {
  hypotheses: Hypothesis[];
}

// Auto-generates testing hypotheses using Gemini AI.
export const generateHypothesis = api<GenerateHypothesisRequest, GenerateHypothesisResponse>(
  { auth: true, expose: true, method: "POST", path: "/learning/hypothesis/generate" },
  async (req) => {
    const auth = getAuthData()!;
    
    const prompt = buildHypothesisPrompt(req);
    const aiResponse = await callGeminiAPI(prompt);
    const hypotheses = parseAIHypotheses(aiResponse);

    // Store generated hypotheses
    for (const hypo of hypotheses) {
      await learningDB.exec`
        INSERT INTO hypotheses (id, user_id, description, status, source, confidence, expected_impact)
        VALUES (${hypo.id}, ${auth.userID}, ${hypo.description}, 'generated', 'ai_generated', ${hypo.confidence}, 0.1)
      `;
    }

    return { hypotheses };
  }
);

function buildHypothesisPrompt(req: GenerateHypothesisRequest): string {
  return `
You are a data scientist for an e-commerce pricing platform. Based on the following observation, generate 3 testable hypotheses.

Observation: "${req.observation}"
Context: Category ID: ${req.categoryId || 'N/A'}, Brand ID: ${req.brandId || 'N/A'}

For each hypothesis, provide a clear description, a testable action, the expected outcome, and the metrics required to measure it.

Respond in the following JSON format:
{
  "hypotheses": [
    {
      "description": "A hypothesis about why the observation occurred.",
      "testableAction": "A specific pricing action to test the hypothesis.",
      "expectedOutcome": "What do you expect to happen if the hypothesis is true.",
      "requiredMetrics": ["metric1", "metric2"],
      "confidence": 0.85
    }
  ]
}
`;
}

function parseAIHypotheses(aiResponse: any): Hypothesis[] {
  if (!aiResponse || !Array.isArray(aiResponse.hypotheses)) {
    throw new Error("Invalid response format from AI for hypothesis generation.");
  }
  return aiResponse.hypotheses.map((h: any) => ({
    id: uuidv4(),
    description: h.description || "N/A",
    testableAction: h.testableAction || "N/A",
    expectedOutcome: h.expectedOutcome || "N/A",
    requiredMetrics: h.requiredMetrics || [],
    confidence: h.confidence || 0.5,
  }));
}
