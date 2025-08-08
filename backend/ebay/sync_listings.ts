import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { ebayDB } from "./db";
import { userDB } from "../user/db";
import { listingTopic } from "../events/topics";

export interface SyncListingsResponse {
  synced: number;
  updated: number;
  message: string;
}

// Syncs user's eBay listings from eBay API.
export const syncListings = api<void, SyncListingsResponse>(
  { auth: true, expose: true, method: "POST", path: "/ebay/sync" },
  async () => {
    const auth = getAuthData()!;

    // Get user's eBay token
    const user = await userDB.queryRow`
      SELECT ebay_access_token, ebay_token_expires_at FROM users WHERE id = ${auth.userID}
    `;

    if (!user?.ebay_access_token) {
      throw APIError.failedPrecondition("eBay account not connected");
    }

    if (user.ebay_token_expires_at && new Date(user.ebay_token_expires_at) < new Date()) {
      throw APIError.failedPrecondition("eBay token expired, please reconnect");
    }

    try {
      // Fetch active listings from eBay
      const response = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item', {
        headers: {
          'Authorization': `Bearer ${user.ebay_access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`eBay API error: ${response.statusText}`);
      }

      const data = await response.json();
      let synced = 0;
      let updated = 0;

      // Process each listing
      for (const item of data.inventoryItems || []) {
        const existingListing = await ebayDB.queryRow`
          SELECT id FROM listings WHERE ebay_item_id = ${item.sku} AND user_id = ${auth.userID}
        `;

        if (existingListing) {
          // Update existing listing
          await ebayDB.exec`
            UPDATE listings SET
              title = ${item.product?.title || 'Unknown'},
              current_price = ${parseFloat(item.product?.aspects?.price?.[0] || '0')},
              quantity = ${item.availability?.shipToLocationAvailability?.quantity || 0},
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ${existingListing.id}
          `;
          updated++;
        } else {
          // Create new listing
          const listingId = `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await ebayDB.exec`
            INSERT INTO listings (
              id, user_id, ebay_item_id, title, current_price, original_price,
              quantity, listing_status, created_at, updated_at
            ) VALUES (
              ${listingId}, ${auth.userID}, ${item.sku}, 
              ${item.product?.title || 'Unknown'},
              ${parseFloat(item.product?.aspects?.price?.[0] || '0')},
              ${parseFloat(item.product?.aspects?.price?.[0] || '0')},
              ${item.availability?.shipToLocationAvailability?.quantity || 0},
              'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `;
          synced++;

          // Publish ListingCreated event
          await listingTopic.publish({
            listingId,
            userId: auth.userID,
            eventType: 'created',
            timestamp: new Date(),
          });
        }
      }

      return {
        synced,
        updated,
        message: `Successfully synced ${synced} new listings and updated ${updated} existing listings`,
      };
    } catch (error) {
      console.error('Sync listings error:', error);
      throw APIError.internal("Failed to sync eBay listings");
    }
  }
);
