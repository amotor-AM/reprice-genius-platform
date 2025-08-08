CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);

CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  command_payload JSONB, -- For executable commands
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);

CREATE TABLE proactive_suggestions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  command_payload JSONB,
  confidence DOUBLE PRECISION,
  status TEXT DEFAULT 'new', -- 'new', 'seen', 'actioned', 'dismissed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_proactive_suggestions_user_id ON proactive_suggestions(user_id);
CREATE INDEX idx_proactive_suggestions_status ON proactive_suggestions(status);
