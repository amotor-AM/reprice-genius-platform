import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { strategyDB } from "./db";
import { listingsDB } from "../listings/db";
import { ml } from "~encore/clients";
import { graph } from "~encore/clients";

export interface PricingStrategy {
  id: string;
  name: string;
  description: string;
  strategyType: string;
  config: StrategyConfig;
  isActive: boolean;
}

export interface StrategyConfig {
  priceAdjustmentMethod: 'percentage' | 'fixed' | 'dynamic';
  targetMetric: 'revenue' | 'profit' | 'volume' | 'market_share';
  aggressiveness: number; // 0-1 scale
  constraints: {
    minPriceChange?: number;
    maxPriceChange?: number;
    minPrice?: number;
    maxPrice?: number;
    profitMarginThreshold?: number;
  };
  conditions: {
    marketConditions?: string[];
    competitorBehavior?: string[];
    demandLevel?: string[];
    seasonalFactors?: string[];
  };
}

export interface StrategyEvaluation {
  strategyId: string;
  strategyName: string;
  predictedOutcome: {
    priceChange: number;
    revenueImpact: number;
    profitImpact: number;
    volumeImpact: number;
    marketShareImpact: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  confidence: number;
  reasoning: string[];
  marketAlignment: number;
  competitiveAdvantage: number;
}

export interface EvaluateStrategiesRequest {
  listingId: string;
  marketConditions?: {
    demandLevel?: string;
    competitionLevel?: string;
    seasonalFactor?: number;
    priceElasticity?: number;
  };
  customStrategies?: string[];
}

export interface EvaluateStrategiesResponse {
  listingId: string;
  evaluations: StrategyEvaluation[];
  marketContext: {
    currentPrice: number;
    competitorPrices: number[];
    demandSignals: any;
    marketTrend: string;
  };
  recommendedStrategy: string;
  evaluationTime: number;
}

// Evaluates multiple pricing strategies for a specific product.
export const evaluateStrategies = api<EvaluateStrategiesRequest, EvaluateStrategiesResponse>(
  { auth: true, expose: true, method: "POST", path: "/strategy/evaluate" },
  async (req) => {
    const auth = getAuthData()!;
    const startTime = Date.now();

    try {
      // Verify listing ownership
      const listing = await listingsDB.queryRow`
        SELECT * FROM products WHERE id = ${req.listingId} AND user_id = ${auth.userID}
      `;

      if (!listing) {
        throw APIError.notFound("Listing not found");
      }

      // Get market context
      const marketContext = await getMarketContext(req.listingId, req.marketConditions);

      // Get available strategies
      const strategies = await getAvailableStrategies(auth.userID, req.customStrategies);

      // Evaluate each strategy
      const evaluations: StrategyEvaluation[] = [];
      
      for (const strategy of strategies) {
        const evaluation = await evaluateStrategy(
          strategy,
          listing,
          marketContext,
          req.marketConditions
        );
        evaluations.push(evaluation);
      }

      // Sort by confidence and predicted outcome
      evaluations.sort((a, b) => {
        const scoreA = a.confidence * (1 + a.predictedOutcome.revenueImpact);
        const scoreB = b.confidence * (1 + b.predictedOutcome.revenueImpact);
        return scoreB - scoreA;
      });

      // Store evaluations
      for (const evaluation of evaluations) {
        await strategyDB.exec`
          INSERT INTO strategy_evaluations (
            listing_id, strategy_id, evaluation_data, predicted_outcome, 
            confidence_score, market_conditions
          ) VALUES (
            ${req.listingId}, ${evaluation.strategyId}, 
            ${JSON.stringify(evaluation)}, ${JSON.stringify(evaluation.predictedOutcome)},
            ${evaluation.confidence}, ${JSON.stringify(req.marketConditions || {})}
          )
        `;
      }

      const evaluationTime = Date.now() - startTime;

      return {
        listingId: req.listingId,
        evaluations,
        marketContext,
        recommendedStrategy: evaluations[0]?.strategyId || '',
        evaluationTime,
      };
    } catch (error) {
      console.error('Error evaluating strategies:', error);
      throw APIError.internal("Failed to evaluate pricing strategies");
    }
  }
);

async function getMarketContext(listingId: string, marketConditions?: any) {
  // Get listing details
  const listing = await listingsDB.queryRow`
    SELECT * FROM products WHERE id = ${listingId}
  `;

  const marketplaceListing = await listingsDB.queryRow`
    SELECT * FROM marketplace_listings WHERE product_id = ${listingId} ORDER BY created_at DESC LIMIT 1
  `;

  // Get competitor prices
  const competitors = await listingsDB.queryAll`
    SELECT ml.current_price FROM marketplace_listings ml
    JOIN products p ON ml.product_id = p.id
    WHERE p.category_id = ${listing.category_id}
      AND p.id != ${listingId}
      AND ml.status = 'active'
    ORDER BY ml.created_at DESC
    LIMIT 10
  `;

  // Get demand signals from ML service
  let demandSignals = {};
  try {
    const demandResponse = await ml.getDemand({ productId: listingId });
    demandSignals = demandResponse;
  } catch (error) {
    console.error('Error getting demand signals:', error);
  }

  return {
    currentPrice: marketplaceListing.current_price,
    competitorPrices: competitors.map(c => c.current_price),
    demandSignals,
    marketTrend: marketConditions?.demandLevel || 'stable',
  };
}

async function getAvailableStrategies(userId: string, customStrategyIds?: string[]): Promise<PricingStrategy[]> {
  const strategies: PricingStrategy[] = [];

  // Get built-in strategies
  const builtInStrategies = await strategyDB.queryAll`
    SELECT * FROM pricing_strategies WHERE is_active = true
  `;

  strategies.push(...builtInStrategies.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    strategyType: s.strategy_type,
    config: s.config,
    isActive: s.is_active,
  })));

  // Get custom strategies
  let customQuery = `
    SELECT * FROM custom_strategies 
    WHERE user_id = ${userId} AND is_active = true
  `;
  
  if (customStrategyIds && customStrategyIds.length > 0) {
    customQuery += ` AND id = ANY(${customStrategyIds})`;
  }

  const customStrategies = await strategyDB.rawQueryAll(customQuery);

  strategies.push(...customStrategies.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    strategyType: s.base_strategy_type,
    config: {
      ...s.custom_rules,
      conditions: s.conditions,
      constraints: s.constraints,
    },
    isActive: s.is_active,
  })));

  return strategies;
}

