import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";

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
export const getCausalInsights = api<CausalInsightRequest, CausalInsightResponse>(
  { auth: true, expose: true, method: "GET", path: "/learning/insights/causal" },
  async (req) => {
    // Simulate DoWhy causal analysis
    const insights: CausalInsight[] = req.factors.map(factor => ({
      factor,
      causalEffect: (Math.random() - 0.5) * 2,
      confidence: Math.random() * 0.3 + 0.65,
      description: `A change in ${factor} has a direct causal effect on ${req.outcome}.`
    }));

    // Simulate causal graph generation
    const causalGraph = `
      digraph {
        ${req.factors.map(f => `${f} -> ${req.outcome};`).join('\n')}
        competitor_price -> price;
        views -> sales_velocity;
      }
    `;

    return { insights, causalGraph };
  }
);
