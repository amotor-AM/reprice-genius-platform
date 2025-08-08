import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { strategyDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface BacktestConfig {
  strategyId: string;
  startDate: Date;
  endDate: Date;
  initialCapital?: number;
  productFilters?: {
    categories?: string[];
    priceRange?: { min: number; max: number };
    brands?: string[];
  };
  marketConditions?: {
    includeSeasonality?: boolean;
    includeCompetitorData?: boolean;
    includeExternalEvents?: boolean;
  };
}

export interface BacktestResult {
  backtestId: string;
  strategyId: string;
  strategyName: string;
  config: BacktestConfig;
  performance: {
    totalReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    totalTrades: number;
    profitableTrades: number;
  };
  timeSeriesData: Array<{
    date: Date;
    portfolioValue: number;
    dailyReturn: number;
    cumulativeReturn: number;
    drawdown: number;
  }>;
  tradeHistory: Array<{
    date: Date;
    productId: string;
    action: 'buy' | 'sell' | 'price_change';
    oldPrice: number;
    newPrice: number;
    outcome: number;
    reasoning: string;
  }>;
  insights: {
    bestPerformingPeriods: string[];
    worstPerformingPeriods: string[];
    keySuccessFactors: string[];
    improvementAreas: string[];
  };
}

export interface RunBacktestRequest {
  config: BacktestConfig;
}

export interface RunBacktestResponse {
  result: BacktestResult;
  comparisonMetrics?: {
    benchmarkReturn: number;
    outperformance: number;
    correlationWithMarket: number;
  };
}

// Runs a backtest for a pricing strategy using historical data.
export const runBacktest = api<RunBacktestRequest, RunBacktestResponse>(
  { auth: true, expose: true, method: "POST", path: "/strategy/backtest" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Validate backtest configuration
      validateBacktestConfig(req.config);

      // Get strategy details
      const strategy = await getStrategyForBacktest(req.config.strategyId, auth.userID);
      
      // Get historical data
      const historicalData = await getHistoricalData(req.config, auth.userID);
      
      if (historicalData.length === 0) {
        throw APIError.invalidArgument("Insufficient historical data for the specified period");
      }

      // Run the backtest simulation
      const backtestResult = await runBacktestSimulation(strategy, historicalData, req.config);
      
      // Calculate comparison metrics
      const comparisonMetrics = await calculateComparisonMetrics(backtestResult, req.config);
      
      // Store backtest results
      await storeBacktestResults(backtestResult);

      return {
        result: backtestResult,
        comparisonMetrics,
      };
    } catch (error) {
      console.error('Error running backtest:', error);
      throw APIError.internal("Failed to run strategy backtest");
    }
  }
);

function validateBacktestConfig(config: BacktestConfig): void {
  if (config.startDate >= config.endDate) {
    throw new Error("Start date must be before end date");
  }

  const daysDiff = (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff < 7) {
    throw new Error("Backtest period must be at least 7 days");
  }

  if (daysDiff > 365) {
    throw new Error("Backtest period cannot exceed 365 days");
  }

  if (config.initialCapital && config.initialCapital <= 0) {
    throw new Error("Initial capital must be positive");
  }
}

async function getStrategyForBacktest(strategyId: string, userId: string): Promise<any> {
  // Try built-in strategies first
  let strategy = await strategyDB.queryRow`
    SELECT * FROM pricing_strategies WHERE id = ${strategyId}
  `;

  // If not found, try custom strategies
  if (!strategy) {
    strategy = await strategyDB.queryRow`
      SELECT * FROM custom_strategies 
      WHERE id = ${strategyId} AND user_id = ${userId}
    `;
  }

  if (!strategy) {
    throw new Error("Strategy not found");
  }

  return strategy;
}

async function getHistoricalData(config: BacktestConfig, userId: string): Promise<any[]> {
  let whereClause = `
    WHERE l.user_id = $1 
    AND ph.created_at >= $2 
    AND ph.created_at <= $3
  `;
  const params: any[] = [userId, config.startDate, config.endDate];

  // Apply product filters
  if (config.productFilters?.categories && config.productFilters.categories.length > 0) {
    whereClause += ` AND l.category_id = ANY($${params.length + 1})`;
    params.push(config.productFilters.categories);
  }

  if (config.productFilters?.priceRange) {
    whereClause += ` AND l.current_price >= $${params.length + 1} AND l.current_price <= $${params.length + 2}`;
    params.push(config.productFilters.priceRange.min, config.productFilters.priceRange.max);
  }

  const historicalData = await strategyDB.rawQueryAll(`
    SELECT 
      l.id as listing_id,
      l.title,
      l.category_id,
      l.current_price,
      ph.old_price,
      ph.new_price,
      ph.created_at,
      ph.reason,
      l.views,
      l.watchers,
      l.sold_quantity
    FROM listings l
    JOIN price_history ph ON l.id = ph.listing_id
    ${whereClause}
    ORDER BY ph.created_at ASC
  `, ...params);

  return historicalData;
}

