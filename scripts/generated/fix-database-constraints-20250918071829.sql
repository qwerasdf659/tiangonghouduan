-- 数据库外键约束和索引修复脚本
-- 生成时间: 2025/09/18 07:18:29
-- 数据库: restaurant_points_dev

-- ⚠️ 执行前请备份数据库！
-- ⚠️ 建议在测试环境先执行验证！

USE restaurant_points_dev;

-- 1. 清理孤儿记录（可选，根据业务需求决定）

-- 2. 创建缺失的索引
CREATE INDEX idx_trade_records_user_id ON trade_records(user_id); -- 外键字段需要索引以提升查询性能

-- 3. 添加外键约束
ALTER TABLE lottery_records 
ADD CONSTRAINT fk_lottery_records_campaign_id
FOREIGN KEY (campaign_id) 
REFERENCES campaigns(campaign_id)
ON DELETE RESTRICT
ON UPDATE CASCADE; -- 抽奖记录必须关联有效活动

ALTER TABLE trade_records 
ADD CONSTRAINT fk_trade_records_user_id
FOREIGN KEY (user_id) 
REFERENCES users(user_id)
ON DELETE CASCADE
ON UPDATE CASCADE; -- 交易记录必须关联有效用户

ALTER TABLE user_point_transactions 
ADD CONSTRAINT fk_user_point_transactions_user_id
FOREIGN KEY (user_id) 
REFERENCES users(user_id)
ON DELETE CASCADE
ON UPDATE CASCADE; -- 积分交易必须关联有效用户


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