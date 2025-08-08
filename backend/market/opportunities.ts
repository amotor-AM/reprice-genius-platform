import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { marketDB } from "./db";
import { getCachedOrCompute } from "./cache";

export interface Opportunity {
  type: string;
  description: string;
  listingId?: string;
  categoryId?: string;
  potentialImpact: number;
  confidence: number;
}

// Identifies pricing and market opportunities.
export const getOpportunities = api<void, { opportunities: Opportunity[] }>(
  { auth: true, expose: true, method: "GET", path: "/market/opportunities" },
  async () => {
    const auth = getAuthData()!;

    const opportunities = await getCachedOrCompute(`opportunities:${auth.userID}`, async () => {
      // In a real implementation, this would run complex analysis.
      // For now, return mock opportunities.
      const mockOpportunities: Opportunity[] = [
        {
          type: 'undervalued_item',
          description: 'Product "Vintage Leather Jacket" is priced 15% below market average.',
          listingId: 'listing_123',
          potentialImpact: 0.15,
          confidence: 0.85,
        },
        {
          type: 'low_competition',
          description: 'Category "Handmade Pottery" has low competition and high demand.',
          categoryId: 'cat_456',
          potentialImpact: 0.25,
          confidence: 0.78,
        },
      ];

      // Store opportunities in DB
      for (const opp of mockOpportunities) {
        await marketDB.exec`
          INSERT INTO market_opportunities (opportunity_type, description, listing_id, category_id, potential_impact, confidence, expires_at)
          VALUES (${opp.type}, ${opp.description}, ${opp.listingId}, ${opp.categoryId}, ${opp.potentialImpact}, ${opp.confidence}, NOW() + INTERVAL '1 day')
          ON CONFLICT (opportunity_type, listing_id, category_id) DO UPDATE SET
            description = EXCLUDED.description,
            potential_impact = EXCLUDED.potential_impact,
            confidence = EXCLUDED.confidence,
            expires_at = EXCLUDED.expires_at
        `;
      }

      return mockOpportunities;
    }, 4 * 3600); // Cache for 4 hours

    return { opportunities };
  }
);
