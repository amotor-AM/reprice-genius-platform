import { cron } from "encore.dev/cron";
import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { analyticsDB } from "./db";
import { ebayDB } from "../ebay/db";

export interface Anomaly {
  id: number;
  listingId: string;
  anomalyType: string;
  description: string;
  magnitude: number;
  detectedAt: Date;
  status: string;
}

// Cron job to detect price anomalies every hour.
export const detectPriceAnomalies = cron("detect-anomalies", {
  every: "1h",
  handler: async () => {
    // Get recent price changes
    const recentChanges = await ebayDB.queryAll`
      SELECT 
        listing_id, old_price, new_price, 
        (new_price - old_price) / old_price as magnitude
      FROM price_history
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `;

    for (const change of recentChanges) {
      if (Math.abs(change.magnitude) > 0.5) { // > 50% change
        await analyticsDB.exec`
          INSERT INTO price_anomalies (listing_id, anomaly_type, description, magnitude)
          VALUES (${change.listing_id}, 'sudden_change', 
                  'Price changed from $${change.old_price} to $${change.new_price}', 
                  ${change.magnitude})
        `;
      }
    }

    // Detect high volatility
    const volatileListings = await ebayDB.queryAll`
      SELECT listing_id, COUNT(*) as change_count
      FROM price_history
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY listing_id
      HAVING COUNT(*) > 5
    `;

    for (const listing of volatileListings) {
      await analyticsDB.exec`
        INSERT INTO price_anomalies (listing_id, anomaly_type, description, magnitude)
        VALUES (${listing.listing_id}, 'high_volatility', 
                '${listing.change_count} price changes in 24 hours', 
                ${listing.change_count})
        ON CONFLICT (listing_id, anomaly_type) DO NOTHING
      `;
    }
  },
});

// Retrieves detected price anomalies.
export const getAnomalies = api<{ status?: string }, { anomalies: Anomaly[] }>(
  { auth: true, expose: true, method: "GET", path: "/analytics/anomalies" },
  async (req) => {
    const auth = getAuthData()!;
    let whereClause = "WHERE l.user_id = $1";
    const params: any[] = [auth.userID];

    if (req.status) {
      whereClause += ` AND pa.status = $${params.length + 1}`;
      params.push(req.status);
    }

    const anomalies = await analyticsDB.rawQueryAll(
      `SELECT pa.* FROM price_anomalies pa
       JOIN listings l ON pa.listing_id = l.id
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
