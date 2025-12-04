-- ============================================================
-- 数据库迁移脚本：从方案5升级到方案5+货币混合制
-- 版本：v1.0
-- 创建日期：2025年12月1日
-- 说明：安全迁移脚本，支持回滚
-- ============================================================

-- 设置安全模式
SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 第一步：修改现有表
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 修改 user_prize_budget 表（重命名为 user_wallet）
-- ------------------------------------------------------------

-- 备份原表（可选，建议生产环境执行）
-- CREATE TABLE user_prize_budget_backup AS SELECT * FROM user_prize_budget;

-- 重命名表
ALTER TABLE user_prize_budget RENAME TO user_wallet;

-- 新增字段：兑换币
ALTER TABLE user_wallet 
ADD COLUMN exchange_coins INT DEFAULT 0 COMMENT '兑换币余额（用户可见）' AFTER points_balance;

-- 新增统计字段
ALTER TABLE user_wallet 
ADD COLUMN total_draw_count INT DEFAULT 0 COMMENT '总抽奖次数' AFTER exchange_coins,
ADD COLUMN won_count INT DEFAULT 0 COMMENT '中奖次数' AFTER total_draw_count,
ADD COLUMN last_draw_at DATETIME COMMENT '最后抽奖时间' AFTER won_count;

-- 新增索引
ALTER TABLE user_wallet 
ADD UNIQUE KEY uk_user_id (user_id),
ADD INDEX idx_remaining_budget (remaining_budget);

-- 更新表注释
ALTER TABLE user_wallet COMMENT='用户钱包-预算对用户透明';

-- 验证迁移结果
SELECT 
    COUNT(*) as total_users,
    SUM(exchange_coins) as total_coins,
    SUM(CASE WHEN exchange_coins > 0 THEN 1 ELSE 0 END) as users_with_coins
FROM user_wallet;

-- ------------------------------------------------------------
-- 1.2 修改 prizes 表（扩展支持货币奖品）
-- ------------------------------------------------------------

-- 备份原表（可选）
-- CREATE TABLE prizes_backup AS SELECT * FROM prizes;

-- 新增字段：奖品类型（默认physical，避免影响现有数据）
ALTER TABLE prizes 
ADD COLUMN type ENUM('physical', 'virtual', 'currency') NOT NULL DEFAULT 'physical' COMMENT '实物/虚拟/货币' AFTER name;

-- 新增展示字段
ALTER TABLE prizes 
ADD COLUMN description TEXT COMMENT '奖品描述' AFTER market_value,
ADD COLUMN image_url VARCHAR(500) COMMENT '奖品图片' AFTER description;

-- 新增货币奖品专用字段
ALTER TABLE prizes 
ADD COLUMN coin_amount INT COMMENT '货币数量（仅type=currency时有效）' AFTER stock,
ADD COLUMN coin_cost DECIMAL(10,2) COMMENT '货币成本（1个币的成本）' AFTER coin_amount;

-- 新增抽奖权重字段
ALTER TABLE prizes 
ADD COLUMN weight INT DEFAULT 100 COMMENT '抽奖权重（货币权重可以设高）' AFTER coin_cost;

-- 新增更新时间字段
ALTER TABLE prizes 
ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- 修改现有字段注释
ALTER TABLE prizes 
MODIFY COLUMN cost_price DECIMAL(10,2) COMMENT '成本价（系统内部）',
MODIFY COLUMN market_value DECIMAL(10,2) COMMENT '市场价（用户展示）',
MODIFY COLUMN points_price INT COMMENT '积分标价（已废弃，不再使用）';

-- 新增索引
ALTER TABLE prizes 
ADD INDEX idx_type_cost (type, cost_price),
ADD INDEX idx_category (category);

-- 更新表注释
ALTER TABLE prizes COMMENT='奖品库-支持货币奖品';

-- 插入示例货币奖品（可选）
INSERT INTO prizes (name, type, cost_price, description, stock, coin_amount, coin_cost, weight, status) VALUES
('10个兑换币', 'currency', 10.00, '可在兑换商城兑换心仪商品', 99999, 10, 1.00, 200, 'active'),
('5个兑换币', 'currency', 5.00, '可在兑换商城兑换心仪商品', 99999, 5, 1.00, 150, 'active');

-- 验证迁移结果
SELECT 
    type,
    COUNT(*) as count,
    AVG(weight) as avg_weight
FROM prizes 
GROUP BY type;

-- ------------------------------------------------------------
-- 1.3 修改 lottery_records 表（新增预算快照字段）
-- ------------------------------------------------------------

