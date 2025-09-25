-- 删除lottery_records表中的重复保底字段
-- 创建时间: 2025-09-24
-- 目的: 删除与guarantee_triggered字段重复的is_pity字段

-- 安全检查：确保我们在正确的数据库中
SELECT DATABASE() as current_database;

-- 数据迁移：将is_pity的数据同步到guarantee_triggered（如果有需要）
-- 检查是否存在is_pity=1但guarantee_triggered=0的不一致数据
SELECT COUNT(*) as inconsistent_records
FROM lottery_records 
WHERE is_pity = 1 AND guarantee_triggered = 0;

-- 如果存在不一致数据，先同步数据
UPDATE lottery_records 
SET guarantee_triggered = 1 
WHERE is_pity = 1 AND guarantee_triggered = 0;

-- 验证数据同步结果
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN is_pity = 1 THEN 1 END) as is_pity_count,
  COUNT(CASE WHEN guarantee_triggered = 1 THEN 1 END) as guarantee_triggered_count,
  COUNT(CASE WHEN is_pity = 1 AND guarantee_triggered = 1 THEN 1 END) as consistent_count
FROM lottery_records;

-- 删除is_pity字段的索引（如果存在）
SET @sql = '';

SELECT COUNT(*) INTO @index_exists 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND INDEX_NAME = 'idx_is_pity';

SET @sql = IF(@index_exists > 0, 
  'ALTER TABLE lottery_records DROP INDEX idx_is_pity;',
  'SELECT "idx_is_pity索引不存在，跳过删除" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查字段是否存在并删除 is_pity 字段
SET @sql = '';

SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'is_pity';

SET @sql = IF(@exists > 0, 
  'ALTER TABLE lottery_records DROP COLUMN is_pity;',
  'SELECT "is_pity字段不存在，跳过删除" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 显示表结构确认字段已删除
SELECT 'lottery_records表当前结构:' AS info;
DESCRIBE lottery_records;

-- 确认删除的字段和保留的字段
SELECT '保底字段状态:' AS info;
SELECT 
  'is_pity' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在（异常）' ELSE '已删除' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'is_pity'

UNION ALL

SELECT 
  'guarantee_triggered' as field_name,
  CASE WHEN COUNT(*) > 0 THEN '存在' ELSE '不存在（异常）' END as status
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records' 
  AND COLUMN_NAME = 'guarantee_triggered';

-- 检查guarantee_triggered字段的索引状态
SELECT 'guarantee_triggered索引状态:' AS info;
SELECT 
  INDEX_NAME,
  COLUMN_NAME,
  SEQ_IN_INDEX,
  NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'lottery_records'
  AND COLUMN_NAME = 'guarantee_triggered'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 最终确认信息
SELECT '重复保底字段清理完成，保留guarantee_triggered，删除is_pity' AS summary; 