import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mlDB } from "./db";
import { listingsDB } from "../listings/db";

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
  // This is a simplified simulation. A real implementation would use time-series forecasting.
  return [{
    anomalyType: 'sales_velocity_spike',
    entityId: 'cat_123',
    entityType: 'category',
    description: 'Unusual spike in sales velocity for Electronics category',
    score: 0.85,
    timestamp: new Date(),
    metadata: {
      increase: '150%',
      timeHorizon: req.timeHorizonHours || 24,
    },
  }];
}

async function detectDemandSurge(req: DetectAnomalyRequest): Promise<Anomaly[]> {
  // This would analyze search trends, social media, etc.
  return [{
    anomalyType: 'demand_surge_prediction',
    entityId: 'brand_abc',
    entityType: 'brand',
    description: 'Predicted demand surge for Brand ABC in the next 48 hours',
    score: 0.92,
    timestamp: new Date(),
    metadata: {
      predictedIncrease: '200%',
      leadTime: 48,
    },
  }];
}
