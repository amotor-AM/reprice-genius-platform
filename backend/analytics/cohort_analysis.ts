import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { strategyDB } from "../strategy/db";
import { learningDB } from "../learning/db";

export interface CohortPerformanceRequest {
  strategyId?: string;
  cohortPeriod?: 'monthly' | 'weekly';
}

export interface CohortDataPoint {
  day: number;
  retention: number;
  avgRevenue: number;
  avgProfit: number;
  conversionRate: number;
}

export interface Cohort {
  cohortId: string;
  strategyId: string;
  period: string;
  userCount: number;
  performance: CohortDataPoint[];
}

export interface CohortAnalysisResponse {
  cohorts: Cohort[];
}

// Analyzes performance of pricing strategy cohorts.
export const getStrategyCohortPerformance = api<CohortPerformanceRequest, CohortAnalysisResponse>(
  { auth: true, expose: true, method: "GET", path: "/analytics/cohort/performance" },
  async (req) => {
    const auth = getAuthData()!;
    const period = req.cohortPeriod || 'monthly';

    // Define cohorts based on strategy assignment date
    const cohortDefinitionQuery = `
      SELECT 
        to_char(ss.created_at, '${period === 'monthly' ? 'YYYY-MM' : 'YYYY-WW'}') as cohort_period,
        ss.selected_strategy_id as strategy_id,
        COUNT(DISTINCT l.user_id) as user_count,
        ARRAY_AGG(DISTINCT ss.listing_id) as listings
      FROM strategy_selections ss
      JOIN listings l ON ss.listing_id = l.id
      WHERE l.user_id = ${auth.userID}
        ${req.strategyId ? `AND ss.selected_strategy_id = '${req.strategyId}'` : ''}
      GROUP BY cohort_period, strategy_id
      ORDER BY cohort_period DESC
      LIMIT 12
    `;

    const cohorts = await strategyDB.rawQueryAll(cohortDefinitionQuery);

    const cohortPerformances: Cohort[] = [];

    for (const cohort of cohorts) {
      // For each cohort, get performance over time
      const performanceData = await getCohortPerformanceOverTime(cohort.listings, cohort.cohort_period, period);
      
      cohortPerformances.push({
        cohortId: `${cohort.strategy_id}_${cohort.cohort_period}`,
        strategyId: cohort.strategy_id,
        period: cohort.cohort_period,
        userCount: cohort.user_count,
        performance: performanceData,
      });
    }

    return { cohorts: cohortPerformances };
  }
);

async function getCohortPerformanceOverTime(
  listingIds: string[],
  cohortPeriod: string,
  periodType: 'monthly' | 'weekly'
): Promise<CohortDataPoint[]> {
  const startDate = new Date(cohortPeriod);
  const performanceData: CohortDataPoint[] = [];

  for (let day = 0; day <= 30; day += 7) {
    const periodStart = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const metrics = await learningDB.queryRow`
      SELECT 
        COUNT(DISTINCT listing_id) as retained_listings,
        AVG(revenue_after - revenue_before) as avg_revenue,
        AVG((revenue_after - revenue_before) * 0.15) as avg_profit,
        AVG(conversion_rate_after) as conversion_rate
      FROM pricing_outcomes
      WHERE listing_id = ANY(${listingIds})
        AND applied_at >= ${periodStart}
        AND applied_at < ${periodEnd}
    `;

    performanceData.push({
      day: day,
      retention: listingIds.length > 0 ? (metrics?.retained_listings || 0) / listingIds.length : 0,
      avgRevenue: metrics?.avg_revenue || 0,
      avgProfit: metrics?.avg_profit || 0,
      conversionRate: metrics?.conversion_rate || 0,
    });
  }

  return performanceData;
}
