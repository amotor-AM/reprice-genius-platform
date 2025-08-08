CREATE TABLE hypotheses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL, -- 'generated', 'testing', 'validated', 'invalidated'
  source TEXT NOT NULL, -- 'ai_generated', 'manual'
  confidence DOUBLE PRECISION,
  expected_impact DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hypothesis_tests (
  id BIGSERIAL PRIMARY KEY,
  hypothesis_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  result JSONB,
  p_value DOUBLE PRECISION,
  is_significant BOOLEAN,
  completed_at TIMESTAMP
);
