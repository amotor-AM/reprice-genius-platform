import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { behaviorDB } from "./db";
import { analytics, ml } from "~encore/clients";

export interface MarketPsychologyMetrics {
  categoryId: string;
  fearGreedIndex: number; // 0-100, 0=extreme fear, 100=extreme greed
  herdBehaviorScore: number; // 0-1, how much the market is moving in unison
  marketSentiment: 'positive' | 'negative' | 'neutral';
  sentimentConfidence: number;
  lastCalculated: Date;
}

// Gets market psychology metrics for a category.
export const getMarketSentiment = api<{ categoryId: string }, MarketPsychologyMetrics>(
  { auth: true, expose: true, method: "GET", path: "/behavior/market/sentiment" },
  async (req) => {
    // Check cache first
    const cached = await behaviorDB.queryRow`
      SELECT * FROM market_psychology_metrics 
      WHERE category_id = ${req.categoryId} AND calculated_at > NOW() - INTERVAL '1 hour'
    `;
    if (cached) {
      return {
        categoryId: cached.category_id,
        fearGreedIndex: cached.metric_type === 'fear_greed_index' ? cached.metric_value : 50,
        herdBehaviorScore: cached.metric_type === 'herd_behavior_score' ? cached.metric_value : 0.5,
        marketSentiment: 'neutral', // This would be another metric type
        sentimentConfidence: 0.8,
        lastCalculated: cached.calculated_at,
      };
    }

    // Calculate metrics if not cached
    const [analyticsData, sentimentData] = await Promise.all([
      analytics.getDashboard({ period: '7d' }), // Simplified, would be category-specific
      ml.analyzeSentiment({ text: `market news for ${req.categoryId}` }),
    ]);

    // Fear & Greed Index calculation (simplified)
    const priceVolatility = analyticsData.topPerformingListings.length > 0 ? 0.3 : 0.1; // Mocked
    const salesVelocity = analyticsData.totalRevenue / 7;
    const greed = (priceVolatility * 0.4) + (salesVelocity / 1000 * 0.6);
    const fearGreedIndex = 50 + (greed - 0.5) * 100;

    // Herd Behavior Score calculation (simplified)
    const herdBehaviorScore = Math.random() * 0.4 + 0.3;

    // Store calculated metrics
    await behaviorDB.exec`
      INSERT INTO market_psychology_metrics (category_id, metric_type, metric_value)
      VALUES (${req.categoryId}, 'fear_greed_index', ${fearGreedIndex})
      ON CONFLICT (category_id, metric_type) DO UPDATE SET metric_value = EXCLUDED.metric_value, calculated_at = NOW()
    `;
    await behaviorDB.exec`
      INSERT INTO market_psychology_metrics (category_id, metric_type, metric_value)
      VALUES (${req.categoryId}, 'herd_behavior_score', ${herdBehaviorScore})
      ON CONFLICT (category_id, metric_type) DO UPDATE SET metric_value = EXCLUDED.metric_value, calculated_at = NOW()
    `;

    return {
      categoryId: req.categoryId,
      fearGreedIndex,
      herdBehaviorScore,
      marketSentiment: sentimentData.sentiment,
      sentimentConfidence: sentimentData.confidence,
      lastCalculated: new Date(),
    };
  }
);
