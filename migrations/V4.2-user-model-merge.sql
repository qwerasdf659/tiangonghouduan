-- V4.2用户模型字段优化迁移脚本
-- 执行时间：2025年09月21日 20:26:04 UTC
-- 目的：为User模型添加password_hash字段，完成AdminUser模型合并

-- 1. 为users表添加password_hash字段
ALTER TABLE `users` 
ADD COLUMN `password_hash` VARCHAR(255) NULL 
COMMENT '密码哈希，可选，主要用手机号+验证码登录'
AFTER `nickname`;

-- 2. 验证字段添加结果
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'password_hash';

-- 3. 更新字段注释，确保字段优先级清晰
ALTER TABLE `users` MODIFY COLUMN `user_id` INT AUTO_INCREMENT COMMENT '⭐⭐⭐⭐⭐ 核心主键，必需，极高优先级';
ALTER TABLE `users` MODIFY COLUMN `mobile` VARCHAR(20) NOT NULL COMMENT '⭐⭐⭐⭐⭐ 唯一标识+登录，必需，极高优先级';
ALTER TABLE `users` MODIFY COLUMN `consecutive_fail_count` INT DEFAULT 0 COMMENT '⭐⭐⭐⭐⭐ 保底机制核心，必需，高优先级';
ALTER TABLE `users` MODIFY COLUMN `history_total_points` INT DEFAULT 0 COMMENT '⭐⭐⭐⭐⭐ 臻选空间解锁，必需，高优先级';
ALTER TABLE `users` MODIFY COLUMN `is_admin` TINYINT(1) DEFAULT 0 COMMENT '⭐⭐⭐⭐ 权限控制，必需，高优先级';

-- 4. 验证核心字段结构
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME IN (
    'user_id', 'mobile', 'consecutive_fail_count', 
    'history_total_points', 'is_admin', 'nickname', 'password_hash'
  )
ORDER BY ORDINAL_POSITION;

-- 5. 验证用户表完整性
SELECT 
  TABLE_NAME,
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'users';

-- 迁移完成标记
INSERT INTO `migration_log` (`version`, `description`, `executed_at`) 
VALUES ('V4.2', 'User模型合并AdminUser完成，添加password_hash字段', NOW())
ON DUPLICATE KEY UPDATE executed_at = NOW();

SELECT '✅ V4.2用户模型迁移完成！' as status; 