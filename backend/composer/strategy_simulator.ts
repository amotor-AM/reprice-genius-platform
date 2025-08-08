import { composerDB } from "./db";
import { listingsDB } from "../listings/db";

export async function runSimulation(simulationId: string, strategy: any, listingId: string, days: number) {
  await composerDB.exec`
    INSERT INTO strategy_simulations (id, strategy_id, status)
    VALUES (${simulationId}, ${strategy.id}, 'running')
  `;

  try {
    // Fetch historical data for the listing
    const historicalData = await listingsDB.queryAll`
      SELECT * FROM price_history 
      WHERE marketplace_listing_id = (SELECT id FROM marketplace_listings WHERE product_id = ${listingId} LIMIT 1)
      ORDER BY created_at DESC LIMIT ${days}
    `;

    if (historicalData.length < 1) {
      throw new Error("Not enough historical data to simulate.");
    }

    let currentPrice = historicalData[0].new_price;
    let totalRevenue = 0;
    let priceChanges = 0;

    // Simplified simulation loop
    for (let day = 0; day < days; day++) {
      const marketContext = {
        competitor_price: currentPrice * (1 + (Math.random() - 0.5) * 0.1),
        stock_level: 100 - day,
        cost: currentPrice * 0.6,
      };

      // This is a placeholder for a proper strategy interpreter
      const newPrice = applyStrategyLogic(currentPrice, strategy.parsed_strategy, marketContext);

      if (newPrice !== currentPrice) {
        priceChanges++;
      }
      currentPrice = newPrice;

      // Simulate sales
      const sales = Math.max(0, (1 - (currentPrice / 200)) * 10);
      totalRevenue += currentPrice * sales;
    }

    const results = {
      totalRevenue,
      priceChanges,
      finalPrice: currentPrice,
      avgDailyRevenue: totalRevenue / days,
    };

    await composerDB.exec`
      UPDATE strategy_simulations
      SET status = 'completed', results = ${JSON.stringify(results)}, completed_at = NOW()
      WHERE id = ${simulationId}
    `;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await composerDB.exec`
      UPDATE strategy_simulations
      SET status = 'failed', results = ${JSON.stringify({ error: errorMessage })}, completed_at = NOW()
      WHERE id = ${simulationId}
    `;
  }
}

function applyStrategyLogic(currentPrice: number, parsedStrategy: any, context: any): number {
  // This is a very simplified interpreter for the strategy logic.
  // A real implementation would require a proper execution engine.
  let newPrice = currentPrice;

  for (const rule of parsedStrategy.rules) {
    // Super simplified condition evaluation
    if (evalCondition(rule.condition, context)) {
      // Super simplified action execution
      newPrice = evalAction(rule.action, currentPrice, context);
      break; // First matching rule wins
    }
  }

  // Apply constraints
  for (const constraint of parsedStrategy.constraints) {
    if (constraint.includes('>=')) {
      const value = evalExpression(constraint.split('>=')[1], context);
      newPrice = Math.max(newPrice, value);
    }
    if (constraint.includes('<=')) {
      const value = evalExpression(constraint.split('<=')[1], context);
      newPrice = Math.min(newPrice, value);
    }
  }

  return newPrice;
}

function evalCondition(condition: string, context: any): boolean {
  // DANGER: In a real app, NEVER use eval. This requires a safe expression parser.
  // This is a placeholder for a safe evaluation engine.
  try {
    const code = `return ${condition};`;
    const func = new Function(...Object.keys(context), code);
    return func(...Object.values(context));
  } catch {
    return false;
  }
}

function evalAction(action: string, currentPrice: number, context: any): number {
  // DANGER: In a real app, NEVER use eval.
  try {
    const match = action.match(/set_price\((.*)\)/);
    if (match) {
      const code = `return ${match[1]};`;
      const func = new Function(...Object.keys(context), code);
      return func(...Object.values(context));
    }
  } catch {
    return currentPrice;
  }
  return currentPrice;
}

function evalExpression(expr: string, context: any): number {
  // DANGER: In a real app, NEVER use eval.
  try {
    const code = `return ${expr};`;
    const func = new Function(...Object.keys(context), code);
    return func(...Object.values(context));
  } catch {
    return 0;
  }
}
