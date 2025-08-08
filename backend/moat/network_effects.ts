import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { moatDB } from "./db";

export interface ContributeRequest {
  contributionType: 'outcome_data' | 'strategy_feedback';
  payload: any;
}

// Contributes anonymized data to the collective intelligence network.
export const contribute = api<ContributeRequest, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/moat/network/contribute" },
  async (req) => {
    const auth = getAuthData()!;
    
    await moatDB.exec`
      INSERT INTO network_contributions (user_id, contribution_type, payload)
      VALUES (${auth.userID}, ${req.contributionType}, ${JSON.stringify(req.payload)})
    `;

    // Trigger an async job to process the contribution and update collective intelligence
    // ...

    return { success: true };
  }
);

export interface CollectiveIntelligenceRequest {
  categoryId: string;
  insightType: 'category_trend' | 'successful_strategy_pattern';
}

export interface CollectiveIntelligenceResponse {
  insight: any;
  confidence: number;
  sampleSize: number;
}

// Gets collective intelligence insights derived from the network.
export const getCollectiveIntelligence = api<CollectiveIntelligenceRequest, CollectiveIntelligenceResponse>(
  { auth: true, expose: true, method: "GET", path: "/moat/intelligence/collective" },
  async (req) => {
    const insight = await moatDB.queryRow`
      SELECT * FROM collective_intelligence_insights
      WHERE id = ${`${req.insightType}:${req.categoryId}`}
    `;

    if (!insight) {
      throw APIError.notFound("No collective intelligence found for this query.");
    }

    return {
      insight: insight.payload,
      confidence: insight.confidence,
      sampleSize: insight.source_contribution_count,
    };
  }
);
