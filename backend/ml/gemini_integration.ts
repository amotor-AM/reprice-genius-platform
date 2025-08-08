import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { ebayDB } from "../ebay/db";
import { mlDB } from "./db";

const geminiApiKey = secret("GeminiApiKey");

export interface MarketAnalysisRequest {
  listingId: string;
  includeCompetitors?: boolean;
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface MarketAnalysisResponse {
  listingId: string;
  analysis: {
    marketTrend: string;
    demandLevel: 'low' | 'medium' | 'high' | 'very_high';
    competitionLevel: 'low' | 'medium' | 'high' | 'very_high';
    seasonalFactors: string[];
    pricePositioning: string;
    recommendations: string[];
  };
  confidence: number;
  reasoning: string;
  generatedAt: Date;
}

export interface PriceRecommendationRequest {
  listingId: string;
  targetMargin?: number;
  marketConditions?: {
    demandLevel?: string;
    competitionLevel?: string;
    seasonalFactor?: number;
  };
}

export interface PriceRecommendationResponse {
  listingId: string;
  currentPrice: number;
  recommendedPrice: number;
  priceRange: {
    min: number;
    max: number;
    optimal: number;
  };
  confidence: number;
  reasoning: string[];
  marketFactors: {
    demandImpact: number;
    competitionImpact: number;
    seasonalImpact: number;
    brandImpact: number;
  };
  expectedOutcome: {
    salesVelocityChange: number;
    profitMarginChange: number;
    competitivePosition: string;
  };
}

// Analyzes market conditions using Google Gemini AI.
export const analyzeMarket = api<MarketAnalysisRequest, MarketAnalysisResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/market-analysis" },
  async (req) => {
    const auth = getAuthData()!;

    // Get listing details
    const listing = await ebayDB.queryRow`
      SELECT l.*, u.id as user_id FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = ${req.listingId} AND l.user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    try {
      // Get market data for context
      const marketData = await getMarketContext(listing);
      
      // Prepare prompt for Gemini
      const prompt = buildMarketAnalysisPrompt(listing, marketData, req.analysisDepth || 'detailed');
      
      // Call Gemini API
      const geminiResponse = await callGeminiAPI(prompt);
      
      // Parse and structure the response
      const analysis = parseMarketAnalysis(geminiResponse);
      
      // Store analysis for future reference
      await storeAnalysis(req.listingId, analysis, geminiResponse);
      
      return {
        listingId: req.listingId,
        analysis,
        confidence: calculateAnalysisConfidence(analysis, marketData),
        reasoning: geminiResponse.reasoning || "AI analysis based on market trends and product characteristics",
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error analyzing market with Gemini:', error);
      throw APIError.internal("Failed to analyze market conditions");
    }
  }
);

// Gets AI-powered price recommendations using Gemini.
export const getPriceRecommendation = api<PriceRecommendationRequest, PriceRecommendationResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/price-recommendation" },
  async (req) => {
    const auth = getAuthData()!;

    // Get listing details
    const listing = await ebayDB.queryRow`
      SELECT l.*, u.id as user_id FROM listings l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = ${req.listingId} AND l.user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    try {
      // Get comprehensive market data
      const marketData = await getMarketContext(listing);
      const competitorData = await getCompetitorPricing(listing);
      const historicalData = await getHistoricalPricing(req.listingId);
      
      // Prepare prompt for price recommendation
      const prompt = buildPriceRecommendationPrompt(
        listing, 
        marketData, 
        competitorData, 
        historicalData,
        req.targetMargin,
        req.marketConditions
      );
      
      // Call Gemini API
      const geminiResponse = await callGeminiAPI(prompt);
      
      // Parse the recommendation
      const recommendation = parsePriceRecommendation(geminiResponse, listing.current_price);
      
      // Store recommendation for learning
      await storePriceRecommendation(req.listingId, recommendation, geminiResponse);
      
      return {
        listingId: req.listingId,
        currentPrice: listing.current_price,
        recommendedPrice: recommendation.price,
        priceRange: recommendation.priceRange,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning,
        marketFactors: recommendation.marketFactors,
        expectedOutcome: recommendation.expectedOutcome,
      };
    } catch (error) {
      console.error('Error getting price recommendation from Gemini:', error);
      throw APIError.internal("Failed to get price recommendation");
    }
  }
);

async function callGeminiAPI(prompt: string): Promise<any> {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey(),
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini API');
    }

    const content = data.candidates[0].content.parts[0].text;
    
    // Try to parse as JSON, fallback to text
    try {
      return JSON.parse(content);
    } catch {
      return { text: content, reasoning: content };
    }
  } catch (error) {
    console.error('Gemini API call failed:', error);
    throw error;
  }
}

