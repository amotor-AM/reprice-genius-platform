import { secret } from "encore.dev/config";

const geminiApiKey = secret("GeminiApiKey");

export function buildExplainPrompt(decision: any): string {
  return `
You are an AI assistant that explains complex pricing decisions in simple terms.
A pricing decision was made for a product. Explain why.

DECISION CONTEXT:
- Listing ID: ${decision.listing_id}
- Decision Type: ${decision.decision_type}
- Final Decision: ${JSON.stringify(decision.decision_payload, null, 2)}
- Overall Confidence: ${(decision.confidence * 100).toFixed(1)}%

INPUTS FROM AI SERVICES:
- ML Service Prediction: ${JSON.stringify(decision.inputs.ml, null, 2)}
- Profit Service Analysis: ${JSON.stringify(decision.inputs.profit, null, 2)}
- Behavioral Service Analysis: ${JSON.stringify(decision.inputs.behavior, null, 2)}
- Intelligence Service Forecast: ${JSON.stringify(decision.inputs.intel, null, 2)}
- Adapt Service Real-time Check: ${JSON.stringify(decision.inputs.adapt, null, 2)}

TASK:
Provide a clear, concise explanation of why this decision was made.
Focus on the most influential factors. Avoid jargon.

Respond in JSON format:
{
  "summary": "A one-sentence summary of the decision.",
  "keyFactors": ["The most important factor.", "Another key factor."],
  "tradeOffs": "Explain any trade-offs considered (e.g., sacrificing some profit for market share).",
  "confidenceAnalysis": "Explain why the confidence score is what it is."
}
`;
}

export async function callGeminiForExplanation(prompt: string): Promise<any> {
  // In a real implementation, this would call the Gemini API.
  // For now, returning mock data.
  return {
    summary: "The price was slightly increased to maximize profit while staying competitive.",
    keyFactors: ["Strong demand forecast from the Intelligence service.", "ML service predicted a higher optimal price.", "Competitor prices are stable, allowing for a small increase."],
    tradeOffs: "This decision prioritizes profit margin over maximizing immediate sales volume.",
    confidenceAnalysis: "Confidence is high due to agreement between multiple AI services and stable market conditions."
  };
}
