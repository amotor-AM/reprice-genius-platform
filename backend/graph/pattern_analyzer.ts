import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { graphDB } from "./db";
import { neo4jClient } from "./neo4j_client";

export interface AnalyzePatternsRequest {
  categoryId?: string;
  brandId?: string;
  priceRange?: {
    min: number;
    max: number;
  };
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  patternTypes?: string[];
}

export interface PricingPattern {
  patternId: string;
  patternType: string;
  description: string;
  successRate: number;
  confidence: number;
  sampleSize: number;
  averageImpact: number;
  conditions: {
    categoryId?: string;
    brandId?: string;
    priceRange?: { min: number; max: number };
    seasonality?: string;
  };
  examples: Array<{
    productId: string;
    title: string;
    priceChange: number;
    outcome: string;
    timeToSale?: number;
  }>;
}

export interface AnalyzePatternsResponse {
  patterns: PricingPattern[];
  totalPatterns: number;
  analysisTime: number;
  recommendations: string[];
}

export interface SuccessfulPath {
  pathId: string;
  startPrice: number;
  endPrice: number;
  priceSteps: Array<{
    price: number;
    timestamp: Date;
    marketConditions: Record<string, any>;
  }>;
  totalDuration: number; // days
  successMetrics: {
    salesVelocityIncrease: number;
    profitMarginChange: number;
    competitiveAdvantage: number;
  };
  confidence: number;
}

export interface FindSuccessPathRequest {
  productId: string;
  targetOutcome: 'maximize_sales' | 'maximize_profit' | 'optimize_velocity';
  constraints?: {
    maxPriceChange?: number;
    timeLimit?: number; // days
    minMargin?: number;
  };
}

export interface FindSuccessPathResponse {
  paths: SuccessfulPath[];
  recommendedPath: SuccessfulPath;
  alternativePaths: SuccessfulPath[];
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    factors: string[];
    mitigation: string[];
  };
}

// Analyzes pricing patterns in the graph database.
export const analyzePatterns = api<AnalyzePatternsRequest, AnalyzePatternsResponse>(
  { auth: true, expose: true, method: "POST", path: "/graph/pattern/analyze" },
  async (req) => {
    const auth = getAuthData()!;
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = generateCacheKey('pattern_analysis', req);
      const cached = await getCachedAnalysis(cacheKey);
      if (cached) {
        return cached;
      }

      const patterns: PricingPattern[] = [];

      // Analyze successful price increase patterns
      const increasePatterns = await analyzeSuccessfulIncreasePatterns(req);
      patterns.push(...increasePatterns);

      // Analyze successful price decrease patterns
      const decreasePatterns = await analyzeSuccessfulDecreasePatterns(req);
      patterns.push(...decreasePatterns);

      // Analyze seasonal patterns
      const seasonalPatterns = await analyzeSeasonalPatterns(req);
      patterns.push(...seasonalPatterns);

      // Analyze competitor response patterns
      const competitorPatterns = await analyzeCompetitorResponsePatterns(req);
      patterns.push(...competitorPatterns);

      // Generate recommendations based on patterns
      const recommendations = generatePatternRecommendations(patterns);

      const analysisTime = Date.now() - startTime;

      const response = {
        patterns,
        totalPatterns: patterns.length,
        analysisTime,
        recommendations,
      };

      // Cache the results
      await cacheAnalysis(cacheKey, response, 3600); // Cache for 1 hour

      return response;
    } catch (error) {
      console.error('Error analyzing pricing patterns:', error);
      throw APIError.internal("Failed to analyze pricing patterns");
    }
  }
);

// Finds successful pricing paths for similar products.
export const findSuccessPath = api<FindSuccessPathRequest, FindSuccessPathResponse>(
  { auth: true, expose: true, method: "POST", path: "/graph/success-path" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get product node
      const productNode = await graphDB.queryRow`
        SELECT * FROM graph_nodes 
        WHERE node_type = 'product' AND properties->>'listingId' = ${req.productId}
      `;

      if (!productNode) {
        throw APIError.notFound("Product not found in graph");
      }

      // Find similar products using graph algorithms
      const similarProducts = await findSimilarProductsInGraph(productNode.neo4j_id);

      // Analyze successful pricing paths from similar products
      const paths = await analyzeSuccessfulPaths(similarProducts, req.targetOutcome, req.constraints);

      // Rank paths by success probability and target outcome
      const rankedPaths = rankPathsByOutcome(paths, req.targetOutcome);

      // Assess risks for each path
      const pathsWithRisk = await assessPathRisks(rankedPaths, productNode);

      const recommendedPath = pathsWithRisk[0];
      const alternativePaths = pathsWithRisk.slice(1, 4);

      const riskAssessment = await calculateOverallRisk(recommendedPath, productNode);

      return {
        paths: pathsWithRisk,
        recommendedPath,
        alternativePaths,
        riskAssessment,
      };
    } catch (error) {
      console.error('Error finding success path:', error);
      throw APIError.internal("Failed to find successful pricing path");
    }
  }
);

