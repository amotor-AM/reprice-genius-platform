import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { listingsDB } from "../listings/db";
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
    const listing = await listingsDB.queryRow`
      SELECT * FROM products
      WHERE id = ${req.listingId} AND user_id = ${auth.userID}
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
    const listing = await listingsDB.queryRow`
      SELECT * FROM products
      WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    const marketplaceListing = await listingsDB.queryRow`
      SELECT * FROM marketplace_listings WHERE product_id = ${listing.id} ORDER BY created_at DESC LIMIT 1
    `;

    if (!marketplaceListing) {
      throw APIError.notFound("No marketplace listing found for this product");
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
      const recommendation = parsePriceRecommendation(geminiResponse, marketplaceListing.current_price);
      
      // Store recommendation for learning
      await storePriceRecommendation(req.listingId, recommendation, geminiResponse);
      
      return {
        listingId: req.listingId,
        currentPrice: marketplaceListing.current_price,
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
- Current Price: $${marketData.currentPrice}
- Category: ${listing.category_id || 'Unknown'}
- Condition: ${(listing.properties as any)?.condition || 'Unknown'}
- Quantity Available: ${marketData.quantity || 0}
- Views: ${marketData.views || 0}
- Watchers: ${marketData.watchers || 0}

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
- Current Price: $${marketData.currentPrice}
- Original Price: $${marketData.originalPrice}
- Category: ${listing.category_id || 'Unknown'}
- Condition: ${(listing.properties as any)?.condition || 'Unknown'}
- Target Profit Margin: ${targetMargin || 0.15}
- Min Price: $${(listing.properties as any)?.minPrice || 'None'}
- Max Price: $${(listing.properties as any)?.maxPrice || 'None'}

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
  const marketData = await listingsDB.queryRow`
    SELECT 
      AVG(ml.current_price) as avg_price,
      MIN(ml.current_price) as min_price,
      MAX(ml.current_price) as max_price,
      COUNT(*) as active_listings
    FROM marketplace_listings ml
    JOIN products p ON ml.product_id = p.id
    WHERE p.category_id = ${listing.category_id}
      AND ml.status = 'active'
      AND ml.created_at >= NOW() - INTERVAL '30 days'
  `;

  const marketplaceListing = await listingsDB.queryRow`
    SELECT * FROM marketplace_listings WHERE product_id = ${listing.id} ORDER BY created_at DESC LIMIT 1
  `;

  return {
    currentPrice: marketplaceListing?.current_price || 0,
    originalPrice: marketplaceListing?.original_price || 0,
    quantity: 0, // Mocked
    views: (marketplaceListing?.metadata as any)?.views || 0,
    watchers: (marketplaceListing?.metadata as any)?.watchers || 0,
    avgPrice: marketData?.avg_price || marketplaceListing?.current_price || 0,
    minPrice: marketData?.min_price || (marketplaceListing?.current_price || 0) * 0.7,
    maxPrice: marketData?.max_price || (marketplaceListing?.current_price || 0) * 1.5,
    activeListings: marketData?.active_listings || 10,
    recentSales: 0, // Mocked
  };
}

async function getCompetitorPricing(listing: any): Promise<any[]> {
  // Get similar products for competitor analysis
  const competitors = await listingsDB.queryAll`
    SELECT p.title, ml.current_price, ml.metadata
    FROM products p
    JOIN marketplace_listings ml ON p.id = ml.product_id
    WHERE p.category_id = ${listing.category_id}
      AND p.id != ${listing.id}
      AND ml.status = 'active'
    ORDER BY ml.created_at DESC
    LIMIT 10
  `;

  return competitors.map(comp => ({
    title: comp.title,
    price: comp.current_price,
    performance: {
      views: (comp.metadata as any)?.views || 0,
      watchers: (comp.metadata as any)?.watchers || 0,
      sales: 0, // Mocked
    }
  }));
}

async function getHistoricalPricing(listingId: string): Promise<any[]> {
  const history = await listingsDB.queryAll`
    SELECT ph.old_price, ph.new_price, ph.reason, ph.created_at
    FROM price_history ph
    JOIN marketplace_listings ml ON ph.marketplace_listing_id = ml.id
    WHERE ml.product_id = ${listingId}
    ORDER BY ph.created_at DESC
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
