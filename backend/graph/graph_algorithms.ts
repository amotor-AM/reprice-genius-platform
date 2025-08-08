import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { graphDB } from "./db";
import { neo4jClient } from "./neo4j_client";

export interface OptimizePriceRequest {
  productId: string;
  objective: 'maximize_revenue' | 'maximize_profit' | 'maximize_sales_velocity' | 'optimize_market_share';
  constraints?: {
    minPrice?: number;
    maxPrice?: number;
    maxPriceChange?: number; // percentage
    timeHorizon?: number; // days
    competitorResponse?: boolean;
  };
  marketConditions?: {
    demandElasticity?: number;
    seasonalFactor?: number;
    competitionIntensity?: number;
  };
}

export interface PriceOptimizationResult {
  currentPrice: number;
  recommendedPrice: number;
  expectedOutcome: {
    revenueChange: number;
    profitChange: number;
    salesVelocityChange: number;
    marketShareChange: number;
  };
  confidence: number;
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    factors: string[];
    mitigation: string[];
  };
  competitorImpact: Array<{
    competitorId: string;
    expectedResponse: number;
    responseTime: number; // days
    marketImpact: number;
  }>;
  algorithmDetails: {
    algorithm: string;
    iterations: number;
    convergence: number;
    factors: Record<string, number>;
  };
}

export interface MarketSimulationRequest {
  categoryId: string;
  priceChanges: Array<{
    productId: string;
    newPrice: number;
  }>;
  timeHorizon: number; // days
  includeCompetitorResponse?: boolean;
}

export interface MarketSimulationResult {
  simulationId: string;
  timeHorizon: number;
  results: Array<{
    day: number;
    marketState: {
      totalRevenue: number;
      averagePrice: number;
      salesVolume: number;
      competitionIndex: number;
    };
    productStates: Array<{
      productId: string;
      price: number;
      sales: number;
      marketShare: number;
      competitorResponses: number;
    }>;
  }>;
  insights: {
    optimalStrategy: string;
    riskFactors: string[];
    recommendations: string[];
  };
}

export interface InfluenceAnalysisRequest {
  productId: string;
  analysisType: 'price_influence' | 'market_influence' | 'network_centrality';
  scope?: 'category' | 'brand' | 'global';
}

export interface InfluenceAnalysisResult {
  productId: string;
  influenceScore: number;
  ranking: number;
  totalProducts: number;
  influenceFactors: {
    networkCentrality: number;
    marketShare: number;
    priceLeadership: number;
    brandStrength: number;
  };
  influencedProducts: Array<{
    productId: string;
    title: string;
    influenceStrength: number;
    responseTime: number;
  }>;
  recommendations: {
    leverageOpportunities: string[];
    riskMitigation: string[];
    strategicActions: string[];
  };
}

// Optimizes product pricing using graph algorithms and market analysis.
export const optimizePrice = api<OptimizePriceRequest, PriceOptimizationResult>(
  { auth: true, expose: true, method: "POST", path: "/graph/optimize/price" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get product node and current market position
      const productNode = await getProductNode(req.productId, auth.userID);
      
      // Run price optimization algorithm
      const optimizationResult = await runPriceOptimizationAlgorithm(
        productNode,
        req.objective,
        req.constraints,
        req.marketConditions
      );

      // Analyze competitor impact
      const competitorImpact = await analyzeCompetitorImpact(
        productNode,
        optimizationResult.recommendedPrice
      );

      // Calculate risk assessment
      const riskAssessment = await calculatePriceChangeRisk(
        productNode,
        optimizationResult.recommendedPrice,
        competitorImpact
      );

      return {
        currentPrice: productNode.properties.currentPrice,
        recommendedPrice: optimizationResult.recommendedPrice,
        expectedOutcome: optimizationResult.expectedOutcome,
        confidence: optimizationResult.confidence,
        riskAssessment,
        competitorImpact,
        algorithmDetails: optimizationResult.algorithmDetails,
      };
    } catch (error) {
      console.error('Error optimizing price:', error);
      throw APIError.internal("Failed to optimize price");
    }
  }
);

