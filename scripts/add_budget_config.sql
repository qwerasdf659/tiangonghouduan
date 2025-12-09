-- ============================================================
-- 预算系数动态配置 - 数据库初始化脚本
-- ============================================================
-- 创建时间：2025-12-08
-- 说明：在system_settings表中新增预算分配系数配置
-- 用途：支持管理后台动态修改预算分配系数（消费金额×系数=预算积分）
-- 默认值：0.24（计算公式：消费额×10%×80%×3）
-- ============================================================

-- 插入预算系数配置（如已存在则更新时间）
INSERT INTO system_settings (
  category,
  setting_key,
  setting_value,
  value_type,
  description,
  is_visible,
  is_readonly,
  updated_by,
  created_at,
  updated_at
) VALUES (
  'points',                                       -- 分类：积分设置
  'budget_allocation_ratio',                      -- 配置键
  '0.24',                                         -- 默认值：0.24
  'number',                                       -- 数值类型
  '预算分配系数（消费金额×该系数=预算积分，公式：消费额×10%×80%×3=0.24）',
  1,                                              -- 可见
  0,                                              -- 非只读（允许管理员修改）
  1,                                              -- 创建人ID（admin）
  NOW(),                                          -- 创建时间
  NOW()                                           -- 更新时间
) ON DUPLICATE KEY UPDATE 
  updated_at = NOW();                             -- 如果已存在，只更新时间

-- ============================================================
-- 验证插入结果
-- ============================================================
SELECT 
  setting_id,
  category,
  setting_key,
  setting_value,
  value_type,
  description,
  is_visible,
  is_readonly,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
FROM system_settings 
WHERE setting_key = 'budget_allocation_ratio';

-- ============================================================
-- 预期结果示例
-- ============================================================
-- +------------+----------+-------------------------+---------------+------------+----------------------------------+------------+-------------+---------------------+---------------------+
-- | setting_id | category | setting_key             | setting_value | value_type | description                      | is_visible | is_readonly | created_at          | updated_at          |
-- +------------+----------+-------------------------+---------------+------------+----------------------------------+------------+-------------+---------------------+---------------------+
-- |         XX | points   | budget_allocation_ratio | 0.24          | number     | 预算分配系数（消费金额×...）       |          1 |           0 | 2025-12-08 14:30:00 | 2025-12-08 14:30:00 |
-- +------------+----------+-------------------------+---------------+------------+----------------------------------+------------+-------------+---------------------+---------------------+

-- ============================================================
-- 使用说明
-- ============================================================
-- 执行方式1（命令行）：
--   mysql -u root -p123456 restaurant_lottery < scripts/add_budget_config.sql
--
-- 执行方式2（MySQL客户端）：
--   mysql -u root -p123456 restaurant_lottery
--   source scripts/add_budget_config.sql;
--
-- 执行方式3（复制粘贴）：
--   登录MySQL后，复制INSERT语句直接执行
--
-- 验证配置：
--   SELECT * FROM system_settings WHERE setting_key='budget_allocation_ratio'\G
--
-- 修改系数（通过SQL，也可以在管理后台修改）：
--   UPDATE system_settings SET setting_value='0.30' WHERE setting_key='budget_allocation_ratio';
--
-- 删除配置（回滚用）：
--   DELETE FROM system_settings WHERE setting_key='budget_allocation_ratio';
-- ============================================================








