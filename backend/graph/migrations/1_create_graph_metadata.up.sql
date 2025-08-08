CREATE TABLE graph_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL, -- 'product', 'category', 'brand', 'competitor', 'price_point', 'sale'
  properties JSONB NOT NULL,
  neo4j_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_nodes_type ON graph_nodes(node_type);
CREATE INDEX idx_graph_nodes_neo4j_id ON graph_nodes(neo4j_id);
CREATE INDEX idx_graph_nodes_properties ON graph_nodes USING GIN(properties);

CREATE TABLE graph_relationships (
  id BIGSERIAL PRIMARY KEY,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL, -- 'COMPETES_WITH', 'SIMILAR_TO', 'PRICED_AT', 'SOLD_AT', 'BELONGS_TO'
  properties JSONB DEFAULT '{}',
  strength DOUBLE PRECISION DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_relationships_source ON graph_relationships(source_node_id);
CREATE INDEX idx_graph_relationships_target ON graph_relationships(target_node_id);
CREATE INDEX idx_graph_relationships_type ON graph_relationships(relationship_type);
CREATE INDEX idx_graph_relationships_strength ON graph_relationships(strength);

-- Unique constraint for relationship pairs
CREATE UNIQUE INDEX idx_graph_relationships_unique 
ON graph_relationships(source_node_id, target_node_id, relationship_type);

CREATE TABLE graph_analysis_cache (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  parameters JSONB NOT NULL,
  results JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_graph_analysis_cache_type ON graph_analysis_cache(analysis_type);
CREATE INDEX idx_graph_analysis_cache_expires ON graph_analysis_cache(expires_at);
