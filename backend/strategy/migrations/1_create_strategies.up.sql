CREATE TABLE pricing_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL, -- 'competitive_matching', 'profit_maximization', 'volume_optimization', 'penetration_pricing', 'dynamic_demand'
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_strategies_type ON pricing_strategies(strategy_type);
CREATE INDEX idx_pricing_strategies_active ON pricing_strategies(is_active);

CREATE TABLE strategy_evaluations (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  evaluation_data JSONB NOT NULL,
  predicted_outcome JSONB NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  market_conditions JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategy_evaluations_listing ON strategy_evaluations(listing_id);
CREATE INDEX idx_strategy_evaluations_strategy ON strategy_evaluations(strategy_id);
CREATE INDEX idx_strategy_evaluations_confidence ON strategy_evaluations(confidence_score DESC);

CREATE TABLE strategy_performance (
  id BIGSERIAL PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  listing_id TEXT,
  category_id TEXT,
  brand_id TEXT,
  performance_metrics JSONB NOT NULL,
  time_period_start TIMESTAMP NOT NULL,
  time_period_end TIMESTAMP NOT NULL,
  sample_size INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategy_performance_strategy ON strategy_performance(strategy_id);
CREATE INDEX idx_strategy_performance_category ON strategy_performance(category_id);
CREATE INDEX idx_strategy_performance_period ON strategy_performance(time_period_start, time_period_end);
