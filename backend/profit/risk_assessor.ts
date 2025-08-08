import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { profitDB } from "./db";
import { runMonteCarloSimulation } from "./models/monte_carlo";

export interface AssessRiskRequest {
  listingId: string;
  priceChangePercent: number;
  timeHorizonDays: number;
}

export interface AssessRiskResponse {
  listingId: string;
  valueAtRisk: number; // The maximum expected loss
  confidenceLevel: number;
  riskLevel: 'low' | 'medium' | 'high';
  distribution: {
    bestCaseProfit: number;
    worstCaseLoss: number;
    meanExpectedProfit: number;
  };
}

// Assesses the financial risk of a pricing decision.
export const assessRisk = api<AssessRiskRequest, AssessRiskResponse>(
  { auth: true, expose: true, method: "POST", path: "/profit/risk/assess" },
  async (req) => {
    // Run Monte Carlo simulation to assess risk
    const simulationResult = await runMonteCarloSimulation({
      listingId: req.listingId,
      priceChangePercent: req.priceChangePercent,
      simulations: 10000,
    });

    // Calculate Value at Risk (VaR) from simulation results
    const sortedOutcomes = simulationResult.outcomes.sort((a, b) => a - b);
    const confidenceLevel = 0.95;
    const varIndex = Math.floor((1 - confidenceLevel) * sortedOutcomes.length);
    const valueAtRisk = sortedOutcomes[varIndex];

    const response = {
      listingId: req.listingId,
      valueAtRisk,
      confidenceLevel,
      riskLevel: valueAtRisk < -100 ? 'high' : valueAtRisk < -50 ? 'medium' : 'low',
      distribution: {
        bestCaseProfit: sortedOutcomes[sortedOutcomes.length - 1],
        worstCaseLoss: sortedOutcomes[0],
        meanExpectedProfit: simulationResult.meanProfit,
      },
    };

    // Store risk assessment
    await profitDB.exec`
      INSERT INTO risk_assessments (entity_id, entity_type, value_at_risk, confidence_level, time_horizon_days)
      VALUES (${req.listingId}, 'listing', ${valueAtRisk}, ${confidenceLevel}, ${req.timeHorizonDays})
    `;

    return response;
  }
);
