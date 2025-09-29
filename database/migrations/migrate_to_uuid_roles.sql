-- UUID角色系统迁移脚本
-- 创建时间：2025年01月21日
-- 用途：将is_admin字段迁移到基于UUID的安全角色系统

-- 第一步：创建角色表
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
  UNIQUE KEY `role_uuid` (`role_uuid`),
  UNIQUE KEY `role_name` (`role_name`),
  KEY `idx_role_level` (`role_level`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色管理表';

-- 第二步：创建用户角色关联表
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
  UNIQUE KEY `user_role_unique` (`user_id`, `role_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `fk_user_roles_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_roles_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';

-- 第三步：插入默认角色
INSERT INTO `roles` (`role_uuid`, `role_name`, `role_level`, `permissions`, `description`) VALUES
(UUID(), 'user', 0, JSON_OBJECT(
  'lottery', JSON_ARRAY('read', 'participate'),
  'profile', JSON_ARRAY('read', 'update'),
  'points', JSON_ARRAY('read')
), '普通用户'),
(UUID(), 'admin', 100, JSON_OBJECT(
  '*', JSON_ARRAY('*')
), '超级管理员'),
(UUID(), 'moderator', 50, JSON_OBJECT(
  'lottery', JSON_ARRAY('*'),
  'users', JSON_ARRAY('read', 'update'),
  'analytics', JSON_ARRAY('read'),
  'prizes', JSON_ARRAY('*')
), '运营管理员');

-- 第四步：迁移现有用户的权限数据
-- 为所有is_admin=1的用户分配admin角色
INSERT INTO `user_roles` (`user_id`, `role_id`, `assigned_at`, `assigned_by`)
SELECT 
  u.user_id,
  r.id,
  NOW(),
  NULL
FROM `users` u
CROSS JOIN `roles` r
WHERE u.is_admin = 1 AND r.role_name = 'admin';

-- 为所有is_admin=0或NULL的用户分配user角色
INSERT INTO `user_roles` (`user_id`, `role_id`, `assigned_at`, `assigned_by`)
SELECT 
  u.user_id,
  r.id,
  NOW(),
  NULL
FROM `users` u
CROSS JOIN `roles` r
WHERE (u.is_admin = 0 OR u.is_admin IS NULL) AND r.role_name = 'user';

-- 第五步：验证迁移结果
SELECT 
  '迁移验证' as step,
  COUNT(*) as total_users,
  SUM(CASE WHEN ur.role_id IS NOT NULL THEN 1 ELSE 0 END) as users_with_roles,
  SUM(CASE WHEN r.role_name = 'admin' THEN 1 ELSE 0 END) as admin_users,
  SUM(CASE WHEN r.role_name = 'user' THEN 1 ELSE 0 END) as regular_users
FROM `users` u
LEFT JOIN `user_roles` ur ON u.user_id = ur.user_id AND ur.is_active = 1
LEFT JOIN `roles` r ON ur.role_id = r.id AND r.is_active = 1;

-- 第六步：创建备份表（保留原始数据）
CREATE TABLE IF NOT EXISTS `users_backup_before_uuid_migration` AS 
SELECT user_id, mobile, nickname, is_admin, status, created_at, updated_at 
FROM users;

-- 显示迁移完成信息
SELECT 
  'UUID角色系统迁移完成' as message,
  NOW() as completed_at,
  '请在应用代码更新后执行: ALTER TABLE users DROP COLUMN is_admin;' as next_step; 