// Simulates market dynamics with price changes.
export const simulateMarket = api<MarketSimulationRequest, MarketSimulationResult>(
  { auth: true, expose: true, method: "POST", path: "/graph/simulate/market" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Initialize market simulation
      const simulationId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get initial market state
      const initialMarketState = await getMarketState(req.categoryId);
      
      // Run simulation over time horizon
      const simulationResults = await runMarketSimulation(
        req.categoryId,
        req.priceChanges,
        req.timeHorizon,
        req.includeCompetitorResponse || false,
        initialMarketState
      );

      // Generate insights from simulation
      const insights = generateSimulationInsights(simulationResults);

      return {
        simulationId,
        timeHorizon: req.timeHorizon,
        results: simulationResults,
        insights,
      };
    } catch (error) {
      console.error('Error simulating market:', error);
      throw APIError.internal("Failed to simulate market");
    }
  }
);

// Analyzes product influence in the market network.
export const analyzeInfluence = api<InfluenceAnalysisRequest, InfluenceAnalysisResult>(
  { auth: true, expose: true, method: "POST", path: "/graph/analyze/influence" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get product node
      const productNode = await getProductNode(req.productId, auth.userID);

      // Calculate influence metrics using graph algorithms
      const influenceMetrics = await calculateInfluenceMetrics(
        productNode,
        req.analysisType,
        req.scope || 'category'
      );

      // Find influenced products
      const influencedProducts = await findInfluencedProducts(productNode, req.scope);

      // Generate strategic recommendations
      const recommendations = generateInfluenceRecommendations(
        influenceMetrics,
        influencedProducts
      );

      return {
        productId: req.productId,
        influenceScore: influenceMetrics.overallScore,
        ranking: influenceMetrics.ranking,
        totalProducts: influenceMetrics.totalProducts,
        influenceFactors: influenceMetrics.factors,
        influencedProducts,
        recommendations,
      };
    } catch (error) {
      console.error('Error analyzing influence:', error);
      throw APIError.internal("Failed to analyze market influence");
    }
  }
);

async function getProductNode(productId: string, userId: string) {
  const node = await graphDB.queryRow`
    SELECT gn.*, l.user_id
    FROM graph_nodes gn
    JOIN listings l ON gn.properties->>'listingId' = l.id
    WHERE gn.node_type = 'product' 
      AND gn.properties->>'listingId' = ${productId}
      AND l.user_id = ${userId}
  `;

  if (!node) {
    throw APIError.notFound("Product not found or access denied");
  }

  return node;
}

async function runPriceOptimizationAlgorithm(
  productNode: any,
  objective: string,
  constraints?: any,
  marketConditions?: any
) {
  // Get competitor network for optimization context
  const competitorNetwork = await getCompetitorNetworkForOptimization(productNode.neo4j_id);
  
  // Define optimization parameters
  const currentPrice = productNode.properties.currentPrice;
  const minPrice = constraints?.minPrice || currentPrice * 0.7;
  const maxPrice = constraints?.maxPrice || currentPrice * 1.5;
  const maxChange = constraints?.maxPriceChange || 0.2; // 20%
  
  // Price bounds based on max change constraint
  const changeMinPrice = Math.max(minPrice, currentPrice * (1 - maxChange));
  const changeMaxPrice = Math.min(maxPrice, currentPrice * (1 + maxChange));

  // Run optimization algorithm (simplified genetic algorithm approach)
  const optimizationResult = await geneticAlgorithmOptimization({
    currentPrice,
    minPrice: changeMinPrice,
    maxPrice: changeMaxPrice,
    objective,
    competitorNetwork,
    marketConditions: marketConditions || {},
    iterations: 100,
  });

  return optimizationResult;
}

