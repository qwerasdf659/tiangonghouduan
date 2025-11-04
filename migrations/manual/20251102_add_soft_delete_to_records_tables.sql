-- =====================================================
-- 为消费、兑换、积分交易记录表添加统一软删除支持
-- =====================================================
-- 创建时间: 2025-11-02
-- 目的: 实现API#7统一软删除机制
-- 涉及表: consumption_records, exchange_records, points_transactions
-- 设计原则: 
--   - 前端只负责数据展示，查询时过滤is_deleted=0
--   - 数据永久保留，禁止物理删除
--   - 管理员可恢复已删除记录
-- =====================================================

-- 获取当前数据库名
SET @db_name = DATABASE();

-- =====================================================
-- 1. consumption_records表添加软删除字段
-- =====================================================

-- 检查并添加is_deleted字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'consumption_records' 
  AND COLUMN_NAME = 'is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE consumption_records ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT "软删除标记：0=未删除（默认），1=已删除（用户端隐藏）";',
  'SELECT "consumption_records.is_deleted字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加deleted_at字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'consumption_records' 
  AND COLUMN_NAME = 'deleted_at';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE consumption_records ADD COLUMN deleted_at DATETIME(3) NULL COMMENT "删除时间（软删除时记录，管理员恢复时清空）";',
  'SELECT "consumption_records.deleted_at字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（加速查询已删除记录）
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'consumption_records' 
  AND INDEX_NAME = 'idx_consumption_is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE consumption_records ADD INDEX idx_consumption_is_deleted (is_deleted) COMMENT "软删除标记索引（用于过滤已删除记录和管理员查询）";',
  'SELECT "consumption_records.idx_consumption_is_deleted索引已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 2. exchange_records表添加软删除字段
-- =====================================================

-- 检查并添加is_deleted字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'exchange_records' 
  AND COLUMN_NAME = 'is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE exchange_records ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT "软删除标记：0=未删除（默认），1=已删除（用户端隐藏）";',
  'SELECT "exchange_records.is_deleted字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加deleted_at字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'exchange_records' 
  AND COLUMN_NAME = 'deleted_at';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE exchange_records ADD COLUMN deleted_at DATETIME(3) NULL COMMENT "删除时间（软删除时记录，恢复时清空）";',
  'SELECT "exchange_records.deleted_at字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'exchange_records' 
  AND INDEX_NAME = 'idx_exchange_is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE exchange_records ADD INDEX idx_exchange_is_deleted (is_deleted) COMMENT "软删除标记索引";',
  'SELECT "exchange_records.idx_exchange_is_deleted索引已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 3. points_transactions表添加软删除字段
-- =====================================================

-- 检查并添加is_deleted字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'points_transactions' 
  AND COLUMN_NAME = 'is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE points_transactions ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT "软删除标记：0=未删除（默认），1=已删除（用户端隐藏）";',
  'SELECT "points_transactions.is_deleted字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加deleted_at字段
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'points_transactions' 
  AND COLUMN_NAME = 'deleted_at';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE points_transactions ADD COLUMN deleted_at DATETIME(3) NULL COMMENT "删除时间（软删除时记录，恢复时清空）";',
  'SELECT "points_transactions.deleted_at字段已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引
SELECT COUNT(*) INTO @exists 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = @db_name
  AND TABLE_NAME = 'points_transactions' 
  AND INDEX_NAME = 'idx_points_is_deleted';

SET @sql = IF(@exists = 0, 
  'ALTER TABLE points_transactions ADD INDEX idx_points_is_deleted (is_deleted) COMMENT "软删除标记索引";',
  'SELECT "points_transactions.idx_points_is_deleted索引已存在" AS message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 4. 显示表结构确认修改结果
-- =====================================================

SELECT '=== consumption_records表结构 ===' AS Info;
SHOW COLUMNS FROM consumption_records LIKE '%deleted%';

SELECT '=== exchange_records表结构 ===' AS Info;
SHOW COLUMNS FROM exchange_records LIKE '%deleted%';

SELECT '=== points_transactions表结构 ===' AS Info;
SHOW COLUMNS FROM points_transactions LIKE '%deleted%';

SELECT '✅ 软删除字段添加完成' AS Result;


