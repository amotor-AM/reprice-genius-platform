import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analytics, graph, moat } from "~encore/clients";

export interface SystemInsightsResponse {
  insights: {
    marketOverview: string;
    topOpportunities: any[];
    potentialRisks: string[];
  };
}

// Gets system-wide insights by synthesizing data from multiple services.
export const getInsights = api<void, SystemInsightsResponse>(
  { auth: true, expose: true, method: "GET", path: "/brain/insights" },
  async () => {
    // Gather data from various services
    const [analyticsData, graphData, moatData] = await Promise.all([
      analytics.getDashboard({ period: '30d' }),
      graph.getCategoryInsights({ categoryId: 'all' }), // Assuming 'all' is a valid option
      moat.getOpportunities(),
    ]);

    // Synthesize insights (simplified)
    const insights = {
      marketOverview: `Overall revenue is $${analyticsData.totalRevenue.toFixed(2)}. The market is currently ${graphData.marketMetrics.competitionLevel}.`,
      topOpportunities: moatData.opportunities.slice(0, 3),
      potentialRisks: [
        `High competition in ${graphData.categoryName}`,
        `Market volatility is at ${(graphData.marketMetrics.priceVolatility * 100).toFixed(1)}%`,
      ],
    };

    return { insights };
  }
);
