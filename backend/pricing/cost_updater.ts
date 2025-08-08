import { api } from "encore.dev/api";
import { pricingDB } from "./db";

export interface UpdateCostDataRequest {
  sku: string;
  cost: number;
  source: string;
}

// Updates cost data for a product.
export const updateCostData = api<UpdateCostDataRequest, { success: boolean }>(
  { method: "POST", path: "/pricing/cost" },
  async (req) => {
    // In a real implementation, this would update the cost basis for a product
    // which would then be used in profit calculations for pricing decisions.
    
    await pricingDB.exec`
      INSERT INTO product_costs (sku, cost, source, recorded_at)
      VALUES (${req.sku}, ${req.cost}, ${req.source}, CURRENT_TIMESTAMP)
      ON CONFLICT (sku) DO UPDATE SET
        cost = EXCLUDED.cost,
        source = EXCLUDED.source,
        recorded_at = CURRENT_TIMESTAMP
    `;

    return { success: true };
  }
);
