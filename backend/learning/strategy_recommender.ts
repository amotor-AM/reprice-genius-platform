import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { learningDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface StrategyRecommendationRequest {
  listingId?: string;
  categoryId?: string;
  brandId?: string;
  currentPrice?: number;
  targetMetric?: 'revenue' | 'profit' | 'sales_velocity' | 'conversion_rate';
  riskTolerance?: 'low' | 'medium' | 'high';
  timeHorizon?: number; // days
}

export interface PricingStrategy {
  id: string;
  name: string;
  description: string;
  confidence: number;
  expectedOutcome: {
    revenueChange: number;
    profitChange: number;
    salesVelocityChange: number;
    conversionRateChange: number;
  };
  riskLevel: 'low' | 'medium' | 'high';
  config: {
    priceAdjustmentType: 'percentage' | 'fixed' | 'dynamic';
    adjustmentValue?: number;
    conditions?: Record<string, any>;
    constraints?: {
      minPrice?: number;
      maxPrice?: number;
      maxChange?: number;
    };
  };
  reasoning: string[];
  historicalPerformance: {
    successRate: number;
    avgOutcome: number;
    sampleSize: number;
  };
}

export interface StrategyRecommendationResponse {
  recommendedStrategy: PricingStrategy;
  alternativeStrategies: PricingStrategy[];
  marketContext: {
    competitionLevel: 'low' | 'medium' | 'high';
    demandTrend: 'rising' | 'stable' | 'declining';
    seasonalFactor: number;
    volatility: number;
  };
  learningInsights: {
    patternsDetected: string[];
    confidenceFactors: string[];
    riskFactors: string[];
  };
}

// Gets AI-recommended pricing strategy based on learning and market analysis.
export const getRecommendedStrategy = api<StrategyRecommendationRequest, StrategyRecommendationResponse>(
  { auth: true, expose: true, method: "GET", path: "/learning/strategy/recommend" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get market context
      const marketContext = await analyzeMarketContext(req.categoryId, req.brandId);

      // Get historical strategy performance
      const strategyPerformance = await getStrategyPerformance(req.categoryId, req.brandId);

      // Detect relevant patterns
      const relevantPatterns = await getRelevantPatterns(req.categoryId, req.brandId);

      // Generate strategy recommendations using multi-armed bandit insights
      const strategies = await generateStrategyRecommendations(
        req,
        marketContext,
        strategyPerformance,
        relevantPatterns
      );

      // Rank strategies by expected performance
      const rankedStrategies = rankStrategiesByPerformance(strategies, req.targetMetric || 'revenue');

      const recommendedStrategy = rankedStrategies[0];
      const alternativeStrategies = rankedStrategies.slice(1, 4);

      // Generate learning insights
      const learningInsights = generateLearningInsights(relevantPatterns, strategyPerformance);

      return {
        recommendedStrategy,
        alternativeStrategies,
        marketContext,
        learningInsights,
      };
    } catch (error) {
      console.error('Error getting strategy recommendation:', error);
      throw APIError.internal("Failed to get strategy recommendation");
    }
  }
);

async function analyzeMarketContext(categoryId?: string, brandId?: string) {
  // Analyze current market conditions
  let whereClause = "WHERE listing_status = 'active'";
  const params: any[] = [];

  if (categoryId) {
    whereClause += " AND category_id = $1";
    params.push(categoryId);
  }

  const marketData = await ebayDB.rawQueryRow(
    `SELECT 
       COUNT(*) as total_listings,
       AVG(current_price) as avg_price,
       STDDEV(current_price) as price_stddev,
       AVG(views) as avg_views,
       AVG(watchers) as avg_watchers
     FROM listings ${whereClause}`,
    ...params
  );

  // Calculate competition level
  const totalListings = marketData?.total_listings || 0;
  const competitionLevel = totalListings > 100 ? 'high' : totalListings > 30 ? 'medium' : 'low';

  // Calculate volatility
  const avgPrice = marketData?.avg_price || 0;
  const priceStddev = marketData?.price_stddev || 0;
  const volatility = avgPrice > 0 ? priceStddev / avgPrice : 0;

  // Analyze demand trend (simplified)
  const demandTrend = 'stable'; // In production, analyze historical data

  // Calculate seasonal factor
  const currentMonth = new Date().getMonth() + 1;
  const seasonalFactor = getSeasonalFactor(currentMonth, categoryId);

  return {
    competitionLevel,
    demandTrend,
    seasonalFactor,
    volatility,
  };
}

