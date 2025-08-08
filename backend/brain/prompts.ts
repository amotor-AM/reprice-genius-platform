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

export async function callGeminiAPI(prompt: string): Promise<any> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey(),
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error: ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;
    
    return JSON.parse(content);
  } catch (error) {
    console.error('Gemini API call failed:', error);
    // Fallback to a structured error
    return {
      summary: "Could not generate explanation due to an API error.",
      keyFactors: ["API communication failure."],
      tradeOffs: "N/A",
      confidenceAnalysis: "Confidence is low due to system error."
    };
  }
}