async function evaluateStrategy(
  strategy: PricingStrategy,
  listing: any,
  marketContext: any,
  marketConditions?: any
): Promise<StrategyEvaluation> {
  const currentPrice = marketContext.currentPrice;
  let predictedPrice = currentPrice;
  let confidence = 0.7; // Base confidence

  // Apply strategy-specific logic
  switch (strategy.strategyType) {
    case 'competitive_matching':
      predictedPrice = await evaluateCompetitiveMatching(strategy, listing, marketContext);
      confidence = 0.85;
      break;
    case 'profit_maximization':
      predictedPrice = await evaluateProfitMaximization(strategy, listing, marketContext);
      confidence = 0.75;
      break;
    case 'volume_optimization':
      predictedPrice = await evaluateVolumeOptimization(strategy, listing, marketContext);
      confidence = 0.8;
      break;
    case 'penetration_pricing':
      predictedPrice = await evaluatePenetrationPricing(strategy, listing, marketContext);
      confidence = 0.7;
      break;
    case 'dynamic_demand':
      predictedPrice = await evaluateDynamicDemand(strategy, listing, marketContext);
      confidence = 0.9;
      break;
    default:
      predictedPrice = await evaluateCustomStrategy(strategy, listing, marketContext);
      confidence = 0.65;
  }

  // Apply constraints
  if (strategy.config.constraints.minPrice) {
    predictedPrice = Math.max(predictedPrice, strategy.config.constraints.minPrice);
  }
  if (strategy.config.constraints.maxPrice) {
    predictedPrice = Math.min(predictedPrice, strategy.config.constraints.maxPrice);
  }

  // Calculate impacts
  const priceChange = predictedPrice - currentPrice;
  const priceChangePercent = priceChange / currentPrice;

  // Estimate impacts (simplified model)
  const demandElasticity = marketConditions?.priceElasticity || -1.2;
  const volumeImpact = demandElasticity * priceChangePercent;
  const revenueImpact = priceChangePercent + volumeImpact + (priceChangePercent * volumeImpact);
  const profitImpact = revenueImpact * 1.5; // Simplified profit calculation

  // Calculate market alignment and competitive advantage
  const marketAlignment = calculateMarketAlignment(predictedPrice, marketContext);
  const competitiveAdvantage = calculateCompetitiveAdvantage(predictedPrice, marketContext);

  // Generate reasoning
  const reasoning = generateStrategyReasoning(strategy, priceChange, marketContext);

  // Determine risk level
  const riskLevel = Math.abs(priceChangePercent) > 0.15 ? 'high' : 
                   Math.abs(priceChangePercent) > 0.08 ? 'medium' : 'low';

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    predictedOutcome: {
      priceChange,
      revenueImpact,
      profitImpact,
      volumeImpact,
      marketShareImpact: competitiveAdvantage * 0.5,
      riskLevel,
    },
    confidence,
    reasoning,
    marketAlignment,
    competitiveAdvantage,
  };
}

