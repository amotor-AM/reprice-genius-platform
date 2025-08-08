CREATE TABLE composed_strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  parsed_strategy JSONB NOT NULL,
  generated_code TEXT,
  documentation TEXT,
  test_cases JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_composed_strategies_user_id ON composed_strategies(user_id);

CREATE TABLE strategy_simulations (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES composed_strategies(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'running', 'completed', 'failed'
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_strategy_simulations_strategy_id ON strategy_simulations(strategy_id);
