import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { strategyDB } from "./db";

export interface CustomStrategyRule {
  condition: {
    type: 'market_trend' | 'competitor_price' | 'demand_level' | 'time_of_day' | 'day_of_week' | 'season';
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'between';
    value: any;
  };
  action: {
    type: 'price_adjustment' | 'percentage_change' | 'fixed_price' | 'competitor_match';
    value: number;
    modifier?: string;
  };
  priority: number;
}

export interface CustomizeStrategyRequest {
  name: string;
  description?: string;
  baseStrategyType: 'competitive_matching' | 'profit_maximization' | 'volume_optimization' | 'penetration_pricing' | 'dynamic_demand';
  customRules: CustomStrategyRule[];
  conditions?: {
    categories?: string[];
    priceRange?: { min: number; max: number };
    marketConditions?: string[];
  };
  constraints?: {
    minPrice?: number;
    maxPrice?: number;
    maxPriceChange?: number;
    profitMarginThreshold?: number;
  };
}

export interface CustomizeStrategyResponse {
  strategyId: string;
  name: string;
  isActive: boolean;
  validationResults: {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  };
}

// Creates a custom pricing strategy with user-defined rules.
export const customizeStrategy = api<CustomizeStrategyRequest, CustomizeStrategyResponse>(
  { auth: true, expose: true, method: "POST", path: "/strategy/customize" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Validate the custom strategy
      const validation = validateCustomStrategy(req);
      
      if (!validation.isValid) {
        throw APIError.invalidArgument(`Invalid strategy configuration: ${validation.warnings.join(', ')}`);
      }

      // Generate strategy ID
      const strategyId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store custom strategy
      await strategyDB.exec`
        INSERT INTO custom_strategies (
          id, user_id, name, description, base_strategy_type,
          custom_rules, conditions, constraints
        ) VALUES (
          ${strategyId}, ${auth.userID}, ${req.name}, ${req.description || ''},
          ${req.baseStrategyType}, ${JSON.stringify(req.customRules)},
          ${JSON.stringify(req.conditions || {})}, ${JSON.stringify(req.constraints || {})}
        )
      `;

      return {
        strategyId,
        name: req.name,
        isActive: true,
        validationResults: validation,
      };
    } catch (error) {
      console.error('Error creating custom strategy:', error);
      throw APIError.internal("Failed to create custom strategy");
    }
  }
);

function validateCustomStrategy(req: CustomizeStrategyRequest): { isValid: boolean; warnings: string[]; suggestions: string[] } {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Validate rules
  if (req.customRules.length === 0) {
    warnings.push('At least one custom rule is required');
  }

  // Check for conflicting rules
  const priceAdjustmentRules = req.customRules.filter(rule => 
    rule.action.type === 'price_adjustment' || rule.action.type === 'percentage_change'
  );

  if (priceAdjustmentRules.length > 5) {
    warnings.push('Too many price adjustment rules may cause conflicts');
    suggestions.push('Consider consolidating similar rules');
  }

  // Validate constraints
  if (req.constraints?.minPrice && req.constraints?.maxPrice) {
    if (req.constraints.minPrice >= req.constraints.maxPrice) {
      warnings.push('Minimum price must be less than maximum price');
    }
  }

  if (req.constraints?.maxPriceChange && req.constraints.maxPriceChange > 0.5) {
    warnings.push('Maximum price change above 50% may be too aggressive');
    suggestions.push('Consider limiting price changes to 20-30% for better stability');
  }

  // Validate rule logic
  for (const rule of req.customRules) {
    if (rule.action.type === 'percentage_change' && Math.abs(rule.action.value) > 0.3) {
      warnings.push(`Rule with ${rule.action.value * 100}% change may be too aggressive`);
    }

    if (rule.condition.type === 'competitor_price' && rule.action.type === 'competitor_match') {
      suggestions.push('Consider adding a small adjustment to competitor matching for differentiation');
    }
  }

  // Check for rule coverage
  const conditionTypes = new Set(req.customRules.map(rule => rule.condition.type));
  if (!conditionTypes.has('market_trend') && !conditionTypes.has('demand_level')) {
    suggestions.push('Consider adding rules for market trends or demand levels');
  }

  const isValid = warnings.length === 0;

  return { isValid, warnings, suggestions };
}

// Gets user's custom strategies
export const getCustomStrategies = api<void, { strategies: any[] }>(
  { auth: true, expose: true, method: "GET", path: "/strategy/custom" },
  async () => {
    const auth = getAuthData()!;

    const strategies = await strategyDB.queryAll`
      SELECT * FROM custom_strategies 
      WHERE user_id = ${auth.userID}
      ORDER BY created_at DESC
    `;

    return {
      strategies: strategies.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        baseStrategyType: s.base_strategy_type,
        customRules: s.custom_rules,
        conditions: s.conditions,
        constraints: s.constraints,
        isActive: s.is_active,
        createdAt: s.created_at,
      })),
    };
  }
);

// Updates a custom strategy
export const updateCustomStrategy = api<{ strategyId: string } & Partial<CustomizeStrategyRequest>, { success: boolean }>(
  { auth: true, expose: true, method: "PUT", path: "/strategy/custom/:strategyId" },
  async (req) => {
    const auth = getAuthData()!;

    // Verify ownership
    const strategy = await strategyDB.queryRow`
      SELECT id FROM custom_strategies 
      WHERE id = ${req.strategyId} AND user_id = ${auth.userID}
    `;

    if (!strategy) {
      throw APIError.notFound("Custom strategy not found");
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (req.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(req.name);
    }

    if (req.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(req.description);
    }

    if (req.customRules) {
      // Validate before updating
      const validation = validateCustomStrategy(req as CustomizeStrategyRequest);
      if (!validation.isValid) {
        throw APIError.invalidArgument(`Invalid strategy configuration: ${validation.warnings.join(', ')}`);
      }

      updates.push(`custom_rules = $${paramIndex++}`);
      values.push(JSON.stringify(req.customRules));
    }

    if (req.conditions) {
      updates.push(`conditions = $${paramIndex++}`);
      values.push(JSON.stringify(req.conditions));
    }

    if (req.constraints) {
      updates.push(`constraints = $${paramIndex++}`);
      values.push(JSON.stringify(req.constraints));
    }

    if (updates.length === 0) {
      return { success: true };
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.strategyId);

    await strategyDB.rawExec(
      `UPDATE custom_strategies SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      ...values
    );

    return { success: true };
  }
);

// Deletes a custom strategy
export const deleteCustomStrategy = api<{ strategyId: string }, { success: boolean }>(
  { auth: true, expose: true, method: "DELETE", path: "/strategy/custom/:strategyId" },
  async (req) => {
    const auth = getAuthData()!;

    const result = await strategyDB.queryRow`
      DELETE FROM custom_strategies 
      WHERE id = ${req.strategyId} AND user_id = ${auth.userID}
      RETURNING id
    `;

    if (!result) {
      throw APIError.notFound("Custom strategy not found");
    }

    return { success: true };
  }
);
