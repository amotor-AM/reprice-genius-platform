import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { userDB } from "../user/db";

const ebayClientId = secret("EbayClientId");
const ebayClientSecret = secret("EbayClientSecret");
const ebayRedirectUri = secret("EbayRedirectUri");

export interface EbayAuthUrlResponse {
  authUrl: string;
}

export interface EbayCallbackRequest {
  code: string;
  state?: string;
}

export interface EbayCallbackResponse {
  success: boolean;
  message: string;
}

// Generates eBay OAuth authorization URL.
export const getAuthUrl = api<void, EbayAuthUrlResponse>(
  { auth: true, expose: true, method: "GET", path: "/ebay/auth/url" },
  async () => {
    const auth = getAuthData()!;
    const state = auth.userID; // Use user ID as state for security
    
    const params = new URLSearchParams({
      client_id: ebayClientId(),
      redirect_uri: ebayRedirectUri(),
      response_type: 'code',
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory',
      state: state,
    });

    const authUrl = `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
    
    return { authUrl };
  }
);

// Handles eBay OAuth callback and exchanges code for tokens.
export const handleCallback = api<EbayCallbackRequest, EbayCallbackResponse>(
  { auth: true, expose: true, method: "POST", path: "/ebay/auth/callback" },
  async (req) => {
    const auth = getAuthData()!;
    
    if (req.state !== auth.userID) {
      throw APIError.invalidArgument("Invalid state parameter");
    }

    try {
      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: req.code,
          redirect_uri: ebayRedirectUri(),
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json();
      
      // Store tokens in database
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      
      await userDB.exec`
        UPDATE users 
        SET ebay_access_token = ${tokenData.access_token},
            ebay_refresh_token = ${tokenData.refresh_token},
            ebay_token_expires_at = ${expiresAt},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${auth.userID}
      `;

      return {
        success: true,
        message: "eBay account connected successfully"
      };
    } catch (error) {
      console.error('eBay OAuth callback error:', error);
      throw APIError.internal("Failed to connect eBay account");
    }
  }
);
