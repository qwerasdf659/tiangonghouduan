-- ===================================================================
-- 用户行为检测系统 - 数据库表创建脚本
-- 创建时间：2025年08月18日
-- 基于项目：餐厅积分抽奖系统v2.0
-- 说明：基于现有数据库架构，新增用户行为分析相关表
-- ===================================================================

-- 设置字符集和校对规则
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===================================================================
-- 1. 用户行为主表 - user_behaviors
-- ===================================================================
DROP TABLE IF EXISTS `user_behaviors`;
CREATE TABLE `user_behaviors` (
  `behavior_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '行为记录唯一标识',
  `user_id` INT NOT NULL COMMENT '用户ID，关联现有users表',
  `session_id` VARCHAR(64) NOT NULL COMMENT '会话标识',
  `event_type` ENUM(
    'page_view', 'button_click', 'scroll', 'input_focus',
    'lottery_action', 'recharge_action', 'social_action',
    'chat_action', 'exchange_action'
  ) NOT NULL COMMENT '事件类型',
  `event_data` JSON NOT NULL COMMENT '事件详细数据（JSON格式）',
  `page_info` JSON DEFAULT NULL COMMENT '页面信息（路径、标题等）',
  `device_info` JSON DEFAULT NULL COMMENT '设备信息（UA、屏幕尺寸等）',
  `action_time` TIMESTAMP(3) NOT NULL COMMENT '行为发生时间（毫秒精度）',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  
  PRIMARY KEY (`behavior_id`),
  
  -- 高性能索引设计
  INDEX `idx_user_time` (`user_id`, `action_time`),
  INDEX `idx_session` (`session_id`),
  INDEX `idx_event_type` (`event_type`, `action_time`),
  INDEX `idx_created_date` (`created_at`),
  
  -- 关联现有用户表的外键
  CONSTRAINT `fk_user_behaviors_user_id` 
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
    
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci
  COMMENT='用户行为数据主表'
  -- 按月分区优化查询性能
  PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p_202508 VALUES LESS THAN (TO_DAYS('2025-09-01')),
    PARTITION p_202509 VALUES LESS THAN (TO_DAYS('2025-10-01')),
    PARTITION p_202510 VALUES LESS THAN (TO_DAYS('2025-11-01')),
    PARTITION p_202511 VALUES LESS THAN (TO_DAYS('2025-12-01')),
    PARTITION p_202512 VALUES LESS THAN (TO_DAYS('2026-01-01')),
    PARTITION p_future VALUES LESS THAN MAXVALUE
  );

-- ===================================================================
-- 2. 用户画像表 - user_profiles
-- ===================================================================
DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `profile_id` INT NOT NULL AUTO_INCREMENT COMMENT '画像记录唯一标识',
  `user_id` INT NOT NULL COMMENT '用户ID，关联users表',
  `profile_data` JSON NOT NULL COMMENT '用户画像数据JSON',
  `behavioral_tags` JSON DEFAULT NULL COMMENT '行为标签（活跃用户、付费用户等）',
  `preference_vector` JSON DEFAULT NULL COMMENT '偏好向量（用于推荐算法）',
  `activity_score` DECIMAL(5,2) DEFAULT 0.00 COMMENT '活跃度评分',
  `churn_risk` ENUM('low', 'medium', 'high') DEFAULT 'low' COMMENT '流失风险评估',
  `last_analyzed` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '最后分析时间',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  
  PRIMARY KEY (`profile_id`),
  
  -- 唯一约束和索引
  UNIQUE KEY `uk_user` (`user_id`),
  INDEX `idx_activity` (`activity_score`),
  INDEX `idx_churn_risk` (`churn_risk`),
  INDEX `idx_last_analyzed` (`last_analyzed`),
  
  -- 关联用户表的外键
  CONSTRAINT `fk_user_profiles_user_id` 
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
    
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci
  COMMENT='用户画像分析表';

-- ===================================================================
-- 3. 推荐记录表 - recommendation_logs
-- ===================================================================
DROP TABLE IF EXISTS `recommendation_logs`;
CREATE TABLE `recommendation_logs` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '推荐记录唯一标识',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `recommendation_type` ENUM('lottery', 'product', 'social', 'content') NOT NULL COMMENT '推荐类型',
  `recommended_items` JSON NOT NULL COMMENT '推荐内容JSON',
  `algorithm_used` VARCHAR(50) DEFAULT NULL COMMENT '推荐算法',
  `confidence_score` DECIMAL(5,4) DEFAULT NULL COMMENT '推荐置信度',
  `user_response` ENUM('clicked', 'ignored', 'dismissed') DEFAULT NULL COMMENT '用户响应',
  `response_time` TIMESTAMP NULL DEFAULT NULL COMMENT '用户响应时间',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '推荐生成时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  
  PRIMARY KEY (`log_id`),
  
  -- 查询优化索引
  INDEX `idx_user_type` (`user_id`, `recommendation_type`),
  INDEX `idx_algorithm` (`algorithm_used`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_user_response` (`user_response`),
  INDEX `idx_response_time` (`response_time`),
  
  -- 关联用户表的外键
  CONSTRAINT `fk_recommendation_logs_user_id` 
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
    
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci
  COMMENT='推荐记录和效果跟踪表';

-- ===================================================================
-- 4. 行为统计汇总表 - behavior_summary
-- ===================================================================
DROP TABLE IF EXISTS `behavior_summary`;
CREATE TABLE `behavior_summary` (
  `summary_id` INT NOT NULL AUTO_INCREMENT COMMENT '汇总记录唯一标识',
  `user_id` INT NOT NULL COMMENT '用户ID',
  `summary_date` DATE NOT NULL COMMENT '汇总日期',
  `total_behaviors` INT DEFAULT 0 COMMENT '当日总行为数',
  `page_views` INT DEFAULT 0 COMMENT '页面浏览次数',
  `button_clicks` INT DEFAULT 0 COMMENT '按钮点击次数',
  `lottery_actions` INT DEFAULT 0 COMMENT '抽奖行为次数',
  `social_actions` INT DEFAULT 0 COMMENT '社交行为次数',
  `session_duration` INT DEFAULT 0 COMMENT '会话总时长（秒）',
  `unique_sessions` INT DEFAULT 0 COMMENT '独立会话数',
  `behavior_stats` JSON DEFAULT NULL COMMENT '详细行为统计JSON',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  
  PRIMARY KEY (`summary_id`),
  
  -- 唯一约束和索引
  UNIQUE KEY `uk_user_date` (`user_id`, `summary_date`),
  INDEX `idx_summary_date` (`summary_date`),
  INDEX `idx_total_behaviors` (`total_behaviors`),
  INDEX `idx_created_at` (`created_at`),
  
  -- 关联用户表的外键
  CONSTRAINT `fk_behavior_summary_user_id` 
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
    
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_unicode_ci
  COMMENT='用户行为每日汇总表';

-- ===================================================================
-- 5. 创建事件触发器（自动分区管理）
-- ===================================================================

-- 创建自动分区管理存储过程
DELIMITER $$

DROP PROCEDURE IF EXISTS `create_behavior_partition`$$
CREATE PROCEDURE `create_behavior_partition`(IN partition_date DATE)
BEGIN
  DECLARE partition_name VARCHAR(20);
  DECLARE partition_value VARCHAR(20);
  DECLARE sql_statement TEXT;
  
  -- 生成分区名称（格式：p_YYYYMM）
  SET partition_name = CONCAT('p_', DATE_FORMAT(partition_date, '%Y%m'));
  
  -- 计算分区上限值
  SET partition_value = CONCAT('TO_DAYS(''', 
                              DATE_FORMAT(DATE_ADD(partition_date, INTERVAL 1 MONTH), '%Y-%m-01'), 
                              ''')');
  
  -- 构建ALTER TABLE语句
  SET sql_statement = CONCAT(
    'ALTER TABLE user_behaviors ADD PARTITION (',
    'PARTITION ', partition_name, 
    ' VALUES LESS THAN (', partition_value, ')',
    ')'
  );
  
  -- 执行分区创建
  SET @sql = sql_statement;
  PREPARE stmt FROM @sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
  
  SELECT CONCAT('分区创建成功: ', partition_name) as result;
END$$

-- 创建定时事件（每月自动创建下个月分区）
DROP EVENT IF EXISTS `auto_create_monthly_partition`$$
CREATE EVENT `auto_create_monthly_partition`
ON SCHEDULE EVERY 1 MONTH
STARTS '2025-09-01 00:00:00'
DO BEGIN
  CALL create_behavior_partition(DATE_ADD(CURDATE(), INTERVAL 2 MONTH));
END$$

DELIMITER ;

-- ===================================================================
-- 6. 插入初始化数据
-- ===================================================================

-- 为现有用户创建空白用户画像（避免NULL值问题）
INSERT INTO user_profiles (user_id, profile_data, behavioral_tags, preference_vector)
SELECT 
  user_id,
  JSON_OBJECT(
    'created_at', NOW(),
    'total_behaviors', 0,
    'avg_session_duration', 0,
    'preferred_pages', JSON_ARRAY(),
    'activity_pattern', JSON_OBJECT()
  ) as profile_data,
  JSON_ARRAY() as behavioral_tags,
  JSON_OBJECT(
    'lottery_preference', 0.0,
    'social_preference', 0.0,
    'recharge_preference', 0.0
  ) as preference_vector
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles WHERE user_profiles.user_id = users.user_id
);

-- ===================================================================
-- 7. 数据库表结构验证
-- ===================================================================

-- 验证表创建是否成功
SELECT 
  TABLE_NAME as '数据表名称',
  TABLE_ROWS as '当前记录数',
  DATA_LENGTH as '数据大小(字节)',
  INDEX_LENGTH as '索引大小(字节)',
  TABLE_COMMENT as '表说明'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('user_behaviors', 'user_profiles', 'recommendation_logs', 'behavior_summary')
ORDER BY TABLE_NAME;

-- 验证分区创建是否成功
SELECT 
  PARTITION_NAME as '分区名称',
  PARTITION_DESCRIPTION as '分区条件',
  TABLE_ROWS as '记录数'
FROM information_schema.PARTITIONS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'user_behaviors'
  AND PARTITION_NAME IS NOT NULL
ORDER BY PARTITION_ORDINAL_POSITION;

-- 验证外键约束
SELECT 
  CONSTRAINT_NAME as '约束名称',
  TABLE_NAME as '表名',
  COLUMN_NAME as '字段名',
  REFERENCED_TABLE_NAME as '引用表',
  REFERENCED_COLUMN_NAME as '引用字段'
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = DATABASE() 
  AND REFERENCED_TABLE_NAME IS NOT NULL
  AND TABLE_NAME IN ('user_behaviors', 'user_profiles', 'recommendation_logs', 'behavior_summary')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- ===================================================================
-- 执行完成提示
-- ===================================================================
SELECT '🎉 用户行为检测系统数据库表创建完成！' as '执行结果';
SELECT CONCAT('✅ 成功创建 ', COUNT(*), ' 个数据表') as '统计信息'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME IN ('user_behaviors', 'user_profiles', 'recommendation_logs', 'behavior_summary');
  
-- ===================================================================
-- 使用说明
-- ===================================================================
/*
数据库表创建完成后，请按以下步骤继续：

1. 验证表结构：
   DESCRIBE user_behaviors;
   DESCRIBE user_profiles;
   DESCRIBE recommendation_logs;
   DESCRIBE behavior_summary;

2. 创建Sequelize模型文件：
   - models/UserBehavior.js
   - models/UserProfile.js
   - models/RecommendationLog.js
   - models/BehaviorSummary.js

3. 更新models/index.js注册新模型

4. 创建API路由文件：
   - routes/v2/analytics.js

5. 配置Redis Stream处理：
   - config/redis-stream.js

6. 运行测试验证功能：
   npm test

预计开发时间：8-10个工作日完成所有后端功能
*/ 