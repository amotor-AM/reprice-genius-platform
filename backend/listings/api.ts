import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { Query } from "encore.dev/api";
import { listingsDB } from "./db";

export interface UnifiedListing {
  id: string;
  productId: string;
  marketplace: string;
  marketplaceItemId: string;
  title: string;
  sku?: string;
  currentPrice: number;
  currency: string;
  quantity: number;
  status: string;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListUnifiedListingsRequest {
  page?: Query<number>;
  limit?: Query<number>;
  status?: Query<string>;
  marketplace?: Query<string>;
}

export interface ListUnifiedListingsResponse {
  listings: UnifiedListing[];
  total: number;
  page: number;
  limit: number;
}

// Retrieves user's unified listings with pagination.
export const list = api<ListUnifiedListingsRequest, ListUnifiedListingsResponse>(
  { auth: true, expose: true, method: "GET", path: "/listings" },
  async (req) => {
    const auth = getAuthData()!;
    const page = req.page || 1;
    const limit = Math.min(req.limit || 20, 100);
    const offset = (page - 1) * limit;

    let whereClause = "WHERE ml.user_id = $1";
    const params: any[] = [auth.userID];
    
    if (req.status) {
      whereClause += ` AND ml.status = $${params.length + 1}`;
      params.push(req.status);
    }
    if (req.marketplace) {
      whereClause += ` AND ml.marketplace = $${params.length + 1}`;
      params.push(req.marketplace);
    }

    const countResult = await listingsDB.rawQueryRow(
      `SELECT COUNT(*) as total FROM marketplace_listings ml ${whereClause}`,
      ...params
    );
    const total = countResult?.total || 0;

    const listings = await listingsDB.rawQueryAll(
      `SELECT ml.*, p.title, p.sku FROM marketplace_listings ml
       JOIN products p ON ml.product_id = p.id
       ${whereClause} 
       ORDER BY ml.created_at DESC 
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params, limit, offset
    );

    return {
      listings: listings.map(l => ({
        id: l.id,
        productId: l.product_id,
        marketplace: l.marketplace,
        marketplaceItemId: l.marketplace_item_id,
        title: l.title,
        sku: l.sku,
        currentPrice: l.current_price,
        currency: l.currency,
        quantity: 0, // TODO: Get from inventory service
        status: l.status,
        url: l.url,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })),
      total,
      page,
      limit,
    };
  }
);
