CREATE TABLE demand_forecasts (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  forecast_horizon_days INTEGER NOT NULL,
  forecast_data JSONB NOT NULL, -- Array of {date, predicted_demand, confidence_lower, confidence_upper}
  model_ensemble TEXT[] NOT NULL, -- ['arima', 'prophet', 'lstm']
  confidence DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_demand_forecasts_listing_id ON demand_forecasts(listing_id);

CREATE TABLE external_signals (
  id BIGSERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL, -- 'google_trends', 'social_sentiment', 'economic_indicator'
  keyword TEXT,
  category_id TEXT,
  signal_data JSONB NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  UNIQUE(signal_type, keyword, category_id, recorded_at)
);
CREATE INDEX idx_external_signals_type ON external_signals(signal_type);
CREATE INDEX idx_external_signals_keyword ON external_signals(keyword);
CREATE INDEX idx_external_signals_recorded_at ON external_signals(recorded_at);

CREATE TABLE competitor_intelligence (
  id BIGSERIAL PRIMARY KEY,
  competitor_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'shadow_inventory', 'sales_velocity'
  metric_value DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competitor_id, listing_id, metric_type)
);
CREATE INDEX idx_competitor_intel_competitor ON competitor_intelligence(competitor_id);
CREATE INDEX idx_competitor_intel_listing ON competitor_intelligence(listing_id);

CREATE TABLE market_regimes (
  id BIGSERIAL PRIMARY KEY,
  category_id TEXT NOT NULL,
  regime_type TEXT NOT NULL, -- 'bullish', 'bearish', 'volatile', 'stable'
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  confidence DOUBLE PRECISION,
  driving_factors TEXT[]
);
CREATE INDEX idx_market_regimes_category ON market_regimes(category_id);
CREATE INDEX idx_market_regimes_type ON market_regimes(regime_type);

CREATE TABLE arbitrage_opportunities (
  id BIGSERIAL PRIMARY KEY,
  source_listing_id TEXT NOT NULL,
  target_listing_id TEXT NOT NULL,
  price_difference DOUBLE PRECISION NOT NULL,
  potential_profit DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_arbitrage_opportunities_expires ON arbitrage_opportunities(expires_at);
