import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { learningDB } from "./db";
import { v4 as uuidv4 } from 'uuid';

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
    const aiResponse = await callGeminiForHypotheses(prompt);
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

async function callGeminiForHypotheses(prompt: string): Promise<any> {
  // In a real implementation, this would call the Gemini API.
  // For now, returning mock data.
  return {
    hypotheses: [
      {
        description: "Competitors have become more aggressive, causing our prices to be uncompetitive.",
        testableAction: "Implement a 'Competitive Matching' strategy for a subset of products in this category, aiming to be 5% cheaper than the average competitor.",
        expectedOutcome: "Sales volume will increase by at least 10%, and market share will grow.",
        requiredMetrics: ["sales_volume", "market_share", "competitor_prices"],
        confidence: 0.85
      },
      {
        description: "The perceived value of the product has decreased due to market saturation.",
        testableAction: "Run a promotional campaign offering a 15% discount for 2 weeks.",
        expectedOutcome: "A short-term spike in sales and conversion rate, followed by a return to baseline.",
        requiredMetrics: ["conversion_rate", "sales_velocity", "customer_feedback"],
        confidence: 0.70
      }
    ]
  };
}

function parseAIHypotheses(aiResponse: any): Hypothesis[] {
  return aiResponse.hypotheses.map((h: any) => ({
    id: uuidv4(),
    ...h
  }));
}
