import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { userDB } from "./db";

export interface UserProfile {
  id: string;
  email: string | null;
  imageUrl: string;
  ebayConnected: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
}

// Retrieves the current user's profile information.
export const getProfile = api<void, UserProfile>(
  { auth: true, expose: true, method: "GET", path: "/user/profile" },
  async () => {
    const auth = getAuthData()!;
    
    let user = await userDB.queryRow`
      SELECT id, email, image_url, ebay_access_token, subscription_status, subscription_tier
      FROM users WHERE id = ${auth.userID}
    `;

    if (!user) {
      // Create user if doesn't exist
      await userDB.exec`
        INSERT INTO users (id, email, image_url)
        VALUES (${auth.userID}, ${auth.email}, ${auth.imageUrl})
      `;
      user = {
        id: auth.userID,
        email: auth.email,
        image_url: auth.imageUrl,
        ebay_access_token: null,
        subscription_status: 'inactive',
        subscription_tier: 'free'
      };
    }

    return {
      id: user.id,
      email: user.email,
      imageUrl: user.image_url,
      ebayConnected: !!user.ebay_access_token,
      subscriptionStatus: user.subscription_status,
      subscriptionTier: user.subscription_tier,
    };
  }
);
