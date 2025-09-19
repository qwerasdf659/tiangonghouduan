-- 数据库外键约束和索引修复脚本
-- 生成时间: 2025/09/18 08:41:55
-- 数据库: restaurant_points_dev

-- ⚠️ 执行前请备份数据库！
-- ⚠️ 建议在测试环境先执行验证！

USE restaurant_points_dev;

-- 1. 清理孤儿记录（可选，根据业务需求决定）

-- 4. 验证修复结果
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = 'restaurant_points_dev' 
AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;