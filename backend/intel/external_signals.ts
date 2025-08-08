import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { intelDB } from "./db";
import { secret } from "encore.dev/config";

const googleTrendsApiKey = secret("GoogleTrendsApiKey");
const socialMediaApiKey = secret("SocialMediaApiKey");

export interface IntegrateSignalsRequest {
  categoryId: string;
  keywords: string[];
}

// Integrates external signals for market analysis.
export const integrateExternalSignals = api<IntegrateSignalsRequest, { success: boolean; signalsIntegrated: number }>(
  { auth: true, expose: true, method: "POST", path: "/intel/signals/external" },
  async (req) => {
    let signalsIntegrated = 0;

    // Google Trends
    for (const keyword of req.keywords) {
      const trendsData = await fetchGoogleTrends(keyword);
      await intelDB.exec`
        INSERT INTO external_signals (signal_type, keyword, category_id, signal_data, recorded_at)
        VALUES ('google_trends', ${keyword}, ${req.categoryId}, ${JSON.stringify(trendsData)}, NOW())
        ON CONFLICT (signal_type, keyword, category_id, recorded_at) DO NOTHING
      `;
      signalsIntegrated++;
    }

    // Social Media Sentiment
    const socialData = await fetchSocialSentiment(req.categoryId);
    await intelDB.exec`
      INSERT INTO external_signals (signal_type, category_id, signal_data, recorded_at)
      VALUES ('social_sentiment', ${req.categoryId}, ${JSON.stringify(socialData)}, NOW())
      ON CONFLICT (signal_type, keyword, category_id, recorded_at) DO NOTHING
    `;
    signalsIntegrated++;

    return { success: true, signalsIntegrated };
  }
);

async function fetchGoogleTrends(keyword: string) {
  // This would call a real Google Trends API or a scraping service.
  // The official API is not publicly available, so this remains a detailed simulation.
  const interest_over_time = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000);
    const seasonalFactor = 1 + 0.3 * Math.sin(date.getMonth() * (2 * Math.PI / 12));
    return {
      date: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 40 + 30) * seasonalFactor,
    };
  });

  return {
    interest_over_time,
    related_queries: [{ query: `${keyword} review`, value: 100 }, { query: `best ${keyword}`, value: 95 }],
  };
}

async function fetchSocialSentiment(categoryId: string) {
  // This would call a social media listening API (e.g., Brandwatch, Sprinklr).
  return {
    sentiment_score: Math.random() * 0.4 + 0.3, // 0.3 to 0.7
    positive_mentions: Math.floor(Math.random() * 1000),
    negative_mentions: Math.floor(Math.random() * 500),
    trending_topics: ['new_feature', 'customer_service', 'shipping_times'],
  };
}
