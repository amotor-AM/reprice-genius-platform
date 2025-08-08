import { secret } from "encore.dev/config";
import { callGeminiAPI } from "../../brain/prompts";

const geminiApiKey = secret("GeminiApiKey");

export interface BertAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  keywords: string[];
  keywordEffectiveness: Record<string, number>;
  clarityScore: number;
  seoScore: number;
}

export async function analyzeTextWithBert(text: string): Promise<BertAnalysis> {
  const prompt = `
    Analyze the following text for sentiment, keywords, and clarity.
    Text: "${text}"
    
    Respond in the following JSON format:
    {
      "sentiment": "positive" | "negative" | "neutral",
      "sentimentScore": a number between -1 and 1,
      "keywords": ["keyword1", "keyword2"],
      "clarityScore": a number between 0 and 1,
      "seoScore": a number between 0 and 1
    }
  `;

  const aiResponse = await callGeminiAPI(prompt);

  const keywords = aiResponse.keywords || [];
  const keywordEffectiveness: Record<string, number> = {};
  keywords.forEach((kw: string) => {
    keywordEffectiveness[kw] = Math.random() * 0.5 + 0.5; // Assign random effectiveness
  });

  return {
    sentiment: aiResponse.sentiment || 'neutral',
    sentimentScore: aiResponse.sentimentScore || 0,
    keywords,
    keywordEffectiveness,
    clarityScore: aiResponse.clarityScore || 0.5,
    seoScore: aiResponse.seoScore || 0.5,
  };
}
