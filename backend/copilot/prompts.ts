import { secret } from "encore.dev/config";

const geminiApiKey = secret("GeminiApiKey");

export function buildChatPrompt(message: string, history: any[]): string {
  const historyString = history
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  return `
You are an AI assistant for Reprice Genius, an eBay repricing platform.
Your goal is to help users manage their listings by understanding their natural language commands and translating them into executable actions.

Available tools/functions:
- find_listings(filters): Finds listings. Filters can include status, category, min_price, max_price, query.
- update_price(listing_id, new_price): Updates the price of a single listing.
- bulk_update_price(filters, change_type, value): Updates prices for multiple listings. change_type can be 'percentage' or 'fixed'.
- get_analytics(period): Retrieves performance analytics.
- create_strategy(name, rules): Creates a new pricing strategy.

Conversation History:
${historyString}

User's latest message:
"${message}"

Your response should be in JSON format.
If you need more information, respond with:
{ "type": "clarification", "message": "Which items are considered 'not selling'?" }

If you can answer directly with data, respond with:
{ "type": "answer", "message": "Here are the listings..." }

If you have an executable command, respond with:
{
  "type": "command",
  "message": "I can increase the price by 10% for 15 listings that haven't sold in 30 days. Shall I proceed?",
  "command": {
    "tool_name": "bulk_update_price",
    "parameters": {
      "filters": { "status": "active", "days_since_sale": 30 },
      "change_type": "percentage",
      "value": 0.10
    }
  }
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
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
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
      return { type: 'answer', message: content };
    }
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}

export function parseGeminiResponse(response: any): { type: 'answer' | 'clarification' | 'command'; message: string; commandPayload?: any; } {
  return {
    type: response.type || 'answer',
    message: response.message || 'I am not sure how to respond to that.',
    commandPayload: response.command,
  };
}
