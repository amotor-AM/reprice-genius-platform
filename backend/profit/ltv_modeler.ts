import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { profitDB } from "./db";
import { ordersDB } from "../orders/db";

export interface CalculateLTVRequest {
  customerId: string;
}

export interface CalculateLTVResponse {
  customerId: string;
  predictedLTV: number;
  confidence: number;
  ltvModel: string;
  historicalValue: number;
  keyFactors: string[];
}

// Calculates the lifetime value (LTV) for a customer.
export const calculateLTV = api<CalculateLTVRequest, CalculateLTVResponse>(
  { auth: true, expose: true, method: "POST", path: "/profit/ltv/calculate" },
  async (req) => {
    const auth = getAuthData()!;

    // Get customer's order history
    const orderHistory = await ordersDB.queryAll`
      SELECT total_price, created_at FROM orders
      WHERE customer_details->>'id' = ${req.customerId} AND user_id = ${auth.userID}
      ORDER BY created_at ASC
    `;

    if (orderHistory.length === 0) {
      throw APIError.notFound("No order history found for this customer.");
    }

    // In a real implementation, use a sophisticated LTV model (e.g., BG/NBD, Gamma-Gamma).
    // Here, we simulate the calculation.
    const historicalValue = orderHistory.reduce((sum, order) => sum + order.total_price, 0);
    const purchaseFrequency = orderHistory.length / 12; // purchases per year
    const avgOrderValue = historicalValue / orderHistory.length;
    const customerLifetime = 3; // assume 3 years

    const predictedLTV = avgOrderValue * purchaseFrequency * customerLifetime;

    const response = {
      customerId: req.customerId,
      predictedLTV,
      confidence: 0.8,
      ltvModel: "BG/NBD (Simulated)",
      historicalValue,
      keyFactors: ["Purchase Frequency", "Average Order Value", "Recency"],
    };

    // Store LTV prediction
    await profitDB.exec`
      INSERT INTO customer_ltv (customer_id, user_id, predicted_ltv, confidence, model_version)
      VALUES (${req.customerId}, ${auth.userID}, ${predictedLTV}, ${response.confidence}, ${response.ltvModel})
      ON CONFLICT (customer_id, user_id) DO UPDATE SET
        predicted_ltv = EXCLUDED.predicted_ltv,
        confidence = EXCLUDED.confidence,
        model_version = EXCLUDED.model_version,
        last_calculated = CURRENT_TIMESTAMP
    `;

    return response;
  }
);
