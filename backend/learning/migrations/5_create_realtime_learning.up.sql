CREATE TABLE realtime_learning_updates (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_value DOUBLE PRECISION NOT NULL,
  learning_signal JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_realtime_learning_listing ON realtime_learning_updates(listing_id);
CREATE INDEX idx_realtime_learning_processed ON realtime_learning_updates(processed);
CREATE INDEX idx_realtime_learning_created ON realtime_learning_updates(created_at);

-- Reinforcement learning state tracking
CREATE TABLE rl_states (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL,
  state_vector JSONB NOT NULL, -- Current market state representation
  action_taken TEXT, -- Last pricing action
  reward DOUBLE PRECISION, -- Reward received
  next_state_vector JSONB, -- State after action
  episode_id TEXT,
  step_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rl_states_listing ON rl_states(listing_id);
CREATE INDEX idx_rl_states_episode ON rl_states(episode_id);
CREATE INDEX idx_rl_states_reward ON rl_states(reward DESC);

-- Q-learning value function approximation
CREATE TABLE q_values (
  id BIGSERIAL PRIMARY KEY,
  state_hash TEXT NOT NULL, -- Hash of state features
  action TEXT NOT NULL, -- Pricing action
  q_value DOUBLE PRECISION NOT NULL,
  visit_count INTEGER DEFAULT 1,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(state_hash, action)
);

CREATE INDEX idx_q_values_state ON q_values(state_hash);
CREATE INDEX idx_q_values_action ON q_values(action);
CREATE INDEX idx_q_values_value ON q_values(q_value DESC);

-- Policy gradient parameters
CREATE TABLE policy_parameters (
  id BIGSERIAL PRIMARY KEY,
  parameter_name TEXT NOT NULL,
  parameter_value DOUBLE PRECISION NOT NULL,
  gradient DOUBLE PRECISION DEFAULT 0,
  momentum DOUBLE PRECISION DEFAULT 0,
  category_id TEXT,
  brand_id TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_parameters_name ON policy_parameters(parameter_name);
CREATE INDEX idx_policy_parameters_category ON policy_parameters(category_id);
