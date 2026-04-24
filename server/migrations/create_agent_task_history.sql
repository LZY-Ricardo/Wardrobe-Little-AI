CREATE TABLE IF NOT EXISTS agent_task_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  source_entry VARCHAR(32) NOT NULL DEFAULT 'agent-page',
  task_type VARCHAR(32) NOT NULL,
  task_summary VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'success',
  requires_confirmation TINYINT NOT NULL DEFAULT 0,
  confirmation_status VARCHAR(16) NOT NULL DEFAULT 'not_required',
  related_object_type VARCHAR(32) DEFAULT '',
  related_object_id BIGINT NULL,
  result_summary TEXT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  KEY idx_user_time (user_id, create_time),
  KEY idx_user_type (user_id, task_type)
);
