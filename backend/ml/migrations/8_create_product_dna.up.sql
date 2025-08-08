CREATE TABLE product_dna (
  id TEXT PRIMARY KEY, -- listing_id
  dna_vector JSONB NOT NULL, -- 512-dimensional embedding
  model_version TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_dna_model_version ON product_dna(model_version);
CREATE INDEX idx_product_dna_feature_hash ON product_dna(feature_hash);

CREATE TABLE product_dna_history (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  dna_vector JSONB NOT NULL,
  model_version TEXT NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_dna_history_listing_id ON product_dna_history(listing_id);
