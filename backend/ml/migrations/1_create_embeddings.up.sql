CREATE TABLE product_embeddings (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  embedding_vector JSONB NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'v1.0',
  feature_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_embeddings_listing_id ON product_embeddings(listing_id);
CREATE INDEX idx_product_embeddings_model_version ON product_embeddings(model_version);
CREATE INDEX idx_product_embeddings_feature_hash ON product_embeddings(feature_hash);
