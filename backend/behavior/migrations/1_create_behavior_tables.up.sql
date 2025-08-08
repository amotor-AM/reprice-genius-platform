-- Buyer Psychographic Profiles
CREATE TABLE buyer_segments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT,
  segment_name TEXT NOT NULL, -- e.g., 'Bargain Hunter', 'Brand Loyalist', 'Impulse Buyer'
  description TEXT,
  characteristics JSONB, -- e.g., { price_sensitivity: 0.9, brand_affinity: 0.2 }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category_id, segment_name)
);
CREATE INDEX idx_buyer_segments_user_id ON buyer_segments(user_id);
CREATE INDEX idx_buyer_segments_category_id ON buyer_segments(category_id);

-- Competitor Personality Models
CREATE TABLE competitor_models (
  id TEXT PRIMARY KEY, -- competitor_id
  user_id TEXT NOT NULL,
  personality_type TEXT NOT NULL, -- 'Aggressive Pricer', 'Follower', 'Stable', 'Niche Player'
  pricing_algorithm_signature TEXT, -- Reverse-engineered algorithm characteristics
  response_time_hours DOUBLE PRECISION,
  blind_spots TEXT[],
  strengths TEXT[],
  confidence DOUBLE PRECISION,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_competitor_models_user_id ON competitor_models(user_id);
CREATE INDEX idx_competitor_models_personality ON competitor_models(personality_type);

-- Market Psychology Metrics
CREATE TABLE market_psychology_metrics (
  id BIGSERIAL PRIMARY KEY,
  category_id TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'fear_greed_index', 'herd_behavior_score', 'market_sentiment'
  metric_value DOUBLE PRECISION NOT NULL,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, metric_type)
);
CREATE INDEX idx_market_psychology_category ON market_psychology_metrics(category_id);
CREATE INDEX idx_market_psychology_type ON market_psychology_metrics(metric_type);

-- Behavioral Predictions
CREATE TABLE behavioral_predictions (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  prediction_type TEXT NOT NULL, -- 'impulse_buy_prob', 'price_anchor_effect', 'urgency_response'
  predicted_value DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_behavioral_predictions_listing ON behavioral_predictions(listing_id);
CREATE INDEX idx_behavioral_predictions_type ON behavioral_predictions(prediction_type);
