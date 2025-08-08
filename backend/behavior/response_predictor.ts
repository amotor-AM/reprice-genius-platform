import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { behaviorDB } from "./db";
import { listingsDB } from "../listings/db";
import { predictCompetitorResponse } from "./models/game_theory";
import { predictImpulseBuyProbability } from "./models/behavioral_economics";

export interface PredictResponseRequest {
  listingId: string;
  priceChange: number; // as a percentage
}

export interface PredictedResponse {
  buyerResponse: {
    conversionChange: number;
    impulseBuyProbability: number;
    sentimentShift: 'positive' | 'negative' | 'neutral';
  };
  competitorResponses: Array<{
    competitorId: string;
    predictedAction: number; // as a percentage change
    confidence: number;
  }>;
  overallMarketImpact: {
    salesVelocityChange: number;
    marketShareChange: number;
  };
  confidence: number;
}

// Predicts market response to a proposed price change.
export const predictResponse = api<PredictResponseRequest, PredictedResponse>(
  { auth: true, expose: true, method: "POST", path: "/behavior/predict/response" },
  async (req) => {
    const auth = getAuthData()!;
    const listing = await listingsDB.queryRow`
      SELECT p.*, ml.current_price FROM products p
      JOIN marketplace_listings ml ON p.id = ml.product_id
      WHERE p.id = ${req.listingId} AND p.user_id = ${auth.userID}
    `;
    if (!listing) throw APIError.notFound("Listing not found");

    // Predict buyer response
    const impulseProb = predictImpulseBuyProbability(listing, { fearGreedIndex: 60 });
    const buyerResponse = {
      conversionChange: req.priceChange < 0 ? Math.abs(req.priceChange) * 0.5 : -Math.abs(req.priceChange) * 0.3,
      impulseBuyProbability: impulseProb,
      sentimentShift: req.priceChange < -0.1 ? 'positive' : req.priceChange > 0.1 ? 'negative' : 'neutral',
    };

    // Predict competitor responses
    const competitors = await listingsDB.queryAll`
      SELECT p.id, ml.current_price FROM products p
      JOIN marketplace_listings ml ON p.id = ml.product_id
      WHERE p.category_id = ${listing.category_id} AND p.id != ${listing.id}
      LIMIT 5
    `;
    const competitorModels = await behaviorDB.queryAll`
      SELECT * FROM competitor_models WHERE id = ANY(${competitors.map(c => c.id)})
    `;

    const competitorResponses = competitors.map(c => {
      const model = competitorModels.find(m => m.id === c.id);
      const personality = model?.personality_type || 'Follower';
      const { response, confidence } = predictCompetitorResponse(req.priceChange, {
        id: c.id,
        currentPrice: c.current_price,
        personality: personality as any,
      });
      return {
        competitorId: c.id,
        predictedAction: response,
        confidence,
      };
    });

    // Predict overall market impact
    const marketImpact = {
      salesVelocityChange: buyerResponse.conversionChange,
      marketShareChange: -competitorResponses.reduce((sum, r) => sum + r.predictedAction, 0) * 0.1,
    };

    return {
      buyerResponse,
      competitorResponses,
      overallMarketImpact: marketImpact,
      confidence: 0.8,
    };
  }
);