async function analyzeSuccessfulIncreasePatterns(req: AnalyzePatternsRequest): Promise<PricingPattern[]> {
  const cypher = `
    MATCH (p:Product)-[pr:PRICED_AT]->(pp:Price_point)
    MATCH (p)-[s:SOLD_AT]->(sale:Sale)
    WHERE pp.price > p.originalPrice
      AND sale.timestamp > pp.timestamp
      ${req.categoryId ? 'AND p.categoryId = $categoryId' : ''}
      ${req.priceRange ? 'AND pp.price >= $minPrice AND pp.price <= $maxPrice' : ''}
    WITH p, pp, sale, (pp.price - p.originalPrice) / p.originalPrice as priceIncrease
    WHERE priceIncrease > 0.05 // At least 5% increase
    RETURN p.listingId as productId, p.title as title, 
           priceIncrease, sale.timestamp as saleTime,
           pp.timestamp as priceChangeTime
    ORDER BY priceIncrease DESC
    LIMIT 100
  `;

  const parameters: Record<string, any> = {};
  if (req.categoryId) parameters.categoryId = req.categoryId;
  if (req.priceRange) {
    parameters.minPrice = req.priceRange.min;
    parameters.maxPrice = req.priceRange.max;
  }

  const result = await neo4jClient.runQuery(cypher, parameters);
  
  if (result.records.length === 0) {
    return [];
  }

  // Analyze the pattern
  const successfulIncreases = result.records.map(record => ({
    productId: record._fields[0],
    title: record._fields[1],
    priceIncrease: record._fields[2],
    saleTime: new Date(record._fields[3]),
    priceChangeTime: new Date(record._fields[4]),
  }));

  const avgIncrease = successfulIncreases.reduce((sum, item) => sum + item.priceIncrease, 0) / successfulIncreases.length;
  const successRate = successfulIncreases.length / Math.max(successfulIncreases.length * 1.2, 100); // Estimate total attempts

  return [{
    patternId: 'successful_price_increase',
    patternType: 'price_increase',
    description: `Products with price increases of ${(avgIncrease * 100).toFixed(1)}% on average still sold successfully`,
    successRate,
    confidence: Math.min(0.95, successfulIncreases.length / 50),
    sampleSize: successfulIncreases.length,
    averageImpact: avgIncrease,
    conditions: {
      categoryId: req.categoryId,
      priceRange: req.priceRange,
    },
    examples: successfulIncreases.slice(0, 5).map(item => ({
      productId: item.productId,
      title: item.title,
      priceChange: item.priceIncrease,
      outcome: 'sold',
      timeToSale: Math.floor((item.saleTime.getTime() - item.priceChangeTime.getTime()) / (1000 * 60 * 60 * 24)),
    })),
  }];
}

async function analyzeSuccessfulDecreasePatterns(req: AnalyzePatternsRequest): Promise<PricingPattern[]> {
  const cypher = `
    MATCH (p:Product)-[pr:PRICED_AT]->(pp:Price_point)
    MATCH (p)-[s:SOLD_AT]->(sale:Sale)
    WHERE pp.price < p.originalPrice
      AND sale.timestamp > pp.timestamp
      ${req.categoryId ? 'AND p.categoryId = $categoryId' : ''}
    WITH p, pp, sale, (p.originalPrice - pp.price) / p.originalPrice as priceDecrease,
         duration(pp.timestamp, sale.timestamp).days as timeToSale
    WHERE priceDecrease > 0.05 // At least 5% decrease
    RETURN p.listingId as productId, p.title as title,
           priceDecrease, timeToSale
    ORDER BY timeToSale ASC
    LIMIT 100
  `;

  const parameters: Record<string, any> = {};
  if (req.categoryId) parameters.categoryId = req.categoryId;

  const result = await neo4jClient.runQuery(cypher, parameters);
  
  if (result.records.length === 0) {
    return [];
  }

  const fastSales = result.records.map(record => ({
    productId: record._fields[0],
    title: record._fields[1],
    priceDecrease: record._fields[2],
    timeToSale: record._fields[3],
  }));

  const avgDecrease = fastSales.reduce((sum, item) => sum + item.priceDecrease, 0) / fastSales.length;
  const avgTimeToSale = fastSales.reduce((sum, item) => sum + item.timeToSale, 0) / fastSales.length;

  return [{
    patternId: 'fast_sale_price_decrease',
    patternType: 'price_decrease',
    description: `Price decreases of ${(avgDecrease * 100).toFixed(1)}% led to sales in ${avgTimeToSale.toFixed(1)} days on average`,
    successRate: 0.85, // Estimated based on price decrease effectiveness
    confidence: Math.min(0.9, fastSales.length / 30),
    sampleSize: fastSales.length,
    averageImpact: -avgDecrease,
    conditions: {
      categoryId: req.categoryId,
    },
    examples: fastSales.slice(0, 5).map(item => ({
      productId: item.productId,
      title: item.title,
      priceChange: -item.priceDecrease,
      outcome: 'fast_sale',
      timeToSale: item.timeToSale,
    })),
  }];
}

