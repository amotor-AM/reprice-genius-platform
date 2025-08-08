import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { pricingDB } from "./db";
import { listingsDB } from "../listings/db";
import { userDB } from "../user/db";
import { pricingTopic, analyticsTopic } from "../events/topics";
import { marketplace } from "~encore/clients";

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
    const listing = await listingsDB.queryRow`
      SELECT * FROM marketplace_listings 
      WHERE id = ${req.listingId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Listing not found");
    }

    const product = await listingsDB.queryRow`
      SELECT * FROM products WHERE id = ${listing.product_id}
    `;

    if (!product) {
      throw APIError.notFound("Product not found for listing");
    }

    // Validate price bounds
    const constraints = (product.properties as any)?.constraints || {};
    if (constraints.minPrice && req.newPrice < constraints.minPrice) {
      throw APIError.invalidArgument(`Price cannot be below minimum: $${constraints.minPrice}`);
    }

    if (constraints.maxPrice && req.newPrice > constraints.maxPrice) {
      throw APIError.invalidArgument(`Price cannot be above maximum: $${constraints.maxPrice}`);
    }

    try {
      // Update price on the marketplace
      await marketplace.updatePrice({
        marketplaceListingId: req.listingId,
        newPrice: req.newPrice,
      });

      const oldPrice = listing.current_price;

      // Update local database
      await listingsDB.exec`
        UPDATE marketplace_listings 
        SET current_price = ${req.newPrice}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${req.listingId}
      `;

      // Record price history
      await listingsDB.exec`
        INSERT INTO price_history (marketplace_listing_id, old_price, new_price, reason, created_at)
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

      // Publish PriceChanged event
      await pricingTopic.publish({
        listingId: req.listingId,
        userId: auth.userID,
        oldPrice,
        newPrice: req.newPrice,
        reason: req.decisionId ? 'ai_suggestion' : 'manual_update',
        confidence: 1.0, // Placeholder
        timestamp: new Date(),
      });

      // Publish Analytics event
      await analyticsTopic.publish({
        eventType: 'price_change',
        listingId: req.listingId,
        value: req.newPrice - oldPrice,
        timestamp: new Date(),
      });

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
