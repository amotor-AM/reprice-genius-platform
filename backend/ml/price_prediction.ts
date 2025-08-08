import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { listingsDB } from "../listings/db";

export interface PricePredictionRequest {
  listingId: string;
  context?: {
    marketTrend?: 'rising' | 'stable' | 'declining';
    competitorPrices?: number[];
  };
}

export interface PricePredictionResponse {
  listingId: string;
  predictedPrice: number;
  confidence: number;
  priceRange: {
    lowerBound: number;
    upperBound: number;
  };
  modelVersion: string;
}

// Predicts the optimal price for a listing using a transformer model.
export const predictPrice = api<PricePredictionRequest, PricePredictionResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/predict/price" },
  async (req) => {
    const auth = getAuthData()!;

    // Verify listing ownership
    const listing = await listingsDB.queryRow`
      SELECT * FROM products WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;
    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    const marketplaceListing = await listingsDB.queryRow`
      SELECT * FROM marketplace_listings WHERE product_id = ${listing.id} ORDER BY created_at DESC LIMIT 1
    `;

    if (!marketplaceListing) {
      throw APIError.notFound("No marketplace listing found for this product");
    }

    // In a real implementation, this would call a service running the transformer model.
    // Here, we simulate the output of such a model.
    const prediction = simulateTransformerPrediction(listing, marketplaceListing, req.context);

    return {
      listingId: req.listingId,
      predictedPrice: prediction.price,
      confidence: prediction.confidence,
      priceRange: {
        lowerBound: prediction.price * 0.9,
        upperBound: prediction.price * 1.1,
      },
      modelVersion: "transformer_v1.3",
    };
  }
);

function simulateTransformerPrediction(product: any, listing: any, context?: any): { price: number; confidence: number } {
  // Simulate a complex prediction based on listing and market context
  let basePrice = listing.current_price;
  let confidence = 0.75;

  // Adjust based on title and description (simulating text understanding)
  if (product.title.toLowerCase().includes('rare') || product.title.toLowerCase().includes('vintage')) {
    basePrice *= 1.1;
    confidence += 0.05;
  }

  // Adjust based on market context
  if (context?.marketTrend === 'rising') {
    basePrice *= 1.05;
    confidence += 0.03;
  } else if (context?.marketTrend === 'declining') {
    basePrice *= 0.95;
  }

  if (context?.competitorPrices && context.competitorPrices.length > 0) {
    const avgCompetitorPrice = context.competitorPrices.reduce((sum, p) => sum + p, 0) / context.competitorPrices.length;
    // Move towards competitor average
    basePrice = (basePrice * 0.7) + (avgCompetitorPrice * 0.3);
    confidence += 0.1;
  }

  return {
    price: Math.round(basePrice * 100) / 100,
    confidence: Math.min(0.95, confidence),
  };
}
