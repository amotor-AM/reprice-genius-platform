import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { marketDB } from "./db";

export interface TrackCompetitorRequest {
  competitorId: string;
  marketplace: 'ebay' | 'amazon';
  productId?: string;
}

// Adds a competitor to the tracking list.
export const trackCompetitor = api<TrackCompetitorRequest, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/market/competitors/track" },
  async (req) => {
    const auth = getAuthData()!;

    await marketDB.exec`
      INSERT INTO tracked_competitors (user_id, competitor_id, marketplace, product_id)
      VALUES (${auth.userID}, ${req.competitorId}, ${req.marketplace}, ${req.productId})
      ON CONFLICT (user_id, competitor_id, product_id) DO NOTHING
    `;

    return { success: true };
  }
);
