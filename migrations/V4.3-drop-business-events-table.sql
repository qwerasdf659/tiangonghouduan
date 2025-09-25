-- V4.3: 删除 business_events 表
-- 执行时间: 2025年09月22日 23:31:17 UTC
-- 原因: BusinessEvent模型已被识别为过度设计，项目中无实际业务逻辑使用
-- 影响: 删除过度设计的表，简化数据库结构

-- 检查表是否存在，如果存在则删除
SET @table_exists = (
    SELECT COUNT(*)
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = 'business_events'
);

-- 如果表存在，先备份数据（可选）
-- 在实际环境中，如果有重要数据，应该先备份

-- 删除表（如果存在）
SET @sql = IF(@table_exists > 0, 
    'DROP TABLE IF EXISTS business_events;', 
    'SELECT "Table business_events does not exist, skipping." as message;'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 记录迁移执行
INSERT IGNORE INTO schema_migrations (version, executed_at) 
VALUES ('V4.3', NOW())
ON DUPLICATE KEY UPDATE executed_at = NOW();

-- 输出执行结果
SELECT 
    CASE 
        WHEN @table_exists > 0 THEN 'business_events 表已删除'
        ELSE 'business_events 表不存在，跳过删除'
    END as result; 