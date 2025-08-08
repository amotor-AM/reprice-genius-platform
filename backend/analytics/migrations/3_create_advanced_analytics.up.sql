CREATE TABLE sales_forecasts (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  forecast_period_days INTEGER NOT NULL,
  forecasted_sales INTEGER NOT NULL,
  confidence_interval JSONB,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sales_forecasts_listing_id ON sales_forecasts(listing_id);

CREATE TABLE strategy_cohorts (
  id BIGSERIAL PRIMARY KEY,
  cohort_id TEXT NOT NULL, -- e.g., 'strategy_X_2024-01'
  strategy_id TEXT NOT NULL,
  cohort_period TEXT NOT NULL,
  user_count INTEGER NOT NULL,
  performance_data JSONB NOT NULL, -- { day: 1, retention: 0.9, avg_revenue: 10, ... }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_strategy_cohorts_unique ON strategy_cohorts(cohort_id);

CREATE TABLE dashboard_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  configuration JSONB NOT NULL, -- { widgets: [{ type: 'kpi', metric: 'revenue' ... }] }
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_dashboard_views_user_id ON dashboard_views(user_id);

CREATE TABLE price_anomalies (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  anomaly_type TEXT NOT NULL, -- 'sudden_drop', 'sudden_increase', 'high_volatility'
  description TEXT NOT NULL,
  magnitude DOUBLE PRECISION NOT NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'new' -- 'new', 'reviewed', 'dismissed'
);
CREATE INDEX idx_price_anomalies_listing_id ON price_anomalies(listing_id);
CREATE INDEX idx_price_anomalies_status ON price_anomalies(status);
