CREATE TABLE ensemble_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'stacking', 'bagging', 'boosting'
  base_models TEXT[] NOT NULL,
  meta_model TEXT,
  performance_metrics JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contextual_bandit_arms (
  id BIGSERIAL PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  context_features TEXT[] NOT NULL,
  reward_model JSONB, -- e.g., parameters for a linear model
  total_pulls INTEGER DEFAULT 0,
  total_reward DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(experiment_id, arm_id)
);
