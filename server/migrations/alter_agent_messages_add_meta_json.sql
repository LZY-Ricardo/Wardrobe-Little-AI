ALTER TABLE agent_messages
ADD COLUMN meta_json MEDIUMTEXT NULL AFTER content;
