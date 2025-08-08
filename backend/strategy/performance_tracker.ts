import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { strategyDB } from "./db";
import { listingsDB } from "../listings/db";

export interface StrategyPerformanceMetrics {
  strategyId: string;
  strategyName: string;
  totalApplications: number;
  successRate: number;
  averageRevenueImpact: number;
  averageProfitImpact: number;
  averageVolumeImpact: number;
  riskAdjustedReturn: number;
  marketConditions: {
    bestPerformingConditions: string[];
    worstPerformingConditions: string[];
  };
  timeSeriesData: Array<{
    period: string;
    applications: number;
    successRate: number;
    avgReturn: number;
  }>;
}

export interface GetPerformanceRequest {
  strategyId?: string;
  categoryId?: string;
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  groupBy?: 'strategy' | 'category' | 'time_period';
}

export interface GetPerformanceResponse {
  metrics: StrategyPerformanceMetrics[];
  summary: {
    totalStrategiesAnalyzed: number;
    bestPerformingStrategy: string;
    overallSuccessRate: number;
    totalRevenueImpact: number;
  };
  insights: {
    topPerformers: string[];
    underperformers: string[];
    recommendations: string[];
  };
}

// Gets comprehensive performance metrics for pricing strategies.
export const getPerformance = api<GetPerformanceRequest, GetPerformanceResponse>(
  { auth: true, expose: true, method: "GET", path: "/strategy/performance" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      const timeRange = req.timeRange || {
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        endDate: new Date(),
      };

      // Get performance data based on grouping
      const metrics = await getStrategyMetrics(auth.userID, req, timeRange);
      
      // Calculate summary statistics
      const summary = calculateSummaryMetrics(metrics);
      
      // Generate insights and recommendations
      const insights = generatePerformanceInsights(metrics);

      return {
        metrics,
        summary,
        insights,
      };
    } catch (error) {
      console.error('Error getting strategy performance:', error);
      throw APIError.internal("Failed to get strategy performance metrics");
    }
  }
);

async function getStrategyMetrics(
  userId: string,
  req: GetPerformanceRequest,
  timeRange: { startDate: Date; endDate: Date }
): Promise<StrategyPerformanceMetrics[]> {
  let whereClause = `
    WHERE ml.user_id = $1 
    AND ss.created_at >= $2 
    AND ss.created_at <= $3
    AND ss.applied = true
  `;
  const params: any[] = [userId, timeRange.startDate, timeRange.endDate];

  if (req.strategyId) {
    whereClause += ` AND ss.selected_strategy_id = $${params.length + 1}`;
    params.push(req.strategyId);
  }

  if (req.categoryId) {
    whereClause += ` AND p.category_id = $${params.length + 1}`;
    params.push(req.categoryId);
  }

  // Get strategy performance data
  const performanceData = await strategyDB.rawQueryAll(`
    SELECT 
      ss.selected_strategy_id,
      ps.name as strategy_name,
      COUNT(*) as total_applications,
      AVG(CASE WHEN po.outcome_score > 0.6 THEN 1.0 ELSE 0.0 END) as success_rate,
      AVG(po.revenue_after - po.revenue_before) as avg_revenue_impact,
      AVG((po.revenue_after - po.revenue_before) * 0.3) as avg_profit_impact,
      AVG(po.sales_velocity_change) as avg_volume_impact,
      AVG(po.outcome_score) as avg_outcome_score,
      STDDEV(po.outcome_score) as outcome_volatility
    FROM strategy_selections ss
    JOIN marketplace_listings ml ON ss.listing_id = ml.id
    JOIN products p ON ml.product_id = p.id
    LEFT JOIN pricing_strategies ps ON ss.selected_strategy_id = ps.id
    LEFT JOIN pricing_outcomes po ON ml.id = po.listing_id 
      AND po.applied_at >= ss.applied_at
      AND po.applied_at <= ss.applied_at + INTERVAL '7 days'
    ${whereClause}
    GROUP BY ss.selected_strategy_id, ps.name
    ORDER BY avg_outcome_score DESC
  `, ...params);

  const metrics: StrategyPerformanceMetrics[] = [];

  for (const data of performanceData) {
    // Get time series data
    const timeSeriesData = await getTimeSeriesData(data.selected_strategy_id, timeRange);
    
    // Get market condition performance
    const marketConditions = await getMarketConditionPerformance(data.selected_strategy_id, timeRange);
    
    // Calculate risk-adjusted return
    const volatility = data.outcome_volatility || 0.1;
    const riskAdjustedReturn = volatility > 0 ? data.avg_outcome_score / volatility : data.avg_outcome_score;

    metrics.push({
      strategyId: data.selected_strategy_id,
      strategyName: data.strategy_name || 'Unknown Strategy',
      totalApplications: data.total_applications || 0,
      successRate: data.success_rate || 0,
      averageRevenueImpact: data.avg_revenue_impact || 0,
      averageProfitImpact: data.avg_profit_impact || 0,
      averageVolumeImpact: data.avg_volume_impact || 0,
      riskAdjustedReturn,
      marketConditions,
      timeSeriesData,
    });
  }

  return metrics;
}

