import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { profitDB } from "./db";
import { listingsDB } from "../listings/db";
import { runGeneticAlgorithm } from "./models/genetic_algorithm";

export interface PortfolioOptimizationRequest {
  listingIds: string[];
  objective: 'maximize_profit' | 'maximize_cash_flow' | 'balance_risk_return';
  constraints?: {
    maxPortfolioRisk?: number;
    minTotalProfit?: number;
    maxCapitalAllocation?: number;
  };
}

export interface PortfolioOptimizationResponse {
  optimizationId: string;
  optimalAllocation: Array<{
    listingId: string;
    recommendedPrice: number;
    capitalAllocation: number;
  }>;
  expectedOutcome: {
    totalProfit: number;
    totalRevenue: number;
    portfolioRisk: number;
    cashFlow: number;
  };
  paretoFront: any[];
}

// Optimizes the entire product portfolio for maximum profitability.
export const optimizePortfolio = api<PortfolioOptimizationRequest, PortfolioOptimizationResponse>(
  { auth: true, expose: true, method: "POST", path: "/profit/optimize/portfolio" },
  async (req) => {
    const auth = getAuthData()!;

    // Fetch data for the listings in the portfolio
    const listings = await listingsDB.queryAll`
      SELECT p.id, p.title, ml.current_price 
      FROM products p
      JOIN marketplace_listings ml ON p.id = ml.product_id
      WHERE p.id = ANY(${req.listingIds}) AND p.user_id = ${auth.userID}
    `;

    if (listings.length === 0) {
      throw APIError.invalidArgument("No valid listings found for optimization.");
    }

    // Run genetic algorithm for portfolio optimization
    const optimizationResult = await runGeneticAlgorithm({
      listings,
      objective: req.objective,
      constraints: req.constraints,
    });

    // Store optimization results
    await profitDB.exec`
      INSERT INTO portfolio_optimizations (id, user_id, config, results, status)
      VALUES (${optimizationResult.optimizationId}, ${auth.userID}, ${JSON.stringify(req)}, ${JSON.stringify(optimizationResult)}, 'completed')
    `;

    return optimizationResult;
  }
);
