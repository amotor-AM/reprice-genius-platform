CREATE TABLE market_data (
  id BIGSERIAL PRIMARY KEY,
  search_query TEXT NOT NULL,
  source TEXT NOT NULL,
  avg_price DOUBLE PRECISION,
  min_price DOUBLE PRECISION,
  max_price DOUBLE PRECISION,
  sold_count INTEGER DEFAULT 0,
  active_count INTEGER DEFAULT 0,
  data_points JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_data_search_query ON market_data(search_query);
CREATE INDEX idx_market_data_source ON market_data(source);
CREATE INDEX idx_market_data_created_at ON market_data(created_at);
