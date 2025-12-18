-- Manual schema for suit library tables

CREATE TABLE IF NOT EXISTS suits (
  suit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  scene VARCHAR(64) DEFAULT '',
  description VARCHAR(255) DEFAULT '',
  cover MEDIUMTEXT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'manual',
  signature VARCHAR(255) NOT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_user_signature (user_id, signature),
  KEY idx_user_time (user_id, create_time)
);

CREATE TABLE IF NOT EXISTS suit_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  suit_id BIGINT NOT NULL,
  cloth_id BIGINT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_suit (suit_id),
  KEY idx_cloth (cloth_id)
);
