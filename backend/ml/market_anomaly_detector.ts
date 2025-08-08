import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { listingsDB } from "../listings/db";
import { intel } from "~encore/clients";

export interface DetectAnomalyRequest {
  detectionType: 'price_volatility' | 'sales_velocity' | 'demand_surge';
  categoryId?: string;
  timeHorizonHours?: number;
  sensitivity?: 'low' | 'medium' | 'high';
}

export interface Anomaly {
  anomalyType: string;
  entityId: string; // listingId or categoryId
  entityType: 'listing' | 'category';
  description: string;
  score: number;
  timestamp: Date;
  metadata: any;
}

export interface DetectAnomalyResponse {
  anomalies: Anomaly[];
  detectionTime: number;
}

// Detects unusual market behavior using advanced models.
export const detectMarketAnomaly = api<DetectAnomalyRequest, DetectAnomalyResponse>(
  { auth: true, expose: true, method: "POST", path: "/ml/anomaly/detect" },
  async (req) => {
    const startTime = Date.now();
    
    let anomalies: Anomaly[] = [];
    switch (req.detectionType) {
      case 'price_volatility':
        anomalies = await detectPriceVolatility(req);
        break;
      case 'sales_velocity':
        anomalies = await detectSalesVelocityAnomalies(req);
        break;
      case 'demand_surge':
        anomalies = await detectDemandSurge(req);
        break;
      default:
        throw APIError.invalidArgument("Invalid detection type");
    }

    // Store detected anomalies
    for (const anomaly of anomalies) {
      await mlDB.exec`
        INSERT INTO market_anomalies (anomaly_type, entity_id, entity_type, description, score, metadata)
        VALUES (${anomaly.anomalyType}, ${anomaly.entityId}, ${anomaly.entityType}, ${anomaly.description}, ${anomaly.score}, ${JSON.stringify(anomaly.metadata)})
      `;
    }

    return {
      anomalies,
      detectionTime: Date.now() - startTime,
    };
  }
);

async function detectPriceVolatility(req: DetectAnomalyRequest): Promise<Anomaly[]> {
  const timeHorizon = req.timeHorizonHours || 24;
  
  const volatileListings = await listingsDB.queryAll`
    SELECT 
      ml.id,
      p.title,
      STDDEV(ph.new_price) / AVG(ph.new_price) as volatility,
      COUNT(ph.id) as price_changes
    FROM marketplace_listings ml
    JOIN products p ON ml.product_id = p.id
    JOIN price_history ph ON ml.id = ph.marketplace_listing_id
    WHERE ph.created_at >= NOW() - INTERVAL '${timeHorizon} hours'
      ${req.categoryId ? `AND p.category_id = '${req.categoryId}'` : ''}
    GROUP BY ml.id, p.title
    HAVING COUNT(ph.id) > 3
    ORDER BY volatility DESC
    LIMIT 20
  `;

  const sensitivityThreshold = { low: 0.3, medium: 0.2, high: 0.1 };
  const threshold = sensitivityThreshold[req.sensitivity || 'medium'];

  return volatileListings
    .filter(l => l.volatility > threshold)
    .map(l => ({
      anomalyType: 'price_volatility',
      entityId: l.id,
      entityType: 'listing',
      description: `High price volatility of ${(l.volatility * 100).toFixed(1)}% for "${l.title}"`,
      score: l.volatility,
      timestamp: new Date(),
      metadata: {
        priceChanges: l.price_changes,
        timeHorizon,
      },
    }));
}

async function detectSalesVelocityAnomalies(req: DetectAnomalyRequest): Promise<Anomaly[]> {
  const timeHorizon = req.timeHorizonHours || 24;
  const sensitivity = { low: 3.5, medium: 3.0, high: 2.5 }[req.sensitivity || 'medium'];

  // Get historical baseline
  const baseline = await listingsDB.queryAll`
    SELECT 
      DATE_TRUNC('day', ph.created_at) as day,
      COUNT(*) as daily_sales
    FROM price_history ph
    JOIN marketplace_listings ml ON ph.marketplace_listing_id = ml.id
    JOIN products p ON ml.product_id = p.id
    WHERE ph.created_at < NOW() - INTERVAL '${timeHorizon} hours'
      AND ph.created_at >= NOW() - INTERVAL '30 days'
      ${req.categoryId ? `AND p.category_id = '${req.categoryId}'` : ''}
    GROUP BY 1
  `;

  if (baseline.length < 7) return [];

  const sales = baseline.map(b => b.daily_sales);
  const mean = sales.reduce((a, b) => a + b, 0) / sales.length;
  const stddev = Math.sqrt(sales.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / sales.length);

  // Get recent sales
  const recentSales = await listingsDB.queryAll`
    SELECT 
      p.id,
      p.title,
      COUNT(*) as recent_sales
    FROM price_history ph
    JOIN marketplace_listings ml ON ph.marketplace_listing_id = ml.id
    JOIN products p ON ml.product_id = p.id
    WHERE ph.created_at >= NOW() - INTERVAL '${timeHorizon} hours'
      ${req.categoryId ? `AND p.category_id = '${req.categoryId}'` : ''}
    GROUP BY 1, 2
  `;

  const anomalies: Anomaly[] = [];
  for (const listing of recentSales) {
    const zScore = (listing.recent_sales - mean) / stddev;
    if (zScore > sensitivity) {
      anomalies.push({
        anomalyType: 'sales_velocity_spike',
        entityId: listing.id,
        entityType: 'listing',
        description: `Sales for "${listing.title}" are ${zScore.toFixed(1)} standard deviations above average.`,
        score: zScore,
        timestamp: new Date(),
        metadata: { recentSales: listing.recent_sales, historicalMean: mean, zScore },
      });
    }
  }
  return anomalies;
}

async function detectDemandSurge(req: DetectAnomalyRequest): Promise<Anomaly[]> {
  if (!req.categoryId) return [];
  
  const trends = await intel.getTrends({ category: req.categoryId });
  const googleTrend = trends.trends.find(t => t.source === 'google_trends');

  if (googleTrend && googleTrend.value > 2000) { // Arbitrary threshold
    return [{
      anomalyType: 'demand_surge_prediction',
      entityId: req.categoryId,
      entityType: 'category',
      description: `Predicted demand surge for category ${req.categoryId} based on high search volume.`,
      score: 0.92,
      timestamp: new Date(),
      metadata: {
        searchVolume: googleTrend.value,
      },
    }];
  }
  return [];
}
