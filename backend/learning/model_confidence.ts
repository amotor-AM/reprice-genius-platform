import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";

export interface ModelConfidence {
  modelId: string;
  modelType: string;
  confidenceScore: number;
  accuracy: number;
  lastEvaluated: Date;
  contributingFactors: Record<string, number>;
}

export interface ModelConfidenceResponse {
  models: ModelConfidence[];
}

// Gets confidence scores for various learning models.
export const getModelConfidenceScores = api<void, ModelConfidenceResponse>(
  { auth: true, expose: true, method: "GET", path: "/learning/confidence/scores" },
  async () => {
    // This would query a model performance tracking table.
    // For now, returning mock data.
    const models: ModelConfidence[] = [
      {
        modelId: 'price_optimization_v2',
        modelType: 'reinforcement_learning',
        confidenceScore: 0.88,
        accuracy: 0.92,
        lastEvaluated: new Date(),
        contributingFactors: { data_quality: 0.9, market_stability: 0.85 }
      },
      {
        modelId: 'demand_forecast_v1.5',
        modelType: 'lstm',
        confidenceScore: 0.82,
        accuracy: 0.85,
        lastEvaluated: new Date(),
        contributingFactors: { seasonality_data: 0.9, historical_depth: 0.75 }
      }
    ];

    return { models };
  }
);
