import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { behaviorDB } from "./db";
import { v4 as uuidv4 } from 'uuid';

export interface BuyerSegmentProfile {
  id: string;
  name: string;
  description: string;
  characteristics: {
    priceSensitivity: number; // 0-1
    brandAffinity: number; // 0-1
    impulseTendency: number; // 0-1
    qualityFocus: number; // 0-1
  };
}

export interface CreateBuyerProfileRequest {
  categoryId: string;
  segmentName: string;
  description?: string;
  characteristics: BuyerSegmentProfile['characteristics'];
}

// Creates or updates a buyer segment profile for a category.
export const createBuyerProfile = api<CreateBuyerProfileRequest, { profileId: string }>(
  { auth: true, expose: true, method: "POST", path: "/behavior/buyer/profile" },
  async (req) => {
    const auth = getAuthData()!;
    const profileId = uuidv4();

    await behaviorDB.exec`
      INSERT INTO buyer_segments (id, user_id, category_id, segment_name, description, characteristics)
      VALUES (${profileId}, ${auth.userID}, ${req.categoryId}, ${req.segmentName}, ${req.description}, ${JSON.stringify(req.characteristics)})
      ON CONFLICT (user_id, category_id, segment_name) DO UPDATE SET
        description = EXCLUDED.description,
        characteristics = EXCLUDED.characteristics,
        updated_at = CURRENT_TIMESTAMP
    `;

    return { profileId };
  }
);
