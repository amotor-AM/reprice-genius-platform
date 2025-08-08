import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { intelDB } from "./db";
import { listingsDB } from "../listings/db";
import { forecastWithEnsemble } from "./models/ensemble_forecaster";

export interface DemandForecastRequest {
  listingId: string;
  forecastHorizonDays: number; // 7 to 30
}

export interface DemandForecastResponse {
  listingId: string;
  forecast: Array<{
    date: string;
    predictedDemand: number;
    confidenceInterval: { lower: number; upper: number };
  }>;
  modelEnsemble: string[];
  confidence: number;
  warnings: string[];
}

// Provides a multi-horizon demand forecast for a product.
export const forecastDemand = api<DemandForecastRequest, DemandForecastResponse>(
  { auth: true, expose: true, method: "POST", path: "/intel/forecast/demand" },
  async (req) => {
    const auth = getAuthData()!;
    if (req.forecastHorizonDays < 7 || req.forecastHorizonDays > 30) {
      throw APIError.invalidArgument("Forecast horizon must be between 7 and 30 days.");
    }

    const listing = await listingsDB.queryRow`
      SELECT id FROM products WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;
    if (!listing) throw APIError.notFound("Listing not found");

    // Get historical data
    const historicalData = await listingsDB.queryAll`
      SELECT COUNT(*) as sales, DATE(created_at) as date 
      FROM price_history 
      WHERE marketplace_listing_id = (SELECT id FROM marketplace_listings WHERE product_id = ${req.listingId} LIMIT 1)
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 90
    `;

    if (historicalData.length < 30) {
      throw APIError.failedPrecondition("Insufficient historical data for forecasting.");
    }

    // Use ensemble model for forecasting
    const forecastResult = await forecastWithEnsemble(historicalData, req.forecastHorizonDays);

    // Store the forecast
    await intelDB.exec`
      INSERT INTO demand_forecasts (listing_id, forecast_horizon_days, forecast_data, model_ensemble, confidence)
      VALUES (${req.listingId}, ${req.forecastHorizonDays}, ${JSON.stringify(forecastResult.forecast)}, ${forecastResult.modelsUsed}, ${forecastResult.confidence})
    `;

    return {
      listingId: req.listingId,
      forecast: forecastResult.forecast,
      modelEnsemble: forecastResult.modelsUsed,
      confidence: forecastResult.confidence,
      warnings: forecastResult.warnings,
    };
  }
);
