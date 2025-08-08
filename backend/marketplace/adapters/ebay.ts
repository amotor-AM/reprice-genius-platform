import { MarketplaceAdapter } from "./base";
import { secret } from "encore.dev/config";
import { marketplaceDB } from "../db";
import { listings } from "~encore/clients";

const ebayClientId = secret("EbayClientId");
const ebayClientSecret = secret("EbayClientSecret");
const ebayRedirectUri = secret("EbayRedirectUri");

export class EbayAdapter implements MarketplaceAdapter {
  async getAuthUrl(userId: string): Promise<{ authUrl: string }> {
    const params = new URLSearchParams({
      client_id: ebayClientId(),
      redirect_uri: ebayRedirectUri(),
      response_type: 'code',
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory',
      state: userId,
    });
    return { authUrl: `https://auth.ebay.com/oauth2/authorize?${params.toString()}` };
  }

  async handleCallback(userId: string, code: string): Promise<void> {
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: ebayRedirectUri(),
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`eBay token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    await marketplaceDB.exec`
      INSERT INTO marketplace_connections (user_id, marketplace, access_token, refresh_token, token_expires_at)
      VALUES (${userId}, 'ebay', ${tokenData.access_token}, ${tokenData.refresh_token}, ${expiresAt})
      ON CONFLICT (user_id, marketplace) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  async syncListings(userId: string): Promise<{ synced: number; updated: number }> {
    // This would call the listings service to update the unified catalog
    console.log(`Syncing eBay listings for user ${userId}`);
    return { synced: 10, updated: 5 }; // Mock data
  }

  async updatePrice(marketplaceListingId: string, newPrice: number): Promise<void> {
    // This would call the eBay API to update the price
    console.log(`Updating price for eBay listing ${marketplaceListingId} to ${newPrice}`);
  }
}
