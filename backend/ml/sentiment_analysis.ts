import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { analyzeTextWithBert } from "./models/bert_analyzer";

export interface SentimentAnalysisRequest {
  text: string;
  context?: 'product_review' | 'customer_feedback' | 'market_news';
}

export interface SentimentAnalysisResponse {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  keywords: Array<{
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    relevance: number;
  }>;
}

// Analyzes the sentiment of a given text using a BERT model.
export const analyzeSentiment = api<SentimentAnalysisRequest, SentimentAnalysisResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/analyze/sentiment" },
  async (req) => {
    const bertResult = await analyzeTextWithBert(req.text);

    return {
      sentiment: bertResult.sentiment,
      confidence: bertResult.clarityScore, // Use clarity as confidence
      keywords: bertResult.keywords.map(kw => ({
        text: kw,
        sentiment: 'neutral', // BERT would provide this
        relevance: bertResult.keywordEffectiveness[kw],
      })),
    };
  }
);
