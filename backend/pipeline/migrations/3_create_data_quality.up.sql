CREATE TABLE data_quality_rules (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'not_null', 'unique', 'regex', 'min_value', 'max_value'
  rule_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_quality_rules_asset_id ON data_quality_rules(asset_id);

CREATE TABLE data_quality_results (
  id BIGSERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL,
  pipeline_run_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'passed', 'failed', 'warning'
  result_details JSONB,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_quality_results_rule_id ON data_quality_results(rule_id);
CREATE INDEX idx_data_quality_results_run_id ON data_quality_results(pipeline_run_id);
CREATE INDEX idx_data_quality_results_status ON data_quality_results(status);
