CREATE TABLE custom_strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_strategy_type TEXT NOT NULL,
  custom_rules JSONB NOT NULL,
  conditions JSONB,
  constraints JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_custom_strategies_user ON custom_strategies(user_id);
CREATE INDEX idx_custom_strategies_type ON custom_strategies(base_strategy_type);
CREATE INDEX idx_custom_strategies_active ON custom_strategies(is_active);

CREATE TABLE strategy_backtests (
  id BIGSERIAL PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  backtest_config JSONB NOT NULL,
  historical_data JSONB NOT NULL,
  results JSONB NOT NULL,
  performance_summary JSONB NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategy_backtests_strategy ON strategy_backtests(strategy_id);
CREATE INDEX idx_strategy_backtests_period ON strategy_backtests(start_date, end_date);

CREATE TABLE strategy_selections (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  selected_strategy_id TEXT NOT NULL,
  ai_reasoning JSONB NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  alternative_strategies JSONB,
  market_context JSONB,
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategy_selections_listing ON strategy_selections(listing_id);
CREATE INDEX idx_strategy_selections_strategy ON strategy_selections(selected_strategy_id);
CREATE INDEX idx_strategy_selections_applied ON strategy_selections(applied);
