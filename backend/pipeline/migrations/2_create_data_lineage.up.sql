CREATE TABLE data_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- 'table', 'file', 'stream'
  layer TEXT NOT NULL, -- 'raw', 'processed', 'analytics'
  location TEXT NOT NULL, -- e.g., bucket path or table name
  schema_definition JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE data_lineage (
  id BIGSERIAL PRIMARY KEY,
  source_asset_id TEXT NOT NULL,
  target_asset_id TEXT NOT NULL,
  transformation_description TEXT,
  pipeline_run_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_lineage_source ON data_lineage(source_asset_id);
CREATE INDEX idx_data_lineage_target ON data_lineage(target_asset_id);

CREATE TABLE data_versions (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  version TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  pipeline_run_id TEXT NOT NULL,
  metadata JSONB,
  UNIQUE(asset_id, version)
);

CREATE INDEX idx_data_versions_asset_id ON data_versions(asset_id);