async function geneticAlgorithmOptimization(params: any) {
  const {
    currentPrice,
    minPrice,
    maxPrice,
    objective,
    competitorNetwork,
    marketConditions,
    iterations
  } = params;

  // Initialize population of price candidates
  const populationSize = 50;
  let population = [];
  
  for (let i = 0; i < populationSize; i++) {
    population.push({
      price: minPrice + Math.random() * (maxPrice - minPrice),
      fitness: 0,
    });
  }

  let bestSolution = { price: currentPrice, fitness: 0 };
  let convergenceHistory = [];

  // Evolution loop
  for (let generation = 0; generation < iterations; generation++) {
    // Evaluate fitness for each candidate
    for (let candidate of population) {
      candidate.fitness = await evaluatePriceFitness(
        candidate.price,
        currentPrice,
        objective,
        competitorNetwork,
        marketConditions
      );
      
      if (candidate.fitness > bestSolution.fitness) {
        bestSolution = { ...candidate };
      }
    }

    // Selection, crossover, and mutation
    population = evolvePopulation(population);
    convergenceHistory.push(bestSolution.fitness);

    // Early stopping if converged
    if (generation > 20 && 
        Math.abs(convergenceHistory[generation] - convergenceHistory[generation - 10]) < 0.001) {
      break;
    }
  }

  // Calculate expected outcomes
  const expectedOutcome = await calculateExpectedOutcome(
    bestSolution.price,
    currentPrice,
    objective,
    competitorNetwork,
    marketConditions
  );

  return {
    recommendedPrice: Math.round(bestSolution.price * 100) / 100,
    expectedOutcome,
    confidence: Math.min(0.95, bestSolution.fitness),
    algorithmDetails: {
      algorithm: 'Genetic Algorithm',
      iterations: convergenceHistory.length,
      convergence: convergenceHistory[convergenceHistory.length - 1],
      factors: {
        marketPosition: 0.3,
        competitorResponse: 0.25,
        demandElasticity: 0.2,
        profitMargin: 0.25,
      },
    },
  };
}

async function evaluatePriceFitness(
  candidatePrice: number,
  currentPrice: number,
  objective: string,
  competitorNetwork: any,
  marketConditions: any
): Promise<number> {
  // Calculate various metrics for the candidate price
  const priceChange = (candidatePrice - currentPrice) / currentPrice;
  
  // Demand response (simplified elasticity model)
  const demandElasticity = marketConditions.demandElasticity || -1.2;
  const demandChange = demandElasticity * priceChange;
  
  // Competitive response
  const competitiveAdvantage = calculateCompetitiveAdvantage(candidatePrice, competitorNetwork);
  
  // Revenue and profit calculations
  const revenueChange = priceChange + demandChange + (priceChange * demandChange);
  const profitMargin = 0.3; // Assumed 30% margin
  const profitChange = (candidatePrice * profitMargin - currentPrice * profitMargin) / (currentPrice * profitMargin);
  
  // Sales velocity impact
  const velocityChange = demandChange + competitiveAdvantage * 0.1;
  
  // Market share impact
  const marketShareChange = competitiveAdvantage + velocityChange * 0.2;

  // Objective-based fitness calculation
  let fitness = 0;
  switch (objective) {
    case 'maximize_revenue':
      fitness = revenueChange * 0.8 + competitiveAdvantage * 0.2;
      break;
    case 'maximize_profit':
      fitness = profitChange * 0.9 + competitiveAdvantage * 0.1;
      break;
    case 'maximize_sales_velocity':
      fitness = velocityChange * 0.7 + revenueChange * 0.3;
      break;
    case 'optimize_market_share':
      fitness = marketShareChange * 0.6 + revenueChange * 0.4;
      break;
    default:
      fitness = (revenueChange + profitChange + velocityChange) / 3;
  }

  // Apply penalties for extreme changes
  if (Math.abs(priceChange) > 0.15) {
    fitness *= 0.8; // Penalty for large price changes
  }

  return Math.max(0, fitness);
}

