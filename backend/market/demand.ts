import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { ebayDB } from "../ebay/db";
import { getCachedOrCompute } from "./cache";
import { aggregateCategoryData } from "./data_aggregator";

export interface DemandSignals {
  productId: string;
  searchVolume: number;
  salesVelocity: number;
  watchers: number;
  views: number;
  seasonalFactor: number;
  demandTrend: 'rising' | 'stable' | 'declining';
}

// Gets demand signals for a specific product.
export const getDemand = api<{ productId: string }, DemandSignals>(
  { auth: true, expose: true, method: "GET", path: "/market/demand/:productId" },
  async ({ productId }) => {
    const auth = getAuthData()!;

    const listing = await ebayDB.queryRow`
      SELECT * FROM listings WHERE id = ${productId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Product not found");
    }

    const demandData = await getCachedOrCompute(`demand:${productId}`, async () => {
      const marketData = await aggregateCategoryData(listing.category_id);
      
      return {
        searchVolume: marketData.googleTrends.searchVolume,
        salesVelocity: listing.sold_quantity / 30, // Simplified
        watchers: listing.watchers,
        views: listing.views,
        seasonalFactor: 1.1, // From trends data
        demandTrend: marketData.googleTrends.trend,
      };
    }, 3600); // Cache for 1 hour

    return {
      productId,
      ...demandData,
    };
  }
);
