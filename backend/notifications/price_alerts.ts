import { api } from "encore.dev/api";
import { Topic, Subscription } from "encore.dev/pubsub";
import { getAuthData } from "~encore/auth";
import { ebayDB } from "../ebay/db";
import { userDB } from "../user/db";

export interface PriceAlertEvent {
  listingId: string;
  userId: string;
  oldPrice: number;
  newPrice: number;
  reason: string;
  confidence: number;
}

export const priceAlertTopic = new Topic<PriceAlertEvent>("price-alerts", {
  deliveryGuarantee: "at-least-once",
});

// Handles price alert notifications
new Subscription(priceAlertTopic, "send-price-alerts", {
  handler: async (event) => {
    try {
      await sendPriceAlertNotification(event);
    } catch (error) {
      console.error('Error sending price alert:', error);
    }
  },
});

async function sendPriceAlertNotification(event: PriceAlertEvent) {
  // Get user and listing details
  const user = await userDB.queryRow`
    SELECT email FROM users WHERE id = ${event.userId}
  `;

  const listing = await ebayDB.queryRow`
    SELECT title FROM listings WHERE id = ${event.listingId}
  `;

  if (!user || !listing) {
    console.error('User or listing not found for price alert');
    return;
  }

  // In production, this would send an email or push notification
  console.log(`Price Alert: ${listing.title} price changed from $${event.oldPrice} to $${event.newPrice}`);
  console.log(`Reason: ${event.reason} (Confidence: ${Math.round(event.confidence * 100)}%)`);
  console.log(`User: ${user.email}`);
}

export interface CreateAlertRequest {
  listingId: string;
  alertType: 'price_drop' | 'price_increase' | 'competitor_change';
  threshold: number;
}

export interface CreateAlertResponse {
  success: boolean;
  alertId: string;
}

// Creates a new price alert for a listing.
export const createAlert = api<CreateAlertRequest, CreateAlertResponse>(
  { auth: true, expose: true, method: "POST", path: "/notifications/alerts" },
  async (req) => {
    const auth = getAuthData()!;

    // Verify listing ownership
    const listing = await ebayDB.queryRow`
      SELECT id FROM listings WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw new Error("Listing not found");
    }

    // In production, store alert preferences in database
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      success: true,
      alertId,
    };
  }
);
