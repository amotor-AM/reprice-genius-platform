import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { graphDB } from "./db";
import { neo4jClient } from "./neo4j_client";

export interface CompetitorNetworkRequest {
  productId: string;
  depth?: number; // How many degrees of separation to include
  includeMetrics?: boolean;
}

export interface CompetitorNode {
  productId: string;
  title: string;
  currentPrice: number;
  originalPrice: number;
  priceChangePercent: number;
  marketPosition: 'premium' | 'competitive' | 'budget';
  competitiveStrength: number;
  relationshipType: 'direct_competitor' | 'indirect_competitor' | 'substitute';
  distance: number; // Degrees of separation from source product
  metrics?: {
    views: number;
    watchers: number;
    salesVelocity: number;
    priceStability: number;
  };
}

export interface CompetitorRelationship {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  strength: number;
  properties: {
    priceRatio: number;
    priceDifference: number;
    marketOverlap: number;
    responseTime?: number; // How quickly they respond to price changes
  };
}

export interface CompetitorNetworkResponse {
  sourceProduct: CompetitorNode;
  competitors: CompetitorNode[];
  relationships: CompetitorRelationship[];
  networkMetrics: {
    totalCompetitors: number;
    averageCompetitiveStrength: number;
    priceRange: { min: number; max: number };
    marketDensity: number;
    dominantPricePoint: number;
  };
  insights: {
    marketPosition: string;
    pricingOpportunities: string[];
    threats: string[];
    recommendations: string[];
  };
}

export interface CategoryInsightsRequest {
  categoryId: string;
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  includeSubcategories?: boolean;
}

export interface CategoryInsight {
  insightType: 'trend' | 'opportunity' | 'threat' | 'pattern';
  title: string;
  description: string;
  confidence: number;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  data: Record<string, any>;
}

export interface CategoryInsightsResponse {
  categoryId: string;
  categoryName: string;
  insights: CategoryInsight[];
  marketMetrics: {
    totalProducts: number;
    averagePrice: number;
    priceVolatility: number;
    competitionLevel: 'low' | 'medium' | 'high';
    growthTrend: number;
  };
  topPerformers: Array<{
    productId: string;
    title: string;
    performanceScore: number;
    keyFactors: string[];
  }>;
  pricingRecommendations: {
    optimalPriceRange: { min: number; max: number };
    seasonalAdjustments: Array<{
      period: string;
      adjustment: number;
      reasoning: string;
    }>;
    competitivePositioning: string;
  };
}

// Gets the competitor network for a specific product.
export const getCompetitorNetwork = api<CompetitorNetworkRequest, CompetitorNetworkResponse>(
  { auth: true, expose: true, method: "GET", path: "/graph/competitors/:productId" },
  async (req) => {
    const auth = getAuthData()!;
    const depth = req.depth || 2;

    try {
      // Get the source product node
      const sourceNode = await graphDB.queryRow`
        SELECT * FROM graph_nodes 
        WHERE node_type = 'product' AND properties->>'listingId' = ${req.productId}
      `;

      if (!sourceNode) {
        throw APIError.notFound("Product not found in graph");
      }

      // Find competitor network using Neo4j graph traversal
      const competitorNetwork = await findCompetitorNetwork(
        sourceNode.neo4j_id,
        depth,
        req.includeMetrics
      );

      // Calculate network metrics
      const networkMetrics = calculateNetworkMetrics(competitorNetwork);

      // Generate insights and recommendations
      const insights = generateNetworkInsights(competitorNetwork, networkMetrics);

      // Build source product info
      const sourceProduct: CompetitorNode = {
        productId: req.productId,
        title: sourceNode.properties.title,
        currentPrice: sourceNode.properties.currentPrice,
        originalPrice: sourceNode.properties.originalPrice,
        priceChangePercent: ((sourceNode.properties.currentPrice - sourceNode.properties.originalPrice) / sourceNode.properties.originalPrice) * 100,
        marketPosition: determineMarketPosition(sourceNode.properties.currentPrice, networkMetrics.priceRange),
        competitiveStrength: 1.0, // Source product baseline
        relationshipType: 'direct_competitor',
        distance: 0,
        metrics: req.includeMetrics ? {
          views: sourceNode.properties.views || 0,
          watchers: sourceNode.properties.watchers || 0,
          salesVelocity: 0.5, // Mock data
          priceStability: 0.8, // Mock data
        } : undefined,
      };

      return {
        sourceProduct,
        competitors: competitorNetwork.competitors,
        relationships: competitorNetwork.relationships,
        networkMetrics,
        insights,
      };
    } catch (error) {
      console.error('Error getting competitor network:', error);
      throw APIError.internal("Failed to get competitor network");
    }
  }
);

