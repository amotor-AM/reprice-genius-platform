import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { marketDB } from "./db";

export interface CreateAlertRequest {
  listingId?: string;
  alertType: 'price_drop' | 'stock_out' | 'new_competitor';
  thresholdValue?: number;
}

// Creates a new market alert rule.
export const createAlert = api<CreateAlertRequest, { alertId: number }>(
  { auth: true, expose: true, method: "POST", path: "/market/alerts/create" },
  async (req) => {
    const auth = getAuthData()!;

    const result = await marketDB.queryRow`
      INSERT INTO market_alerts (user_id, listing_id, alert_type, threshold_value)
      VALUES (${auth.userID}, ${req.listingId}, ${req.alertType}, ${req.thresholdValue})
      RETURNING id
    `;

    if (!result) {
      throw APIError.internal("Failed to create alert");
    }

    return { alertId: result.id };
  }
);
