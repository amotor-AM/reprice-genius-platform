import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { intelDB } from "./db";
import { listingsDB } from "../listings/db";
import { ml } from "~encore/clients";

export interface ShadowInventoryRequest {
  competitorId: string;
  listingId: string;
}

export interface ShadowInventoryResponse {
  competitorId: string;
  listingId: string;
  estimatedStock: number;
  confidence: number;
  lastChecked: Date;
}

// Tracks competitor's shadow inventory.
export const getShadowInventory = api<ShadowInventoryRequest, ShadowInventoryResponse>(
  { auth: true, expose: true, method: "GET", path: "/intel/competitors/shadow-inventory" },
  async (req) => {
    // Simulate shadow inventory tracking
    const estimatedStock = Math.floor(Math.random() * 20) + 5;
    const confidence = Math.random() * 0.3 + 0.6;

    await intelDB.exec`
      INSERT INTO competitor_intelligence (competitor_id, listing_id, metric_type, metric_value, confidence)
      VALUES (${req.competitorId}, ${req.listingId}, 'shadow_inventory', ${estimatedStock}, ${confidence})
      ON CONFLICT (competitor_id, listing_id, metric_type) DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        confidence = EXCLUDED.confidence,
        recorded_at = NOW()
    `;

    return {
      competitorId: req.competitorId,
      listingId: req.listingId,
      estimatedStock,
      confidence,
      lastChecked: new Date(),
    };
  }
);

export interface WarRoomAnalysisRequest {
  listingId: string;
}

export interface WarRoomAnalysisResponse {
  myPosition: any;
  competitorPositions: any[];
  priceWarRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

// Provides a competitive situation analysis (war room).
export const analyzeWarRoom = api<WarRoomAnalysisRequest, WarRoomAnalysisResponse>(
  { auth: true, expose: true, method: "POST", path: "/intel/war-room/analyze" },
  async (req) => {
    // This would be a very complex analysis in reality
    return {
      myPosition: { price: 99.99, marketShare: 0.15, velocity: 10 },
      competitorPositions: [
        { id: 'comp1', price: 95.00, marketShare: 0.20, velocity: 15 },
        { id: 'comp2', price: 105.00, marketShare: 0.10, velocity: 8 },
      ],
      priceWarRisk: 'medium',
      recommendations: [
        'Hold price, focus on non-price differentiation.',
        'Monitor competitor 1 for further price drops.',
      ],
    };
  }
);