function buildMarketAnalysisPrompt(listing: any, marketData: any, depth: string): string {
  return `
You are an expert eBay market analyst. Analyze the market conditions for this product and provide insights in JSON format.

Product Details:
- Title: ${listing.title}
- Current Price: $${listing.current_price}
- Category: ${listing.category_id || 'Unknown'}
- Condition: ${listing.condition_id || 'Unknown'}
- Quantity Available: ${listing.quantity}
- Views: ${listing.views}
- Watchers: ${listing.watchers}

Market Context:
- Average Market Price: $${marketData.avgPrice || 'Unknown'}
- Price Range: $${marketData.minPrice || 0} - $${marketData.maxPrice || 0}
- Active Listings: ${marketData.activeListings || 'Unknown'}
- Recent Sales: ${marketData.recentSales || 'Unknown'}

Analysis Depth: ${depth}

Please provide a comprehensive market analysis in the following JSON format:
{
  "marketTrend": "rising|stable|declining",
  "demandLevel": "low|medium|high|very_high",
  "competitionLevel": "low|medium|high|very_high", 
  "seasonalFactors": ["factor1", "factor2"],
  "pricePositioning": "below_market|at_market|above_market|premium",
  "recommendations": ["recommendation1", "recommendation2"],
  "reasoning": "Detailed explanation of the analysis"
}

Focus on actionable insights that can help optimize pricing strategy.
`;
}

function buildPriceRecommendationPrompt(
  listing: any, 
  marketData: any, 
  competitorData: any, 
  historicalData: any,
  targetMargin?: number,
  marketConditions?: any
): string {
  return `
You are an expert pricing strategist for eBay. Provide an optimal price recommendation for this product.

Product Details:
- Title: ${listing.title}
- Current Price: $${listing.current_price}
- Original Price: $${listing.original_price}
- Category: ${listing.category_id || 'Unknown'}
- Condition: ${listing.condition_id || 'Unknown'}
- Target Profit Margin: ${targetMargin || listing.target_profit_margin || 0.15}
- Min Price: $${listing.min_price || 'None'}
- Max Price: $${listing.max_price || 'None'}

Market Data:
- Average Competitor Price: $${marketData.avgPrice || 'Unknown'}
- Price Range: $${marketData.minPrice || 0} - $${marketData.maxPrice || 0}
- Market Demand: ${marketConditions?.demandLevel || 'Unknown'}
- Competition Level: ${marketConditions?.competitionLevel || 'Unknown'}

Competitor Analysis:
${JSON.stringify(competitorData, null, 2)}

Historical Performance:
${JSON.stringify(historicalData, null, 2)}

Provide a detailed price recommendation in JSON format:
{
  "price": 0.00,
  "priceRange": {
    "min": 0.00,
    "max": 0.00,
    "optimal": 0.00
  },
  "confidence": 0.85,
  "reasoning": ["reason1", "reason2"],
  "marketFactors": {
    "demandImpact": 0.1,
    "competitionImpact": -0.05,
    "seasonalImpact": 0.15,
    "brandImpact": 0.08
  },
  "expectedOutcome": {
    "salesVelocityChange": 0.2,
    "profitMarginChange": 0.05,
    "competitivePosition": "strong|moderate|weak"
  }
}

Consider market psychology, competitor positioning, and profit optimization.
`;
}

async function getMarketContext(listing: any): Promise<any> {
  // Get market data from database
  const marketData = await ebayDB.queryRow`
    SELECT 
      AVG(current_price) as avg_price,
      MIN(current_price) as min_price,
      MAX(current_price) as max_price,
      COUNT(*) as active_listings,
      SUM(sold_quantity) as recent_sales
    FROM listings 
    WHERE category_id = ${listing.category_id}
      AND listing_status = 'active'
      AND created_at >= NOW() - INTERVAL '30 days'
  `;

  return {
    avgPrice: marketData?.avg_price || listing.current_price,
    minPrice: marketData?.min_price || listing.current_price * 0.7,
    maxPrice: marketData?.max_price || listing.current_price * 1.5,
    activeListings: marketData?.active_listings || 10,
    recentSales: marketData?.recent_sales || 5,
  };
}

