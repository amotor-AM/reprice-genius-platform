CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  marketplace_order_id TEXT NOT NULL,
  order_status TEXT NOT NULL, -- 'pending', 'processing', 'shipped', 'delivered', 'canceled'
  total_price DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  customer_details JSONB,
  shipping_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marketplace, marketplace_order_id)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(order_status);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL, -- References unified product ID
  marketplace_listing_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