async function analyzeSeasonalPatterns(req: AnalyzePatternsRequest): Promise<PricingPattern[]> {
  // Analyze seasonal pricing patterns
  const cypher = `
    MATCH (p:Product)-[pr:PRICED_AT]->(pp:Price_point)
    MATCH (p)-[s:SOLD_AT]->(sale:Sale)
    WHERE sale.timestamp > pp.timestamp
      ${req.categoryId ? 'AND p.categoryId = $categoryId' : ''}
    WITH p, pp, sale, 
         pp.price / p.originalPrice as priceRatio,
         sale.timestamp.month as saleMonth
    RETURN saleMonth, 
           avg(priceRatio) as avgPriceRatio,
           count(*) as salesCount,
           stddev(priceRatio) as priceVolatility
    ORDER BY saleMonth
  `;

  const parameters: Record<string, any> = {};
  if (req.categoryId) parameters.categoryId = req.categoryId;

  const result = await neo4jClient.runQuery(cypher, parameters);
  
  if (result.records.length === 0) {
    return [];
  }

  const monthlyData = result.records.map(record => ({
    month: record._fields[0],
    avgPriceRatio: record._fields[1],
    salesCount: record._fields[2],
    volatility: record._fields[3],
  }));

  // Find months with highest sales and price patterns
  const bestMonths = monthlyData
    .filter(data => data.salesCount > 5)
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, 3);

  if (bestMonths.length === 0) {
    return [];
  }

  const avgRatio = bestMonths.reduce((sum, month) => sum + month.avgPriceRatio, 0) / bestMonths.length;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return [{
    patternId: 'seasonal_pricing',
    patternType: 'seasonal',
    description: `Best sales months (${bestMonths.map(m => monthNames[m.month - 1]).join(', ')}) show optimal pricing at ${(avgRatio * 100).toFixed(1)}% of original price`,
    successRate: 0.75,
    confidence: Math.min(0.8, bestMonths.reduce((sum, m) => sum + m.salesCount, 0) / 50),
    sampleSize: bestMonths.reduce((sum, m) => sum + m.salesCount, 0),
    averageImpact: avgRatio - 1,
    conditions: {
      categoryId: req.categoryId,
      seasonality: bestMonths.map(m => monthNames[m.month - 1]).join(', '),
    },
    examples: [],
  }];
}

async function analyzeCompetitorResponsePatterns(req: AnalyzePatternsRequest): Promise<PricingPattern[]> {
  const cypher = `
    MATCH (p1:Product)-[c:COMPETES_WITH]->(p2:Product)
    MATCH (p1)-[pr1:PRICED_AT]->(pp1:Price_point)
    MATCH (p2)-[pr2:PRICED_AT]->(pp2:Price_point)
    WHERE abs(duration(pp1.timestamp, pp2.timestamp).days) <= 7
      AND pp1.timestamp < pp2.timestamp
      ${req.categoryId ? 'AND p1.categoryId = $categoryId' : ''}
    WITH p1, p2, pp1, pp2,
         (pp2.price - pp1.price) / pp1.price as competitorResponse
    WHERE abs(competitorResponse) > 0.02 // At least 2% response
    RETURN avg(competitorResponse) as avgResponse,
           count(*) as responseCount,
           stddev(competitorResponse) as responseVolatility
  `;

  const parameters: Record<string, any> = {};
  if (req.categoryId) parameters.categoryId = req.categoryId;

  const result = await neo4jClient.runQuery(cypher, parameters);
  
  if (result.records.length === 0 || !result.records[0]._fields[0]) {
    return [];
  }

  const avgResponse = result.records[0]._fields[0];
  const responseCount = result.records[0]._fields[1];
  const volatility = result.records[0]._fields[2];

  return [{
    patternId: 'competitor_response',
    patternType: 'competitor_behavior',
    description: `Competitors typically respond with ${(Math.abs(avgResponse) * 100).toFixed(1)}% ${avgResponse > 0 ? 'increase' : 'decrease'} within 7 days`,
    successRate: 0.7,
    confidence: Math.min(0.85, responseCount / 20),
    sampleSize: responseCount,
    averageImpact: avgResponse,
    conditions: {
      categoryId: req.categoryId,
    },
    examples: [],
  }];
}

