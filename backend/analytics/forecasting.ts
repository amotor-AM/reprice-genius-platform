import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { listingsDB } from "../listings/db";

export interface SalesForecastRequest {
  productId: string;
  periodDays?: number;
}

export interface SalesForecastResponse {
  productId: string;
  forecastPeriodDays: number;
  forecastedSales: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  modelVersion: string;
  generatedAt: Date;
  historicalData: Array<{
    date: string;
    sales: number;
  }>;
}

// Generates a sales forecast for a specific product.
export const getSalesForecast = api<SalesForecastRequest, SalesForecastResponse>(
  { auth: true, expose: true, method: "GET", path: "/analytics/forecast/:productId" },
  async (req) => {
    const auth = getAuthData()!;
    const periodDays = req.periodDays || 30;

    // Verify listing ownership
    const listing = await listingsDB.queryRow`
      SELECT id FROM products WHERE id = ${req.productId} AND user_id = ${auth.userID}
    `;
    if (!listing) {
      throw APIError.notFound("Product not found");
    }

    // Get historical sales data
    const historicalSales = await listingsDB.queryAll`
      SELECT DATE(ph.created_at) as date, COUNT(*) as sales
      FROM price_history ph
      JOIN marketplace_listings ml ON ph.marketplace_listing_id = ml.id
      WHERE ml.product_id = ${req.productId}
        AND ph.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE(ph.created_at)
      ORDER BY date ASC
    `;

    if (historicalSales.length < 5) {
      throw APIError.failedPrecondition("Insufficient historical data for forecasting");
    }

    // Prepare data for forecasting model
    const timeSeries = historicalSales.map((row, index) => ({
      x: index,
      y: row.sales,
    }));

    // Use a simple linear regression model for forecasting
    const forecastModel = linearRegression(timeSeries);
    
    // Generate forecast for the next period
    const forecastPoints: number[] = [];
    for (let i = 0; i < periodDays; i++) {
      const predictedSales = forecastModel(timeSeries.length + i);
      forecastPoints.push(Math.max(0, predictedSales));
    }

    const forecastedSales = forecastPoints.reduce((sum, sales) => sum + sales, 0);
    
    // Calculate confidence interval (simplified)
    const residuals = timeSeries.map(p => p.y - forecastModel(p.x));
    const stdDev = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length);
    const confidenceMargin = 1.96 * stdDev * Math.sqrt(periodDays);

    const forecast = {
      productId: req.productId,
      forecastPeriodDays: periodDays,
      forecastedSales: Math.round(forecastedSales),
      confidenceInterval: {
        lower: Math.round(Math.max(0, forecastedSales - confidenceMargin)),
        upper: Math.round(forecastedSales + confidenceMargin),
      },
      modelVersion: 'linear_regression_v1.0',
      generatedAt: new Date(),
      historicalData: historicalSales.map(row => ({
        date: new Date(row.date).toISOString().split('T')[0],
        sales: row.sales,
      })),
    };

    // Store the forecast
    await analyticsDB.exec`
      INSERT INTO sales_forecasts (listing_id, forecast_period_days, forecasted_sales, confidence_interval, model_version)
      VALUES (${req.productId}, ${periodDays}, ${forecast.forecastedSales}, ${JSON.stringify(forecast.confidenceInterval)}, ${forecast.modelVersion})
    `;

    return forecast;
  }
);

// Simple linear regression implementation
function linearRegression(data: { x: number; y: number }[]): (x: number) => number {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (const point of data) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return (x: number) => slope * x + intercept;
}
