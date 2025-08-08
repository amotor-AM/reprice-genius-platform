import { strategyDB } from "./db";

// Initialize built-in pricing strategies
export async function initializeBuiltInStrategies(): Promise<void> {
  const strategies = [
    {
      id: 'competitive_matching',
      name: 'Competitive Matching',
      description: 'Matches competitor prices with slight adjustments based on market position',
      strategy_type: 'competitive_matching',
      config: {
        priceAdjustmentMethod: 'percentage',
        targetMetric: 'market_share',
        aggressiveness: 0.5,
        constraints: {
          maxPriceChange: 0.15,
          profitMarginThreshold: 0.1,
        },
        conditions: {
          marketConditions: ['stable', 'growing'],
          competitorBehavior: ['active', 'responsive'],
        },
      },
    },
    {
      id: 'profit_maximization',
      name: 'Profit Maximization',
      description: 'Optimizes pricing to maximize profit margins while maintaining sales volume',
      strategy_type: 'profit_maximization',
      config: {
        priceAdjustmentMethod: 'dynamic',
        targetMetric: 'profit',
        aggressiveness: 0.7,
        constraints: {
          maxPriceChange: 0.2,
          profitMarginThreshold: 0.25,
        },
        conditions: {
          demandLevel: ['medium', 'high'],
          marketConditions: ['stable', 'growing'],
        },
      },
    },
    {
      id: 'volume_optimization',
      name: 'Volume Optimization',
      description: 'Focuses on maximizing sales volume through competitive pricing',
      strategy_type: 'volume_optimization',
      config: {
        priceAdjustmentMethod: 'percentage',
        targetMetric: 'volume',
        aggressiveness: 0.8,
        constraints: {
          maxPriceChange: 0.25,
          profitMarginThreshold: 0.05,
        },
        conditions: {
          demandLevel: ['low', 'medium'],
          competitorBehavior: ['aggressive'],
        },
      },
    },
    {
      id: 'penetration_pricing',
      name: 'Market Penetration',
      description: 'Aggressive pricing to gain market share and establish presence',
      strategy_type: 'penetration_pricing',
      config: {
        priceAdjustmentMethod: 'percentage',
        targetMetric: 'market_share',
        aggressiveness: 0.9,
        constraints: {
          maxPriceChange: 0.3,
          profitMarginThreshold: 0.02,
        },
        conditions: {
          marketConditions: ['new_market', 'high_competition'],
          demandLevel: ['medium', 'high'],
        },
      },
    },
    {
      id: 'dynamic_demand',
      name: 'Dynamic Demand-Based',
      description: 'Adjusts pricing based on real-time demand signals and market conditions',
      strategy_type: 'dynamic_demand',
      config: {
        priceAdjustmentMethod: 'dynamic',
        targetMetric: 'revenue',
        aggressiveness: 0.6,
        constraints: {
          maxPriceChange: 0.18,
          profitMarginThreshold: 0.15,
        },
        conditions: {
          demandLevel: ['any'],
          seasonalFactors: ['peak', 'off_peak'],
        },
      },
    },
  ];

  for (const strategy of strategies) {
    try {
      await strategyDB.exec`
        INSERT INTO pricing_strategies (id, name, description, strategy_type, config)
        VALUES (${strategy.id}, ${strategy.name}, ${strategy.description}, 
                ${strategy.strategy_type}, ${JSON.stringify(strategy.config)})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          config = EXCLUDED.config,
          updated_at = CURRENT_TIMESTAMP
      `;
    } catch (error) {
      console.error(`Error initializing strategy ${strategy.id}:`, error);
    }
  }

  console.log('Built-in pricing strategies initialized successfully');
}

// Call this function when the service starts
initializeBuiltInStrategies().catch(console.error);
