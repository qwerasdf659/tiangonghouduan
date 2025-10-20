-- 主键命名统一 - SQL修复脚本
-- 数据库: restaurant_points_dev
-- 执行时间: 2025-09-30

USE restaurant_points_dev;

SET FOREIGN_KEY_CHECKS = 0;

-- ========================================
-- 阶段1：核心业务表
-- ========================================

-- 1. exchange_records
ALTER TABLE exchange_records DROP PRIMARY KEY;
ALTER TABLE exchange_records CHANGE COLUMN id exchange_id INT AUTO_INCREMENT;
ALTER TABLE exchange_records ADD PRIMARY KEY (exchange_id);

-- 修改业务ID字段（如果还未改名）
ALTER TABLE exchange_records CHANGE COLUMN exchange_id exchange_code VARCHAR(50) UNIQUE;

-- 2. trade_records
ALTER TABLE trade_records DROP PRIMARY KEY;
ALTER TABLE trade_records CHANGE COLUMN id trade_id INT AUTO_INCREMENT;
ALTER TABLE trade_records ADD PRIMARY KEY (trade_id);

-- 修改业务ID字段（如果还未改名）
ALTER TABLE trade_records CHANGE COLUMN trade_id trade_code VARCHAR(50) UNIQUE;

-- 3. user_inventory - 已完成 ✅

-- ========================================
-- 阶段2：会话消息表
-- ========================================

-- 4. customer_sessions
ALTER TABLE customer_sessions DROP PRIMARY KEY;
ALTER TABLE customer_sessions CHANGE COLUMN id session_id BIGINT AUTO_INCREMENT;
ALTER TABLE customer_sessions ADD PRIMARY KEY (session_id);

-- 5. chat_messages
ALTER TABLE chat_messages DROP PRIMARY KEY;
ALTER TABLE chat_messages CHANGE COLUMN id message_id BIGINT AUTO_INCREMENT;
ALTER TABLE chat_messages ADD PRIMARY KEY (message_id);

-- 6. user_sessions
ALTER TABLE user_sessions DROP PRIMARY KEY;
ALTER TABLE user_sessions CHANGE COLUMN id user_session_id BIGINT AUTO_INCREMENT;
ALTER TABLE user_sessions ADD PRIMARY KEY (user_session_id);

-- ========================================
-- 阶段3：辅助功能表
-- ========================================

-- 7. roles
ALTER TABLE roles DROP PRIMARY KEY;
ALTER TABLE roles CHANGE COLUMN id role_id INT AUTO_INCREMENT;
ALTER TABLE roles ADD PRIMARY KEY (role_id);

-- 8. user_roles
ALTER TABLE user_roles DROP PRIMARY KEY;
ALTER TABLE user_roles CHANGE COLUMN id user_role_id INT AUTO_INCREMENT;
ALTER TABLE user_roles ADD PRIMARY KEY (user_role_id);

-- 9. system_announcements
ALTER TABLE system_announcements DROP PRIMARY KEY;
ALTER TABLE system_announcements CHANGE COLUMN id announcement_id INT AUTO_INCREMENT;
ALTER TABLE system_announcements ADD PRIMARY KEY (announcement_id);

-- 10. feedbacks - 已完成 ✅

-- 11. image_resources - 已完成 ✅

SET FOREIGN_KEY_CHECKS = 1;

-- 验证结果
SELECT 'exchange_records' as table_name, COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'exchange_records' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'trade_records', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'trade_records' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'customer_sessions', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'customer_sessions' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'chat_messages', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'chat_messages' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'user_sessions', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'user_sessions' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'roles', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'roles' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'user_roles', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'user_roles' AND COLUMN_KEY = 'PRI'

UNION ALL

SELECT 'system_announcements', COLUMN_NAME, COLUMN_KEY, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'restaurant_points_dev' AND TABLE_NAME = 'system_announcements' AND COLUMN_KEY = 'PRI'; 