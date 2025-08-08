import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { ebayDB } from "../ebay/db";

export interface PricingHeatmapRequest {
  categoryId: string;
  xAxis: 'day_of_week' | 'hour_of_day';
  yAxis: 'price_bucket';
}

export interface PricingHeatmapResponse {
  heatmapData: Array<{
    x: string;
    y: string;
    value: number;
  }>;
  xAxisLabels: string[];
  yAxisLabels: string[];
}

export interface ConversionFunnelRequest {
  categoryId?: string;
  productId?: string;
}

export interface ConversionFunnelResponse {
  funnelSteps: Array<{
    name: string;
    value: number;
    conversionRate?: number;
  }>;
}

// Gets data for a pricing heatmap visualization.
export const getPricingHeatmap = api<PricingHeatmapRequest, PricingHeatmapResponse>(
  { auth: true, expose: true, method: "GET", path: "/analytics/heatmap/pricing" },
  async (req) => {
    const auth = getAuthData()!;

    const priceBuckets = 10;
    const priceRange = await ebayDB.queryRow`
      SELECT MIN(current_price) as min_price, MAX(current_price) as max_price
      FROM listings
      WHERE user_id = ${auth.userID} AND category_id = ${req.categoryId}
    `;

    if (!priceRange || !priceRange.min_price) {
      throw APIError.notFound("No data for this category");
    }

    const bucketSize = (priceRange.max_price - priceRange.min_price) / priceBuckets;

    const heatmapQuery = `
      SELECT 
        EXTRACT(${req.xAxis === 'day_of_week' ? 'DOW' : 'HOUR'} FROM created_at) as x_axis,
        FLOOR((current_price - ${priceRange.min_price}) / ${bucketSize}) as y_axis,
        COUNT(*) as value
      FROM listings
      WHERE user_id = ${auth.userID} AND category_id = ${req.categoryId}
      GROUP BY x_axis, y_axis
    `;

    const results = await ebayDB.rawQueryAll(heatmapQuery);

    const yAxisLabels = Array.from({ length: priceBuckets }, (_, i) => 
      `$${(priceRange.min_price + i * bucketSize).toFixed(2)}`
    );

    const xAxisLabels = req.xAxis === 'day_of_week' 
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : Array.from({ length: 24 }, (_, i) => `${i}:00`);

    return {
      heatmapData: results.map(r => ({
        x: xAxisLabels[r.x_axis],
        y: yAxisLabels[r.y_axis],
        value: r.value,
      })),
      xAxisLabels,
      yAxisLabels,
    };
  }
);

// Gets data for a conversion funnel visualization.
export const getConversionFunnel = api<ConversionFunnelRequest, ConversionFunnelResponse>(
  { auth: true, expose: true, method: "GET", path: "/analytics/funnel/conversion" },
  async (req) => {
    const auth = getAuthData()!;
    let whereClause = "WHERE user_id = $1";
    const params: any[] = [auth.userID];

    if (req.categoryId) {
      whereClause += " AND category_id = $2";
      params.push(req.categoryId);
    }
    if (req.productId) {
      whereClause += ` AND id = $${params.length + 1}`;
      params.push(req.productId);
    }

    const funnelData = await ebayDB.rawQueryRow(
      `SELECT 
         SUM(views) as total_views,
         SUM(watchers) as total_watchers,
         SUM(sold_quantity) as total_sales
       FROM listings ${whereClause}`,
      ...params
    );

    const views = funnelData?.total_views || 0;
    const watchers = funnelData?.total_watchers || 0;
    const sales = funnelData?.total_sales || 0;

    return {
      funnelSteps: [
        { name: 'Views', value: views },
        { name: 'Watchers', value: watchers, conversionRate: views > 0 ? watchers / views : 0 },
        { name: 'Sales', value: sales, conversionRate: watchers > 0 ? sales / watchers : 0 },
      ],
    };
  }
);
