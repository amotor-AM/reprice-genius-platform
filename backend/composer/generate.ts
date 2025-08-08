import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { composerDB } from "./db";
import { buildGeneratePrompt, callGeminiAPI, ParsedStrategy } from "./prompts";
import { v4 as uuidv4 } from 'uuid';

export interface GenerateStrategyRequest {
  parsedStrategy: ParsedStrategy;
  name: string;
  description: string;
}

export interface GenerateStrategyResponse {
  strategyId: string;
  generatedCode: string;
  documentation: string;
  testCases: any[];
}

// Generates executable strategy code from a parsed strategy.
export const generate = api<GenerateStrategyRequest, GenerateStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/composer/generate" },
  async (req) => {
    const auth = getAuthData()!;
    const strategyId = uuidv4();

    const prompt = buildGeneratePrompt(req.parsedStrategy);
    const aiResponse = await callGeminiAPI(prompt);

    const response: GenerateStrategyResponse = {
      strategyId,
      generatedCode: aiResponse.generatedCode || "// Could not generate code",
      documentation: aiResponse.documentation || "No documentation generated.",
      testCases: aiResponse.testCases || [],
    };

    await composerDB.exec`
      INSERT INTO composed_strategies (id, user_id, name, description, parsed_strategy, generated_code, documentation, test_cases)
      VALUES (${strategyId}, ${auth.userID}, ${req.name}, ${req.description}, ${JSON.stringify(req.parsedStrategy)}, ${response.generatedCode}, ${response.documentation}, ${JSON.stringify(response.testCases)})
    `;

    return response;
  }
);
