CREATE TABLE product_costs (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  cost DOUBLE PRECISION NOT NULL,
  source TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_costs_sku ON product_costs(sku);
