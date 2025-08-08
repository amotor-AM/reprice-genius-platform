import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { profitDB } from "./db";
import { runMonteCarloSimulation } from "./models/monte_carlo";

export interface MonteCarloRequest {
  listingId: string;
  priceChangePercent: number;
  simulations?: number;
}

export interface MonteCarloResponse {
  simulationId: string;
  meanProfit: number;
  profitDistribution: Record<string, number>;
  probabilityOfProfit: number;
}

// Runs a Monte Carlo simulation for a pricing decision.
export const simulation = api<MonteCarloRequest, MonteCarloResponse>(
  { auth: true, expose: true, method: "POST", path: "/profit/simulation/monte-carlo" },
  async (req) => {
    const auth = getAuthData()!;
    const simulationId = `mc_${Date.now()}`;

    const result = await runMonteCarloSimulation({
      listingId: req.listingId,
      priceChangePercent: req.priceChangePercent,
      simulations: req.simulations || 10000,
    });

    const response = {
      simulationId,
      meanProfit: result.meanProfit,
      profitDistribution: result.distribution,
      probabilityOfProfit: result.probabilityOfProfit,
    };

    // Store simulation results
    await profitDB.exec`
      INSERT INTO monte_carlo_simulations (id, user_id, config, results, status)
      VALUES (${simulationId}, ${auth.userID}, ${JSON.stringify(req)}, ${JSON.stringify(response)}, 'completed')
    `;

    return response;
  }
);
