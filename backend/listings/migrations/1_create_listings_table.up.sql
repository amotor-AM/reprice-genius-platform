-- Centralized product catalog
CREATE TABLE products (
  id TEXT PRIMARY KEY, -- Internal product ID
  user_id TEXT NOT NULL,
  sku TEXT,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category_id TEXT,
  properties JSONB, -- e.g., color, size, material
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, sku)
);

-- Marketplace-specific listings linked to a central product
CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY, -- Internal listing ID
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL,
  marketplace TEXT NOT NULL, -- 'ebay', 'amazon', 'shopify'
  marketplace_item_id TEXT NOT NULL,
  url TEXT,
  status TEXT NOT NULL, -- 'active', 'sold', 'ended'
  current_price DOUBLE PRECISION NOT NULL,
  original_price DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB, -- Marketplace-specific fields
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marketplace, marketplace_item_id)
);

-- Centralized inventory management
CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) UNIQUE,
  location_id TEXT, -- For multi-location inventory
  quantity INTEGER NOT NULL,
  available_quantity INTEGER NOT NULL,
  committed_quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_history (
  id BIGSERIAL PRIMARY KEY,
  marketplace_listing_id TEXT NOT NULL REFERENCES marketplace_listings(id),
  old_price DOUBLE PRECISION NOT NULL,
  new_price DOUBLE PRECISION NOT NULL,
  reason TEXT,
  confidence_score DOUBLE PRECISION,
  market_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_marketplace_listings_product_id ON marketplace_listings(product_id);
CREATE INDEX idx_marketplace_listings_user_id ON marketplace_listings(user_id);
CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_price_history_listing_id ON price_history(marketplace_listing_id);
