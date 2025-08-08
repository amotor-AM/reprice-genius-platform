import { secret } from "encore.dev/config";

const geminiApiKey = secret("GeminiApiKey");

export interface ParsedStrategy {
  objective: 'maximize_profit' | 'maximize_revenue' | 'maximize_volume' | 'balance';
  rules: Array<{
    condition: string;
    action: string;
  }>;
  constraints: string[];
}

export function buildParsePrompt(description: string): string {
  return `
You are an expert in converting natural language business rules into structured pricing strategies.
Parse the following description into a structured JSON format.

Description: "${description}"

The JSON output should follow this structure:
{
  "objective": "maximize_profit" | "maximize_revenue" | "maximize_volume" | "balance",
  "rules": [
    {
      "condition": "A logical condition using variables like 'competitor_price', 'stock_level', 'cost', 'is_only_seller'.",
      "action": "A pricing action, e.g., 'set_price(competitor_price * 0.98)' or 'increase_price(0.05)'."
    }
  ],
  "constraints": [
    "A list of constraints, e.g., 'price >= cost * 1.2', 'price <= msrp'"
  ]
}

Example 1:
Description: "Price aggressively when competitors are above $50 but protect 30% margin"
Output:
{
  "objective": "maximize_volume",
  "rules": [
    {
      "condition": "competitor_price > 50",
      "action": "set_price(competitor_price * 0.95)"
    }
  ],
  "constraints": [
    "price >= cost * 1.3"
  ]
}

Example 2:
Description: "Match lowest competitor but never go below cost plus 20%"
Output:
{
  "objective": "balance",
  "rules": [
    {
      "condition": "lowest_competitor_price > cost * 1.2",
      "action": "set_price(lowest_competitor_price)"
    }
  ],
  "constraints": [
    "price >= cost * 1.2"
  ]
}

Now, parse the provided description.
`;
}

export function buildGeneratePrompt(parsedStrategy: ParsedStrategy): string {
  return `
You are an expert strategy generator. Convert the following structured strategy into executable pseudo-code, documentation, and test cases.

Structured Strategy:
${JSON.stringify(parsedStrategy, null, 2)}

Respond in the following JSON format:
{
  "generatedCode": "A string containing the pseudo-code for the strategy.",
  "documentation": "A markdown string explaining the strategy.",
  "testCases": [
    {
      "name": "Test case name",
      "input": { "current_price": 100, "cost": 50, "competitor_price": 110 },
      "expected_output": { "new_price": 107.8 }
    }
  ]
}
`;
}

export function buildOptimizePrompt(parsedStrategy: ParsedStrategy): string {
  return `
You are an expert pricing strategist. Analyze the following strategy and suggest optimizations.

Current Strategy:
${JSON.stringify(parsedStrategy, null, 2)}

Suggest improvements to the rules and constraints to make it more robust and profitable.
Provide an optimized version of the strategy and a list of suggestions.

Respond in the following JSON format:
{
  "optimizedStrategy": { ... a new ParsedStrategy object ... },
  "suggestions": ["suggestion 1", "suggestion 2"]
}
`;
}

export function buildExplainPrompt(parsedStrategy: ParsedStrategy): string {
  return `
You are an expert at explaining complex topics simply.
Explain the following pricing strategy in plain English for a non-technical user.

Strategy:
${JSON.stringify(parsedStrategy, null, 2)}

Respond in the following JSON format:
{
  "explanation": "A clear, concise explanation of the strategy."
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
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;
    
    try {
      return JSON.parse(content);
    } catch {
      return { explanation: content }; // Fallback for non-JSON responses
    }
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}
