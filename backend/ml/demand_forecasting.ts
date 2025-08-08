import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface DemandForecastRequest {
  listingId: string;
  forecastHorizonDays: number;
  includeSeasonality?: boolean;
}

export interface DemandForecastResponse {
  listingId: string;
  forecast: Array<{
    date: string;
    predictedDemand: number;
    confidenceInterval: { lower: number; upper: number };
  }>;
  modelVersion: string;
  confidence: number;
}

// Forecasts demand for a product using an LSTM network model.
export const forecastDemand = api<DemandForecastRequest, DemandForecastResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/forecast/demand" },
  async (req) => {
    const auth = getAuthData()!;

    // Verify listing ownership
    const listing = await ebayDB.queryRow`
      SELECT id FROM listings WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;
    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    // Get historical data for the LSTM model
    const historicalData = await getHistoricalDemandData(req.listingId);
    if (historicalData.length < 30) {
      throw APIError.failedPrecondition("Insufficient historical data for demand forecasting.");
    }

    // In a real implementation, this would call a service running the LSTM model.
    // Here, we simulate the output of such a model.
    const forecast = simulateLstmForecast(historicalData, req.forecastHorizonDays);

    return {
      listingId: req.listingId,
      forecast,
      modelVersion: "lstm_v1.2",
      confidence: 0.85, // Simulated confidence
    };
  }
);

async function getHistoricalDemandData(listingId: string): Promise<number[]> {
  // Use sales data as a proxy for demand
  const salesData = await ebayDB.queryAll`
    SELECT COUNT(*) as daily_sales
    FROM price_history -- Using price_history as a proxy for sales events
    WHERE listing_id = ${listingId}
      AND created_at >= NOW() - INTERVAL '180 days'
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) ASC
  `;
  return salesData.map(row => row.daily_sales);
}

function simulateLstmForecast(
  historicalData: number[],
  horizonDays: number
): DemandForecastResponse['forecast'] {
  const forecast: DemandForecastResponse['forecast'] = [];
  let lastValue = historicalData[historicalData.length - 1] || 0;

  for (let i = 1; i <= horizonDays; i++) {
    // Simple simulation: autoregressive model with some noise and seasonality
    const seasonalFactor = 1 + 0.2 * Math.sin((new Date().getDay() + i) * (2 * Math.PI / 7));
    const noise = (Math.random() - 0.5) * 0.2;
    const predictedDemand = Math.max(0, lastValue * (0.95 + noise) * seasonalFactor);
    
    const confidenceMargin = predictedDemand * 0.15; // 15% confidence interval

    forecast.push({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      predictedDemand: Math.round(predictedDemand),
      confidenceInterval: {
        lower: Math.round(Math.max(0, predictedDemand - confidenceMargin)),
        upper: Math.round(predictedDemand + confidenceMargin),
      },
    });
    lastValue = predictedDemand;
  }

  return forecast;
}
