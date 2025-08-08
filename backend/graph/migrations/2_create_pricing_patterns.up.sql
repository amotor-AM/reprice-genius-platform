CREATE TABLE pricing_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'successful_path', 'failed_path', 'optimal_range', 'seasonal_trend'
  category_id TEXT,
  brand_id TEXT,
  pattern_data JSONB NOT NULL,
  success_rate DOUBLE PRECISION,
  confidence_score DOUBLE PRECISION,
  sample_size INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_patterns_type ON pricing_patterns(pattern_type);
CREATE INDEX idx_pricing_patterns_category ON pricing_patterns(category_id);
CREATE INDEX idx_pricing_patterns_brand ON pricing_patterns(brand_id);
CREATE INDEX idx_pricing_patterns_success_rate ON pricing_patterns(success_rate DESC);

CREATE TABLE graph_insights (
  id BIGSERIAL PRIMARY KEY,
  insight_type TEXT NOT NULL, -- 'category_trend', 'competitor_analysis', 'price_elasticity', 'market_position'
  entity_id TEXT NOT NULL, -- category_id, product_id, brand_id
  entity_type TEXT NOT NULL, -- 'category', 'product', 'brand'
  insight_data JSONB NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  impact_score DOUBLE PRECISION,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_insights_type ON graph_insights(insight_type);
CREATE INDEX idx_graph_insights_entity ON graph_insights(entity_id, entity_type);
CREATE INDEX idx_graph_insights_confidence ON graph_insights(confidence DESC);
CREATE INDEX idx_graph_insights_expires ON graph_insights(expires_at);
