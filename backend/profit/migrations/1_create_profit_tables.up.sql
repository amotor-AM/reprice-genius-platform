-- Portfolio Optimization
CREATE TABLE portfolio_optimizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  config JSONB NOT NULL,
  results JSONB NOT NULL,
  status TEXT NOT NULL, -- 'running', 'completed', 'failed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Lifetime Value (LTV)
CREATE TABLE customer_ltv (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  predicted_ltv DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION,
  model_version TEXT NOT NULL,
  last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, user_id)
);

-- Cost Models
CREATE TABLE cost_models (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'hidden_costs', 'opportunity_cost'
  config JSONB,
  results JSONB,
  last_run TIMESTAMP
);

-- Inventory Intelligence
CREATE TABLE inventory_intelligence (
  id TEXT PRIMARY KEY, -- product_id
  user_id TEXT NOT NULL,
  dead_stock_risk DOUBLE PRECISION,
  optimal_reorder_point INTEGER,
  clearance_price DOUBLE PRECISION,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk Assessments
CREATE TABLE risk_assessments (
  id BIGSERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL, -- listing_id or portfolio_id
  entity_type TEXT NOT NULL,
  value_at_risk DOUBLE PRECISION,
  confidence_level DOUBLE PRECISION,
  time_horizon_days INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monte Carlo Simulations
CREATE TABLE monte_carlo_simulations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  config JSONB NOT NULL,
  results JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
