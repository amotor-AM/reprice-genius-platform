CREATE TABLE sale_predictions (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  price_point DOUBLE PRECISION NOT NULL,
  time_horizon_hours INTEGER NOT NULL,
  sale_probability DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_predictions_listing_id ON sale_predictions(listing_id);

CREATE TABLE listing_timing_optimizations (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  optimal_day_of_week INTEGER,
  optimal_hour_of_day INTEGER,
  predicted_performance_increase DOUBLE PRECISION,
  confidence DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_elasticity_curves (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  elasticity_data JSONB NOT NULL, -- Array of {price, demand} points
  model_version TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_anomalies (
  id BIGSERIAL PRIMARY KEY,
  anomaly_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  metadata JSONB,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_anomalies_type ON market_anomalies(anomaly_type);
CREATE INDEX idx_market_anomalies_entity ON market_anomalies(entity_id, entity_type);
