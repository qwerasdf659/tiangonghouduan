-- 更新admin_id字段为基于角色系统的管理员ID
-- 创建时间：2025年01月21日
-- 说明：admin_id字段保留，但现在基于UUID角色系统验证管理员权限

-- 更新customer_sessions表的admin_id字段注释
ALTER TABLE customer_sessions 
MODIFY COLUMN admin_id INT(11) NULL 
COMMENT '分配的管理员ID（基于UUID角色系统验证管理员权限）';

-- 更新feedbacks表的admin_id字段注释
ALTER TABLE feedbacks 
MODIFY COLUMN admin_id INT(11) NULL 
COMMENT '处理反馈的管理员ID（基于UUID角色系统验证管理员权限）';

-- 更新system_announcements表的admin_id字段注释
ALTER TABLE system_announcements 
MODIFY COLUMN admin_id INT(11) NOT NULL 
COMMENT '发布公告的管理员ID（基于UUID角色系统验证管理员权限）';

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_customer_sessions_admin_status 
ON customer_sessions(admin_id, status);

CREATE INDEX IF NOT EXISTS idx_feedbacks_admin_status 
ON feedbacks(admin_id, status);

CREATE INDEX IF NOT EXISTS idx_system_announcements_admin 
ON system_announcements(admin_id, created_at);

-- 验证数据完整性
SELECT 
  'customer_sessions' as table_name,
  COUNT(*) as total_records,
  COUNT(admin_id) as records_with_admin,
  COUNT(admin_id) * 100.0 / COUNT(*) as admin_assignment_rate
FROM customer_sessions
UNION ALL
SELECT 
  'feedbacks' as table_name,
  COUNT(*) as total_records,
  COUNT(admin_id) as records_with_admin,
  COUNT(admin_id) * 100.0 / COUNT(*) as admin_assignment_rate
FROM feedbacks
UNION ALL
SELECT 
  'system_announcements' as table_name,
  COUNT(*) as total_records,
  COUNT(admin_id) as records_with_admin,
  COUNT(admin_id) * 100.0 / COUNT(*) as admin_assignment_rate
FROM system_announcements; 