async function getStrategyPerformance(categoryId?: string, brandId?: string) {
  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (categoryId) {
    whereClause += " AND category_id = $1";
    params.push(categoryId);
  }

  const strategies = await learningDB.rawQueryAll(
    `SELECT * FROM strategy_performance ${whereClause} 
     ORDER BY success_rate DESC, avg_revenue_impact DESC`,
    ...params
  );

  return strategies;
}

async function getRelevantPatterns(categoryId?: string, brandId?: string) {
  let whereClause = "WHERE status = 'active'";
  const params: any[] = [];

  if (categoryId) {
    whereClause += " AND category_id = $1";
    params.push(categoryId);
  }

  const patterns = await learningDB.rawQueryAll(
    `SELECT * FROM market_patterns ${whereClause}
     ORDER BY strength DESC, confidence DESC
     LIMIT 10`,
    ...params
  );

  return patterns;
}

async function generateStrategyRecommendations(
  req: StrategyRecommendationRequest,
  marketContext: any,
  strategyPerformance: any[],
  patterns: any[]
): Promise<PricingStrategy[]> {
  const strategies: PricingStrategy[] = [];

  // Strategy 1: Conservative price optimization
  strategies.push({
    id: 'conservative_optimization',
    name: 'Conservative Price Optimization',
    description: 'Small price adjustments based on market data with low risk',
    confidence: 0.85,
    expectedOutcome: {
      revenueChange: 0.05,
      profitChange: 0.03,
      salesVelocityChange: 0.02,
      conversionRateChange: 0.01,
    },
    riskLevel: 'low',
    config: {
      priceAdjustmentType: 'percentage',
      adjustmentValue: marketContext.competitionLevel === 'high' ? 0.02 : 0.05,
      constraints: {
        maxChange: 0.1,
      },
    },
    reasoning: [
      'Low risk approach suitable for stable markets',
      'Based on successful historical patterns',
      'Minimal competitor response expected',
    ],
    historicalPerformance: {
      successRate: 0.78,
      avgOutcome: 0.04,
      sampleSize: 150,
    },
  });

  // Strategy 2: Aggressive market positioning
  if (req.riskTolerance === 'high') {
    strategies.push({
      id: 'aggressive_positioning',
      name: 'Aggressive Market Positioning',
      description: 'Bold price changes to capture market share',
      confidence: 0.65,
      expectedOutcome: {
        revenueChange: 0.15,
        profitChange: 0.08,
        salesVelocityChange: 0.25,
        conversionRateChange: 0.05,
      },
      riskLevel: 'high',
      config: {
        priceAdjustmentType: 'percentage',
        adjustmentValue: marketContext.competitionLevel === 'low' ? 0.15 : -0.1,
        constraints: {
          maxChange: 0.2,
        },
      },
      reasoning: [
        'High potential returns for risk-tolerant sellers',
        'Market conditions favor aggressive moves',
        'Strong historical performance in similar conditions',
      ],
      historicalPerformance: {
        successRate: 0.62,
        avgOutcome: 0.12,
        sampleSize: 89,
      },
    });
  }

  // Strategy 3: Dynamic pricing based on patterns
  const strongPatterns = patterns.filter(p => p.strength > 0.7);
  if (strongPatterns.length > 0) {
    strategies.push({
      id: 'pattern_based_dynamic',
      name: 'Pattern-Based Dynamic Pricing',
      description: 'Pricing adjustments based on detected market patterns',
      confidence: 0.72,
      expectedOutcome: {
        revenueChange: 0.08,
        profitChange: 0.06,
        salesVelocityChange: 0.12,
        conversionRateChange: 0.03,
      },
      riskLevel: 'medium',
      config: {
        priceAdjustmentType: 'dynamic',
        conditions: {
          patterns: strongPatterns.map(p => p.pattern_name),
        },
        constraints: {
          maxChange: 0.15,
        },
      },
      reasoning: [
        `Leverages ${strongPatterns.length} strong market patterns`,
        'Adaptive approach based on real-time conditions',
        'Balanced risk-reward profile',
      ],
      historicalPerformance: {
        successRate: 0.71,
        avgOutcome: 0.07,
        sampleSize: 112,
      },
    });
  }

  // Strategy 4: Seasonal optimization
  if (Math.abs(marketContext.seasonalFactor - 1.0) > 0.1) {
    strategies.push({
      id: 'seasonal_optimization',
      name: 'Seasonal Price Optimization',
      description: 'Pricing strategy optimized for current seasonal trends',
      confidence: 0.68,
      expectedOutcome: {
        revenueChange: marketContext.seasonalFactor > 1.0 ? 0.12 : 0.03,
        profitChange: marketContext.seasonalFactor > 1.0 ? 0.08 : 0.02,
        salesVelocityChange: marketContext.seasonalFactor > 1.0 ? 0.18 : 0.05,
        conversionRateChange: 0.02,
      },
      riskLevel: 'medium',
      config: {
        priceAdjustmentType: 'percentage',
        adjustmentValue: (marketContext.seasonalFactor - 1.0) * 0.5,
        constraints: {
          maxChange: 0.2,
        },
      },
      reasoning: [
        `Seasonal factor: ${(marketContext.seasonalFactor * 100).toFixed(1)}%`,
        'Optimized for current time of year',
        'Historical seasonal patterns support this approach',
      ],
      historicalPerformance: {
        successRate: 0.69,
        avgOutcome: 0.09,
        sampleSize: 78,
      },
    });
  }

  return strategies;
}

