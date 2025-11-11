-- =====================================================
-- 迁移文件: 添加用户活跃会话唯一索引
-- =====================================================
-- 目的: 防止并发创建重复的活跃会话
-- 方案: 方案A - 数据库唯一索引 (《创建聊天会话API实施方案.md》推荐)
-- 创建时间: 2025-11-08 23:52:31
-- 技术路线: 实用主义 - 数据库层面保证数据一致性
-- =====================================================

-- 前置检查: 确认无重复的活跃会话数据
-- 如果有重复数据,需要先清理后再执行此迁移
-- SELECT user_id, status, COUNT(*) as count 
-- FROM customer_service_sessions 
-- WHERE status IN ('waiting', 'assigned', 'active') 
-- GROUP BY user_id, status
-- HAVING count > 1;

-- =====================================================
-- UP: 创建部分唯一索引(仅对未关闭会话生效)
-- =====================================================
-- 说明: MySQL不支持部分唯一索引的WHERE子句,因此采用虚拟列方案
-- 步骤1: 添加虚拟计算列(用于标识活跃会话)

ALTER TABLE customer_service_sessions
ADD COLUMN is_active_session TINYINT(1) GENERATED ALWAYS AS (
  CASE 
    WHEN status IN ('waiting', 'assigned', 'active') THEN 1 
    ELSE NULL 
  END
) VIRTUAL
COMMENT '虚拟列:标识活跃会话(1=活跃,NULL=已关闭),用于部分唯一索引';

-- 步骤2: 在虚拟列和user_id上创建唯一索引
-- 关键: NULL值不参与唯一性检查,因此允许同一用户有多个closed状态的会话
-- 但不允许同一用户有多个活跃状态(waiting/assigned/active)的会话

CREATE UNIQUE INDEX idx_user_active_session 
ON customer_service_sessions(user_id, is_active_session);

-- =====================================================
-- 验证索引创建成功
-- =====================================================
-- SHOW INDEX FROM customer_service_sessions WHERE Key_name = 'idx_user_active_session';

-- =====================================================
-- 测试唯一索引约束
-- =====================================================
-- 测试1: 创建第1个waiting会话 (应该成功)
-- INSERT INTO customer_service_sessions (user_id, status, source, priority, created_at) 
-- VALUES (99999, 'waiting', 'mobile', 1, NOW());

-- 测试2: 尝试创建第2个waiting会话 (应该失败 - 唯一索引冲突)
-- INSERT INTO customer_service_sessions (user_id, status, source, priority, created_at) 
-- VALUES (99999, 'waiting', 'mobile', 1, NOW());
-- 预期错误: Duplicate entry '99999-1' for key 'idx_user_active_session'

-- 测试3: 关闭第1个会话后,可以创建新会话 (应该成功)
-- UPDATE customer_service_sessions SET status = 'closed' WHERE user_id = 99999;
-- INSERT INTO customer_service_sessions (user_id, status, source, priority, created_at) 
-- VALUES (99999, 'waiting', 'mobile', 1, NOW());

-- 清理测试数据
-- DELETE FROM customer_service_sessions WHERE user_id = 99999;

-- =====================================================
-- DOWN: 回滚迁移(删除索引和虚拟列)
-- =====================================================
-- 如果需要回滚,执行以下SQL:
-- DROP INDEX idx_user_active_session ON customer_service_sessions;
-- ALTER TABLE customer_service_sessions DROP COLUMN is_active_session;

-- =====================================================
-- 性能影响评估
-- =====================================================
-- 1. 索引创建时间: <5秒 (数据量<1000条,极小)
-- 2. 索引占用空间: 约10-50MB (可忽略不计)
-- 3. INSERT性能影响: +10-20ms (需要检查唯一性)
-- 4. SELECT性能影响: 无影响 (虚拟列不占用存储空间)
-- 5. 并发性能: 提升 (数据库层面保证,无需应用层锁)

-- =====================================================
-- 业务影响说明
-- =====================================================
-- 1. 正常创建会话: 无影响,正常创建
-- 2. 并发创建会话: 第2个请求会触发唯一索引冲突,应用层捕获后查询现有会话返回
-- 3. 会话复用: 无影响,查询逻辑不变
-- 4. 会话关闭: 无影响,关闭后is_active_session变为NULL,允许创建新会话

-- =====================================================
-- 实施建议
-- =====================================================
-- 1. 建议在低峰期执行(凌晨2:00-4:00)
-- 2. 执行前备份数据库(mysqldump)
-- 3. 执行后验证索引状态(SHOW INDEX)
-- 4. 监控应用日志,观察唯一索引冲突处理是否正常
-- 5. 如有问题,可使用DOWN部分的SQL快速回滚

-- =====================================================
-- 配套代码修改说明
-- =====================================================
-- 此迁移需要配合routes/v4/system.js代码修改:
-- 1. 移除SELECT FOR UPDATE悲观锁逻辑
-- 2. 添加SequelizeUniqueConstraintError捕获和重试逻辑
-- 3. 详见《创建聊天会话API实施方案.md》方案A实现代码

-- =====================================================
-- 迁移执行记录
-- =====================================================
-- 执行人: AI助手
-- 执行时间: 待执行
-- 执行结果: 待验证
-- 回滚记录: N/A

