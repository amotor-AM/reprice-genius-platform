import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Query } from "encore.dev/api";
import { ebayDB } from "./db";
import { userDB } from "../user/db";

export interface ListItemsRequest {
  page?: Query<number>;
  limit?: Query<number>;
  status?: Query<string>;
}

export interface EbayListing {
  id: string;
  ebayItemId: string;
  title: string;
  currentPrice: number;
  originalPrice: number;
  categoryId: string | null;
  condition: string | null;
  quantity: number;
  soldQuantity: number;
  watchers: number;
  views: number;
  status: string;
  autoRepriceEnabled: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  targetProfitMargin: number;
  startTime: Date | null;
  endTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListItemsResponse {
  listings: EbayListing[];
  total: number;
  page: number;
  limit: number;
}

// Retrieves user's eBay listings with pagination.
export const listItems = api<ListItemsRequest, ListItemsResponse>(
  { auth: true, expose: true, method: "GET", path: "/ebay/listings" },
  async (req) => {
    const auth = getAuthData()!;
    const page = req.page || 1;
    const limit = Math.min(req.limit || 20, 100);
    const offset = (page - 1) * limit;

    // Check if user has eBay connected
    const user = await userDB.queryRow`
      SELECT ebay_access_token FROM users WHERE id = ${auth.userID}
    `;

    if (!user?.ebay_access_token) {
      throw APIError.failedPrecondition("eBay account not connected");
    }

    let whereClause = "WHERE user_id = $1";
    const params: any[] = [auth.userID];
    
    if (req.status) {
      whereClause += " AND listing_status = $2";
      params.push(req.status);
    }

    // Get total count
    const countResult = await ebayDB.rawQueryRow(
      `SELECT COUNT(*) as total FROM listings ${whereClause}`,
      ...params
    );
    const total = countResult?.total || 0;

    // Get listings with pagination
    const listings = await ebayDB.rawQueryAll(
      `SELECT * FROM listings ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params, limit, offset
    );

    return {
      listings: listings.map(listing => ({
        id: listing.id,
        ebayItemId: listing.ebay_item_id,
        title: listing.title,
        currentPrice: listing.current_price,
        originalPrice: listing.original_price,
        categoryId: listing.category_id,
        condition: listing.condition_id,
        quantity: listing.quantity,
        soldQuantity: listing.sold_quantity,
        watchers: listing.watchers,
        views: listing.views,
        status: listing.listing_status,
        autoRepriceEnabled: listing.auto_reprice_enabled,
        minPrice: listing.min_price,
        maxPrice: listing.max_price,
        targetProfitMargin: listing.target_profit_margin,
        startTime: listing.start_time,
        endTime: listing.end_time,
        createdAt: listing.created_at,
        updatedAt: listing.updated_at,
      })),
      total,
      page,
      limit,
    };
  }
);