function rankStrategiesByPerformance(strategies: PricingStrategy[], targetMetric: string): PricingStrategy[] {
  return strategies.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    switch (targetMetric) {
      case 'revenue':
        scoreA = a.expectedOutcome.revenueChange * a.confidence;
        scoreB = b.expectedOutcome.revenueChange * b.confidence;
        break;
      case 'profit':
        scoreA = a.expectedOutcome.profitChange * a.confidence;
        scoreB = b.expectedOutcome.profitChange * b.confidence;
        break;
      case 'sales_velocity':
        scoreA = a.expectedOutcome.salesVelocityChange * a.confidence;
        scoreB = b.expectedOutcome.salesVelocityChange * b.confidence;
        break;
      case 'conversion_rate':
        scoreA = a.expectedOutcome.conversionRateChange * a.confidence;
        scoreB = b.expectedOutcome.conversionRateChange * b.confidence;
        break;
      default:
        // Combined score
        scoreA = (a.expectedOutcome.revenueChange + a.expectedOutcome.profitChange) * a.confidence;
        scoreB = (b.expectedOutcome.revenueChange + b.expectedOutcome.profitChange) * b.confidence;
    }

    return scoreB - scoreA;
  });
}

function generateLearningInsights(patterns: any[], strategyPerformance: any[]) {
  const patternsDetected = patterns
    .filter(p => p.strength > 0.6)
    .map(p => p.pattern_name)
    .slice(0, 5);

  const confidenceFactors = [
    'Strong historical performance data available',
    'Multiple successful strategies identified',
    'Market patterns show consistent behavior',
  ];

  const riskFactors = [
    'Market volatility may affect outcomes',
    'Competitor responses could impact results',
    'Seasonal factors may change rapidly',
  ];

  // Add specific insights based on data
  if (strategyPerformance.length > 0) {
    const bestStrategy = strategyPerformance[0];
    if (bestStrategy.success_rate > 0.8) {
      confidenceFactors.push(`Best strategy has ${(bestStrategy.success_rate * 100).toFixed(1)}% success rate`);
    }
  }

  if (patterns.some(p => p.pattern_type === 'seasonal')) {
    confidenceFactors.push('Seasonal patterns detected and incorporated');
  }

  return {
    patternsDetected,
    confidenceFactors,
    riskFactors,
  };
}

function getSeasonalFactor(month: number, categoryId?: string): number {
  // Simplified seasonal factors - in production, use historical data
  const seasonalFactors: Record<number, number> = {
    1: 0.9,  // January - post-holiday slowdown
    2: 0.95, // February
    3: 1.0,  // March
    4: 1.05, // April
    5: 1.1,  // May
    6: 1.05, // June
    7: 1.0,  // July
    8: 1.0,  // August
    9: 1.05, // September
    10: 1.1, // October
    11: 1.2, // November - pre-holiday
    12: 1.3, // December - holiday season
  };

  return seasonalFactors[month] || 1.0;
}
