import { api, APIError } from "encore.dev/api";
import { adaptDB } from "./db";
import { strategy } from "~encore/clients";

export interface SwitchStrategyRequest {
  entityId: string; // e.g., categoryId or listingId
  reason: string;
  context: any;
}

// Instantly switches the pricing strategy for an entity.
export const switchStrategy = api<SwitchStrategyRequest, { newStrategy: string; message: string }>(
  { expose: true, method: "POST", path: "/adapt/strategy/switch" },
  async (req) => {
    // Get current state from state machine
    const stateMachine = await adaptDB.queryRow`
      SELECT * FROM strategy_state_machines WHERE id = ${req.entityId}
    `;

    if (!stateMachine) {
      throw APIError.notFound("No state machine found for this entity.");
    }

    // Determine next state based on context (simplified)
    const nextState = determineNextState(stateMachine.current_state, req.context);
    
    // Determine new strategy based on new state (contextual bandit logic)
    const newStrategy = await selectStrategyWithBandit(nextState, req.context);

    // Update state machine
    await adaptDB.exec`
      UPDATE strategy_state_machines
      SET current_state = ${nextState},
          current_strategy = ${newStrategy},
          last_transition_at = NOW()
      WHERE id = ${req.entityId}
    `;

    // Apply the new strategy (this would be a more complex call in reality)
    // await strategy.applyStrategy({ entityId: req.entityId, strategyId: newStrategy });

    return {
      newStrategy,
      message: `Strategy switched from ${stateMachine.current_strategy} to ${newStrategy} due to ${req.reason}.`,
    };
  }
);

function determineNextState(currentState: string, context: any): string {
  // Simplified state transition logic
  if (context.marketVolatility > 0.3 && currentState !== 'volatile') {
    return 'volatile';
  }
  if (context.competitorAggression > 0.7 && currentState !== 'price_war') {
    return 'price_war';
  }
  return 'stable';
}

async function selectStrategyWithBandit(state: string, context: any): Promise<string> {
  // This would use a contextual bandit model to select the best strategy (arm)
  // for the given state and context.
  if (state === 'price_war') return 'competitive_matching';
  if (state === 'volatile') return 'dynamic_demand';
  return 'profit_maximization';
}
