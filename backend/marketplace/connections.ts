import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { MarketplaceAdapter } from "./adapters/base";
import { EbayAdapter } from "./adapters/ebay";
import { AmazonAdapter } from "./adapters/amazon";
import { ShopifyAdapter } from "./adapters/shopify";

const adapters: Record<string, MarketplaceAdapter> = {
  ebay: new EbayAdapter(),
  amazon: new AmazonAdapter(),
  shopify: new ShopifyAdapter(),
};

function getAdapter(marketplace: string): MarketplaceAdapter {
  const adapter = adapters[marketplace];
  if (!adapter) {
    throw APIError.invalidArgument(`Unsupported marketplace: ${marketplace}`);
  }
  return adapter;
}

export interface GetAuthUrlRequest {
  marketplace: string;
}

export interface GetAuthUrlResponse {
  authUrl: string;
}

// Generates OAuth authorization URL for a given marketplace.
export const getAuthUrl = api<GetAuthUrlRequest, GetAuthUrlResponse>(
  { auth: true, expose: true, method: "POST", path: "/marketplace/auth/url" },
  async (req) => {
    const auth = getAuthData()!;
    const adapter = getAdapter(req.marketplace);
    return adapter.getAuthUrl(auth.userID);
  }
);

export interface HandleCallbackRequest {
  marketplace: string;
  code: string;
  state?: string;
}

// Handles OAuth callback and exchanges code for tokens.
export const handleCallback = api<HandleCallbackRequest, { success: boolean }>(
  { auth: true, expose: true, method: "POST", path: "/marketplace/auth/callback" },
  async (req) => {
    const auth = getAuthData()!;
    if (req.state !== auth.userID) {
      throw APIError.invalidArgument("Invalid state parameter");
    }
    const adapter = getAdapter(req.marketplace);
    await adapter.handleCallback(auth.userID, req.code);
    return { success: true };
  }
);
