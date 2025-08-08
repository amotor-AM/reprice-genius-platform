CREATE TABLE vector_cache (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  vector_data JSONB NOT NULL,
  metadata JSONB,
  feature_hash TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'upstash_v1.0',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vector_cache_listing_id ON vector_cache(listing_id);
CREATE INDEX idx_vector_cache_feature_hash ON vector_cache(feature_hash);
CREATE INDEX idx_vector_cache_expires_at ON vector_cache(expires_at);
CREATE INDEX idx_vector_cache_model_version ON vector_cache(model_version);

-- Auto-cleanup function for expired vector cache
CREATE OR REPLACE FUNCTION cleanup_expired_vector_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM vector_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create similarity search optimization table
CREATE TABLE similarity_search_cache (
  id TEXT PRIMARY KEY,
  source_listing_id TEXT NOT NULL,
  similar_listings JSONB NOT NULL,
  search_params JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_similarity_search_cache_source ON similarity_search_cache(source_listing_id);
CREATE INDEX idx_similarity_search_cache_expires_at ON similarity_search_cache(expires_at);
