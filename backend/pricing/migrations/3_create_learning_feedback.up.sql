CREATE TABLE learning_feedback (
  id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL,
  feedback_type TEXT NOT NULL, -- 'sale', 'view_increase', 'watcher_increase', 'no_activity'
  feedback_value DOUBLE PRECISION,
  time_to_feedback INTEGER, -- minutes from price change to feedback
  additional_context JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_feedback_decision_id ON learning_feedback(decision_id);
CREATE INDEX idx_learning_feedback_type ON learning_feedback(feedback_type);
CREATE INDEX idx_learning_feedback_created_at ON learning_feedback(created_at);
