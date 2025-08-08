import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { listingsDB } from "../listings/db";
import { predictWithEnsemble } from "./models/ensemble_model";
import { getProductDNA } from "./product_dna";

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

// Predicts the optimal price for a listing using an ensemble of deep learning models.
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

    // Get Product DNA
    const productDNA = await getProductDNA(req.listingId);

    // Prepare data for ensemble model
    const ensembleRequest = {
      structuredData: {
        currentPrice: marketplaceListing.current_price,
        views: (marketplaceListing.metadata as any)?.views || 0,
        watchers: (marketplaceListing.metadata as any)?.watchers || 0,
        ...req.context,
      },
      timeSeriesData: productDNA.priceHistory || [],
      textFeatures: productDNA.textEmbedding,
      imageFeatures: productDNA.imageEmbedding,
    };

    // Get prediction from ensemble model
    const prediction = await predictWithEnsemble(ensembleRequest);

    // Scale prediction to a price
    const predictedPrice = marketplaceListing.current_price * (1 + (prediction.prediction - 0.5) * 0.2);

    return {
      listingId: req.listingId,
      predictedPrice: Math.round(predictedPrice * 100) / 100,
      confidence: prediction.confidence,
      priceRange: {
        lowerBound: predictedPrice * 0.9,
        upperBound: predictedPrice * 1.1,
      },
      modelVersion: "ensemble_v2.1",
    };
  }
);
