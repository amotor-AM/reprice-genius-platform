import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { composerDB } from "./db";
import { runSimulation } from "./strategy_simulator";
import { v4 as uuidv4 } from 'uuid';

export interface SimulateStrategyRequest {
  strategyId: string;
  listingId: string;
  simulationDays?: number;
}

export interface SimulateStrategyResponse {
  simulationId: string;
  status: string;
  results: any;
}

// Simulates the performance of a composed strategy.
export const simulate = api<SimulateStrategyRequest, SimulateStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/composer/simulate" },
  async (req) => {
    const auth = getAuthData()!;
    const simulationId = uuidv4();

    const strategy = await composerDB.queryRow`
      SELECT * FROM composed_strategies WHERE id = ${req.strategyId} AND user_id = ${auth.userID}
    `;

    if (!strategy) {
      throw APIError.notFound("Strategy not found.");
    }

    // Start simulation asynchronously
    runSimulation(simulationId, strategy, req.listingId, req.simulationDays || 30)
      .catch(err => console.error(`Simulation ${simulationId} failed:`, err));

    return {
      simulationId,
      status: 'running',
      results: {},
    };
  }
);
