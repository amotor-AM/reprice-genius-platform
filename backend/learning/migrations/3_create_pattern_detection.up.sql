CREATE TABLE market_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'seasonal', 'competitor_response', 'demand_spike', 'price_elasticity'
  pattern_name TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  brand_id TEXT,
  
  -- Pattern characteristics
  pattern_data JSONB NOT NULL,
  strength DOUBLE PRECISION NOT NULL, -- 0-1 strength of pattern
  confidence DOUBLE PRECISION NOT NULL, -- Statistical confidence
  sample_size INTEGER NOT NULL,
  
  -- Temporal aspects
  seasonality JSONB, -- Month/day patterns
  frequency TEXT, -- 'daily', 'weekly', 'monthly', 'yearly'
  duration_days INTEGER, -- How long pattern typically lasts
  
  -- Predictive power
  prediction_accuracy DOUBLE PRECISION,
  last_validated TIMESTAMP,
  validation_count INTEGER DEFAULT 0,
  
  -- Pattern lifecycle
  first_detected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active', -- 'active', 'weakening', 'obsolete'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_patterns_type ON market_patterns(pattern_type);
CREATE INDEX idx_market_patterns_category ON market_patterns(category_id);
CREATE INDEX idx_market_patterns_strength ON market_patterns(strength DESC);
CREATE INDEX idx_market_patterns_confidence ON market_patterns(confidence DESC);
CREATE INDEX idx_market_patterns_status ON market_patterns(status);

CREATE TABLE pattern_validations (
  id BIGSERIAL PRIMARY KEY,
  pattern_id BIGINT NOT NULL,
  listing_id TEXT NOT NULL,
  predicted_outcome JSONB NOT NULL,
  actual_outcome JSONB NOT NULL,
  accuracy_score DOUBLE PRECISION NOT NULL,
  validation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pattern_validations_pattern_id ON pattern_validations(pattern_id);
CREATE INDEX idx_pattern_validations_accuracy ON pattern_validations(accuracy_score DESC);
