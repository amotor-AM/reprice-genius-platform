import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { pricingDB } from "./db";
import { ebayDB } from "../ebay/db";
import { userDB } from "../user/db";

export interface ApplyPriceRequest {
  listingId: string;
  newPrice: number;
  decisionId?: number;
}

export interface ApplyPriceResponse {
  success: boolean;
  message: string;
  oldPrice: number;
  newPrice: number;
}

// Applies a new price to an eBay listing.
export const applyPrice = api<ApplyPriceRequest, ApplyPriceResponse>(
  { auth: true, expose: true, method: "POST", path: "/pricing/apply" },
  async (req) => {
    const auth = getAuthData()!;

    // Get listing and user details
    const listing = await ebayDB.queryRow`
      SELECT * FROM listings 
      WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    const user = await userDB.queryRow`
      SELECT ebay_access_token FROM users WHERE id = ${auth.userID}
    `;

    if (!user?.ebay_access_token) {
      throw APIError.failedPrecondition("eBay account not connected");
    }

    // Validate price bounds
    if (listing.min_price && req.newPrice < listing.min_price) {
      throw APIError.invalidArgument(`Price cannot be below minimum: $${listing.min_price}`);
    }

    if (listing.max_price && req.newPrice > listing.max_price) {
      throw APIError.invalidArgument(`Price cannot be above maximum: $${listing.max_price}`);
    }

    try {
      // Update price on eBay (simulated - in production would call eBay API)
      const ebayUpdateSuccess = await updateEbayPrice(
        listing.ebay_item_id,
        req.newPrice,
        user.ebay_access_token
      );

      if (!ebayUpdateSuccess) {
        throw new Error("Failed to update price on eBay");
      }

      const oldPrice = listing.current_price;

      // Update local database
      await ebayDB.exec`
        UPDATE listings 
        SET current_price = ${req.newPrice}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${req.listingId}
      `;

      // Record price history
      await ebayDB.exec`
        INSERT INTO price_history (listing_id, old_price, new_price, reason, created_at)
        VALUES (${req.listingId}, ${oldPrice}, ${req.newPrice}, 'manual_update', CURRENT_TIMESTAMP)
      `;

      // Mark pricing decision as applied if provided
      if (req.decisionId) {
        await pricingDB.exec`
          UPDATE pricing_decisions 
          SET applied = true, applied_at = CURRENT_TIMESTAMP
          WHERE id = ${req.decisionId}
        `;
      }

      return {
        success: true,
        message: "Price updated successfully",
        oldPrice,
        newPrice: req.newPrice,
      };
    } catch (error) {
      console.error('Apply price error:', error);
      throw APIError.internal("Failed to update price");
    }
  }
);

async function updateEbayPrice(itemId: string, newPrice: number, accessToken: string): Promise<boolean> {
  try {
    // In production, this would call eBay's Inventory API to update the price
    // For now, we'll simulate the API call
    const response = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${itemId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product: {
          aspects: {
            price: [newPrice.toString()],
          },
        },
      }),
    });

    // For demo purposes, we'll assume success
    // In production, check response.ok and handle errors
    return true;
  } catch (error) {
    console.error('eBay price update error:', error);
    return false;
  }
}
