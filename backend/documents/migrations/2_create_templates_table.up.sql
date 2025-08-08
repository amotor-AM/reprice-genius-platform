CREATE TABLE extraction_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL, -- 'invoice', 'purchase_order'
  fields JSONB NOT NULL, -- Defines fields to extract, their types, and keywords/coordinates
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_extraction_templates_user_id ON extraction_templates(user_id);
CREATE INDEX idx_extraction_templates_type ON extraction_templates(template_type);
