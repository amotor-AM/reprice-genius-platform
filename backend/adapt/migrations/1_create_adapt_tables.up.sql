-- Real-time state tracking using sliding windows
CREATE TABLE realtime_market_state (
  id TEXT PRIMARY KEY, -- e.g., 'category:123', 'product:456'
  state_type TEXT NOT NULL, -- 'category', 'product', 'brand'
  state_data JSONB NOT NULL, -- { sales_velocity_5m: 10, price_volatility_1h: 0.05 }
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_realtime_market_state_type ON realtime_market_state(state_type);

-- Detected micro-opportunities
CREATE TABLE micro_opportunities (
  id BIGSERIAL PRIMARY KEY,
  opportunity_type TEXT NOT NULL, -- 'pricing_window', 'competitor_oos', 'demand_spike'
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  description TEXT,
  expires_at TIMESTAMP NOT NULL,
  confidence DOUBLE PRECISION,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_micro_opportunities_expires ON micro_opportunities(expires_at);
CREATE INDEX idx_micro_opportunities_type ON micro_opportunities(opportunity_type);

-- State machine for dynamic strategy switching
CREATE TABLE strategy_state_machines (
  id TEXT PRIMARY KEY, -- e.g., 'category:123'
  current_state TEXT NOT NULL, -- 'stable', 'volatile', 'price_war'
  current_strategy TEXT NOT NULL,
  transitions JSONB NOT NULL, -- { "stable": { "on_volatility_increase": "volatile" } }
  last_transition_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Precomputed responses for instant actions
CREATE TABLE precomputed_responses (
  id TEXT PRIMARY KEY, -- hash of scenario
  scenario JSONB NOT NULL, -- { market_state, competitor_action }
  response JSONB NOT NULL, -- { action, new_price }
  confidence DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Circuit breakers for safety
CREATE TABLE circuit_breakers (
  id TEXT PRIMARY KEY, -- e.g., 'strategy:competitive_matching'
  status TEXT NOT NULL, -- 'closed', 'open', 'half_open'
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMP,
  opens_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
