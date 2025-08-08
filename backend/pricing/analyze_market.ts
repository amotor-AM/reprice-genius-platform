import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { pricingDB } from "./db";
import { listingsDB } from "../listings/db";
import { secret } from "encore.dev/config";

const rapidApiKey = secret("RapidApiKey");

export interface MarketAnalysisRequest {
  listingId: string;
}

export interface MarketAnalysisResponse {
  listingId: string;
  currentPrice: number;
  suggestedPrice: number;
  confidence: number;
  reasoning: string[];
  marketFactors: {
    avgCompetitorPrice: number;
    priceRange: { min: number; max: number };
    demandIndicators: {
      searchVolume: number;
      competitorSales: number;
      seasonalTrend: number;
    };
    supplyIndicators: {
      activeListings: number;
      newListings: number;
    };
  };
}

// Analyzes market conditions and suggests optimal pricing for a listing.
export const analyzeMarket = api<MarketAnalysisRequest, MarketAnalysisResponse>(
  { auth: true, expose: true, method: "POST", path: "/pricing/analyze" },
  async (req) => {
    const auth = getAuthData()!;

    // Get listing details
    const product = await listingsDB.queryRow`
      SELECT * FROM products 
      WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;

    if (!product) {
      throw APIError.notFound("Product not found");
    }

    const marketplaceListing = await listingsDB.queryRow`
      SELECT * FROM marketplace_listings WHERE product_id = ${product.id} ORDER BY created_at DESC LIMIT 1
    `;

    if (!marketplaceListing) {
      throw APIError.notFound("No marketplace listing found for this product");
    }

    try {
      // Analyze multiple data sources
      const [ebayData, amazonData, googleTrendsData] = await Promise.allSettled([
        analyzeEbayMarket(product.title),
        analyzeAmazonMarket(product.title),
        analyzeGoogleTrends(product.title),
      ]);

      // Combine market data
      const marketFactors = combineMarketData(ebayData, amazonData, googleTrendsData);
      
      // Apply pricing algorithm
      const pricingResult = calculateOptimalPrice(product, marketplaceListing, marketFactors);

      // Store pricing decision
      await pricingDB.exec`
        INSERT INTO pricing_decisions (
          listing_id, model_id, old_price, suggested_price, confidence_score,
          reasoning, market_factors, created_at
        ) VALUES (
          ${marketplaceListing.id}, 'hybrid_v1', ${marketplaceListing.current_price}, 
          ${pricingResult.suggestedPrice}, ${pricingResult.confidence},
          ${JSON.stringify(pricingResult.reasoning)}, 
          ${JSON.stringify(marketFactors)}, CURRENT_TIMESTAMP
        )
      `;

      return {
        listingId: req.listingId,
        currentPrice: marketplaceListing.current_price,
        suggestedPrice: pricingResult.suggestedPrice,
        confidence: pricingResult.confidence,
        reasoning: pricingResult.reasoning,
        marketFactors,
      };
    } catch (error) {
      console.error('Market analysis error:', error);
      throw APIError.internal("Failed to analyze market conditions");
    }
  }
);

async function analyzeEbayMarket(title: string) {
  // Simulate eBay market analysis
  // In production, this would call eBay's Finding API
  return {
    avgPrice: 45.99,
    minPrice: 29.99,
    maxPrice: 79.99,
    soldCount: 156,
    activeCount: 89,
  };
}

async function analyzeAmazonMarket(title: string) {
  // Simulate Amazon market analysis using RapidAPI
  try {
    const response = await fetch(`https://amazon-data1.p.rapidapi.com/search?query=${encodeURIComponent(title)}`, {
      headers: {
        'X-RapidAPI-Key': rapidApiKey(),
        'X-RapidAPI-Host': 'amazon-data1.p.rapidapi.com',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        avgPrice: data.avgPrice || 50.00,
        priceRange: data.priceRange || { min: 35.00, max: 85.00 },
        availability: data.availability || 'in_stock',
      };
    }
  } catch (error) {
    console.error('Amazon API error:', error);
  }
  
  // Fallback data
  return {
    avgPrice: 50.00,
    priceRange: { min: 35.00, max: 85.00 },
    availability: 'in_stock',
  };
}

