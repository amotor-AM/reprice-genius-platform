import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { listingsDB } from "../listings/db";
import { orchestrationTopic } from "../events/topics";
import { v4 as uuidv4 } from 'uuid';
import { orchestratorDB } from "./db";

export interface OrchestrateRepriceAllRequest {
  categoryId?: string;
  strategyId?: string;
}

export interface OrchestrateRepriceAllResponse {
  correlationId: string;
  listingsQueued: number;
  message: string;
}

// Orchestrates a bulk repricing workflow for all eligible listings.
export const repriceAll = api<OrchestrateRepriceAllRequest, OrchestrateRepriceAllResponse>(
  { auth: true, expose: true, method: "POST", path: "/orchestrate/reprice-all" },
  async (req) => {
    const auth = getAuthData()!;
    const correlationId = uuidv4();

    // Get eligible listings
    let whereClause = "WHERE p.user_id = $1 AND ml.status = 'active'";
    const params: any[] = [auth.userID];
    if (req.categoryId) {
      whereClause += " AND p.category_id = $2";
      params.push(req.categoryId);
    }
    
    const listings = await listingsDB.rawQueryAll(
      `SELECT p.id FROM products p
       JOIN marketplace_listings ml ON p.id = ml.product_id
       ${whereClause}`,
      ...params
    );

    if (listings.length === 0) {
      return { correlationId, listingsQueued: 0, message: "No listings found to reprice." };
    }

    // Start the saga
    await orchestratorDB.exec`
      INSERT INTO sagas (id, saga_type, status, current_step, payload)
      VALUES (${correlationId}, 'bulk_reprice', 'running', 'start', ${JSON.stringify({
        userId: auth.userID,
        totalListings: listings.length,
        ...req,
      })})
    `;

    // Publish an event for each listing
    for (const listing of listings) {
      await orchestrationTopic.publish({
        listingId: listing.id,
        userId: auth.userID,
        correlationId,
      });
    }

    return {
      correlationId,
      listingsQueued: listings.length,
      message: "Bulk repricing workflow started.",
    };
  }
);

// Orchestrates a full market analysis workflow.
export const marketAnalysis = api<void, { correlationId: string; message: string }>(
  { auth: true, expose: true, method: "POST", path: "/orchestrate/market-analysis" },
  async () => {
    const auth = getAuthData()!;
    const correlationId = uuidv4();

    // In a real implementation, this would trigger a complex workflow.
    // For now, we'll just start the saga.
    await orchestratorDB.exec`
      INSERT INTO sagas (id, saga_type, status, current_step, payload)
      VALUES (${correlationId}, 'market_analysis', 'running', 'start', ${JSON.stringify({
        userId: auth.userID,
      })})
    `;

    // Publish an event to start the analysis
    // (This would be handled by a saga)

    return {
      correlationId,
      message: "Full market analysis workflow started.",
    };
  }
);