function calculateCompetitiveAdvantage(candidatePrice: number, competitorNetwork: any): number {
  if (!competitorNetwork || competitorNetwork.length === 0) {
    return 0;
  }

  const competitorPrices = competitorNetwork.map((c: any) => c.price);
  const avgCompetitorPrice = competitorPrices.reduce((sum: number, p: number) => sum + p, 0) / competitorPrices.length;
  
  // Advantage is higher when price is competitive but not too low
  const priceRatio = candidatePrice / avgCompetitorPrice;
  
  if (priceRatio < 0.8) return -0.2; // Too cheap, may signal low quality
  if (priceRatio < 0.95) return 0.3; // Good competitive advantage
  if (priceRatio < 1.05) return 0.1; // Neutral position
  if (priceRatio < 1.2) return -0.1; // Slightly expensive
  return -0.3; // Too expensive
}

function evolvePopulation(population: any[]): any[] {
  // Sort by fitness
  population.sort((a, b) => b.fitness - a.fitness);
  
  // Keep top 20% (elitism)
  const eliteSize = Math.floor(population.length * 0.2);
  const newPopulation = population.slice(0, eliteSize);
  
  // Generate offspring through crossover and mutation
  while (newPopulation.length < population.length) {
    // Tournament selection
    const parent1 = tournamentSelection(population);
    const parent2 = tournamentSelection(population);
    
    // Crossover
    const child = {
      price: (parent1.price + parent2.price) / 2,
      fitness: 0,
    };
    
    // Mutation (5% chance)
    if (Math.random() < 0.05) {
      const mutationRange = (parent1.price + parent2.price) * 0.1;
      child.price += (Math.random() - 0.5) * mutationRange;
    }
    
    newPopulation.push(child);
  }
  
  return newPopulation;
}

function tournamentSelection(population: any[], tournamentSize: number = 3): any {
  const tournament = [];
  for (let i = 0; i < tournamentSize; i++) {
    tournament.push(population[Math.floor(Math.random() * population.length)]);
  }
  return tournament.reduce((best, current) => current.fitness > best.fitness ? current : best);
}

async function calculateExpectedOutcome(
  recommendedPrice: number,
  currentPrice: number,
  objective: string,
  competitorNetwork: any,
  marketConditions: any
) {
  const priceChange = (recommendedPrice - currentPrice) / currentPrice;
  const demandElasticity = marketConditions.demandElasticity || -1.2;
  const demandChange = demandElasticity * priceChange;
  
  return {
    revenueChange: priceChange + demandChange + (priceChange * demandChange),
    profitChange: priceChange * 1.5, // Simplified profit impact
    salesVelocityChange: demandChange + calculateCompetitiveAdvantage(recommendedPrice, competitorNetwork) * 0.1,
    marketShareChange: calculateCompetitiveAdvantage(recommendedPrice, competitorNetwork) * 0.5,
  };
}

async function getCompetitorNetworkForOptimization(productNeo4jId: number) {
  const cypher = `
    MATCH (p:Product)-[:COMPETES_WITH]-(competitor:Product)
    WHERE id(p) = $productId
    RETURN competitor.currentPrice as price,
           competitor.listingId as id,
           competitor.views as views,
           competitor.watchers as watchers
    ORDER BY competitor.views DESC
    LIMIT 10
  `;

  const result = await neo4jClient.runQuery(cypher, { productId: productNeo4jId });
  return result.records.map(record => ({
    id: record._fields[1],
    price: record._fields[0],
    views: record._fields[2] || 0,
    watchers: record._fields[3] || 0,
  }));
}

