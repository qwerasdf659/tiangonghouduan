-- 数据库表重命名迁移脚本
-- 将 lottery_records 表重命名为 lottery_draws
-- 创建时间: 2025年09月25日
-- 目的: 统一代码模型名称与数据库表名

-- ===================================================
-- 表重命名操作
-- ===================================================

-- 1. 重命名主表
RENAME TABLE lottery_records TO lottery_draws;

-- 2. 验证重命名结果
-- SELECT COUNT(*) as record_count FROM lottery_draws;
-- SHOW CREATE TABLE lottery_draws;

-- ===================================================
-- 索引检查和重建（如果需要）
-- ===================================================

-- 检查现有索引是否需要重命名
-- SHOW INDEX FROM lottery_draws;

-- 如果有以表名命名的索引，可能需要重新创建
-- 但大多数情况下，MySQL会自动处理索引重命名

-- ===================================================
-- 验证操作完成
-- ===================================================

-- 确认表已重命名且数据完整
SELECT 
    'lottery_draws' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_winner = 1 THEN 1 END) as winner_records,
    MIN(created_at) as earliest_record,
    MAX(created_at) as latest_record
FROM lottery_draws;

-- ===================================================
-- 回滚脚本（紧急情况使用）
-- ===================================================

-- 如果需要回滚，执行以下命令：
-- RENAME TABLE lottery_draws TO lottery_records; 