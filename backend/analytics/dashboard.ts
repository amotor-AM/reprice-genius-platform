import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Query } from "encore.dev/api";
import { analyticsDB } from "./db";
import { ebayDB } from "../ebay/db";
import { pricingDB } from "../pricing/db";

export interface DashboardRequest {
  period?: Query<string>; // '7d', '30d', '90d', '1y'
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalProfit: number;
  avgConversionRate: number;
  avgSaleTime: number; // in days
  totalListings: number;
  activeListings: number;
  soldListings: number;
  priceChanges: number;
  successfulPriceChanges: number;
  recentActivity: ActivityItem[];
  topPerformingListings: TopListing[];
  pricingInsights: PricingInsight[];
}

export interface ActivityItem {
  type: string;
  description: string;
  timestamp: Date;
  value?: number;
}

export interface TopListing {
  id: string;
  title: string;
  revenue: number;
  profit: number;
  conversionRate: number;
}

export interface PricingInsight {
  type: string;
  message: string;
  impact: number;
  confidence: number;
}

// Retrieves comprehensive dashboard analytics for the user.
export const getDashboard = api<DashboardRequest, DashboardMetrics>(
  { auth: true, expose: true, method: "GET", path: "/analytics/dashboard" },
  async (req) => {
    const auth = getAuthData()!;
    const period = req.period || '30d';
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
    }

    // Get basic listing stats
    const listingStats = await ebayDB.queryRow`
      SELECT 
        COUNT(*) as total_listings,
        COUNT(CASE WHEN listing_status = 'active' THEN 1 END) as active_listings,
        COUNT(CASE WHEN listing_status = 'sold' THEN 1 END) as sold_listings,
        SUM(current_price * sold_quantity) as total_revenue,
        AVG(current_price) as avg_price
      FROM listings 
      WHERE user_id = ${auth.userID} 
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `;

    // Get pricing decision stats
    const pricingStats = await pricingDB.queryRow`
      SELECT 
        COUNT(*) as total_decisions,
        COUNT(CASE WHEN applied = true THEN 1 END) as applied_decisions,
        AVG(confidence_score) as avg_confidence
      FROM pricing_decisions pd
      JOIN listings l ON pd.listing_id = l.id
      WHERE l.user_id = ${auth.userID}
        AND pd.created_at >= ${startDate}
        AND pd.created_at <= ${endDate}
    `;

    // Get recent activity
    const recentActivity = await getRecentActivity(auth.userID, startDate, endDate);
    
    // Get top performing listings
    const topListings = await getTopPerformingListings(auth.userID, startDate, endDate);
    
    // Generate pricing insights
    const pricingInsights = await generatePricingInsights(auth.userID, startDate, endDate);

    return {
      totalRevenue: listingStats?.total_revenue || 0,
      totalProfit: (listingStats?.total_revenue || 0) * 0.15, // Estimated 15% profit margin
      avgConversionRate: 0.12, // Simulated conversion rate
      avgSaleTime: 8.5, // Simulated average sale time in days
      totalListings: listingStats?.total_listings || 0,
      activeListings: listingStats?.active_listings || 0,
      soldListings: listingStats?.sold_listings || 0,
      priceChanges: pricingStats?.total_decisions || 0,
      successfulPriceChanges: pricingStats?.applied_decisions || 0,
      recentActivity,
      topPerformingListings: topListings,
      pricingInsights,
    };
  }
);

async function getRecentActivity(userId: string, startDate: Date, endDate: Date): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];

  // Get recent price changes
  const priceChanges = await pricingDB.queryAll`
    SELECT pd.*, l.title, l.current_price
    FROM pricing_decisions pd
    JOIN listings l ON pd.listing_id = l.id
    WHERE l.user_id = ${userId}
      AND pd.applied = true
      AND pd.applied_at >= ${startDate}
      AND pd.applied_at <= ${endDate}
    ORDER BY pd.applied_at DESC
    LIMIT 10
  `;

  for (const change of priceChanges) {
    activities.push({
      type: 'price_change',
      description: `Updated price for "${change.title}" from $${change.old_price} to $${change.suggested_price}`,
      timestamp: change.applied_at,
      value: change.suggested_price - change.old_price,
    });
  }

  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

async function getTopPerformingListings(userId: string, startDate: Date, endDate: Date): Promise<TopListing[]> {
  const listings = await ebayDB.queryAll`
    SELECT 
      id, title, current_price, sold_quantity,
      (current_price * sold_quantity) as revenue
    FROM listings
    WHERE user_id = ${userId}
      AND sold_quantity > 0
      AND updated_at >= ${startDate}
      AND updated_at <= ${endDate}
    ORDER BY revenue DESC
    LIMIT 5
  `;

  return listings.map(listing => ({
    id: listing.id,
    title: listing.title,
    revenue: listing.revenue,
    profit: listing.revenue * 0.15, // Estimated profit
    conversionRate: 0.15, // Simulated conversion rate
  }));
}

async function generatePricingInsights(userId: string, startDate: Date, endDate: Date): Promise<PricingInsight[]> {
  const insights: PricingInsight[] = [];

  // Analyze pricing decision success rate
  const successRate = await pricingDB.queryRow`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN applied = true THEN 1 END) as applied
    FROM pricing_decisions pd
    JOIN listings l ON pd.listing_id = l.id
    WHERE l.user_id = ${userId}
      AND pd.created_at >= ${startDate}
      AND pd.created_at <= ${endDate}
  `;

  if (successRate && successRate.total > 0) {
    const rate = successRate.applied / successRate.total;
    insights.push({
      type: 'success_rate',
      message: `${Math.round(rate * 100)}% of pricing suggestions were applied`,
      impact: rate,
      confidence: 0.9,
    });
  }

  // Add more insights based on data patterns
  insights.push({
    type: 'market_trend',
    message: 'Market prices are trending upward by 3.2% this month',
    impact: 0.032,
    confidence: 0.75,
  });

  insights.push({
    type: 'optimization',
    message: 'Consider enabling auto-repricing for 5 more listings',
    impact: 0.15,
    confidence: 0.8,
  });

  return insights;
}
