CREATE TABLE pricing_experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  experiment_type TEXT NOT NULL, -- 'ab_test', 'multi_armed_bandit', 'reinforcement_learning'
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  user_id TEXT NOT NULL,
  category_id TEXT,
  brand_id TEXT,
  strategies JSONB NOT NULL, -- Array of pricing strategies to test
  allocation_method TEXT NOT NULL DEFAULT 'equal', -- 'equal', 'thompson_sampling', 'epsilon_greedy'
  success_metric TEXT NOT NULL DEFAULT 'revenue', -- 'revenue', 'profit', 'sales_velocity', 'conversion_rate'
  confidence_threshold DOUBLE PRECISION DEFAULT 0.95,
  min_sample_size INTEGER DEFAULT 100,
  max_duration_days INTEGER DEFAULT 30,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_experiments_user_id ON pricing_experiments(user_id);
CREATE INDEX idx_pricing_experiments_status ON pricing_experiments(status);
CREATE INDEX idx_pricing_experiments_type ON pricing_experiments(experiment_type);
CREATE INDEX idx_pricing_experiments_category ON pricing_experiments(category_id);

CREATE TABLE experiment_assignments (
  id BIGSERIAL PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(experiment_id, listing_id)
);

CREATE INDEX idx_experiment_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX idx_experiment_assignments_listing ON experiment_assignments(listing_id);
CREATE INDEX idx_experiment_assignments_strategy ON experiment_assignments(strategy_id);