// Gets category-level insights and analytics.
export const getCategoryInsights = api<CategoryInsightsRequest, CategoryInsightsResponse>(
  { auth: true, expose: true, method: "GET", path: "/graph/insights/:categoryId" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get category information and products
      const categoryData = await analyzeCategoryData(req.categoryId, req.timeRange);

      // Generate various types of insights
      const insights = await generateCategoryInsights(categoryData, req.categoryId);

      // Calculate market metrics
      const marketMetrics = calculateCategoryMetrics(categoryData);

      // Find top performers using graph algorithms
      const topPerformers = await findTopPerformers(req.categoryId);

      // Generate pricing recommendations
      const pricingRecommendations = generateCategoryPricingRecommendations(categoryData, marketMetrics);

      return {
        categoryId: req.categoryId,
        categoryName: categoryData.categoryName || req.categoryId,
        insights,
        marketMetrics,
        topPerformers,
        pricingRecommendations,
      };
    } catch (error) {
      console.error('Error getting category insights:', error);
      throw APIError.internal("Failed to get category insights");
    }
  }
);

async function findCompetitorNetwork(
  sourceNeo4jId: number,
  depth: number,
  includeMetrics: boolean
): Promise<{ competitors: CompetitorNode[]; relationships: CompetitorRelationship[] }> {
  // Use Neo4j to find competitor network with specified depth
  const cypher = `
    MATCH path = (source:Product)-[:COMPETES_WITH|SIMILAR_TO*1..${depth}]-(competitor:Product)
    WHERE id(source) = $sourceId
    WITH competitor, length(path) as distance, 
         relationships(path) as rels,
         nodes(path) as pathNodes
    RETURN DISTINCT 
           competitor.listingId as productId,
           competitor.title as title,
           competitor.currentPrice as currentPrice,
           competitor.originalPrice as originalPrice,
           distance,
           rels[0].strength as competitiveStrength,
           type(rels[0]) as relationshipType,
           competitor.views as views,
           competitor.watchers as watchers
    ORDER BY distance, competitiveStrength DESC
    LIMIT 50
  `;

  const result = await neo4jClient.runQuery(cypher, { sourceId: sourceNeo4jId });

  const competitors: CompetitorNode[] = result.records.map(record => {
    const currentPrice = record._fields[2];
    const originalPrice = record._fields[3];
    const priceChangePercent = ((currentPrice - originalPrice) / originalPrice) * 100;

    return {
      productId: record._fields[0],
      title: record._fields[1],
      currentPrice,
      originalPrice,
      priceChangePercent,
      marketPosition: determineMarketPosition(currentPrice, { min: 0, max: 1000 }), // Will be recalculated
      competitiveStrength: record._fields[5] || 0.5,
      relationshipType: mapRelationshipType(record._fields[6]),
      distance: record._fields[4],
      metrics: includeMetrics ? {
        views: record._fields[7] || 0,
        watchers: record._fields[8] || 0,
        salesVelocity: Math.random() * 0.5 + 0.25, // Mock data
        priceStability: Math.random() * 0.3 + 0.7, // Mock data
      } : undefined,
    };
  });

  // Get relationships between competitors
  const relationships = await getCompetitorRelationships(competitors);

  return { competitors, relationships };
}

async function getCompetitorRelationships(competitors: CompetitorNode[]): Promise<CompetitorRelationship[]> {
  const relationships: CompetitorRelationship[] = [];

  // Query relationships between the competitors
  const productIds = competitors.map(c => c.productId);
  
  for (let i = 0; i < productIds.length; i++) {
    for (let j = i + 1; j < productIds.length; j++) {
      const sourceId = productIds[i];
      const targetId = productIds[j];
      
      // Check if relationship exists in graph
      const relationship = await graphDB.queryRow`
        SELECT gr.*, 
               gn1.properties as source_props,
               gn2.properties as target_props
        FROM graph_relationships gr
        JOIN graph_nodes gn1 ON gr.source_node_id = gn1.id
        JOIN graph_nodes gn2 ON gr.target_node_id = gn2.id
        WHERE (gn1.properties->>'listingId' = ${sourceId} AND gn2.properties->>'listingId' = ${targetId})
           OR (gn1.properties->>'listingId' = ${targetId} AND gn2.properties->>'listingId' = ${sourceId})
        LIMIT 1
      `;

      if (relationship) {
        const sourcePrice = relationship.source_props.currentPrice;
        const targetPrice = relationship.target_props.currentPrice;
        
        relationships.push({
          sourceId,
          targetId,
          relationshipType: relationship.relationship_type,
          strength: relationship.strength,
          properties: {
            priceRatio: sourcePrice / targetPrice,
            priceDifference: Math.abs(sourcePrice - targetPrice),
            marketOverlap: 0.8, // Mock data
            responseTime: Math.floor(Math.random() * 7) + 1, // 1-7 days
          },
        });
      }
    }
  }

  return relationships;
}