-- 备份原表（可选）
-- CREATE TABLE lottery_records_backup AS SELECT * FROM lottery_records;

-- 新增预算快照字段
ALTER TABLE lottery_records 
ADD COLUMN budget_before DECIMAL(10,2) COMMENT '抽奖前预算' AFTER actual_cost,
ADD COLUMN budget_after DECIMAL(10,2) COMMENT '抽奖后预算' AFTER budget_before;

-- 新增复合索引（优化查询）
ALTER TABLE lottery_records 
ADD INDEX idx_user_created (user_id, created_at);

-- 验证迁移结果
SELECT 
    COUNT(*) as total_records,
    SUM(CASE WHEN is_won = 1 THEN 1 ELSE 0 END) as won_count,
    AVG(actual_cost) as avg_cost
FROM lottery_records;

-- ============================================================
-- 第二步：创建新表
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 创建 exchange_items 表（兑换商城商品表）
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exchange_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL COMMENT '商品名称',
    description TEXT COMMENT '商品描述',
    image_url VARCHAR(500) COMMENT '商品图片',
    
    -- ========== 兑换价格（支持多种支付方式）==========
    price_type ENUM('coin', 'points', 'mixed') NOT NULL COMMENT '支付方式',
    coin_price INT COMMENT '兑换币价格',
    points_price INT COMMENT '积分价格',
    mixed_coin INT COMMENT '混合支付-币数量',
    mixed_points INT COMMENT '混合支付-积分数量',
    
    -- ========== 商品成本和库存 ==========
    cost_price DECIMAL(10,2) NOT NULL COMMENT '实际成本（系统内部）',
    stock INT DEFAULT 0 COMMENT '库存',
    sold_count INT DEFAULT 0 COMMENT '已售数量',
    
    -- ========== 分类和状态 ==========
    category VARCHAR(50) COMMENT '分类',
    status ENUM('active', 'inactive') DEFAULT 'active',
    sort_order INT DEFAULT 0 COMMENT '排序',
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_price_type (price_type),
    INDEX idx_coin_price (coin_price),
    INDEX idx_status (status),
    INDEX idx_category (category)
) COMMENT='兑换商城商品表';

-- 插入示例兑换商品
INSERT INTO exchange_items (name, description, price_type, coin_price, cost_price, stock, category, sort_order) VALUES
-- 纯币兑换商品
('保温杯', '高品质不锈钢保温杯，容量500ml', 'coin', 10, 10.00, 200, '生活用品', 1),
('无线鼠标', '人体工学设计，2.4G无线连接', 'coin', 30, 30.00, 100, '数码产品', 2),
('蓝牙音箱', '立体声蓝牙音箱，续航8小时', 'coin', 50, 50.00, 50, '数码产品', 3),
('充电宝', '20000mAh大容量，快充支持', 'coin', 70, 70.00, 30, '数码产品', 4),

-- 纯积分兑换商品
('数据线', '高品质USB数据线，1米长', 'points', NULL, 300, 5.00, 500, '配件', 10),
('手机壳', '透明TPU材质，多型号可选', 'points', NULL, 200, 3.00, 1000, '配件', 11),

-- 混合支付商品（高价值商品）
('智能手表', '智能运动手表，心率监测', 'mixed', NULL, NULL, 50, 500, 100.00, 20, '数码产品', 20),
('蓝牙耳机', '主动降噪，续航24小时', 'mixed', NULL, NULL, 30, 300, 60.00, 50, '数码产品', 21);

-- 验证创建结果
SELECT 
    price_type,
    COUNT(*) as item_count,
    AVG(cost_price) as avg_cost
FROM exchange_items 
GROUP BY price_type;

-- ------------------------------------------------------------
-- 2.2 创建 exchange_records 表（兑换记录表）
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exchange_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL COMMENT '兑换商品ID',
    
    -- ========== 支付信息 ==========
    payment_type ENUM('coin', 'points', 'mixed') COMMENT '支付方式',
    coin_paid INT DEFAULT 0 COMMENT '消耗兑换币',
    points_paid INT DEFAULT 0 COMMENT '消耗积分',
    
    -- ========== 成本信息（后端记录）==========
    actual_cost DECIMAL(10,2) COMMENT '实际成本（系统内部）',
    
    -- ========== 订单信息 ==========
    order_no VARCHAR(50) NOT NULL COMMENT '订单号',
    status ENUM('pending', 'completed', 'shipped', 'cancelled') DEFAULT 'pending',
    shipped_at DATETIME COMMENT '发货时间',
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_order_no (order_no),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) COMMENT='兑换记录表';

