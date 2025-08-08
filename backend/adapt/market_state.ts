import { api } from "encore.dev/api";
import { adaptDB } from "./db";

export interface MarketStateRequest {
  entityId: string; // e.g., categoryId or listingId
}

// Gets the current, real-time market state for an entity.
export const getCurrentState = api<MarketStateRequest, { state: any }>(
  { expose: true, method: "GET", path: "/adapt/state/current" },
  async (req) => {
    const state = await adaptDB.queryRow`
      SELECT state_data, last_updated FROM realtime_market_state
      WHERE id = ${req.entityId}
    `;

    return {
      state: state ? { ...state.state_data, last_updated: state.last_updated } : {},
    };
  }
);
