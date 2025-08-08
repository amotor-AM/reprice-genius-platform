import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { listingsDB } from "../listings/db";

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
    let detectedCount = 0;
    // Get recent price changes
    const recentChanges = await listingsDB.queryAll`
      SELECT 
        marketplace_listing_id, old_price, new_price, 
        (new_price - old_price) / old_price as magnitude
      FROM price_history
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `;

    for (const change of recentChanges) {
      if (Math.abs(change.magnitude) > 0.5) { // > 50% change
        await analyticsDB.exec`
          INSERT INTO price_anomalies (listing_id, anomaly_type, description, magnitude)
          VALUES (${change.marketplace_listing_id}, 'sudden_change', 
                  'Price changed from $${change.old_price} to $${change.new_price}', 
                  ${change.magnitude})
        `;
        detectedCount++;
      }
    }

    // Detect high volatility
    const volatileListings = await listingsDB.queryAll`
      SELECT marketplace_listing_id, COUNT(*) as change_count
      FROM price_history
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY marketplace_listing_id
      HAVING COUNT(*) > 5
    `;

    for (const listing of volatileListings) {
      await analyticsDB.exec`
        INSERT INTO price_anomalies (listing_id, anomaly_type, description, magnitude)
        VALUES (${listing.marketplace_listing_id}, 'high_volatility', 
                '${listing.change_count} price changes in 24 hours', 
                ${listing.change_count})
        ON CONFLICT (listing_id, anomaly_type) DO NOTHING
      `;
      detectedCount++;
    }
    return { detected: detectedCount };
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
