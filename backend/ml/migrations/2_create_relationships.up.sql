CREATE TABLE product_relationships (
  id BIGSERIAL PRIMARY KEY,
  source_listing_id TEXT NOT NULL,
  target_listing_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'similar', 'competitor', 'substitute', 'complement'
  strength DOUBLE PRECISION NOT NULL CHECK (strength >= 0 AND strength <= 1),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_relationships_source ON product_relationships(source_listing_id);
CREATE INDEX idx_product_relationships_target ON product_relationships(target_listing_id);
CREATE INDEX idx_product_relationships_type ON product_relationships(relationship_type);
CREATE INDEX idx_product_relationships_strength ON product_relationships(strength DESC);

-- Ensure no duplicate relationships
CREATE UNIQUE INDEX idx_product_relationships_unique 
ON product_relationships(source_listing_id, target_listing_id, relationship_type);
