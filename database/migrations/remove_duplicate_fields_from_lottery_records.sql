-- 删除lottery_records表中的重复字段
-- 创建时间: 2025-09-24
-- 目的: 删除与ip_address和user_agent重复的draw_ip和draw_device字段

-- 安全检查：确保我们在正确的数据库中
SELECT DATABASE() as current_database;

-- 检查字段是否存在并删除 draw_ip 字段
SET @sql = '';

SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'draw_ip';

SET @sql = IF(@exists > 0, 
  'ALTER TABLE lottery_records DROP COLUMN draw_ip;',
  'SELECT "draw_ip字段不存在，跳过删除" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查字段是否存在并删除 draw_device 字段
SET @sql = '';

SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'draw_device';

SET @sql = IF(@exists > 0, 
  'ALTER TABLE lottery_records DROP COLUMN draw_device;',
  'SELECT "draw_device字段不存在，跳过删除" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 显示表结构确认字段已删除
SELECT 'lottery_records表当前结构:' AS info;
DESCRIBE lottery_records;

-- 确认删除的字段
SELECT 'IP和设备信息字段状态:' AS info;
SELECT 
  'ip_address' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在' ELSE '不存在' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'ip_address'

UNION ALL

SELECT 
  'user_agent' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在' ELSE '不存在' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'user_agent'

UNION ALL

SELECT 
  'draw_ip' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在（需要删除）' ELSE '已删除' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'draw_ip'

UNION ALL

SELECT 
  'draw_device' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在（需要删除）' ELSE '已删除' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'draw_device';

-- 最终确认信息
SELECT '字段清理完成，保留ip_address和user_agent，删除draw_ip和draw_device' AS summary; 