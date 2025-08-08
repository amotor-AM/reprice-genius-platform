CREATE TABLE causal_graphs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT,
  graph_data JSONB NOT NULL, -- DOT format or similar
  model_version TEXT NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE counterfactual_analyses (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  scenario TEXT NOT NULL, -- "what if price was 10% lower?"
  predicted_outcome JSONB NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE causal_insights (
  id BIGSERIAL PRIMARY KEY,
  insight_type TEXT NOT NULL, -- 'direct_cause', 'confounder', 'mediator'
  description TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
