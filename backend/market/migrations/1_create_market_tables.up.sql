CREATE TABLE tracked_competitors (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  competitor_id TEXT NOT NULL, -- e.g., eBay seller ID or Amazon seller ID
  product_id TEXT, -- Track for a specific product
  marketplace TEXT NOT NULL, -- 'ebay', 'amazon'
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, competitor_id, product_id)
);

CREATE TABLE market_trends (
  id BIGSERIAL PRIMARY KEY,
  category_id TEXT,
  product_id TEXT,
  trend_type TEXT NOT NULL, -- 'price', 'demand', 'supply'
  trend_value DOUBLE PRECISION NOT NULL,
  period TEXT NOT NULL, -- '7d', '30d', '90d'
  source TEXT NOT NULL, -- 'ebay', 'amazon', 'google_trends'
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, product_id, trend_type, period, source)
);

CREATE TABLE market_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_id TEXT,
  alert_type TEXT NOT NULL, -- 'price_drop', 'stock_out', 'new_competitor'
  threshold_value DOUBLE PRECISION,
  is_active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_opportunities (
  id BIGSERIAL PRIMARY KEY,
  opportunity_type TEXT NOT NULL, -- 'undervalued_item', 'low_competition', 'high_demand'
  listing_id TEXT,
  category_id TEXT,
  description TEXT NOT NULL,
  potential_impact DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
