CREATE TABLE knowledge_graph_triples (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  source TEXT,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kg_triples_subject ON knowledge_graph_triples(subject_id);
CREATE INDEX idx_kg_triples_object ON knowledge_graph_triples(object_id);
CREATE INDEX idx_kg_triples_predicate ON knowledge_graph_triples(predicate);
