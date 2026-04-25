CREATE TABLE IF NOT EXISTS agent_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(64) NOT NULL DEFAULT '新会话',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  current_task_type VARCHAR(32) DEFAULT '',
  last_message_at BIGINT NOT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  KEY idx_user_last_message (user_id, last_message_at),
  KEY idx_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role VARCHAR(16) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  meta_json MEDIUMTEXT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'chat',
  task_id BIGINT NULL,
  tool_name VARCHAR(32) DEFAULT '',
  confirmation_status VARCHAR(16) DEFAULT '',
  create_time BIGINT NOT NULL,
  KEY idx_session_time (session_id, create_time),
  KEY idx_user_session (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS agent_session_memory (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  summary TEXT NULL,
  key_facts TEXT NULL,
  active_goals TEXT NULL,
  pending_actions TEXT NULL,
  last_summarized_message_id BIGINT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_session_memory (session_id),
  KEY idx_user_session_memory (user_id, session_id)
);
