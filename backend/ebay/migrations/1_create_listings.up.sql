CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ebay_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_price DOUBLE PRECISION NOT NULL,
  original_price DOUBLE PRECISION NOT NULL,
  category_id TEXT,
  condition_id TEXT,
  listing_type TEXT,
  quantity INTEGER DEFAULT 1,
  sold_quantity INTEGER DEFAULT 0,
  watchers INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  listing_status TEXT DEFAULT 'active',
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  auto_reprice_enabled BOOLEAN DEFAULT true,
  min_price DOUBLE PRECISION,
  max_price DOUBLE PRECISION,
  target_profit_margin DOUBLE PRECISION DEFAULT 0.15,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_listings_user_id ON listings(user_id);
CREATE INDEX idx_listings_ebay_item_id ON listings(ebay_item_id);
CREATE INDEX idx_listings_status ON listings(listing_status);
CREATE INDEX idx_listings_auto_reprice ON listings(auto_reprice_enabled);