async function analyzeCompetitorImpact(productNode: any, recommendedPrice: number) {
  // Get competitor network
  const competitors = await getCompetitorNetworkForOptimization(productNode.neo4j_id);
  
  return competitors.map(competitor => {
    const priceRatio = recommendedPrice / competitor.price;
    let expectedResponse = 0;
    let responseTime = 7; // Default 7 days
    
    // Model competitor response based on price ratio
    if (priceRatio < 0.9) {
      expectedResponse = -0.05; // Competitor may lower price
      responseTime = 3;
    } else if (priceRatio > 1.1) {
      expectedResponse = 0.03; // Competitor may raise price
      responseTime = 5;
    }
    
    return {
      competitorId: competitor.id,
      expectedResponse,
      responseTime,
      marketImpact: Math.abs(expectedResponse) * (competitor.views / 1000), // Impact based on competitor visibility
    };
  });
}

async function calculatePriceChangeRisk(productNode: any, recommendedPrice: number, competitorImpact: any[]) {
  const currentPrice = productNode.properties.currentPrice;
  const priceChange = Math.abs((recommendedPrice - currentPrice) / currentPrice);
  
  const factors = [];
  const mitigation = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  
  // Price change magnitude risk
  if (priceChange > 0.15) {
    factors.push('Large price change may shock market');
    mitigation.push('Consider gradual price adjustment');
    riskLevel = 'high';
  } else if (priceChange > 0.08) {
    factors.push('Moderate price change requires monitoring');
    mitigation.push('Monitor competitor responses closely');
    riskLevel = 'medium';
  }
  
  // Competitor response risk
  const strongResponses = competitorImpact.filter(c => Math.abs(c.expectedResponse) > 0.03);
  if (strongResponses.length > 2) {
    factors.push('Multiple competitors likely to respond');
    mitigation.push('Prepare counter-strategies for competitor responses');
    riskLevel = 'high';
  }
  
  // Market position risk
  const views = productNode.properties.views || 0;
  if (views > 1000) {
    factors.push('High visibility product - changes will be noticed');
    mitigation.push('Communicate value proposition clearly');
  }
  
  return {
    riskLevel,
    factors,
    mitigation,
  };
}

async function getMarketState(categoryId: string) {
  const cypher = `
    MATCH (p:Product)-[:BELONGS_TO]->(c:Category)
    WHERE c.categoryId = $categoryId
    RETURN count(p) as totalProducts,
           avg(p.currentPrice) as avgPrice,
           sum(p.views) as totalViews,
           sum(p.watchers) as totalWatchers
  `;

  const result = await neo4jClient.runQuery(cypher, { categoryId });
  const record = result.records[0];

  return {
    totalProducts: record._fields[0] || 0,
    averagePrice: record._fields[1] || 0,
    totalViews: record._fields[2] || 0,
    totalWatchers: record._fields[3] || 0,
    salesVolume: 100, // Mock data
    competitionIndex: 0.5, // Mock data
  };
}

async function runMarketSimulation(
  categoryId: string,
  priceChanges: any[],
  timeHorizon: number,
  includeCompetitorResponse: boolean,
  initialState: any
) {
  const results = [];
  let currentState = { ...initialState };

  for (let day = 0; day <= timeHorizon; day++) {
    // Apply price changes on day 0
    if (day === 0) {
      // Apply initial price changes
      for (const change of priceChanges) {
        // Update product price in simulation
        currentState.averagePrice = (currentState.averagePrice * currentState.totalProducts + 
                                   (change.newPrice - 100)) / currentState.totalProducts; // Simplified
      }
    }

    // Simulate competitor responses
    if (includeCompetitorResponse && day > 0 && day <= 7) {
      // Simulate gradual competitor responses
      const responseIntensity = Math.exp(-day / 3); // Exponential decay
      currentState.averagePrice *= (1 + responseIntensity * 0.02); // Small price adjustments
    }

    // Simulate market dynamics
    const demandEffect = Math.sin(day / 7) * 0.1; // Weekly demand cycle
    currentState.salesVolume = initialState.salesVolume * (1 + demandEffect);
    currentState.totalRevenue = currentState.averagePrice * currentState.salesVolume;

    // Create product states (simplified)
    const productStates = priceChanges.map(change => ({
      productId: change.productId,
      price: change.newPrice * (1 + Math.random() * 0.02 - 0.01), // Small random variation
      sales: Math.floor(Math.random() * 10) + 1,
      marketShare: 0.1 + Math.random() * 0.1,
      competitorResponses: includeCompetitorResponse ? Math.floor(Math.random() * 3) : 0,
    }));

    results.push({
      day,
      marketState: { ...currentState },
      productStates,
    });
  }

  return results;
}

