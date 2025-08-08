import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { copilotDB } from "./db";

export interface Suggestion {
  id: number;
  type: string;
  title: string;
  description: string;
  commandPayload?: any;
  confidence?: number;
  status: string;
  createdAt: Date;
}

// Gets proactive suggestions for the user.
export const getSuggestions = api<{ limit?: number }, { suggestions: Suggestion[] }>(
  { auth: true, expose: true, method: "GET", path: "/copilot/suggestions" },
  async (req) => {
    const auth = getAuthData()!;
    const limit = req.limit || 10;

    const suggestions = await copilotDB.queryAll`
      SELECT * FROM proactive_suggestions
      WHERE user_id = ${auth.userID} AND status = 'new'
      ORDER BY confidence DESC, created_at DESC
      LIMIT ${limit}
    `;

    return {
      suggestions: suggestions.map(s => ({
        id: s.id,
        type: s.suggestion_type,
        title: s.title,
        description: s.description,
        commandPayload: s.command_payload,
        confidence: s.confidence,
        status: s.status,
        createdAt: s.created_at,
      })),
    };
  }
);

// Updates the status of a suggestion.
export const updateSuggestionStatus = api<{ suggestionId: number; status: 'seen' | 'actioned' | 'dismissed' }, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/copilot/suggestions/:suggestionId/status" },
  async (req) => {
    const auth = getAuthData()!;

    const result = await copilotDB.exec`
      UPDATE proactive_suggestions
      SET status = ${req.status}
      WHERE id = ${req.suggestionId} AND user_id = ${auth.userID}
    `;

    return { success: true };
  }
);
