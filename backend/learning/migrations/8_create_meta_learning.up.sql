CREATE TABLE meta_models (
  id TEXT PRIMARY KEY,
  model_type TEXT NOT NULL, -- 'maml', 'reptile'
  base_task TEXT NOT NULL, -- e.g., 'price_optimization'
  performance_metrics JSONB,
  last_trained TIMESTAMP
);

CREATE TABLE transfer_learning_tasks (
  id BIGSERIAL PRIMARY KEY,
  source_category TEXT NOT NULL,
  target_category TEXT NOT NULL,
  source_model_id TEXT NOT NULL,
  target_model_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  performance_gain DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE few_shot_learning_registry (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  base_model_id TEXT NOT NULL,
  fine_tuned_model_id TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  performance_improvement DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
