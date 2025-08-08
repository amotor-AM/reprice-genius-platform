import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { listingsDB } from "../listings/db";
import { ml } from "~encore/clients";

export interface Anomaly {
  id: number;
  listingId: string;
  anomalyType: string;
  description: string;
  magnitude: number;
  detectedAt: Date;
  status: string;
}

// Internal API to be called by the jobs service.
export const detectPriceAnomalies = api<void, { detected: number }>(
  { method: "POST", path: "/analytics/internal/detect-anomalies" },
  async () => {
    // Use the new ML service for advanced anomaly detection
    const response = await ml.detectMarketAnomaly({
      detectionType: 'price_volatility',
      timeHorizonHours: 24,
      sensitivity: 'high',
    });

    // Store detected anomalies
    for (const anomaly of response.anomalies) {
      await analyticsDB.exec`
        INSERT INTO price_anomalies (listing_id, anomaly_type, description, magnitude, status)
        VALUES (${anomaly.entityId}, ${anomaly.anomalyType}, ${anomaly.description}, ${anomaly.score}, 'new')
        ON CONFLICT (listing_id, anomaly_type) DO NOTHING
      `;
    }

    return { detected: response.anomalies.length };
  }
);

// Retrieves detected price anomalies.
export const getAnomalies = api<{ status?: string }, { anomalies: Anomaly[] }>(
  { auth: true, expose: true, method: "GET", path: "/analytics/anomalies" },
  async (req) => {
    const auth = getAuthData()!;
    let whereClause = "WHERE ml.user_id = $1";
    const params: any[] = [auth.userID];

    if (req.status) {
      whereClause += ` AND pa.status = $${params.length + 1}`;
      params.push(req.status);
    }

    const anomalies = await analyticsDB.rawQueryAll(
      `SELECT pa.* FROM price_anomalies pa
       JOIN marketplace_listings ml ON pa.listing_id = ml.id
       ${whereClause}
       ORDER BY pa.detected_at DESC
       LIMIT 50`,
      ...params
    );

    return {
      anomalies: anomalies.map(a => ({
        id: a.id,
        listingId: a.listing_id,
        anomalyType: a.anomaly_type,
        description: a.description,
        magnitude: a.magnitude,
        detectedAt: a.detected_at,
        status: a.status,
      })),
    };
  }
);
