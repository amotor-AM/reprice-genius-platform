import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { intelDB } from "./db";
import { listingsDB } from "../listings/db";

export interface ArbitrageOpportunity {
  sourceListingId: string;
  targetListingId: string;
  sourceMarketplace: string;
  targetMarketplace: string;
  sourcePrice: number;
  targetPrice: number;
  priceDifference: number;
  potentialProfit: number;
  confidence: number;
}

// Finds pricing arbitrage opportunities across different marketplaces.
export const findArbitrageOpportunities = api<void, { opportunities: ArbitrageOpportunity[] }>(
  { auth: true, expose: true, method: "GET", path: "/intel/opportunities/arbitrage" },
  async () => {
    const auth = getAuthData()!;

    // Find products listed on multiple marketplaces
    const results = await listingsDB.queryAll`
      SELECT 
        p.sku,
        p.id as product_id,
        array_agg(ml.id) as listing_ids,
        array_agg(ml.marketplace) as marketplaces,
        array_agg(ml.current_price) as prices
      FROM products p
      JOIN marketplace_listings ml ON p.id = ml.product_id
      WHERE p.user_id = ${auth.userID} AND p.sku IS NOT NULL
      GROUP BY p.sku, p.id
      HAVING COUNT(ml.id) > 1
    `;

    const opportunities: ArbitrageOpportunity[] = [];

    for (const product of results) {
      if (product.prices.length < 2) continue;

      for (let i = 0; i < product.prices.length; i++) {
        for (let j = i + 1; j < product.prices.length; j++) {
          const priceDiff = Math.abs(product.prices[i] - product.prices[j]);
          
          // Consider an opportunity if price difference is > 10%
          if (priceDiff / Math.min(product.prices[i], product.prices[j]) > 0.1) {
            const sourceIndex = product.prices[i] < product.prices[j] ? i : j;
            const targetIndex = product.prices[i] < product.prices[j] ? j : i;

            opportunities.push({
              sourceListingId: product.listing_ids[sourceIndex],
              targetListingId: product.listing_ids[targetIndex],
              sourceMarketplace: product.marketplaces[sourceIndex],
              targetMarketplace: product.marketplaces[targetIndex],
              sourcePrice: product.prices[sourceIndex],
              targetPrice: product.prices[targetIndex],
              priceDifference: priceDiff,
              potentialProfit: priceDiff * 0.8, // Assuming 20% fees/costs
              confidence: 0.9,
            });
          }
        }
      }
    }

    return { opportunities };
  }
);
