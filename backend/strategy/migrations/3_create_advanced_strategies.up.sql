CREATE TABLE game_theory_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'prisoner_dilemma', 'stackelberg', 'bertrand'
  config JSONB NOT NULL,
  performance_metrics JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rl_strategy_policies (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  policy_data JSONB NOT NULL, -- e.g., neural network weights
  version INTEGER NOT NULL,
  performance_score DOUBLE PRECISION,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
