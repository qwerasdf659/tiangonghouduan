-- ============================================
-- 迁移: 为points_transactions表添加删除审计字段
-- 版本: V4.7.0
-- 日期: 2025-11-10
-- 作者: 后端技术团队
-- 目的: 实施软删除审计增强，记录删除原因和操作者
-- ============================================

-- 环境检查
SELECT '开始迁移: 添加deletion_reason和deleted_by字段' as status;

-- 检查表是否存在
SELECT COUNT(*) INTO @table_exists 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'points_transactions';

-- 如果表不存在则报错
SELECT IF(@table_exists = 0, 
  'ERROR: points_transactions表不存在', 
  'SUCCESS: 表存在，继续执行迁移') as check_result;

-- ============================================
-- Step 1: 添加deletion_reason字段
-- ============================================

-- 检查deletion_reason字段是否已存在
SELECT COUNT(*) INTO @deletion_reason_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'points_transactions'
  AND COLUMN_NAME = 'deletion_reason';

-- 如果不存在则添加
SET @sql_add_deletion_reason = IF(@deletion_reason_exists = 0,
  'ALTER TABLE points_transactions 
   ADD COLUMN deletion_reason TEXT NULL 
   COMMENT ''删除原因（管理员必填，用户可选，记录为什么删除该交易记录）'' 
   AFTER deleted_at',
  'SELECT ''deletion_reason字段已存在，跳过添加'' as skip_msg');

PREPARE stmt FROM @sql_add_deletion_reason;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT IF(@deletion_reason_exists = 0,
  'SUCCESS: 已添加deletion_reason字段',
  'INFO: deletion_reason字段已存在，跳过') as deletion_reason_result;

-- ============================================
-- Step 2: 添加deleted_by字段
-- ============================================

-- 检查deleted_by字段是否已存在
SELECT COUNT(*) INTO @deleted_by_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'points_transactions'
  AND COLUMN_NAME = 'deleted_by';

-- 如果不存在则添加
SET @sql_add_deleted_by = IF(@deleted_by_exists = 0,
  'ALTER TABLE points_transactions 
   ADD COLUMN deleted_by INT NULL 
   COMMENT ''删除操作者user_id（记录是谁删除的，用于审计追溯）'' 
   AFTER deletion_reason',
  'SELECT ''deleted_by字段已存在，跳过添加'' as skip_msg');

PREPARE stmt FROM @sql_add_deleted_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT IF(@deleted_by_exists = 0,
  'SUCCESS: 已添加deleted_by字段',
  'INFO: deleted_by字段已存在，跳过') as deleted_by_result;

-- ============================================
-- Step 3: 添加索引idx_points_deleted_by
-- ============================================

-- 检查索引是否已存在
SELECT COUNT(*) INTO @index_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'points_transactions'
  AND INDEX_NAME = 'idx_points_deleted_by';

-- 如果不存在则添加
SET @sql_add_index = IF(@index_exists = 0,
  'CREATE INDEX idx_points_deleted_by 
   ON points_transactions(deleted_by) 
   COMMENT ''按删除操作者查询索引，加速审计查询''',
  'SELECT ''索引idx_points_deleted_by已存在，跳过添加'' as skip_msg');

PREPARE stmt FROM @sql_add_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT IF(@index_exists = 0,
  'SUCCESS: 已添加索引idx_points_deleted_by',
  'INFO: 索引idx_points_deleted_by已存在，跳过') as index_result;

-- ============================================
-- 验证迁移结果
-- ============================================

-- 验证字段和索引是否成功添加
SELECT 
  '迁移完成，验证结果:' as verification_title;

SELECT 
  COLUMN_NAME as field_name,
  DATA_TYPE as data_type,
  IS_NULLABLE as nullable,
  COLUMN_COMMENT as comment
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'points_transactions'
  AND COLUMN_NAME IN ('deletion_reason', 'deleted_by')
ORDER BY ORDINAL_POSITION;

SELECT 
  INDEX_NAME as index_name,
  COLUMN_NAME as column_name,
  INDEX_COMMENT as comment
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'points_transactions'
  AND INDEX_NAME = 'idx_points_deleted_by';

SELECT '✅ 迁移成功完成' as final_status;

-- ============================================
-- 回滚说明
-- ============================================
-- 如需回滚，执行以下SQL:
-- 
-- -- 删除索引
-- DROP INDEX idx_points_deleted_by ON points_transactions;
-- 
-- -- 删除字段
-- ALTER TABLE points_transactions DROP COLUMN deleted_by;
-- ALTER TABLE points_transactions DROP COLUMN deletion_reason;
-- ============================================

