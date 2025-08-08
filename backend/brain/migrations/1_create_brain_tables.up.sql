CREATE TABLE master_decisions (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  decision_type TEXT NOT NULL, -- 'price_change', 'strategy_change'
  decision_payload JSONB NOT NULL,
  inputs JSONB NOT NULL, -- Store inputs from all services
  confidence DOUBLE PRECISION NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE model_registry (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  service_name TEXT NOT NULL,
  model_type TEXT NOT NULL,
  description TEXT,
  performance_metrics JSONB,
  is_active BOOLEAN DEFAULT true,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_name, model_version)
);

CREATE TABLE global_optimizations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  optimization_goal TEXT NOT NULL,
  status TEXT NOT NULL,
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE system_flags (
  id TEXT PRIMARY KEY, -- e.g., 'auto_pricing_enabled'
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