async function evaluateCompetitiveMatching(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  const competitorPrices = marketContext.competitorPrices;
  if (competitorPrices.length === 0) return marketContext.currentPrice;

  const avgCompetitorPrice = competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length;
  const aggressiveness = strategy.config.aggressiveness || 0.5;

  // Match competitor price with slight adjustment based on aggressiveness
  const adjustment = (aggressiveness - 0.5) * 0.1; // -5% to +5% adjustment
  return avgCompetitorPrice * (1 + adjustment);
}

async function evaluateProfitMaximization(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  const currentPrice = marketContext.currentPrice;
  const targetMargin = strategy.config.constraints?.profitMarginThreshold || 0.3;
  const aggressiveness = strategy.config.aggressiveness || 0.5;

  // Estimate optimal price for profit maximization
  const demandSensitivity = marketContext.demandSignals?.demandTrend === 'rising' ? 0.8 : 1.2;
  const priceMultiplier = 1 + (aggressiveness * 0.2 * demandSensitivity);
  
  return currentPrice * priceMultiplier;
}

async function evaluateVolumeOptimization(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  const currentPrice = marketContext.currentPrice;
  const aggressiveness = strategy.config.aggressiveness || 0.5;
  const competitorPrices = marketContext.competitorPrices;

  if (competitorPrices.length === 0) {
    // No competitors, reduce price to stimulate volume
    return currentPrice * (1 - aggressiveness * 0.15);
  }

  const minCompetitorPrice = Math.min(...competitorPrices);
  const discountFactor = aggressiveness * 0.1; // Up to 10% below minimum competitor
  
  return minCompetitorPrice * (1 - discountFactor);
}

async function evaluatePenetrationPricing(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  const currentPrice = marketContext.currentPrice;
  const aggressiveness = strategy.config.aggressiveness || 0.5;
  const competitorPrices = marketContext.competitorPrices;

  if (competitorPrices.length === 0) {
    // No competitors, aggressive pricing to gain market share
    return currentPrice * (1 - aggressiveness * 0.25);
  }

  const avgCompetitorPrice = competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length;
  const penetrationDiscount = aggressiveness * 0.2; // Up to 20% below average
  
  return avgCompetitorPrice * (1 - penetrationDiscount);
}

