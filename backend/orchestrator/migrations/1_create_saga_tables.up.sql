CREATE TABLE sagas (
  id TEXT PRIMARY KEY, -- Correlation ID
  saga_type TEXT NOT NULL, -- 'price_optimization', 'bulk_reprice'
  status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'compensating'
  current_step TEXT NOT NULL,
  payload JSONB NOT NULL,
  context JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sagas_type ON sagas(saga_type);
CREATE INDEX idx_sagas_status ON sagas(status);

CREATE TABLE saga_steps (
  id BIGSERIAL PRIMARY KEY,
  saga_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'completed', 'failed'
  payload JSONB,
  result JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT
);

CREATE INDEX idx_saga_steps_saga_id ON saga_steps(saga_id);
CREATE INDEX idx_saga_steps_status ON saga_steps(status);
