CREATE TABLE price_history (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  old_price DOUBLE PRECISION NOT NULL,
  new_price DOUBLE PRECISION NOT NULL,
  reason TEXT,
  confidence_score DOUBLE PRECISION,
  market_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX idx_price_history_created_at ON price_history(created_at);
