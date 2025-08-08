CREATE TABLE marketplace_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  marketplace TEXT NOT NULL, -- 'ebay', 'amazon', 'shopify'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  scopes TEXT[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, marketplace)
);

CREATE INDEX idx_connections_user_id ON marketplace_connections(user_id);
CREATE INDEX idx_connections_marketplace ON marketplace_connections(marketplace);
