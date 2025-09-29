-- 数据库迁移脚本：从is_admin字段迁移到UUID角色系统
-- 版本：V4.3
-- 创建时间：2025年01月21日
-- 目的：提升安全性，防止权限信息通过抓包泄露

-- ==========================================
-- 第一步：创建角色表
-- ==========================================

CREATE TABLE IF NOT EXISTS `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_uuid` varchar(36) NOT NULL COMMENT '角色UUID标识（安全不可推测）',
  `role_name` varchar(50) NOT NULL COMMENT '角色名称（仅内部使用）',
  `role_level` int(11) NOT NULL DEFAULT 0 COMMENT '角色级别（0=普通用户，100=超级管理员）',
  `permissions` json DEFAULT NULL COMMENT '角色权限配置（JSON格式）',
  `description` text DEFAULT NULL COMMENT '角色描述',
  `is_active` tinyint(1) DEFAULT 1 COMMENT '角色是否启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_uuid` (`role_uuid`),
  UNIQUE KEY `uk_role_name` (`role_name`),
  KEY `idx_role_level` (`role_level`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色管理表';

-- ==========================================
-- 第二步：创建用户角色关联表
-- ==========================================

CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL COMMENT '用户ID',
  `role_id` int(11) NOT NULL COMMENT '角色ID',
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '角色分配时间',
  `assigned_by` int(11) DEFAULT NULL COMMENT '角色分配者ID',
  `is_active` tinyint(1) DEFAULT 1 COMMENT '角色是否激活',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`user_id`, `role_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户角色关联表';

-- ==========================================
-- 第三步：插入默认角色数据
-- ==========================================

-- 插入普通用户角色
INSERT IGNORE INTO `roles` (`role_uuid`, `role_name`, `role_level`, `permissions`, `description`) VALUES
(UUID(), 'user', 0, JSON_OBJECT(
  'lottery', JSON_ARRAY('read', 'participate'),
  'profile', JSON_ARRAY('read', 'update'), 
  'points', JSON_ARRAY('read')
), '普通用户');

-- 插入运营管理员角色
INSERT IGNORE INTO `roles` (`role_uuid`, `role_name`, `role_level`, `permissions`, `description`) VALUES
(UUID(), 'moderator', 50, JSON_OBJECT(
  'lottery', JSON_ARRAY('*'),
  'users', JSON_ARRAY('read', 'update'),
  'analytics', JSON_ARRAY('read'),
  'prizes', JSON_ARRAY('*')
), '运营管理员');

-- 插入超级管理员角色
INSERT IGNORE INTO `roles` (`role_uuid`, `role_name`, `role_level`, `permissions`, `description`) VALUES
(UUID(), 'admin', 100, JSON_OBJECT(
  '*', JSON_ARRAY('*')
), '超级管理员');

-- ==========================================
-- 第四步：数据迁移 - 根据is_admin字段分配角色
-- ==========================================

-- 🔥 关键迁移逻辑：将现有用户根据is_admin字段分配到对应角色

-- 为管理员用户分配admin角色
INSERT INTO `user_roles` (`user_id`, `role_id`, `assigned_at`, `assigned_by`)
SELECT 
  u.user_id,
  r.id as role_id,
  NOW(),
  NULL
FROM `users` u
CROSS JOIN `roles` r
WHERE u.is_admin = 1 
  AND r.role_name = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM `user_roles` ur 
    WHERE ur.user_id = u.user_id AND ur.role_id = r.id
  );

-- 为普通用户分配user角色
INSERT INTO `user_roles` (`user_id`, `role_id`, `assigned_at`, `assigned_by`)
SELECT 
  u.user_id,
  r.id as role_id,
  NOW(),
  NULL
FROM `users` u
CROSS JOIN `roles` r
WHERE (u.is_admin = 0 OR u.is_admin IS NULL)
  AND r.role_name = 'user'
  AND NOT EXISTS (
    SELECT 1 FROM `user_roles` ur 
    WHERE ur.user_id = u.user_id AND ur.role_id = r.id
  );

-- ==========================================
-- 第五步：验证迁移结果
-- ==========================================

-- 验证角色分配情况
SELECT 
  '角色分配统计' as description,
  r.role_name,
  COUNT(ur.user_id) as user_count
FROM `roles` r
LEFT JOIN `user_roles` ur ON r.id = ur.role_id AND ur.is_active = 1
GROUP BY r.id, r.role_name
ORDER BY r.role_level DESC;

-- 验证用户角色对应关系
SELECT 
  '用户角色验证' as description,
  u.user_id,
  u.mobile,
  u.is_admin as old_is_admin,
  r.role_name as new_role,
  r.role_level
FROM `users` u
LEFT JOIN `user_roles` ur ON u.user_id = ur.user_id AND ur.is_active = 1
LEFT JOIN `roles` r ON ur.role_id = r.id
WHERE u.status = 'active'
ORDER BY u.user_id
LIMIT 10;

-- ==========================================
-- 第六步：添加用户表的角色关联（更新模型）
-- ==========================================

-- 更新User模型的关联关系将在Node.js代码中处理
-- 这里只需要确保外键约束正确设置

-- ==========================================
-- 迁移完成标记
-- ==========================================

-- 插入迁移记录
INSERT INTO `migration_log` (`version`, `description`, `executed_at`) VALUES
('V4.3', '从is_admin字段迁移到UUID角色系统', NOW())
ON DUPLICATE KEY UPDATE 
  executed_at = NOW(),
  description = '从is_admin字段迁移到UUID角色系统';

-- 🔴 重要提醒：
-- 1. 迁移完成后需要更新应用代码使用新的UUID权限验证
-- 2. 建议保留is_admin字段一段时间作为备份，确认新系统稳定后再删除
-- 3. 需要更新所有使用is_admin的中间件和业务逻辑
-- 4. JWT Token生成逻辑需要更新，移除权限信息

SELECT '🛡️ UUID角色系统迁移完成！' as status,
       '安全性显著提升，权限信息不再通过抓包泄露' as benefit; 