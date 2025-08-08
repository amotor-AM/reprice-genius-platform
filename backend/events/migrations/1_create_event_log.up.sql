CREATE TABLE event_log (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  source_service TEXT,
  correlation_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_log_topic ON event_log(topic);
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
CREATE INDEX idx_event_log_correlation_id ON event_log(correlation_id);
