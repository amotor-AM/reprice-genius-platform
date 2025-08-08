import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { moatDB } from "./db";
import { listingsDB } from "../listings/db";

export interface ProprietaryMetricsRequest {
  listingId: string;
}

export interface ProprietaryMetricsResponse {
  listingId: string;
  metrics: {
    repricingVelocityScore: number;
    marketDominanceIndex: number;
    priceConfidenceScore: number;
    profitPotentialScore: number;
    competitionIntensityIndex: number;
  };
  lastCalculated: Date;
}

// Gets proprietary performance metrics for a listing.
export const getProprietaryMetrics = api<ProprietaryMetricsRequest, ProprietaryMetricsResponse>(
  { auth: true, expose: true, method: "GET", path: "/moat/metrics/proprietary/:listingId" },
  async (req) => {
    const auth = getAuthData()!;
    
    // Check for cached metrics
    const cachedMetrics = await moatDB.queryRow`
      SELECT * FROM proprietary_metrics 
      WHERE id = ${req.listingId} AND last_calculated > NOW() - INTERVAL '1 hour'
    `;
    if (cachedMetrics) {
      return {
        listingId: req.listingId,
        metrics: {
          repricingVelocityScore: cachedMetrics.repricing_velocity_score,
          marketDominanceIndex: cachedMetrics.market_dominance_index,
          priceConfidenceScore: cachedMetrics.price_confidence_score,
          profitPotentialScore: cachedMetrics.profit_potential_score,
          competitionIntensityIndex: cachedMetrics.competition_intensity_index,
        },
        lastCalculated: cachedMetrics.last_calculated,
      };
    }

    // If not cached, calculate them
    const metrics = await calculateProprietaryMetrics(req.listingId);

    // Store calculated metrics
    await moatDB.exec`
      INSERT INTO proprietary_metrics (id, entity_type, repricing_velocity_score, market_dominance_index, price_confidence_score, profit_potential_score, competition_intensity_index)
      VALUES (${req.listingId}, 'listing', ${metrics.repricingVelocityScore}, ${metrics.marketDominanceIndex}, ${metrics.priceConfidenceScore}, ${metrics.profitPotentialScore}, ${metrics.competitionIntensityIndex})
      ON CONFLICT (id) DO UPDATE SET
        repricing_velocity_score = EXCLUDED.repricing_velocity_score,
        market_dominance_index = EXCLUDED.market_dominance_index,
        price_confidence_score = EXCLUDED.price_confidence_score,
        profit_potential_score = EXCLUDED.profit_potential_score,
        competition_intensity_index = EXCLUDED.competition_intensity_index,
        last_calculated = NOW()
    `;

    return {
      listingId: req.listingId,
      metrics,
      lastCalculated: new Date(),
    };
  }
);

async function calculateProprietaryMetrics(listingId: string): Promise<any> {
  // In a real app, these would be complex calculations based on various data sources.
  return {
    repricingVelocityScore: Math.random(),
    marketDominanceIndex: Math.random(),
    priceConfidenceScore: Math.random(),
    profitPotentialScore: Math.random(),
    competitionIntensityIndex: Math.random(),
  };
}
