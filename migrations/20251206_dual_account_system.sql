-- ============================================================
-- 抽奖系统双账户模型 - 数据库迁移脚本
-- 版本：v1.0（基于现有代码扩展）
-- 创建日期：2025年12月6日
-- 说明：ALTER TABLE扩展现有表 + 新建兑换市场表
-- ============================================================

SET SQL_SAFE_UPDATES = 0;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. 扩展 user_points_accounts（用户积分账户 → 双账户模型）
-- ============================================================
ALTER TABLE user_points_accounts
ADD COLUMN frozen_points DECIMAL(10,2) DEFAULT 0
    COMMENT '冻结积分（审核中）',
ADD COLUMN budget_points INT DEFAULT 0
    COMMENT '预算积分总额（系统内部）',
ADD COLUMN remaining_budget_points INT DEFAULT 0
    COMMENT '剩余预算积分（系统内部）',
ADD COLUMN used_budget_points INT DEFAULT 0
    COMMENT '已用预算积分（系统内部）',
ADD COLUMN total_draw_count INT DEFAULT 0
    COMMENT '总抽奖次数',
ADD COLUMN total_redeem_count INT DEFAULT 0
    COMMENT '总兑换次数',
ADD COLUMN won_count INT DEFAULT 0
    COMMENT '中奖次数',
ADD COLUMN last_draw_at DATETIME
    COMMENT '最后抽奖时间',
ADD COLUMN last_redeem_at DATETIME
    COMMENT '最后兑换时间',
ADD INDEX idx_remaining_budget (remaining_budget_points);

-- ============================================================
-- 2. 扩展 lottery_prizes（奖品配置 → 支持虚拟奖品）
-- ============================================================
ALTER TABLE lottery_prizes
ADD COLUMN prize_value_points INT DEFAULT 0
    COMMENT '奖品价值积分（统一单位）',
ADD COLUMN virtual_amount INT
    COMMENT '虚拟奖品数量（水晶等）',
ADD COLUMN category VARCHAR(50)
    COMMENT '分类:crystal/metal/physical/empty/virtual',
ADD INDEX idx_value_points (prize_value_points),
ADD INDEX idx_category (category);

-- ============================================================
-- 3. 扩展 lottery_draws（抽奖记录 → 添加预算审计）
-- ============================================================
ALTER TABLE lottery_draws
ADD COLUMN prize_value_points INT DEFAULT 0
    COMMENT '奖品价值积分消耗',
ADD COLUMN budget_points_before INT
    COMMENT '抽奖前预算积分',
ADD COLUMN budget_points_after INT
    COMMENT '抽奖后预算积分';

-- ============================================================
-- 4. 扩展 user_inventory（用户背包 → 支持虚拟奖品道具）
-- ============================================================
ALTER TABLE user_inventory
ADD COLUMN virtual_amount INT DEFAULT 0
    COMMENT '虚拟奖品数量',
ADD COLUMN virtual_value_points INT DEFAULT 0
    COMMENT '虚拟奖品价值积分',
ADD COLUMN lottery_record_id VARCHAR(50)
    COMMENT '关联抽奖记录',
ADD COLUMN exchange_record_id BIGINT
    COMMENT '关联兑换记录',
ADD INDEX idx_user_item_type (user_id, item_type);

-- ============================================================
-- 5. 新建 exchange_items（兑换市场商品表）
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_items (
    item_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '商品唯一标识',
    name VARCHAR(200) NOT NULL COMMENT '商品名称',
    description TEXT COMMENT '商品描述',
    image_url VARCHAR(500) COMMENT '商品图片URL',

    -- 价格类型
    price_type ENUM('virtual', 'points', 'mixed') NOT NULL COMMENT '支付方式：虚拟奖品/积分/混合',
    virtual_value_price INT COMMENT '虚拟奖品价格（价值积分）',
    points_price INT COMMENT '积分价格',
    mixed_virtual_value INT COMMENT '混合支付-虚拟奖品价值',
    mixed_points INT COMMENT '混合支付-积分数量',

    -- 商品成本和库存
    cost_price DECIMAL(10,2) NOT NULL COMMENT '实际成本（人民币）',
    stock INT DEFAULT 0 COMMENT '库存数量',
    sold_count INT DEFAULT 0 COMMENT '已售数量',

    -- 分类和状态
    category VARCHAR(50) COMMENT '商品分类',
    status ENUM('active','inactive') DEFAULT 'active' COMMENT '商品状态',
    sort_order INT DEFAULT 0 COMMENT '排序序号',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    INDEX idx_price_type (price_type),
    INDEX idx_status (status),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='兑换市场商品表';

-- ============================================================
-- 6. 新建 exchange_market_records（兑换市场记录表）
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_market_records (
    record_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '兑换记录唯一标识',
    user_id INT NOT NULL COMMENT '用户ID',
    item_id BIGINT NOT NULL COMMENT '兑换商品ID',

    -- 支付信息
    payment_type ENUM('virtual','points','mixed') COMMENT '支付方式',
    virtual_value_paid INT DEFAULT 0 COMMENT '消耗虚拟奖品价值',
    points_paid INT DEFAULT 0 COMMENT '消耗积分',

    -- 成本信息（后端记录）
    actual_cost DECIMAL(10,2) COMMENT '实际成本',

    -- 订单信息
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号',
    status ENUM('pending','completed','shipped','cancelled') DEFAULT 'pending' COMMENT '订单状态',
    shipped_at DATETIME COMMENT '发货时间',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE INDEX uk_order_no (order_no),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES exchange_items(item_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='兑换市场记录表';

SET SQL_SAFE_UPDATES = 1;
SET FOREIGN_KEY_CHECKS = 1;

SELECT '✅ 数据库迁移完成！扩展4张表，新建2张表' as result;
