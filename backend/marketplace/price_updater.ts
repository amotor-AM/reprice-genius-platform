import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { listingsDB } from "../listings/db";
import { marketplaceDB } from "./db";
import { EbayAdapter } from "./adapters/ebay";
import { AmazonAdapter } from "./adapters/amazon";
import { ShopifyAdapter } from "./adapters/shopify";

const adapters = {
  ebay: new EbayAdapter(),
  amazon: new AmazonAdapter(),
  shopify: new ShopifyAdapter(),
};

export interface UpdatePriceRequest {
  marketplaceListingId: string;
  newPrice: number;
}

// Updates the price for a specific marketplace listing.
export const updatePrice = api<UpdatePriceRequest, { success: boolean }>(
  { auth: true, method: "POST", path: "/marketplace/price/update" },
  async (req) => {
    const auth = getAuthData()!;
    
    // Get listing details to find out which marketplace it belongs to
    const listing = await listingsDB.queryRow`
      SELECT marketplace FROM marketplace_listings 
      WHERE id = ${req.marketplaceListingId} AND user_id = ${auth.userID}
    `;

    if (!listing) {
      throw APIError.notFound("Marketplace listing not found");
    }

    const adapter = adapters[listing.marketplace];
    if (!adapter) {
      throw APIError.invalidArgument(`Unsupported marketplace: ${listing.marketplace}`);
    }

    await adapter.updatePrice(req.marketplaceListingId, req.newPrice);

    // Record price history
    // This should be done via an event and handled by the listings service
    
    return { success: true };
  }
);