async function runBacktestSimulation(
  strategy: any,
  historicalData: any[],
  config: BacktestConfig
): Promise<BacktestResult> {
  const backtestId = `backtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const initialCapital = config.initialCapital || 10000;
  
  let portfolioValue = initialCapital;
  let maxPortfolioValue = initialCapital;
  let maxDrawdown = 0;
  
  const timeSeriesData: any[] = [];
  const tradeHistory: any[] = [];
  const dailyReturns: number[] = [];
  
  let totalTrades = 0;
  let profitableTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;

  // Group data by date for daily simulation
  const dataByDate = groupDataByDate(historicalData);
  const dates = Object.keys(dataByDate).sort();

  for (const date of dates) {
    const dayData = dataByDate[date];
    let dailyPnL = 0;

    for (const trade of dayData) {
      // Simulate strategy decision
      const decision = simulateStrategyDecision(strategy, trade, config);
      
      if (decision.shouldTrade) {
        const outcome = calculateTradeOutcome(trade, decision);
        dailyPnL += outcome.pnl;
        totalTrades++;

        if (outcome.pnl > 0) {
          profitableTrades++;
          totalWins += outcome.pnl;
        } else {
          totalLosses += Math.abs(outcome.pnl);
        }

        tradeHistory.push({
          date: new Date(date),
          productId: trade.listing_id,
          action: decision.action,
          oldPrice: trade.old_price,
          newPrice: decision.newPrice,
          outcome: outcome.pnl,
          reasoning: decision.reasoning,
        });
      }
    }

    // Update portfolio value
    portfolioValue += dailyPnL;
    maxPortfolioValue = Math.max(maxPortfolioValue, portfolioValue);
    
    const drawdown = (maxPortfolioValue - portfolioValue) / maxPortfolioValue;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    
    const dailyReturn = dailyPnL / (portfolioValue - dailyPnL);
    dailyReturns.push(dailyReturn);

    timeSeriesData.push({
      date: new Date(date),
      portfolioValue,
      dailyReturn,
      cumulativeReturn: (portfolioValue - initialCapital) / initialCapital,
      drawdown,
    });
  }

  // Calculate performance metrics
  const totalReturn = (portfolioValue - initialCapital) / initialCapital;
  const dayCount = dates.length;
  const annualizedReturn = Math.pow(1 + totalReturn, 365 / dayCount) - 1;
  
  const avgDailyReturn = dailyReturns.reduce((sum, ret) => sum + ret, 0) / dailyReturns.length;
  const dailyReturnStd = Math.sqrt(
    dailyReturns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) / dailyReturns.length
  );
  const sharpeRatio = dailyReturnStd > 0 ? (avgDailyReturn / dailyReturnStd) * Math.sqrt(365) : 0;
  
  const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;
  const averageWin = profitableTrades > 0 ? totalWins / profitableTrades : 0;
  const averageLoss = (totalTrades - profitableTrades) > 0 ? totalLosses / (totalTrades - profitableTrades) : 0;

  // Generate insights
  const insights = generateBacktestInsights(timeSeriesData, tradeHistory, strategy);

  return {
    backtestId,
    strategyId: strategy.id,
    strategyName: strategy.name || 'Custom Strategy',
    config,
    performance: {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      averageWin,
      averageLoss,
      totalTrades,
      profitableTrades,
    },
    timeSeriesData,
    tradeHistory,
    insights,
  };
}

function groupDataByDate(historicalData: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  for (const data of historicalData) {
    const date = data.created_at.toISOString().split('T')[0];
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(data);
  }
  
  return grouped;
}

function simulateStrategyDecision(strategy: any, trade: any, config: BacktestConfig): any {
  // Simplified strategy simulation
  const currentPrice = trade.old_price;
  const marketPrice = trade.new_price;
  
  let shouldTrade = false;
  let newPrice = currentPrice;
  let action = 'hold';
  let reasoning = 'No action required';

  // Apply strategy logic based on type
  const strategyType = strategy.strategy_type || strategy.base_strategy_type;
  
  switch (strategyType) {
    case 'competitive_matching':
      if (Math.abs(currentPrice - marketPrice) / currentPrice > 0.05) {
        shouldTrade = true;
        newPrice = marketPrice * 0.98; // Slightly below market
        action = 'price_change';
        reasoning = 'Competitive price matching';
      }
      break;
      
    case 'profit_maximization':
      if (trade.views > 50 && trade.watchers > 5) {
        shouldTrade = true;
        newPrice = currentPrice * 1.05; // 5% increase
        action = 'price_change';
        reasoning = 'High demand detected, increasing price';
      }
      break;
      
    case 'volume_optimization':
      if (trade.sold_quantity === 0 && trade.views > 20) {
        shouldTrade = true;
        newPrice = currentPrice * 0.95; // 5% decrease
        action = 'price_change';
        reasoning = 'Stimulating sales with price reduction';
      }
      break;
  }

  return {
    shouldTrade,
    newPrice,
    action,
    reasoning,
  };
}

function calculateTradeOutcome(trade: any, decision: any): { pnl: number; success: boolean } {
  // Simplified outcome calculation
  const priceChange = decision.newPrice - trade.old_price;
  const priceChangePercent = priceChange / trade.old_price;
  
  // Estimate demand response (simplified)
  const demandElasticity = -1.2;
  const volumeChange = demandElasticity * priceChangePercent;
  
  // Calculate P&L (simplified)
  const baseVolume = 1; // Assume 1 unit base volume
  const newVolume = baseVolume * (1 + volumeChange);
  const revenue = decision.newPrice * newVolume;
  const baseRevenue = trade.old_price * baseVolume;
  const pnl = revenue - baseRevenue;
  
  return {
    pnl,
    success: pnl > 0,
  };
}

function generateBacktestInsights(timeSeriesData: any[], tradeHistory: any[], strategy: any): any {
  // Analyze performance periods
  const monthlyReturns = groupReturnsByMonth(timeSeriesData);
  const sortedMonths = Object.entries(monthlyReturns).sort(([,a], [,b]) => (b as number) - (a as number));
  
  const bestPerformingPeriods = sortedMonths.slice(0, 3).map(([month]) => month);
  const worstPerformingPeriods = sortedMonths.slice(-3).map(([month]) => month);
  
  // Analyze successful trades
  const successfulTrades = tradeHistory.filter(trade => trade.outcome > 0);
  const keySuccessFactors = analyzeSuccessFactors(successfulTrades);
  
  // Identify improvement areas
  const improvementAreas = identifyImprovementAreas(tradeHistory, timeSeriesData);

  return {
    bestPerformingPeriods,
    worstPerformingPeriods,
    keySuccessFactors,
    improvementAreas,
  };
}

function groupReturnsByMonth(timeSeriesData: any[]): Record<string, number> {
  const monthlyReturns: Record<string, number> = {};
  
  for (const data of timeSeriesData) {
    const month = data.date.toISOString().substring(0, 7); // YYYY-MM
    if (!monthlyReturns[month]) {
      monthlyReturns[month] = 0;
    }
    monthlyReturns[month] += data.dailyReturn;
  }
  
  return monthlyReturns;
}

function analyzeSuccessFactors(successfulTrades: any[]): string[] {
  const factors: string[] = [];
  
  // Analyze common patterns in successful trades
  const reasoningCounts: Record<string, number> = {};
  for (const trade of successfulTrades) {
    reasoningCounts[trade.reasoning] = (reasoningCounts[trade.reasoning] || 0) + 1;
  }
  
  const topReasons = Object.entries(reasoningCounts)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([reason]) => reason);
  
  factors.push(...topReasons);
  
  return factors;
}

function identifyImprovementAreas(tradeHistory: any[], timeSeriesData: any[]): string[] {
  const areas: string[] = [];
  
  // Check for high drawdown periods
  const maxDrawdown = Math.max(...timeSeriesData.map(d => d.drawdown));
  if (maxDrawdown > 0.15) {
    areas.push('High drawdown periods - consider risk management');
  }
  
  // Check win rate
  const winRate = tradeHistory.filter(t => t.outcome > 0).length / tradeHistory.length;
  if (winRate < 0.5) {
    areas.push('Low win rate - review strategy criteria');
  }
  
  // Check for overtrading
  if (tradeHistory.length > timeSeriesData.length * 0.5) {
    areas.push('High trading frequency - consider reducing trade frequency');
  }
  
  return areas;
}

async function calculateComparisonMetrics(backtestResult: BacktestResult, config: BacktestConfig): Promise<any> {
  // Calculate benchmark return (simplified - could be market index or buy-and-hold)
  const benchmarkReturn = 0.05; // Assume 5% benchmark return
  const outperformance = backtestResult.performance.totalReturn - benchmarkReturn;
  
  // Calculate correlation with market (simplified)
  const correlationWithMarket = 0.3; // Mock correlation
  
  return {
    benchmarkReturn,
    outperformance,
    correlationWithMarket,
  };
}

async function storeBacktestResults(result: BacktestResult): Promise<void> {
  await strategyDB.exec`
    INSERT INTO strategy_backtests (
      id, strategy_id, backtest_config, historical_data, results,
      performance_summary, start_date, end_date
    ) VALUES (
      ${result.backtestId}, ${result.strategyId}, ${JSON.stringify(result.config)},
      ${JSON.stringify(result.tradeHistory)}, ${JSON.stringify(result)},
      ${JSON.stringify(result.performance)}, ${result.config.startDate}, ${result.config.endDate}
    )
  `;
}

// Gets historical backtest results
export const getBacktestHistory = api<{ strategyId?: string }, { backtests: any[] }>(
  { auth: true, expose: true, method: "GET", path: "/strategy/backtests" },
  async (req) => {
    const auth = getAuthData()!;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (req.strategyId) {
      whereClause += " AND strategy_id = $1";
      params.push(req.strategyId);
    }

    const backtests = await strategyDB.rawQueryAll(`
      SELECT id, strategy_id, performance_summary, start_date, end_date, created_at
      FROM strategy_backtests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 50
    `, ...params);

    return {
      backtests: backtests.map(b => ({
        id: b.id,
        strategyId: b.strategy_id,
        performance: b.performance_summary,
        startDate: b.start_date,
        endDate: b.end_date,
        createdAt: b.created_at,
      })),
    };
  }
);
