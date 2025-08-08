CREATE TABLE market_analyses (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  analysis_data JSONB NOT NULL,
  raw_response JSONB,
  confidence_score DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_analyses_listing_id ON market_analyses(listing_id);
CREATE INDEX idx_market_analyses_created_at ON market_analyses(created_at);

CREATE TABLE price_recommendations (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  recommendation_data JSONB NOT NULL,
  raw_response JSONB,
  confidence_score DOUBLE PRECISION,
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_recommendations_listing_id ON price_recommendations(listing_id);
CREATE INDEX idx_price_recommendations_applied ON price_recommendations(applied);
CREATE INDEX idx_price_recommendations_created_at ON price_recommendations(created_at);

-- Add metadata column to existing embeddings table
ALTER TABLE product_embeddings ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Update existing cache table to support vector embeddings
ALTER TABLE cache_entries ADD COLUMN IF NOT EXISTS embedding_data JSONB;
CREATE INDEX IF NOT EXISTS idx_cache_entries_embedding ON cache_entries USING GIN(embedding_data);