async function getCompetitorPricing(listing: any): Promise<any[]> {
  // Get similar products for competitor analysis
  const competitors = await ebayDB.queryAll`
    SELECT title, current_price, views, watchers, sold_quantity
    FROM listings 
    WHERE category_id = ${listing.category_id}
      AND condition_id = ${listing.condition_id}
      AND listing_status = 'active'
      AND id != ${listing.id}
    ORDER BY views DESC
    LIMIT 10
  `;

  return competitors.map(comp => ({
    title: comp.title,
    price: comp.current_price,
    performance: {
      views: comp.views,
      watchers: comp.watchers,
      sales: comp.sold_quantity,
    }
  }));
}

async function getHistoricalPricing(listingId: string): Promise<any[]> {
  const history = await ebayDB.queryAll`
    SELECT old_price, new_price, reason, created_at
    FROM price_history 
    WHERE listing_id = ${listingId}
    ORDER BY created_at DESC
    LIMIT 10
  `;

  return history.map(h => ({
    oldPrice: h.old_price,
    newPrice: h.new_price,
    reason: h.reason,
    date: h.created_at,
  }));
}

function parseMarketAnalysis(geminiResponse: any): any {
  // If response is already structured, return it
  if (geminiResponse.marketTrend) {
    return geminiResponse;
  }

  // Parse text response and extract structured data
  const text = geminiResponse.text || geminiResponse.reasoning || '';
  
  return {
    marketTrend: extractValue(text, 'trend', 'stable'),
    demandLevel: extractValue(text, 'demand', 'medium'),
    competitionLevel: extractValue(text, 'competition', 'medium'),
    seasonalFactors: extractArray(text, 'seasonal'),
    pricePositioning: extractValue(text, 'positioning', 'at_market'),
    recommendations: extractArray(text, 'recommend'),
  };
}

function parsePriceRecommendation(geminiResponse: any, currentPrice: number): any {
  // If response is already structured, return it
  if (geminiResponse.price) {
    return geminiResponse;
  }

  // Parse text response and extract pricing data
  const text = geminiResponse.text || geminiResponse.reasoning || '';
  const recommendedPrice = extractPrice(text) || currentPrice;
  
  return {
    price: recommendedPrice,
    priceRange: {
      min: recommendedPrice * 0.9,
      max: recommendedPrice * 1.1,
      optimal: recommendedPrice,
    },
    confidence: 0.75,
    reasoning: [text.substring(0, 200)],
    marketFactors: {
      demandImpact: 0.1,
      competitionImpact: 0.05,
      seasonalImpact: 0.0,
      brandImpact: 0.05,
    },
    expectedOutcome: {
      salesVelocityChange: 0.1,
      profitMarginChange: 0.05,
      competitivePosition: 'moderate',
    },
  };
}

function extractValue(text: string, key: string, defaultValue: string): string {
  const patterns = [
    new RegExp(`${key}[:\\s]+(\\w+)`, 'i'),
    new RegExp(`"${key}"[:\\s]+"([^"]+)"`, 'i'),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  
  return defaultValue;
}

function extractArray(text: string, key: string): string[] {
  const pattern = new RegExp(`${key}[^\\[]*\\[([^\\]]+)\\]`, 'i');
  const match = text.match(pattern);
  
  if (match) {
    return match[1].split(',').map(item => item.trim().replace(/"/g, ''));
  }
  
  return [];
}

function extractPrice(text: string): number | null {
  const patterns = [
    /\$(\d+\.?\d*)/g,
    /price[:\s]+(\d+\.?\d*)/gi,
    /recommend[^$]*\$(\d+\.?\d*)/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    if (matches.length > 0) {
      return parseFloat(matches[0][1]);
    }
  }
  
  return null;
}

function calculateAnalysisConfidence(analysis: any, marketData: any): number {
  let confidence = 0.7; // Base confidence
  
  // Increase confidence based on data quality
  if (marketData.activeListings > 5) confidence += 0.1;
  if (marketData.recentSales > 10) confidence += 0.1;
  if (analysis.recommendations && analysis.recommendations.length > 2) confidence += 0.05;
  
  return Math.min(0.95, confidence);
}

async function storeAnalysis(listingId: string, analysis: any, rawResponse: any): Promise<void> {
  await mlDB.exec`
    INSERT INTO market_analyses (listing_id, analysis_data, raw_response, created_at)
    VALUES (${listingId}, ${JSON.stringify(analysis)}, ${JSON.stringify(rawResponse)}, CURRENT_TIMESTAMP)
  `;
}

async function storePriceRecommendation(listingId: string, recommendation: any, rawResponse: any): Promise<void> {
  await mlDB.exec`
    INSERT INTO price_recommendations (listing_id, recommendation_data, raw_response, created_at)
    VALUES (${listingId}, ${JSON.stringify(recommendation)}, ${JSON.stringify(rawResponse)}, CURRENT_TIMESTAMP)
  `;
}