-- 验证创建结果
SELECT 'exchange_records table created successfully' as status;

-- ============================================================
-- 第三步：数据完整性验证
-- ============================================================

-- 验证所有表结构
SELECT 
    TABLE_NAME as table_name,
    TABLE_ROWS as row_count,
    CREATE_TIME as created_at,
    UPDATE_TIME as updated_at,
    TABLE_COMMENT as comment
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN ('user_wallet', 'prizes', 'lottery_records', 'exchange_items', 'exchange_records', 'transactions')
ORDER BY TABLE_NAME;

-- 验证所有新增字段
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN ('user_wallet', 'prizes', 'lottery_records')
AND COLUMN_NAME IN (
    'exchange_coins', 'total_draw_count', 'won_count', 'last_draw_at',
    'type', 'description', 'image_url', 'coin_amount', 'coin_cost', 'weight',
    'budget_before', 'budget_after'
)
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ============================================================
-- 第四步：数据迁移验证报告
-- ============================================================

SELECT '========== 数据迁移验证报告 ==========' as report_title;

-- 用户钱包统计
SELECT 
    '用户钱包' as table_name,
    COUNT(*) as total_records,
    SUM(remaining_budget) as total_remaining_budget,
    SUM(exchange_coins) as total_exchange_coins,
    AVG(points_balance) as avg_points
FROM user_wallet;

-- 奖品库统计
SELECT 
    '奖品库' as table_name,
    type,
    COUNT(*) as count,
    SUM(stock) as total_stock
FROM prizes 
GROUP BY type;

-- 抽奖记录统计
SELECT 
    '抽奖记录' as table_name,
    COUNT(*) as total_records,
    SUM(CASE WHEN is_won = 1 THEN 1 ELSE 0 END) as won_count,
    ROUND(SUM(CASE WHEN is_won = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate
FROM lottery_records;

-- 兑换商品统计
SELECT 
    '兑换商品' as table_name,
    COUNT(*) as total_items,
    SUM(stock) as total_stock,
    AVG(cost_price) as avg_cost
FROM exchange_items;

-- 兑换记录统计（新表，应该为0）
SELECT 
    '兑换记录' as table_name,
    COUNT(*) as total_records
FROM exchange_records;

-- ============================================================
-- 第五步：恢复设置
-- ============================================================

SET FOREIGN_KEY_CHECKS = 1;
SET SQL_SAFE_UPDATES = 1;

-- ============================================================
-- 迁移完成提示
-- ============================================================

SELECT 
    '✅ 数据库迁移完成！' as status,
    NOW() as completed_at,
    '
    迁移内容：
    1. user_prize_budget → user_wallet (新增4个字段)
    2. prizes 扩展 (新增7个字段，支持货币奖品)
    3. lottery_records 扩展 (新增2个字段)
    4. exchange_items 创建 (全新表)
    5. exchange_records 创建 (全新表)
    
    下一步：
    1. 检查上述验证报告
    2. 更新应用代码以支持新表结构
    3. 测试货币奖品抽奖功能
    4. 测试兑换商城功能
    ' as summary;

-- ============================================================
-- 回滚脚本（紧急情况使用）
-- ============================================================
/*
-- 如需回滚，取消以下注释执行

-- 1. 删除新增的表
DROP TABLE IF EXISTS exchange_records;
DROP TABLE IF EXISTS exchange_items;

-- 2. 恢复 user_wallet 为 user_prize_budget
ALTER TABLE user_wallet RENAME TO user_prize_budget;
ALTER TABLE user_prize_budget 
DROP COLUMN exchange_coins,
DROP COLUMN total_draw_count,
DROP COLUMN won_count,
DROP COLUMN last_draw_at;

-- 3. 恢复 prizes 表
ALTER TABLE prizes 
DROP COLUMN type,
DROP COLUMN description,
DROP COLUMN image_url,
DROP COLUMN coin_amount,
DROP COLUMN coin_cost,
DROP COLUMN weight,
DROP COLUMN updated_at;

-- 4. 恢复 lottery_records 表
ALTER TABLE lottery_records 
DROP COLUMN budget_before,
DROP COLUMN budget_after;

-- 5. 从备份恢复数据（如果有）
-- INSERT INTO user_prize_budget SELECT * FROM user_prize_budget_backup;
-- INSERT INTO prizes SELECT id, name, cost_price, market_value, points_price, stock, issued_count, category, status, created_at FROM prizes_backup;

SELECT '⚠️ 数据库已回滚到迁移前状态' as rollback_status;
*/


