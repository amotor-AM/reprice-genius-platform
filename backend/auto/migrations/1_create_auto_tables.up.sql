CREATE TABLE auto_optimization_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL, -- 'automl', 'hyperparam_tuning', 'feature_engineering'
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  config JSONB,
  results JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE auto_experiments (
  id TEXT PRIMARY KEY,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL, -- 'designing', 'running', 'analyzing', 'completed'
  results JSONB,
  learnings_implemented BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE auto_healing_tasks (
  id TEXT PRIMARY KEY,
  issue_description TEXT NOT NULL,
  status TEXT NOT NULL, -- 'diagnosing', 'testing_fix', 'deploying_fix', 'resolved', 'failed'
  diagnosis JSONB,
  fix_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE auto_performance_reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL, -- 'daily', 'weekly'
  summary JSONB,
  details JSONB,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
