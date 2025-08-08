import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { moatDB } from "./db";
import { listingsDB } from "../listings/db";
import { generateWithGAN } from "./models/gan";
import { v4 as uuidv4 } from 'uuid';

export interface GenerateSyntheticDataRequest {
  generationType: 'market_scenario' | 'counterfactual' | 'edge_cases';
  baseListingId?: string;
  categoryId?: string;
  count?: number;
}

export interface GenerateSyntheticDataResponse {
  jobId: string;
  message: string;
  sampleData: any[];
}

// Generates synthetic data for training and testing.
export const generate = api<GenerateSyntheticDataRequest, GenerateSyntheticDataResponse>(
  { auth: true, expose: true, method: "POST", path: "/moat/synthetic/generate" },
  async (req) => {
    const auth = getAuthData()!;
    const jobId = uuidv4();
    const count = req.count || 100;

    // Get base data for GAN
    const baseData = await getBaseData(req.baseListingId, req.categoryId);
    if (baseData.length === 0) {
      throw APIError.invalidArgument("Could not find base data for generation.");
    }

    // Simulate GAN generation
    const syntheticData = await generateWithGAN(req.generationType, baseData, count);

    // Store job and results (simplified)
    await moatDB.exec`
      INSERT INTO synthetic_data_jobs (id, user_id, job_type, status, config, results_location, completed_at)
      VALUES (${jobId}, ${auth.userID}, ${req.generationType}, 'completed', ${JSON.stringify(req)}, 'db_mock', NOW())
    `;

    return {
      jobId,
      message: `Successfully generated ${count} synthetic data points.`,
      sampleData: syntheticData.slice(0, 5),
    };
  }
);

async function getBaseData(listingId?: string, categoryId?: string): Promise<any[]> {
  let query = `
    SELECT p.properties, ml.current_price 
    FROM products p
    JOIN marketplace_listings ml ON p.id = ml.product_id
  `;
  const params: any[] = [];
  
  if (listingId) {
    query += ` WHERE p.id = $1`;
    params.push(listingId);
  } else if (categoryId) {
    query += ` WHERE p.category_id = $1`;
    params.push(categoryId);
  }
  
  query += ` LIMIT 100`;

  return listingsDB.rawQueryAll(query, ...params);
}
