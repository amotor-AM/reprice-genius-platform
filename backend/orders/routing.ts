import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { ordersDB } from "./db";

export interface RouteOrderRequest {
  orderId: string;
  fulfillmentCenterId?: string;
}

// Routes an order for fulfillment.
export const routeOrder = api<RouteOrderRequest, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/orders/route" },
  async (req) => {
    const auth = getAuthData()!;

    // In a real implementation, this would contain complex logic to determine
    // the best fulfillment center based on inventory, location, cost, etc.
    
    await ordersDB.exec`
      UPDATE orders
      SET order_status = 'processing',
          shipping_details = shipping_details || ${JSON.stringify({ fulfillmentCenterId: req.fulfillmentCenterId || 'default' })}::jsonb
      WHERE id = ${req.orderId} AND user_id = ${auth.userID}
    `;

    return { success: true };
  }
);