async function analyzeGoogleTrends(title: string) {
  // Simulate Google Trends analysis
  return {
    searchVolume: 1250,
    trend: 'rising',
    seasonalFactor: 1.15,
  };
}

function combineMarketData(ebayData: any, amazonData: any, googleTrendsData: any) {
  const ebay = ebayData.status === 'fulfilled' ? ebayData.value : null;
  const amazon = amazonData.status === 'fulfilled' ? amazonData.value : null;
  const trends = googleTrendsData.status === 'fulfilled' ? googleTrendsData.value : null;

  return {
    avgCompetitorPrice: ebay ? (ebay.avgPrice + (amazon?.avgPrice || ebay.avgPrice)) / 2 : 45.99,
    priceRange: {
      min: Math.min(ebay?.minPrice || 30, amazon?.priceRange?.min || 35),
      max: Math.max(ebay?.maxPrice || 80, amazon?.priceRange?.max || 85),
    },
    demandIndicators: {
      searchVolume: trends?.searchVolume || 1000,
      competitorSales: ebay?.soldCount || 100,
      seasonalTrend: trends?.seasonalFactor || 1.0,
    },
    supplyIndicators: {
      activeListings: ebay?.activeCount || 75,
      newListings: Math.floor((ebay?.activeCount || 75) * 0.1),
    },
  };
}

function calculateOptimalPrice(product: any, listing: any, marketFactors: any) {
  const currentPrice = listing.current_price;
  const properties = product.properties as any;
  const targetMargin = properties?.target_profit_margin || 0.15;
  const minPrice = properties?.min_price || currentPrice * 0.7;
  const maxPrice = properties?.max_price || currentPrice * 1.5;

  // Base price on market average
  let suggestedPrice = marketFactors.avgCompetitorPrice;

  // Adjust for demand
  const demandMultiplier = Math.min(
    1.2,
    1 + (marketFactors.demandIndicators.searchVolume / 2000) * 0.1
  );
  suggestedPrice *= demandMultiplier;

  // Adjust for supply
  const supplyMultiplier = Math.max(
    0.9,
    1 - (marketFactors.supplyIndicators.activeListings / 200) * 0.1
  );
  suggestedPrice *= supplyMultiplier;

  // Apply seasonal factor
  suggestedPrice *= marketFactors.demandIndicators.seasonalTrend;

  // Ensure within bounds
  suggestedPrice = Math.max(minPrice, Math.min(maxPrice, suggestedPrice));

  // Round to reasonable precision
  suggestedPrice = Math.round(suggestedPrice * 100) / 100;

  // Calculate confidence based on data quality
  const confidence = calculateConfidence(marketFactors, listing);

  const reasoning = [
    `Market average: $${marketFactors.avgCompetitorPrice.toFixed(2)}`,
    `Demand adjustment: ${((demandMultiplier - 1) * 100).toFixed(1)}%`,
    `Supply adjustment: ${((supplyMultiplier - 1) * 100).toFixed(1)}%`,
    `Seasonal factor: ${((marketFactors.demandIndicators.seasonalTrend - 1) * 100).toFixed(1)}%`,
  ];

  return {
    suggestedPrice,
    confidence,
    reasoning,
  };
}

function calculateConfidence(marketFactors: any, listing: any) {
  let confidence = 0.7; // Base confidence

  // Increase confidence with more market data
  if (marketFactors.demandIndicators.competitorSales > 50) confidence += 0.1;
  if (marketFactors.supplyIndicators.activeListings > 20) confidence += 0.1;
  if (marketFactors.demandIndicators.searchVolume > 500) confidence += 0.1;

  return Math.min(0.95, confidence);
}
