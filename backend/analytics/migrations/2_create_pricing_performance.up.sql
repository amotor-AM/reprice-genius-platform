CREATE TABLE pricing_performance (
  id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL,
  listing_id TEXT NOT NULL,
  price_change_amount DOUBLE PRECISION NOT NULL,
  price_change_percent DOUBLE PRECISION NOT NULL,
  views_before INTEGER DEFAULT 0,
  views_after INTEGER DEFAULT 0,
  watchers_before INTEGER DEFAULT 0,
  watchers_after INTEGER DEFAULT 0,
  sales_before INTEGER DEFAULT 0,
  sales_after INTEGER DEFAULT 0,
  time_to_sale INTEGER, -- minutes
  roi DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_performance_decision_id ON pricing_performance(decision_id);
CREATE INDEX idx_pricing_performance_listing_id ON pricing_performance(listing_id);
CREATE INDEX idx_pricing_performance_roi ON pricing_performance(roi);
