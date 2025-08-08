import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";

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

// Analyzes the sentiment of a given text.
export const analyzeSentiment = api<SentimentAnalysisRequest, SentimentAnalysisResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/analyze/sentiment" },
  async (req) => {
    // In a real implementation, this would call a sentiment analysis model.
    // Here, we simulate the output.
    const result = simulateSentimentAnalysis(req.text);

    // Optionally store results for learning
    // await mlDB.exec`...`;

    return result;
  }
);

function simulateSentimentAnalysis(text: string): SentimentAnalysisResponse {
  const lowerText = text.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;

  const positiveWords = ['great', 'excellent', 'love', 'amazing', 'perfect', 'fast', 'good'];
  const negativeWords = ['bad', 'poor', 'slow', 'broken', 'disappointed', 'terrible', 'problem'];

  const keywords: SentimentAnalysisResponse['keywords'] = [];

  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (positiveWords.includes(word)) {
      positiveScore++;
      keywords.push({ text: word, sentiment: 'positive', relevance: 0.8 });
    }
    if (negativeWords.includes(word)) {
      negativeScore++;
      keywords.push({ text: word, sentiment: 'negative', relevance: 0.9 });
    }
  }

  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  let confidence = 0.6;

  if (positiveScore > negativeScore) {
    sentiment = 'positive';
    confidence = 0.6 + (positiveScore - negativeScore) * 0.1;
  } else if (negativeScore > positiveScore) {
    sentiment = 'negative';
    confidence = 0.6 + (negativeScore - positiveScore) * 0.1;
  }

  return {
    sentiment,
    confidence: Math.min(0.95, confidence),
    keywords: keywords.slice(0, 5),
  };
}
