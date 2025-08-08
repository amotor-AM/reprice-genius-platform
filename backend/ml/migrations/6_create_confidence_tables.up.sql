CREATE TABLE confidence_analyses (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL,
  confidence_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_confidence_analyses_listing_id ON confidence_analyses(listing_id);
CREATE INDEX idx_confidence_analyses_type ON confidence_analyses(analysis_type);
CREATE INDEX idx_confidence_analyses_created_at ON confidence_analyses(created_at);

CREATE TABLE prediction_accuracy (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL,
  predicted_value DOUBLE PRECISION NOT NULL,
  actual_value DOUBLE PRECISION NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  accuracy_score DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prediction_accuracy_listing_id ON prediction_accuracy(listing_id);
CREATE INDEX idx_prediction_accuracy_type ON prediction_accuracy(analysis_type);
CREATE INDEX idx_prediction_accuracy_score ON prediction_accuracy(accuracy_score);
CREATE INDEX idx_prediction_accuracy_created_at ON prediction_accuracy(created_at);

CREATE TABLE model_performance (
  id BIGSERIAL PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  model_version TEXT NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  accuracy_score DOUBLE PRECISION NOT NULL,
  performance_metrics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_model_performance_type ON model_performance(analysis_type);
CREATE INDEX idx_model_performance_version ON model_performance(model_version);
CREATE INDEX idx_model_performance_created_at ON model_performance(created_at);
