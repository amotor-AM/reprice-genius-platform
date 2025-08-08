CREATE TABLE feature_definitions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL, -- 'numeric', 'categorical', 'text', 'vector'
  source TEXT NOT NULL,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, version)
);

CREATE TABLE feature_values (
  id BIGSERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  feature_value JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feature_values_entity_id ON feature_values(entity_id);
CREATE INDEX idx_feature_values_feature_name ON feature_values(feature_name);
CREATE INDEX idx_feature_values_timestamp ON feature_values(timestamp DESC);
