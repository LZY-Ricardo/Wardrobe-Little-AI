-- Example schema for core tables used by this project.
-- NOTE: Adjust types/constraints/indexes to match your production needs.

CREATE TABLE IF NOT EXISTS user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(64) DEFAULT NULL,
  sex VARCHAR(16) DEFAULT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  characterModel TEXT DEFAULT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  UNIQUE KEY uniq_username (username)
);

CREATE TABLE IF NOT EXISTS clothes (
  cloth_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(64) NOT NULL,
  color VARCHAR(64) NOT NULL,
  style VARCHAR(64) NOT NULL,
  season VARCHAR(64) NOT NULL,
  material VARCHAR(64) DEFAULT '',
  favorite TINYINT NOT NULL DEFAULT 0,
  image MEDIUMTEXT NULL,
  create_time BIGINT NOT NULL,
  update_time BIGINT NOT NULL,
  KEY idx_user (user_id),
  KEY idx_user_time (user_id, create_time),
  KEY idx_user_fav (user_id, favorite)
);