async function evaluateDynamicDemand(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  const currentPrice = marketContext.currentPrice;
  const demandSignals = marketContext.demandSignals;
  const aggressiveness = strategy.config.aggressiveness || 0.5;

  // Base adjustment on demand signals
  let demandMultiplier = 1.0;
  
  if (demandSignals.demandTrend === 'rising') {
    demandMultiplier = 1 + (aggressiveness * 0.15);
  } else if (demandSignals.demandTrend === 'declining') {
    demandMultiplier = 1 - (aggressiveness * 0.1);
  }

  // Factor in search volume and seasonal factors
  if (demandSignals.searchVolume > 1500) {
    demandMultiplier *= 1.05;
  }
  
  if (demandSignals.seasonalFactor > 1.1) {
    demandMultiplier *= 1.03;
  }

  return currentPrice * demandMultiplier;
}

async function evaluateCustomStrategy(strategy: PricingStrategy, listing: any, marketContext: any): Promise<number> {
  // For custom strategies, apply the custom rules
  const currentPrice = marketContext.currentPrice;
  const customRules = strategy.config;
  
  let adjustedPrice = currentPrice;
  
  // Apply percentage adjustment if specified
  if (customRules.priceAdjustmentMethod === 'percentage' && customRules.aggressiveness) {
    const adjustment = (customRules.aggressiveness - 0.5) * 0.2; // -10% to +10%
    adjustedPrice = currentPrice * (1 + adjustment);
  }
  
  // Apply fixed adjustment if specified
  if (customRules.priceAdjustmentMethod === 'fixed' && customRules.constraints?.minPriceChange) {
    adjustedPrice = currentPrice + customRules.constraints.minPriceChange;
  }
  
  return adjustedPrice;
}

function calculateMarketAlignment(predictedPrice: number, marketContext: any): number {
  const competitorPrices = marketContext.competitorPrices;
  if (competitorPrices.length === 0) return 0.5;

  const avgPrice = competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length;
  const priceRatio = predictedPrice / avgPrice;
  
  // Alignment is highest when price is close to market average
  if (priceRatio >= 0.9 && priceRatio <= 1.1) return 1.0;
  if (priceRatio >= 0.8 && priceRatio <= 1.2) return 0.8;
  if (priceRatio >= 0.7 && priceRatio <= 1.3) return 0.6;
  return 0.4;
}

function calculateCompetitiveAdvantage(predictedPrice: number, marketContext: any): number {
  const competitorPrices = marketContext.competitorPrices;
  if (competitorPrices.length === 0) return 0.5;

  const avgPrice = competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length;
  const priceRatio = predictedPrice / avgPrice;
  
  // Advantage is higher when price is competitive (lower) but not too low
  if (priceRatio < 0.7) return 0.3; // Too cheap, may signal low quality
  if (priceRatio < 0.9) return 0.9; // Good competitive advantage
  if (priceRatio < 1.0) return 0.7; // Slight advantage
  if (priceRatio < 1.1) return 0.5; // Neutral
  return 0.2; // Disadvantage
}

function generateStrategyReasoning(strategy: PricingStrategy, priceChange: number, marketContext: any): string[] {
  const reasoning: string[] = [];
  
  reasoning.push(`Applied ${strategy.name} strategy`);
  
  if (priceChange > 0) {
    reasoning.push(`Price increase of $${priceChange.toFixed(2)} to capitalize on market conditions`);
  } else if (priceChange < 0) {
    reasoning.push(`Price reduction of $${Math.abs(priceChange).toFixed(2)} to improve competitiveness`);
  } else {
    reasoning.push('Current price is optimal for this strategy');
  }
  
  if (marketContext.competitorPrices.length > 0) {
    const avgCompetitorPrice = marketContext.competitorPrices.reduce((sum: number, price: number) => sum + price, 0) / marketContext.competitorPrices.length;
    reasoning.push(`Competitor average: $${avgCompetitorPrice.toFixed(2)}`);
  }
  
  if (marketContext.demandSignals?.demandTrend) {
    reasoning.push(`Market demand is ${marketContext.demandSignals.demandTrend}`);
  }
  
  return reasoning;
}
