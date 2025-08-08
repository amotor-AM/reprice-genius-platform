import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { behaviorDB } from "./db";

export interface CompetitorModel {
  competitorId: string;
  personalityType: 'Aggressive Pricer' | 'Follower' | 'Stable' | 'Niche Player';
  pricingAlgorithmSignature: string;
  responseTimeHours: number;
  blindSpots: string[];
  strengths: string[];
  confidence: number;
}

export interface ModelCompetitorRequest {
  competitorId: string;
}

// Models a competitor's behavior based on historical data.
export const modelCompetitor = api<ModelCompetitorRequest, CompetitorModel>(
  { auth: true, expose: true, method: "POST", path: "/behavior/competitor/model" },
  async (req) => {
    const auth = getAuthData()!;

    // In a real system, this would analyze historical data from the graph and analytics services.
    // For now, we simulate the modeling process.
    const personalityTypes = ['Aggressive Pricer', 'Follower', 'Stable', 'Niche Player'];
    const personalityType = personalityTypes[Math.floor(Math.random() * personalityTypes.length)];
    
    const model: CompetitorModel = {
      competitorId: req.competitorId,
      personalityType: personalityType as CompetitorModel['personalityType'],
      pricingAlgorithmSignature: "Reacts to price drops, ignores small increases.",
      responseTimeHours: Math.random() * 48 + 12,
      blindSpots: ["long-tail keywords", "off-peak hours"],
      strengths: ["high-volume items", "fast shipping"],
      confidence: Math.random() * 0.3 + 0.65,
    };

    await behaviorDB.exec`
      INSERT INTO competitor_models (id, user_id, personality_type, pricing_algorithm_signature, response_time_hours, blind_spots, strengths, confidence)
      VALUES (${req.competitorId}, ${auth.userID}, ${model.personalityType}, ${model.pricingAlgorithmSignature}, ${model.responseTimeHours}, ${model.blindSpots}, ${model.strengths}, ${model.confidence})
      ON CONFLICT (id) DO UPDATE SET
        personality_type = EXCLUDED.personality_type,
        pricing_algorithm_signature = EXCLUDED.pricing_algorithm_signature,
        response_time_hours = EXCLUDED.response_time_hours,
        blind_spots = EXCLUDED.blind_spots,
        strengths = EXCLUDED.strengths,
        confidence = EXCLUDED.confidence,
        last_updated = CURRENT_TIMESTAMP
    `;

    return model;
  }
);
