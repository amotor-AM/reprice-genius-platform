CREATE TABLE performance_metrics (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_id TEXT,
  metric_type TEXT NOT NULL, -- 'revenue', 'profit', 'conversion_rate', 'avg_sale_time'
  metric_value DOUBLE PRECISION NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_performance_metrics_user_id ON performance_metrics(user_id);
CREATE INDEX idx_performance_metrics_listing_id ON performance_metrics(listing_id);
CREATE INDEX idx_performance_metrics_type ON performance_metrics(metric_type);
CREATE INDEX idx_performance_metrics_period ON performance_metrics(period_start, period_end);