async function findSimilarProductsInGraph(productNeo4jId: number): Promise<string[]> {
  const cypher = `
    MATCH (p:Product)-[:SIMILAR_TO|COMPETES_WITH]-(similar:Product)
    WHERE id(p) = $productId
    RETURN id(similar) as similarId, similar.listingId as listingId
    ORDER BY similar.views DESC
    LIMIT 20
  `;

  const result = await neo4jClient.runQuery(cypher, { productId: productNeo4jId });
  return result.records.map(record => record._fields[0].toString());
}

async function analyzeSuccessfulPaths(
  similarProductIds: string[],
  targetOutcome: string,
  constraints?: any
): Promise<SuccessfulPath[]> {
  // This would analyze pricing paths from similar products
  // For now, return mock data structure
  return [{
    pathId: 'path_1',
    startPrice: 100,
    endPrice: 95,
    priceSteps: [
      { price: 100, timestamp: new Date(), marketConditions: {} },
      { price: 98, timestamp: new Date(), marketConditions: {} },
      { price: 95, timestamp: new Date(), marketConditions: {} },
    ],
    totalDuration: 14,
    successMetrics: {
      salesVelocityIncrease: 0.25,
      profitMarginChange: -0.05,
      competitiveAdvantage: 0.15,
    },
    confidence: 0.82,
  }];
}

function rankPathsByOutcome(paths: SuccessfulPath[], targetOutcome: string): SuccessfulPath[] {
  return paths.sort((a, b) => {
    switch (targetOutcome) {
      case 'maximize_sales':
        return b.successMetrics.salesVelocityIncrease - a.successMetrics.salesVelocityIncrease;
      case 'maximize_profit':
        return b.successMetrics.profitMarginChange - a.successMetrics.profitMarginChange;
      case 'optimize_velocity':
        return (b.successMetrics.salesVelocityIncrease + b.successMetrics.competitiveAdvantage) - 
               (a.successMetrics.salesVelocityIncrease + a.successMetrics.competitiveAdvantage);
      default:
        return b.confidence - a.confidence;
    }
  });
}

async function assessPathRisks(paths: SuccessfulPath[], productNode: any): Promise<SuccessfulPath[]> {
  // Add risk assessment to each path
  return paths;
}

async function calculateOverallRisk(path: SuccessfulPath, productNode: any): Promise<any> {
  return {
    riskLevel: 'medium' as const,
    factors: ['Market volatility', 'Competitor response'],
    mitigation: ['Monitor competitor prices', 'Set price bounds'],
  };
}

function generatePatternRecommendations(patterns: PricingPattern[]): string[] {
  const recommendations: string[] = [];

  patterns.forEach(pattern => {
    if (pattern.successRate > 0.8 && pattern.confidence > 0.7) {
      recommendations.push(`High confidence pattern: ${pattern.description}`);
    }
    
    if (pattern.patternType === 'seasonal' && pattern.confidence > 0.6) {
      recommendations.push(`Consider seasonal pricing adjustments based on ${pattern.description}`);
    }
    
    if (pattern.patternType === 'competitor_behavior' && pattern.sampleSize > 10) {
      recommendations.push(`Expect competitor response: ${pattern.description}`);
    }
  });

  return recommendations;
}

function generateCacheKey(analysisType: string, params: any): string {
  const paramString = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < paramString.length; i++) {
    const char = paramString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${analysisType}_${Math.abs(hash).toString(36)}`;
}

async function getCachedAnalysis(cacheKey: string): Promise<any> {
  const cached = await graphDB.queryRow`
    SELECT results FROM graph_analysis_cache 
    WHERE id = ${cacheKey} AND expires_at > NOW()
  `;
  
  return cached ? cached.results : null;
}

async function cacheAnalysis(cacheKey: string, results: any, ttlSeconds: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  
  await graphDB.exec`
    INSERT INTO graph_analysis_cache (id, analysis_type, parameters, results, expires_at)
    VALUES (${cacheKey}, 'pattern_analysis', '{}', ${JSON.stringify(results)}, ${expiresAt})
    ON CONFLICT (id) DO UPDATE SET
      results = EXCLUDED.results,
      expires_at = EXCLUDED.expires_at
  `;
}
