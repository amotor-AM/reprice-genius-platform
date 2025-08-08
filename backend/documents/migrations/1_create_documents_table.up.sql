CREATE TABLE processed_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'csv'
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  extracted_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processed_documents_user_id ON processed_documents(user_id);
CREATE INDEX idx_processed_documents_status ON processed_documents(status);
CREATE INDEX idx_processed_documents_file_type ON processed_documents(file_type);