async function getTimeSeriesData(strategyId: string, timeRange: any): Promise<any[]> {
  const timeSeriesData = await strategyDB.rawQueryAll(`
    SELECT 
      DATE_TRUNC('week', ss.applied_at) as period,
      COUNT(*) as applications,
      AVG(CASE WHEN po.outcome_score > 0.6 THEN 1.0 ELSE 0.0 END) as success_rate,
      AVG(po.outcome_score) as avg_return
    FROM strategy_selections ss
    LEFT JOIN pricing_outcomes po ON ss.listing_id = po.listing_id
      AND po.applied_at >= ss.applied_at
      AND po.applied_at <= ss.applied_at + INTERVAL '7 days'
    WHERE ss.selected_strategy_id = $1
      AND ss.applied_at >= $2
      AND ss.applied_at <= $3
      AND ss.applied = true
    GROUP BY DATE_TRUNC('week', ss.applied_at)
    ORDER BY period
  `, strategyId, timeRange.startDate, timeRange.endDate);

  return timeSeriesData.map(data => ({
    period: data.period.toISOString().split('T')[0],
    applications: data.applications || 0,
    successRate: data.success_rate || 0,
    avgReturn: data.avg_return || 0,
  }));
}

async function getMarketConditionPerformance(strategyId: string, timeRange: any): Promise<any> {
  // Analyze performance under different market conditions
  const conditionData = await strategyDB.rawQueryAll(`
    SELECT 
      ss.market_context->>'marketTrend' as market_trend,
      AVG(po.outcome_score) as avg_performance,
      COUNT(*) as sample_size
    FROM strategy_selections ss
    LEFT JOIN pricing_outcomes po ON ss.listing_id = po.listing_id
      AND po.applied_at >= ss.applied_at
      AND po.applied_at <= ss.applied_at + INTERVAL '7 days'
    WHERE ss.selected_strategy_id = $1
      AND ss.applied_at >= $2
      AND ss.applied_at <= $3
      AND ss.applied = true
    GROUP BY ss.market_context->>'marketTrend'
    HAVING COUNT(*) >= 3
    ORDER BY avg_performance DESC
  `, strategyId, timeRange.startDate, timeRange.endDate);

  const bestConditions = conditionData
    .filter(d => d.avg_performance > 0.7)
    .map(d => d.market_trend)
    .slice(0, 3);

  const worstConditions = conditionData
    .filter(d => d.avg_performance < 0.5)
    .map(d => d.market_trend)
    .slice(0, 3);

  return {
    bestPerformingConditions: bestConditions,
    worstPerformingConditions: worstConditions,
  };
}

function calculateSummaryMetrics(metrics: StrategyPerformanceMetrics[]): any {
  if (metrics.length === 0) {
    return {
      totalStrategiesAnalyzed: 0,
      bestPerformingStrategy: '',
      overallSuccessRate: 0,
      totalRevenueImpact: 0,
    };
  }

  const totalApplications = metrics.reduce((sum, m) => sum + m.totalApplications, 0);
  const weightedSuccessRate = metrics.reduce((sum, m) => 
    sum + (m.successRate * m.totalApplications), 0) / totalApplications;
  
  const bestStrategy = metrics.reduce((best, current) => 
    current.riskAdjustedReturn > best.riskAdjustedReturn ? current : best
  );

  const totalRevenueImpact = metrics.reduce((sum, m) => 
    sum + (m.averageRevenueImpact * m.totalApplications), 0);

  return {
    totalStrategiesAnalyzed: metrics.length,
    bestPerformingStrategy: bestStrategy.strategyName,
    overallSuccessRate: weightedSuccessRate,
    totalRevenueImpact,
  };
}

function generatePerformanceInsights(metrics: StrategyPerformanceMetrics[]): any {
  const topPerformers = metrics
    .filter(m => m.riskAdjustedReturn > 0.8 && m.totalApplications >= 5)
    .slice(0, 3)
    .map(m => m.strategyName);

  const underperformers = metrics
    .filter(m => m.riskAdjustedReturn < 0.5 && m.totalApplications >= 5)
    .slice(0, 3)
    .map(m => m.strategyName);

  const recommendations: string[] = [];

  if (topPerformers.length > 0) {
    recommendations.push(`Focus on top performing strategies: ${topPerformers.join(', ')}`);
  }

  if (underperformers.length > 0) {
    recommendations.push(`Review and optimize underperforming strategies: ${underperformers.join(', ')}`);
  }

  // Analyze success rate trends
  const avgSuccessRate = metrics.reduce((sum, m) => sum + m.successRate, 0) / metrics.length;
  if (avgSuccessRate < 0.6) {
    recommendations.push('Overall success rate is below 60% - consider strategy refinement');
  }

  // Analyze risk-adjusted returns
  const avgRiskAdjustedReturn = metrics.reduce((sum, m) => sum + m.riskAdjustedReturn, 0) / metrics.length;
  if (avgRiskAdjustedReturn < 0.7) {
    recommendations.push('Consider strategies with better risk-adjusted returns');
  }

  return {
    topPerformers,
    underperformers,
    recommendations,
  };
}
