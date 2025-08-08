import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { listingsDB } from "../listings/db";

export interface CausalInsightRequest {
  listingId: string;
  factors: string[]; // e.g., ['price', 'views', 'competitor_price']
  outcome: string; // e.g., 'sales_velocity'
}

export interface CausalInsight {
  factor: string;
  causalEffect: number;
  confidence: number;
  description: string;
}

export interface CausalInsightResponse {
  insights: CausalInsight[];
  causalGraph: string; // DOT format for visualization
}

// Gets causal insights for a product.
// NOTE: This is a simplified implementation using correlation as a proxy for causation.
// True causal inference requires more advanced methods like instrumental variables or structural equation modeling.
export const getCausalInsights = api<CausalInsightRequest, CausalInsightResponse>(
  { auth: true, expose: true, method: "GET", path: "/learning/insights/causal" },
  async (req) => {
    const historicalData = await listingsDB.queryAll`
      SELECT 
        new_price as price,
        (views_after - views_before) as views,
        sales_velocity_change as sales_velocity
      FROM pricing_outcomes
      WHERE listing_id = ${req.listingId}
      ORDER BY applied_at DESC
      LIMIT 100
    `;

    if (historicalData.length < 10) {
      throw APIError.failedPrecondition("Not enough data for causal analysis.");
    }

    const insights: CausalInsight[] = [];
    for (const factor of req.factors) {
      if (factor in historicalData[0] && req.outcome in historicalData[0]) {
        const correlation = calculatePearsonCorrelation(historicalData, factor, req.outcome);
        insights.push({
          factor,
          causalEffect: correlation,
          confidence: Math.min(0.95, 0.5 + historicalData.length / 200),
          description: `A change in ${factor} has a correlation of ${correlation.toFixed(2)} with ${req.outcome}.`
        });
      }
    }

    const causalGraph = `
      digraph {
        ${insights.map(i => `${i.factor} -> ${req.outcome} [label="${i.causalEffect.toFixed(2)}"];`).join('\n')}
      }
    `;

    return { insights, causalGraph };
  }
);

function calculatePearsonCorrelation(data: any[], key1: string, key2: string): number {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (const point of data) {
    const x = point[key1] || 0;
    const y = point[key2] || 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}
