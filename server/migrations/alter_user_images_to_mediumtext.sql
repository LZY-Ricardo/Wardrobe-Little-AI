-- 迁移脚本：将用户头像和模特照片字段改为 MEDIUMTEXT 以支持存储 Base64 图片数据
-- 执行时间：预计 < 1 秒
-- 执行前请先备份数据库！

-- 检查当前字段类型（可选）
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM
    INFORMATION_SCHEMA.COLUMNS
WHERE
    TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user'
    AND COLUMN_NAME IN ('avatar', 'characterModel');

-- 修改字段类型
ALTER TABLE user
MODIFY COLUMN avatar MEDIUMTEXT DEFAULT NULL COMMENT '用户头像（Base64 格式）';

ALTER TABLE user
MODIFY COLUMN characterModel MEDIUMTEXT DEFAULT NULL COMMENT '用户模特照片（Base64 格式）';

-- 验证修改结果
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM
    INFORMATION_SCHEMA.COLUMNS
WHERE
    TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user'
    AND COLUMN_NAME IN ('avatar', 'characterModel');
