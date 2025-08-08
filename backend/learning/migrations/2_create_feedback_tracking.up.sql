CREATE TABLE pricing_outcomes (
  id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT, -- Reference to pricing_decisions table
  experiment_id TEXT, -- Reference to pricing_experiments table
  listing_id TEXT NOT NULL,
  strategy_id TEXT,
  old_price DOUBLE PRECISION NOT NULL,
  new_price DOUBLE PRECISION NOT NULL,
  price_change_percent DOUBLE PRECISION NOT NULL,
  applied_at TIMESTAMP NOT NULL,
  
  -- Outcome metrics
  sales_before INTEGER DEFAULT 0,
  sales_after INTEGER DEFAULT 0,
  views_before INTEGER DEFAULT 0,
  views_after INTEGER DEFAULT 0,
  watchers_before INTEGER DEFAULT 0,
  watchers_after INTEGER DEFAULT 0,
  
  -- Time-based metrics
  time_to_first_sale INTEGER, -- minutes
  sales_velocity_change DOUBLE PRECISION, -- sales per day change
  conversion_rate_before DOUBLE PRECISION,
  conversion_rate_after DOUBLE PRECISION,
  
  -- Financial metrics
  revenue_before DOUBLE PRECISION DEFAULT 0,
  revenue_after DOUBLE PRECISION DEFAULT 0,
  profit_margin_before DOUBLE PRECISION,
  profit_margin_after DOUBLE PRECISION,
  
  -- Competitor response tracking
  competitor_responses JSONB, -- Array of competitor price changes
  market_share_change DOUBLE PRECISION,
  
  -- Outcome classification
  outcome_type TEXT, -- 'positive', 'negative', 'neutral'
  outcome_score DOUBLE PRECISION, -- Normalized score 0-1
  confidence_score DOUBLE PRECISION,
  
  -- Tracking period
  tracking_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tracking_end TIMESTAMP,
  is_complete BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_outcomes_decision_id ON pricing_outcomes(decision_id);
CREATE INDEX idx_pricing_outcomes_experiment_id ON pricing_outcomes(experiment_id);
CREATE INDEX idx_pricing_outcomes_listing_id ON pricing_outcomes(listing_id);
CREATE INDEX idx_pricing_outcomes_outcome_type ON pricing_outcomes(outcome_type);
CREATE INDEX idx_pricing_outcomes_outcome_score ON pricing_outcomes(outcome_score DESC);
CREATE INDEX idx_pricing_outcomes_applied_at ON pricing_outcomes(applied_at);
