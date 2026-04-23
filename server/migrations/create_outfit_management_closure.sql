-- Outfit management closure tables

CREATE TABLE IF NOT EXISTS recommendation_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  recommendation_type VARCHAR(32) NOT NULL DEFAULT 'scene',
  scene VARCHAR(64) DEFAULT '',
  weather_summary VARCHAR(64) DEFAULT '',
  trigger_source VARCHAR(32) DEFAULT '',
  request_summary TEXT NULL,
  result_summary TEXT NULL,
  result_payload MEDIUMTEXT NULL,
  adopted TINYINT NOT NULL DEFAULT 0,
  saved_as_suit TINYINT NOT NULL DEFAULT 0,
  saved_as_outfit_log TINYINT NOT NULL DEFAULT 0,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  KEY idx_user_time (user_id, create_time),
  KEY idx_user_scene (user_id, scene)
);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  recommendation_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  feedback_result VARCHAR(16) NOT NULL,
  reason_tags TEXT NULL,
  note VARCHAR(255) DEFAULT '',
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_recommendation_feedback (recommendation_id),
  KEY idx_user_feedback_time (user_id, update_time)
);

CREATE TABLE IF NOT EXISTS outfit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  recommendation_id BIGINT NULL,
  suit_id BIGINT NULL,
  log_date VARCHAR(16) NOT NULL,
  scene VARCHAR(64) DEFAULT '',
  weather_summary VARCHAR(64) DEFAULT '',
  satisfaction TINYINT NOT NULL DEFAULT 0,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  note VARCHAR(255) DEFAULT '',
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  KEY idx_user_log_date (user_id, log_date),
  KEY idx_user_time (user_id, create_time)
);

CREATE TABLE IF NOT EXISTS outfit_log_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  outfit_log_id BIGINT NOT NULL,
  cloth_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_outfit_log (outfit_log_id),
  KEY idx_cloth (cloth_id)
);

CREATE TABLE IF NOT EXISTS user_style_profile (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  preferred_colors TEXT NULL,
  preferred_styles TEXT NULL,
  frequent_scenes TEXT NULL,
  frequent_seasons TEXT NULL,
  liked_reason_tags TEXT NULL,
  confirmation_preferences TEXT NULL,
  summary TEXT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_user_profile (user_id)
);
