import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { marketDB } from "./db";
import { getCachedOrCompute } from "./cache";
import { aggregateCategoryData } from "./data_aggregator";

export interface TrendData {
  source: string;
  trendType: string;
  value: number;
  period: string;
  timestamp: Date;
}

// Gets trend data for a specific category.
export const getTrends = api<{ category: string }, { trends: TrendData[] }>(
  { auth: true, expose: true, method: "GET", path: "/market/trends/:category" },
  async ({ category }) => {
    const trends = await getCachedOrCompute(`trends:${category}`, async () => {
      // First, try to get from DB
      const dbTrends = await marketDB.queryAll`
        SELECT source, trend_type, trend_value, period, calculated_at
        FROM market_trends
        WHERE category_id = ${category}
        ORDER BY calculated_at DESC
      `;

      if (dbTrends.length > 0) {
        return dbTrends.map(t => ({
          source: t.source,
          trendType: t.trend_type,
          value: t.trend_value,
          period: t.period,
          timestamp: t.calculated_at,
        }));
      }

      // If not in DB, aggregate it now
      await aggregateCategoryData(category);
      const newDbTrends = await marketDB.queryAll`
        SELECT source, trend_type, trend_value, period, calculated_at
        FROM market_trends
        WHERE category_id = ${category}
        ORDER BY calculated_at DESC
      `;
      return newDbTrends.map(t => ({
        source: t.source,
        trendType: t.trend_type,
        value: t.trend_value,
        period: t.period,
        timestamp: t.calculated_at,
      }));
    }, 600); // Cache for 10 minutes

    return { trends };
  }
);
