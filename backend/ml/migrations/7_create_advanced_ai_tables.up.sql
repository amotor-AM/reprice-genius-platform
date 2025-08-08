CREATE TABLE ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_type TEXT NOT NULL, -- 'transformer', 'lstm', 'gnn', 'sentiment'
  version TEXT NOT NULL,
  description TEXT,
  config JSONB,
  trained_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(name, version)
);

CREATE TABLE model_performance_metrics (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  evaluation_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sentiment_analysis_results (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  review_id TEXT,
  sentiment TEXT NOT NULL, -- 'positive', 'negative', 'neutral'
  confidence DOUBLE PRECISION NOT NULL,
  analysis_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