function calculateNetworkMetrics(network: { competitors: CompetitorNode[]; relationships: CompetitorRelationship[] }) {
  const prices = network.competitors.map(c => c.currentPrice);
  const strengths = network.competitors.map(c => c.competitiveStrength);

  return {
    totalCompetitors: network.competitors.length,
    averageCompetitiveStrength: strengths.reduce((sum, s) => sum + s, 0) / strengths.length,
    priceRange: {
      min: Math.min(...prices),
      max: Math.max(...prices),
    },
    marketDensity: network.relationships.length / Math.max(1, network.competitors.length),
    dominantPricePoint: prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)], // Median
  };
}

function generateNetworkInsights(
  network: { competitors: CompetitorNode[]; relationships: CompetitorRelationship[] },
  metrics: any
) {
  const insights = {
    marketPosition: 'competitive',
    pricingOpportunities: [] as string[],
    threats: [] as string[],
    recommendations: [] as string[],
  };

  // Analyze market position
  if (metrics.averageCompetitiveStrength > 0.7) {
    insights.marketPosition = 'highly competitive';
    insights.threats.push('Strong competitor presence');
  } else if (metrics.averageCompetitiveStrength < 0.4) {
    insights.marketPosition = 'low competition';
    insights.pricingOpportunities.push('Opportunity for premium pricing');
  }

  // Price range analysis
  const priceSpread = metrics.priceRange.max - metrics.priceRange.min;
  if (priceSpread > metrics.dominantPricePoint * 0.5) {
    insights.pricingOpportunities.push('Wide price range allows for flexible positioning');
  }

  // Network density analysis
  if (metrics.marketDensity > 0.5) {
    insights.threats.push('High market interconnectedness - price changes may trigger responses');
  }

  // Generate recommendations
  insights.recommendations.push('Monitor top 3 competitors for price changes');
  insights.recommendations.push('Consider gradual price adjustments to test market response');
  
  if (metrics.averageCompetitiveStrength < 0.6) {
    insights.recommendations.push('Opportunity to increase prices given weak competition');
  }

  return insights;
}

function determineMarketPosition(price: number, priceRange: { min: number; max: number }): 'premium' | 'competitive' | 'budget' {
  const range = priceRange.max - priceRange.min;
  const position = (price - priceRange.min) / range;

  if (position > 0.7) return 'premium';
  if (position < 0.3) return 'budget';
  return 'competitive';
}

function mapRelationshipType(neo4jType: string): 'direct_competitor' | 'indirect_competitor' | 'substitute' {
  switch (neo4jType) {
    case 'COMPETES_WITH':
      return 'direct_competitor';
    case 'SIMILAR_TO':
      return 'indirect_competitor';
    default:
      return 'substitute';
  }
}

async function analyzeCategoryData(categoryId: string, timeRange?: any) {
  // Get all products in category from graph
  const cypher = `
    MATCH (p:Product)-[:BELONGS_TO]->(c:Category)
    WHERE c.categoryId = $categoryId
    OPTIONAL MATCH (p)-[:PRICED_AT]->(pp:Price_point)
    OPTIONAL MATCH (p)-[:SOLD_AT]->(s:Sale)
    RETURN p.listingId as productId,
           p.title as title,
           p.currentPrice as currentPrice,
           p.originalPrice as originalPrice,
           p.views as views,
           p.watchers as watchers,
           collect(DISTINCT pp.price) as priceHistory,
           count(DISTINCT s) as salesCount
  `;

  const result = await neo4jClient.runQuery(cypher, { categoryId });

  return {
    categoryName: categoryId, // In production, fetch actual category name
    products: result.records.map(record => ({
      productId: record._fields[0],
      title: record._fields[1],
      currentPrice: record._fields[2],
      originalPrice: record._fields[3],
      views: record._fields[4] || 0,
      watchers: record._fields[5] || 0,
      priceHistory: record._fields[6] || [],
      salesCount: record._fields[7] || 0,
    })),
  };
}

