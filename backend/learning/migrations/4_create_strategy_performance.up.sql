CREATE TABLE strategy_performance (
  id BIGSERIAL PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  strategy_config JSONB NOT NULL,
  
  -- Performance metrics
  total_applications INTEGER DEFAULT 0,
  successful_applications INTEGER DEFAULT 0,
  success_rate DOUBLE PRECISION DEFAULT 0,
  
  -- Financial performance
  total_revenue_impact DOUBLE PRECISION DEFAULT 0,
  avg_revenue_impact DOUBLE PRECISION DEFAULT 0,
  total_profit_impact DOUBLE PRECISION DEFAULT 0,
  avg_profit_impact DOUBLE PRECISION DEFAULT 0,
  
  -- Operational metrics
  avg_time_to_sale DOUBLE PRECISION,
  avg_conversion_rate_change DOUBLE PRECISION,
  avg_sales_velocity_change DOUBLE PRECISION,
  
  -- Risk metrics
  volatility DOUBLE PRECISION, -- Standard deviation of outcomes
  max_drawdown DOUBLE PRECISION, -- Worst single outcome
  sharpe_ratio DOUBLE PRECISION, -- Risk-adjusted return
  
  -- Multi-armed bandit metrics
  exploration_count INTEGER DEFAULT 0,
  exploitation_count INTEGER DEFAULT 0,
  regret_bound DOUBLE PRECISION,
  confidence_interval JSONB,
  
  -- Contextual information
  category_id TEXT,
  brand_id TEXT,
  price_range_min DOUBLE PRECISION,
  price_range_max DOUBLE PRECISION,
  
  -- Temporal tracking
  last_used TIMESTAMP,
  performance_trend TEXT, -- 'improving', 'stable', 'declining'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_strategy_performance_strategy_id ON strategy_performance(strategy_id);
CREATE INDEX idx_strategy_performance_success_rate ON strategy_performance(success_rate DESC);
CREATE INDEX idx_strategy_performance_category ON strategy_performance(category_id);
CREATE INDEX idx_strategy_performance_sharpe_ratio ON strategy_performance(sharpe_ratio DESC);

CREATE TABLE bandit_arms (
  id BIGSERIAL PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  strategy_config JSONB NOT NULL,
  
  -- Thompson Sampling parameters
  alpha DOUBLE PRECISION DEFAULT 1.0, -- Success count + 1
  beta DOUBLE PRECISION DEFAULT 1.0, -- Failure count + 1
  
  -- UCB parameters
  total_pulls INTEGER DEFAULT 0,
  total_reward DOUBLE PRECISION DEFAULT 0,
  avg_reward DOUBLE PRECISION DEFAULT 0,
  confidence_bound DOUBLE PRECISION DEFAULT 0,
  
  -- Epsilon-greedy parameters
  exploration_rate DOUBLE PRECISION DEFAULT 0.1,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(experiment_id, arm_id)
);

CREATE INDEX idx_bandit_arms_experiment ON bandit_arms(experiment_id);
CREATE INDEX idx_bandit_arms_avg_reward ON bandit_arms(avg_reward DESC);
