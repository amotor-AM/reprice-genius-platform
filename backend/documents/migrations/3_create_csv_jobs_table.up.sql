CREATE TABLE csv_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL, -- 'import', 'export'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  input_file_path TEXT,
  output_file_path TEXT,
  total_rows INTEGER,
  processed_rows INTEGER DEFAULT 0,
  error_log JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_csv_jobs_user_id ON csv_jobs(user_id);
CREATE INDEX idx_csv_jobs_status ON csv_jobs(status);
CREATE INDEX idx_csv_jobs_type ON csv_jobs(job_type);