async function generateCategoryInsights(categoryData: any, categoryId: string): Promise<CategoryInsight[]> {
  const insights: CategoryInsight[] = [];

  // Price trend analysis
  const prices = categoryData.products.map((p: any) => p.currentPrice);
  const avgPrice = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
  const priceVolatility = Math.sqrt(prices.reduce((sum: number, p: number) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length) / avgPrice;

  if (priceVolatility > 0.3) {
    insights.push({
      insightType: 'pattern',
      title: 'High Price Volatility',
      description: `Category shows high price volatility (${(priceVolatility * 100).toFixed(1)}%), indicating dynamic pricing opportunities`,
      confidence: 0.85,
      impact: 'high',
      actionable: true,
      data: { volatility: priceVolatility, avgPrice },
    });
  }

  // Sales performance analysis
  const totalSales = categoryData.products.reduce((sum: number, p: any) => sum + p.salesCount, 0);
  const avgSales = totalSales / categoryData.products.length;

  if (avgSales > 5) {
    insights.push({
      insightType: 'opportunity',
      title: 'High Sales Activity',
      description: `Category shows strong sales activity with ${avgSales.toFixed(1)} average sales per product`,
      confidence: 0.9,
      impact: 'high',
      actionable: true,
      data: { avgSales, totalSales },
    });
  }

  // Competition analysis
  const competitionLevel = categoryData.products.length > 50 ? 'high' : 
                          categoryData.products.length > 20 ? 'medium' : 'low';

  insights.push({
    insightType: 'trend',
    title: `${competitionLevel.charAt(0).toUpperCase() + competitionLevel.slice(1)} Competition Level`,
    description: `Category has ${categoryData.products.length} active products indicating ${competitionLevel} competition`,
    confidence: 0.95,
    impact: competitionLevel === 'high' ? 'high' : 'medium',
    actionable: true,
    data: { productCount: categoryData.products.length, competitionLevel },
  });

  return insights;
}

function calculateCategoryMetrics(categoryData: any) {
  const prices = categoryData.products.map((p: any) => p.currentPrice);
  const avgPrice = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
  const priceVolatility = Math.sqrt(prices.reduce((sum: number, p: number) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length) / avgPrice;

  return {
    totalProducts: categoryData.products.length,
    averagePrice: avgPrice,
    priceVolatility,
    competitionLevel: categoryData.products.length > 50 ? 'high' as const : 
                     categoryData.products.length > 20 ? 'medium' as const : 'low' as const,
    growthTrend: 0.15, // Mock data - would calculate from historical data
  };
}

async function findTopPerformers(categoryId: string) {
  // Use PageRank or similar algorithm to find top performers
  const cypher = `
    MATCH (p:Product)-[:BELONGS_TO]->(c:Category)
    WHERE c.categoryId = $categoryId
    RETURN p.listingId as productId,
           p.title as title,
           (p.views + p.watchers * 2) as performanceScore
    ORDER BY performanceScore DESC
    LIMIT 10
  `;

  const result = await neo4jClient.runQuery(cypher, { categoryId });

  return result.records.map(record => ({
    productId: record._fields[0],
    title: record._fields[1],
    performanceScore: record._fields[2] || 0,
    keyFactors: ['High visibility', 'Strong engagement'], // Mock data
  }));
}

function generateCategoryPricingRecommendations(categoryData: any, metrics: any) {
  const prices = categoryData.products.map((p: any) => p.currentPrice);
  const sortedPrices = prices.sort((a: number, b: number) => a - b);
  
  const q1 = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
  const q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];

  return {
    optimalPriceRange: {
      min: q1,
      max: q3,
    },
    seasonalAdjustments: [
      {
        period: 'Holiday Season',
        adjustment: 0.15,
        reasoning: 'Increased demand during holidays allows for premium pricing',
      },
      {
        period: 'Summer',
        adjustment: -0.05,
        reasoning: 'Lower activity period may require competitive pricing',
      },
    ],
    competitivePositioning: metrics.competitionLevel === 'high' 
      ? 'Focus on value differentiation rather than price competition'
      : 'Opportunity for premium positioning with limited competition',
  };
}
