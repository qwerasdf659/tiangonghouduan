/**
 * 主键命名统一迁移脚本 - exchange_records表
 * 
 * 改造内容：
 *   - 主键：id → exchange_id
 *   - 业务ID字段：exchange_id → exchange_code
 * 
 * 执行前提：
 *   1. 已做好完整数据库备份
 *   2. 已在测试环境验证通过
 *   3. 选择了合适的维护窗口
 * 
 * 预计耗时：15-20分钟
 * 风险等级：中等
 */

-- =====================================================
-- 步骤1：检查前提条件（1分钟）
-- =====================================================

-- 1.1 检查表是否存在
SELECT COUNT(*) as table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exchange_records';
-- 应该返回 1

-- 1.2 检查当前表结构
DESC exchange_records;

-- 1.3 检查记录数
SELECT COUNT(*) as total_records FROM exchange_records;
-- 记录这个数字，后面要对比

-- 1.4 检查主键字段
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exchange_records'
  AND COLUMN_KEY = 'PRI';
-- 应该看到：id | int | PRI | auto_increment

-- =====================================================
-- 步骤2：检查外键约束（2分钟）
-- =====================================================

-- 2.1 查找引用exchange_records的外键
SELECT
  TABLE_NAME,
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND REFERENCED_TABLE_NAME = 'exchange_records';
-- 记录所有外键，改造后要重新创建

-- 2.2 查找exchange_records引用其他表的外键
SELECT
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exchange_records'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
-- 这些外键通常不需要修改

-- =====================================================
-- 步骤3：创建备份表（2分钟）
-- =====================================================

-- 3.1 删除旧备份表（如果存在）
DROP TABLE IF EXISTS exchange_records_backup_20250121;

-- 3.2 创建备份表（完整复制数据）
CREATE TABLE exchange_records_backup_20250121 AS
SELECT * FROM exchange_records;

-- 3.3 验证备份
SELECT COUNT(*) as backup_records FROM exchange_records_backup_20250121;
-- 应该和原表记录数一致

-- 3.4 验证备份数据完整性
SELECT
  MIN(id) as min_id,
  MAX(id) as max_id,
  COUNT(DISTINCT exchange_id) as unique_exchange_ids
FROM exchange_records_backup_20250121;

-- =====================================================
-- 步骤4：删除外键约束（如有）（2分钟）
-- =====================================================

-- 示例：如果user_inventory表有外键引用exchange_records
-- ALTER TABLE user_inventory DROP FOREIGN KEY fk_exchange_id;

-- 根据步骤2的查询结果，删除所有引用exchange_records.id的外键
-- 记录所有删除的外键定义，后面要重新创建

-- =====================================================
-- 步骤5：执行主键改造（5-8分钟）
-- =====================================================

-- 5.1 开启事务（重要！）
START TRANSACTION;

-- 5.2 修改主键名称（id → exchange_id）
ALTER TABLE exchange_records
  CHANGE COLUMN id exchange_id INT PRIMARY KEY AUTO_INCREMENT
  COMMENT '兑换记录主键ID';

-- 5.3 修改业务ID字段名称（exchange_id → exchange_code）
ALTER TABLE exchange_records
  CHANGE COLUMN exchange_id exchange_code VARCHAR(50) UNIQUE
  COMMENT '兑换业务编号（用户凭证）';

-- 5.4 验证改造结果
DESC exchange_records;
-- 应该看到：
-- exchange_id    | int         | PRI | auto_increment
-- exchange_code  | varchar(50) | UNI

-- 5.5 检查数据完整性
SELECT COUNT(*) as total FROM exchange_records;
-- 应该和改造前一致

-- 5.6 检查数据样例
SELECT
  exchange_id,
  exchange_code,
  user_id,
  product_id,
  status,
  created_at
FROM exchange_records
ORDER BY exchange_id DESC
LIMIT 10;

-- 5.7 检查exchange_code唯一性
SELECT exchange_code, COUNT(*) as count
FROM exchange_records
GROUP BY exchange_code
HAVING count > 1;
-- 应该返回 0 条记录

