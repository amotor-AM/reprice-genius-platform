CREATE TABLE pricing_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model_type TEXT NOT NULL, -- 'ml', 'rule_based', 'hybrid'
  model_config JSONB NOT NULL,
  performance_metrics JSONB,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_models_type ON pricing_models(model_type);
CREATE INDEX idx_pricing_models_active ON pricing_models(is_active);
