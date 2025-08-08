-- Synthetic Data Generation
CREATE TABLE synthetic_data_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  job_type TEXT NOT NULL, -- 'market_scenario', 'counterfactual', 'edge_cases'
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  config JSONB,
  results_location TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Crowdsourced Intelligence & Benchmarking
CREATE TABLE community_benchmarks (
  id TEXT PRIMARY KEY, -- e.g., 'category:123' or 'brand:abc'
  benchmark_type TEXT NOT NULL, -- 'performance', 'pricing'
  data JSONB NOT NULL, -- { p50: 100, p75: 120, p90: 150 }
  sample_size INTEGER NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, benchmark_type)
);

-- Proprietary Metrics
CREATE TABLE proprietary_metrics (
  id TEXT PRIMARY KEY, -- e.g., listing_id or category_id
  entity_type TEXT NOT NULL, -- 'listing', 'category', 'brand'
  repricing_velocity_score DOUBLE PRECISION,
  market_dominance_index DOUBLE PRECISION,
  price_confidence_score DOUBLE PRECISION,
  profit_potential_score DOUBLE PRECISION,
  competition_intensity_index DOUBLE PRECISION,
  last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Network Effects & Collective Intelligence
CREATE TABLE network_contributions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  contribution_type TEXT NOT NULL, -- 'outcome_data', 'strategy_feedback'
  payload JSONB NOT NULL,
  anonymized BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collective_intelligence_insights (
  id TEXT PRIMARY KEY,
  insight_type TEXT NOT NULL, -- 'category_trend', 'successful_strategy_pattern'
  payload JSONB NOT NULL,
  confidence DOUBLE PRECISION,
  source_contribution_count INTEGER,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE strategy_marketplace (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL, -- from custom_strategies table
  name TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  performance_metrics JSONB,
  usage_count INTEGER DEFAULT 0,
  average_rating DOUBLE PRECISION DEFAULT 0,
  revenue_share_percent DOUBLE PRECISION DEFAULT 0.1,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
