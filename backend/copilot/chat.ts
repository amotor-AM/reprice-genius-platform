import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { copilotDB } from "./db";
import { buildChatPrompt, callGeminiAPI, parseGeminiResponse } from "./prompts";
import { v4 as uuidv4 } from 'uuid';

export interface ChatRequest {
  sessionId?: string;
  message: string;
}

export interface ChatResponse {
  sessionId: string;
  response: {
    type: 'answer' | 'clarification' | 'command';
    message: string;
    commandPayload?: any;
  };
}

// Handles chat interactions with the AI Copilot.
export const chat = api<ChatRequest, ChatResponse>(
  { auth: true, expose: true, method: "POST", path: "/copilot/chat" },
  async (req) => {
    const auth = getAuthData()!;
    let sessionId = req.sessionId;

    // Create a new session if one isn't provided
    if (!sessionId) {
      sessionId = uuidv4();
      await copilotDB.exec`
        INSERT INTO chat_sessions (id, user_id, title)
        VALUES (${sessionId}, ${auth.userID}, ${req.message.substring(0, 50)})
      `;
    }

    // Store user message
    await copilotDB.exec`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (${sessionId}, 'user', ${req.message})
    `;

    // Get chat history for context
    const history = await copilotDB.queryAll`
      SELECT role, content FROM chat_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
      LIMIT 20
    `;

    // Build prompt and call Gemini
    const prompt = buildChatPrompt(req.message, history);
    const geminiResponse = await callGeminiAPI(prompt);
    const parsedResponse = parseGeminiResponse(geminiResponse);

    // Store assistant message
    await copilotDB.exec`
      INSERT INTO chat_messages (session_id, role, content, command_payload)
      VALUES (${sessionId}, 'assistant', ${parsedResponse.message}, ${JSON.stringify(parsedResponse.commandPayload || {})})
    `;

    return {
      sessionId,
      response: parsedResponse,
    };
  }
);