-- 5.8 如果一切正常，提交事务
COMMIT;

-- 如果出现任何问题，执行回滚
-- ROLLBACK;

-- =====================================================
-- 步骤6：重新创建外键约束（2分钟）
-- =====================================================

-- 示例：重新创建user_inventory的外键（如果之前删除了）
-- ALTER TABLE user_inventory
-- ADD CONSTRAINT fk_exchange_id
--   FOREIGN KEY (source_id)
--   REFERENCES exchange_records(exchange_id)
--   ON DELETE RESTRICT
--   ON UPDATE CASCADE;

-- 根据步骤4记录的外键定义，重新创建所有外键
-- 注意：现在引用的是exchange_id而不是id

-- =====================================================
-- 步骤7：验证改造结果（3分钟）
-- =====================================================

-- 7.1 验证表结构
DESC exchange_records;

-- 7.2 验证主键
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exchange_records'
  AND COLUMN_KEY = 'PRI';
-- 应该返回：exchange_id | int | PRI | auto_increment

-- 7.3 验证唯一键
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exchange_records'
  AND COLUMN_KEY = 'UNI';
-- 应该返回：exchange_code | varchar(50) | UNI

-- 7.4 验证记录数
SELECT COUNT(*) FROM exchange_records;
-- 应该和改造前一致

-- 7.5 验证数据完整性
SELECT
  MIN(exchange_id) as min_id,
  MAX(exchange_id) as max_id,
  COUNT(*) as total,
  COUNT(DISTINCT exchange_code) as unique_codes
FROM exchange_records;

-- 7.6 验证外键关联
SELECT * FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND (TABLE_NAME = 'exchange_records' OR REFERENCED_TABLE_NAME = 'exchange_records')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 7.7 对比改造前后数据
SELECT
  'original' as source,
  MIN(id) as min_id,
  MAX(id) as max_id,
  COUNT(*) as total
FROM exchange_records_backup_20250121

UNION ALL

SELECT
  'migrated' as source,
  MIN(exchange_id) as min_id,
  MAX(exchange_id) as max_id,
  COUNT(*) as total
FROM exchange_records;
-- 记录数应该完全一致

-- =====================================================
-- 步骤8：性能测试（2分钟）
-- =====================================================

-- 8.1 测试主键查询性能
EXPLAIN SELECT * FROM exchange_records WHERE exchange_id = 1;
-- 应该看到：type: const, key: PRIMARY

-- 8.2 测试业务编号查询性能
EXPLAIN SELECT * FROM exchange_records WHERE exchange_code = 'exc_test';
-- 应该看到：type: const, key: exchange_code (UNIQUE KEY)

-- 8.3 测试关联查询性能
EXPLAIN SELECT
  er.*,
  ui.id as inventory_id
FROM exchange_records er
LEFT JOIN user_inventory ui ON ui.source_id = er.exchange_id
WHERE er.user_id = 1;

-- =====================================================
-- 完成标记
-- =====================================================

SELECT
  'exchange_records表改造完成' as status,
  NOW() as completed_at,
  (SELECT COUNT(*) FROM exchange_records) as total_records;

-- =====================================================
-- 回滚方案（仅在出错时使用）
-- =====================================================

/*
-- 如果改造失败，执行以下回滚步骤：

-- 1. 删除改造后的表
DROP TABLE IF EXISTS exchange_records;

-- 2. 恢复备份表
RENAME TABLE exchange_records_backup_20250121 TO exchange_records;

-- 3. 验证数据
SELECT COUNT(*) FROM exchange_records;
DESC exchange_records;

-- 4. 恢复外键（如果之前删除了）
-- ALTER TABLE user_inventory
-- ADD CONSTRAINT fk_exchange_id
--   FOREIGN KEY (source_id) REFERENCES exchange_records(id);

-- 5. 验证系统功能
-- 运行API测试，确认功能正常
*/

-- =====================================================
-- 清理备份表（改造成功1周后执行）
-- =====================================================

/*
-- 确认改造成功且系统运行正常1周后，可以删除备份表
DROP TABLE IF EXISTS exchange_records_backup_20250121;
*/ 