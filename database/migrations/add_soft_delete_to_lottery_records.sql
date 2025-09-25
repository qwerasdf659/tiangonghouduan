-- 为lottery_records表添加软删除支持
-- 创建时间: 2025-01-21
-- 目的: 支持LotteryDraw模型重构后的软删除功能

-- 检查字段是否已存在，如果不存在则添加
SET @sql = '';

-- 添加is_deleted字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'restaurant_lottery' 
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE lottery_records ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE COMMENT "是否已删除";',
  'SELECT "is_deleted字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加deleted_at字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'restaurant_lottery' 
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'deleted_at';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE lottery_records ADD COLUMN deleted_at DATETIME NULL COMMENT "删除时间";',
  'SELECT "deleted_at字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加软删除索引（如果不存在）
SET @sql = '';

SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = 'restaurant_lottery' 
  AND TABLE_NAME = 'lottery_records' 
  AND INDEX_NAME = 'idx_is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE lottery_records ADD INDEX idx_is_deleted (is_deleted);',
  'SELECT "idx_is_deleted索引已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 显示表结构确认
DESCRIBE lottery_records; 