CREATE TABLE pricing_decisions (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  old_price DOUBLE PRECISION NOT NULL,
  suggested_price DOUBLE PRECISION NOT NULL,
  confidence_score DOUBLE PRECISION NOT NULL,
  reasoning JSONB,
  market_factors JSONB,
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMP,
  outcome_tracked BOOLEAN DEFAULT false,
  outcome_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_decisions_listing_id ON pricing_decisions(listing_id);
CREATE INDEX idx_pricing_decisions_model_id ON pricing_decisions(model_id);
CREATE INDEX idx_pricing_decisions_applied ON pricing_decisions(applied);
CREATE INDEX idx_pricing_decisions_created_at ON pricing_decisions(created_at);