function generateSimulationInsights(simulationResults: any[]) {
  const finalState = simulationResults[simulationResults.length - 1];
  const initialState = simulationResults[0];
  
  const revenueChange = (finalState.marketState.totalRevenue - initialState.marketState.totalRevenue) / 
                       initialState.marketState.totalRevenue;

  return {
    optimalStrategy: revenueChange > 0.05 ? 'Aggressive pricing strategy recommended' : 
                    revenueChange < -0.05 ? 'Conservative pricing strategy recommended' :
                    'Maintain current pricing strategy',
    riskFactors: [
      'Competitor response uncertainty',
      'Market demand volatility',
      'Seasonal effects not modeled',
    ],
    recommendations: [
      'Monitor competitor responses in first week',
      'Adjust strategy based on early market feedback',
      'Consider A/B testing with subset of products',
    ],
  };
}

async function calculateInfluenceMetrics(productNode: any, analysisType: string, scope: string) {
  // Use centrality algorithms to calculate influence
  const centralityResults = await neo4jClient.calculateCentrality('Product', 'COMPETES_WITH', 'betweenness');
  
  const productInfluence = centralityResults.find(result => 
    result.nodeId === productNode.neo4j_id.toString()
  );

  const ranking = centralityResults.findIndex(result => 
    result.nodeId === productNode.neo4j_id.toString()
  ) + 1;

  return {
    overallScore: productInfluence?.score || 0,
    ranking,
    totalProducts: centralityResults.length,
    factors: {
      networkCentrality: productInfluence?.score || 0,
      marketShare: 0.15, // Mock data
      priceLeadership: 0.8, // Mock data
      brandStrength: 0.6, // Mock data
    },
  };
}

async function findInfluencedProducts(productNode: any, scope?: string) {
  const cypher = `
    MATCH (p:Product)-[r:COMPETES_WITH|SIMILAR_TO]-(influenced:Product)
    WHERE id(p) = $productId
    RETURN influenced.listingId as productId,
           influenced.title as title,
           r.strength as influenceStrength,
           3 + floor(rand() * 5) as responseTime
    ORDER BY r.strength DESC
    LIMIT 10
  `;

  const result = await neo4jClient.runQuery(cypher, { productId: productNode.neo4j_id });
  
  return result.records.map(record => ({
    productId: record._fields[0],
    title: record._fields[1],
    influenceStrength: record._fields[2] || 0.5,
    responseTime: record._fields[3],
  }));
}

function generateInfluenceRecommendations(influenceMetrics: any, influencedProducts: any[]) {
  const recommendations = {
    leverageOpportunities: [] as string[],
    riskMitigation: [] as string[],
    strategicActions: [] as string[],
  };

  if (influenceMetrics.overallScore > 0.7) {
    recommendations.leverageOpportunities.push('High influence - consider price leadership strategy');
    recommendations.strategicActions.push('Use influence to set market pricing trends');
  } else if (influenceMetrics.overallScore < 0.3) {
    recommendations.riskMitigation.push('Low influence - avoid aggressive pricing moves');
    recommendations.strategicActions.push('Focus on building market presence before major changes');
  }

  if (influencedProducts.length > 5) {
    recommendations.leverageOpportunities.push('Large network of influenced products');
    recommendations.strategicActions.push('Coordinate pricing strategy across influenced network');
  }

  return recommendations;
}
