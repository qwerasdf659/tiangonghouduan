'use strict';

/**
 * Baseline v4.0.0 Squashed Migration
 *
 * Generated: 2026-03-02T13:54:10.139Z
 * Database: restaurant_points_dev
 * Tables: 106
 *
 * This migration represents the complete database schema as of v4.0.0.
 * All previous migrations (v3-to-v4 incremental) have been squashed into this single file.
 *
 * IMPORTANT:
 * - This migration uses CREATE TABLE IF NOT EXISTS for idempotency
 * - The down() drops ALL tables in reverse dependency order with FK checks disabled
 * - Previous migration files have been archived to migrations/archive/v3-to-v4/
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log('[baseline-v4] Creating 106 tables...');

      // [1/106] users
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`users\` (
  \`user_id\` int NOT NULL AUTO_INCREMENT COMMENT '用户唯一标识',
  \`mobile\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '手机号，唯一标识+登录凭证',
  \`nickname\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户昵称',
  \`status\` enum('active','inactive','banned') COLLATE utf8mb4_unicode_ci DEFAULT 'active' COMMENT '用户状态',
  \`last_login\` datetime DEFAULT NULL COMMENT '最后登录时间',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`login_count\` int DEFAULT '0' COMMENT '登录次数统计',
  \`consecutive_fail_count\` int DEFAULT '0' COMMENT '连续未中奖次数（保底机制核心）',
  \`history_total_points\` int DEFAULT '0' COMMENT '历史累计总积分（臻选空间解锁条件）',
  \`user_uuid\` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '用户UUID（用于外部标识和QR码，UUIDv4格式）',
  \`user_level\` enum('normal','vip','merchant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '用户等级（normal-普通用户，vip-VIP用户，merchant-商户）',
  \`last_active_at\` datetime DEFAULT NULL COMMENT '用户最后活跃时间（登录、抽奖等操作时更新，用于用户分群）',
  \`avatar_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户头像URL（微信头像或自定义头像）',
  \`max_active_listings\` int DEFAULT NULL COMMENT '用户个性化最大上架数量限制（NULL=使用全局默认值）',
  PRIMARY KEY (\`user_id\`),
  UNIQUE KEY \`mobile\` (\`mobile\`),
  UNIQUE KEY \`idx_users_user_uuid_unique\` (\`user_uuid\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`users_last_login\` (\`last_login\`),
  KEY \`users_history_total_points\` (\`history_total_points\`),
  KEY \`idx_users_user_level\` (\`user_level\`),
  KEY \`idx_users_last_active_at\` (\`last_active_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [2/106] accounts
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`accounts\` (
  \`account_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '账户ID（主键，自增）',
  \`account_type\` enum('user','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账户类型（Account Type）：user-用户账户（关联真实用户，user_id必填）| system-系统账户（平台运营账户，system_code必填）',
  \`user_id\` int DEFAULT NULL COMMENT '用户ID（User ID）：当 account_type=user 时必填且唯一；当 account_type=system 时为NULL；外键关联 users.user_id',
  \`system_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '系统账户代码（System Code）：当 account_type=system 时必填且唯一；预定义系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）、SYSTEM_ESCROW（托管/争议）',
  \`status\` enum('active','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '账户状态（Account Status）：active-活跃（可正常交易）| disabled-禁用（冻结状态，禁止任何交易）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`account_id\`),
  UNIQUE KEY \`uk_accounts_user_id\` (\`user_id\`),
  UNIQUE KEY \`uk_accounts_system_code\` (\`system_code\`),
  KEY \`idx_accounts_type_status\` (\`account_type\`,\`status\`),
  CONSTRAINT \`accounts_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户表（统一用户账户与系统账户）';`, { transaction });

      // [3/106] account_asset_balances
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`account_asset_balances\` (
  \`account_asset_balance_id\` bigint NOT NULL AUTO_INCREMENT,
  \`account_id\` bigint NOT NULL COMMENT '账户ID（Account ID）：关联 accounts.account_id，外键约束CASCADE更新/RESTRICT删除',
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code）：如 DIAMOND、red_shard、red_crystal 等；唯一约束：(account_id, asset_code)',
  \`available_amount\` bigint NOT NULL DEFAULT '0' COMMENT '可用余额（Available Amount）：可直接支付、转让、挂牌的余额；业务规则：不可为负数，所有扣减操作必须验证余额充足；单位：整数（BIGINT避免浮点精度问题）',
  \`frozen_amount\` bigint NOT NULL DEFAULT '0' COMMENT '冻结余额（Frozen Amount）：下单冻结、挂牌冻结的余额；业务规则：交易市场购买时冻结买家DIAMOND，挂牌时冻结卖家标的资产；成交后从冻结转为扣减或入账；取消/超时时解冻回到 available_amount；不可为负数',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  \`lottery_campaign_id\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '抽奖活动ID（仅 BUDGET_POINTS 需要，其他资产为 NULL）',
  \`lottery_campaign_key\` varchar(50) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (coalesce(\`lottery_campaign_id\`,_utf8mb4'GLOBAL')) STORED NOT NULL COMMENT '抽奖活动键（自动生成）：COALESCE(lottery_campaign_id, GLOBAL)',
  PRIMARY KEY (\`account_asset_balance_id\`),
  UNIQUE KEY \`uk_account_asset_lottery_campaign_key\` (\`account_id\`,\`asset_code\`,\`lottery_campaign_key\`),
  KEY \`idx_account_asset_balances_asset_code\` (\`asset_code\`),
  KEY \`idx_account_asset_balances_account_id\` (\`account_id\`),
  KEY \`idx_account_asset_balances_lottery_campaign_id\` (\`lottery_campaign_id\`),
  CONSTRAINT \`account_asset_balances_ibfk_1\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`chk_budget_points_lottery_campaign\` CHECK (((\`asset_code\` <> _utf8mb4'BUDGET_POINTS') or (\`lottery_campaign_id\` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户资产余额表（可用余额 + 冻结余额）';`, { transaction });

      // [4/106] ad_antifraud_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_antifraud_logs\` (
  \`ad_antifraud_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '反作弊判定日志主键',
  \`user_id\` int NOT NULL COMMENT '触发用户 ID',
  \`ad_campaign_id\` int NOT NULL COMMENT '关联广告计划 ID',
  \`event_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件类型：impression / click',
  \`rule_triggered\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发的反作弊规则名称',
  \`verdict\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '判定结果：valid / invalid / suspicious',
  \`raw_data\` json DEFAULT NULL COMMENT '原始事件数据（调试用）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '判定时间',
  PRIMARY KEY (\`ad_antifraud_log_id\`),
  KEY \`idx_aaf_user\` (\`user_id\`),
  KEY \`idx_aaf_campaign\` (\`ad_campaign_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反作弊判定日志表 — Phase 5 无效流量识别';`, { transaction });

      // [5/106] ad_target_zones
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_target_zones\` (
  \`zone_id\` int NOT NULL AUTO_INCREMENT COMMENT '地域定向ID',
  \`zone_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地域类型：district=商圈, region=区域',
  \`zone_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地域名称（如"望京商圈"、"朝阳区"）',
  \`priority\` int NOT NULL DEFAULT '10' COMMENT '匹配优先级（越小越优先，运营可调）',
  \`parent_zone_id\` int DEFAULT NULL COMMENT '上级区域ID（商圈→区域的父子关系）',
  \`geo_scope\` json DEFAULT NULL COMMENT '覆盖范围（关联门店列表、行政区划ID 等）',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active=启用, inactive=停用',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`zone_id\`),
  KEY \`parent_zone_id\` (\`parent_zone_id\`),
  CONSTRAINT \`ad_target_zones_ibfk_1\` FOREIGN KEY (\`parent_zone_id\`) REFERENCES \`ad_target_zones\` (\`zone_id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告地域定向表（商圈 + 区域两级分类）';`, { transaction });

      // [6/106] ad_slots
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_slots\` (
  \`ad_slot_id\` int NOT NULL AUTO_INCREMENT COMMENT '广告位主键',
  \`slot_key\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位标识（如 home_popup），全局唯一',
  \`slot_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位名称（如「首页弹窗位」）',
  \`slot_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位类型：popup / carousel',
  \`position\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '页面位置：home / lottery / profile',
  \`max_display_count\` int NOT NULL DEFAULT '3' COMMENT '该位每次最多展示广告数',
  \`daily_price_diamond\` int NOT NULL COMMENT '固定包天日价（钻石）',
  \`min_bid_diamond\` int NOT NULL DEFAULT '50' COMMENT '竞价最低日出价（拍板决策4：高门槛50钻石）',
  \`min_daily_price_diamond\` int NOT NULL DEFAULT '0' COMMENT '最低日价下限（DAU 系数计算结果不得低于此值），0 表示不限制',
  \`floor_price_override\` int DEFAULT NULL COMMENT '运营手动覆盖的竞价底价（优先于动态计算值），NULL 表示使用自动计算',
  \`zone_id\` int DEFAULT NULL COMMENT '绑定地域ID（NULL=全站级别广告位）',
  \`slot_category\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'display' COMMENT '广告位大类：display=展示广告（按天/竞价）, feed=信息流广告（CPM）',
  \`cpm_price_diamond\` int NOT NULL DEFAULT '0' COMMENT '每千次曝光价格（钻石），仅 slot_category=feed 时使用',
  \`min_budget_diamond\` int NOT NULL DEFAULT '500' COMMENT '竞价最低总预算（拍板决策4：500钻石）',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否开放投放',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '广告位描述',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`ad_slot_id\`),
  UNIQUE KEY \`slot_key\` (\`slot_key\`),
  KEY \`ad_slots_zone_id_foreign_idx\` (\`zone_id\`),
  CONSTRAINT \`ad_slots_zone_id_foreign_idx\` FOREIGN KEY (\`zone_id\`) REFERENCES \`ad_target_zones\` (\`zone_id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告位配置表 — Phase 3 广告主自助投放';`, { transaction });

      // [7/106] ad_campaigns
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_campaigns\` (
  \`ad_campaign_id\` int NOT NULL AUTO_INCREMENT COMMENT '广告计划主键',
  \`business_id\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（复用 IdempotencyService）',
  \`advertiser_user_id\` int DEFAULT NULL COMMENT '广告主/创建人用户ID（operational/system 类型存运营人员 user_id）',
  \`ad_slot_id\` int NOT NULL COMMENT '投放广告位 ID',
  \`campaign_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告计划名称',
  \`billing_mode\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计费模式：fixed_daily（固定包天）/ bidding（竞价排名）',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态：draft / pending_review / approved / active / paused / completed / rejected / cancelled',
  \`daily_bid_diamond\` int DEFAULT NULL COMMENT '竞价日出价（仅 bidding 模式）',
  \`budget_total_diamond\` int DEFAULT NULL COMMENT '总预算钻石（仅 bidding 模式）',
  \`budget_spent_diamond\` int NOT NULL DEFAULT '0' COMMENT '已消耗钻石',
  \`fixed_days\` int DEFAULT NULL COMMENT '固定包天天数（仅 fixed_daily 模式）',
  \`fixed_total_diamond\` int DEFAULT NULL COMMENT '固定包天总价 = daily_price × days',
  \`targeting_rules\` json DEFAULT NULL COMMENT '定向规则 JSON（Phase 5 启用）：{ match_all: [...], match_any: [...] }',
  \`priority\` int NOT NULL DEFAULT '50' COMMENT '展示优先级（广告范围 1~99，拍板决策6）',
  \`start_date\` date DEFAULT NULL COMMENT '投放开始日期',
  \`end_date\` date DEFAULT NULL COMMENT '投放结束日期',
  \`review_note\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审核备注',
  \`reviewed_by\` int DEFAULT NULL COMMENT '审核管理员 ID',
  \`reviewed_at\` datetime DEFAULT NULL COMMENT '审核时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`campaign_category\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'commercial' COMMENT '计划分类：commercial=商业广告 / operational=运营内容 / system=系统通知',
  \`frequency_rule\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'once_per_day' COMMENT '频次规则：always/once/once_per_session/once_per_day/once_per_n_days/n_times_total',
  \`frequency_value\` int DEFAULT '1' COMMENT '频次参数（once_per_n_days 的 N 天，n_times_total 的 N 次）',
  \`force_show\` tinyint(1) DEFAULT '0' COMMENT '是否强制弹出（忽略用户关闭行为）',
  \`internal_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（运营人员可见，不展示给前端用户）',
  \`slide_interval_ms\` int DEFAULT '3000' COMMENT '轮播间隔毫秒（仅 slot_type=carousel 时使用）',
  PRIMARY KEY (\`ad_campaign_id\`),
  UNIQUE KEY \`business_id\` (\`business_id\`),
  KEY \`reviewed_by\` (\`reviewed_by\`),
  KEY \`idx_ac_advertiser\` (\`advertiser_user_id\`),
  KEY \`idx_ac_slot\` (\`ad_slot_id\`),
  KEY \`idx_ac_status\` (\`status\`),
  KEY \`idx_ac_billing_status\` (\`billing_mode\`,\`status\`),
  KEY \`idx_campaign_category\` (\`campaign_category\`),
  CONSTRAINT \`ad_campaigns_ibfk_1\` FOREIGN KEY (\`advertiser_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_campaigns_ibfk_2\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_campaigns_ibfk_3\` FOREIGN KEY (\`reviewed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告投放计划表 — Phase 3 广告主自助投放';`, { transaction });

      // [8/106] ad_click_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_click_logs\` (
  \`ad_click_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '广告点击日志主键',
  \`ad_campaign_id\` int NOT NULL COMMENT '广告计划 ID',
  \`user_id\` int NOT NULL COMMENT '点击用户 ID',
  \`ad_slot_id\` int NOT NULL COMMENT '广告位 ID',
  \`click_target\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '跳转目标 URL',
  \`is_valid\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否有效点击（反作弊判定结果）',
  \`invalid_reason\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '无效原因：fake_click / self_click',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点击时间',
  PRIMARY KEY (\`ad_click_log_id\`),
  KEY \`ad_slot_id\` (\`ad_slot_id\`),
  KEY \`idx_acl_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_acl_user_created\` (\`user_id\`,\`created_at\`),
  CONSTRAINT \`ad_click_logs_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_click_logs_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_click_logs_ibfk_3\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告点击日志表 — Phase 5 归因数据源';`, { transaction });

      // [9/106] ad_attribution_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_attribution_logs\` (
  \`ad_attribution_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '归因日志主键',
  \`ad_click_log_id\` bigint NOT NULL COMMENT '关联的广告点击日志 ID',
  \`ad_campaign_id\` int NOT NULL COMMENT '广告计划 ID',
  \`user_id\` int NOT NULL COMMENT '转化用户 ID',
  \`conversion_type\` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '转化类型：lottery_draw / exchange / market_buy / page_view',
  \`conversion_entity_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '转化实体 ID（如 draw_id / exchange_record_id）',
  \`click_at\` datetime NOT NULL COMMENT '广告点击时间',
  \`conversion_at\` datetime NOT NULL COMMENT '转化发生时间',
  \`attribution_window_hours\` int NOT NULL DEFAULT '24' COMMENT '归因窗口期（拍板决策7：24小时）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`ad_attribution_log_id\`),
  KEY \`ad_click_log_id\` (\`ad_click_log_id\`),
  KEY \`idx_aal_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_aal_user\` (\`user_id\`),
  KEY \`idx_aal_type\` (\`conversion_type\`),
  KEY \`idx_aal_click_at\` (\`click_at\`),
  CONSTRAINT \`ad_attribution_logs_ibfk_1\` FOREIGN KEY (\`ad_click_log_id\`) REFERENCES \`ad_click_logs\` (\`ad_click_log_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_attribution_logs_ibfk_2\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_attribution_logs_ibfk_3\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='归因追踪日志表 — Phase 6 点击→转化关联';`, { transaction });

      // [10/106] ad_bid_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_bid_logs\` (
  \`ad_bid_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '竞价记录主键（BIGINT）',
  \`ad_slot_id\` int NOT NULL COMMENT '竞争的广告位 ID',
  \`ad_campaign_id\` int NOT NULL COMMENT '参与竞价的广告计划 ID',
  \`bid_amount_diamond\` int NOT NULL COMMENT '出价（钻石）',
  \`is_winner\` tinyint(1) NOT NULL COMMENT '是否胜出',
  \`target_user_id\` int NOT NULL COMMENT '目标用户 ID（为谁竞价）',
  \`lose_reason\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '落选原因：outbid / targeting_mismatch / budget_exhausted',
  \`bid_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '竞价时间',
  PRIMARY KEY (\`ad_bid_log_id\`),
  KEY \`idx_abl_slot_time\` (\`ad_slot_id\`,\`bid_at\`),
  KEY \`idx_abl_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_abl_user\` (\`target_user_id\`),
  CONSTRAINT \`ad_bid_logs_ibfk_1\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_bid_logs_ibfk_2\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_bid_logs_ibfk_3\` FOREIGN KEY (\`target_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价记录表 — Phase 4 竞价排名';`, { transaction });

      // [11/106] ad_billing_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_billing_records\` (
  \`ad_billing_record_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '计费流水主键（BIGINT 预留大数据量）',
  \`business_id\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（防重复扣费）',
  \`ad_campaign_id\` int NOT NULL COMMENT '关联广告计划 ID',
  \`advertiser_user_id\` int NOT NULL COMMENT '广告主用户 ID',
  \`billing_date\` date NOT NULL COMMENT '计费日期',
  \`amount_diamond\` int NOT NULL COMMENT '钻石金额',
  \`billing_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '计费类型：freeze / deduct / refund / daily_deduct',
  \`asset_transaction_id\` bigint DEFAULT NULL COMMENT '关联 asset_transactions 流水 ID',
  \`remark\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`ad_billing_record_id\`),
  UNIQUE KEY \`business_id\` (\`business_id\`),
  KEY \`advertiser_user_id\` (\`advertiser_user_id\`),
  KEY \`idx_abr_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_abr_date\` (\`billing_date\`),
  KEY \`idx_abr_type\` (\`billing_type\`),
  CONSTRAINT \`ad_billing_records_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_billing_records_ibfk_2\` FOREIGN KEY (\`advertiser_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告计费流水表 — Phase 3 钻石冻结/扣款/退款';`, { transaction });

      // [12/106] ad_creatives
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_creatives\` (
  \`ad_creative_id\` int NOT NULL AUTO_INCREMENT COMMENT '广告素材主键',
  \`ad_campaign_id\` int NOT NULL COMMENT '所属广告计划 ID',
  \`title\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '素材标题',
  \`image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '图片URL（对象存储key，content_type=text 时为 NULL）',
  \`image_width\` int unsigned DEFAULT NULL COMMENT '原图宽度 px',
  \`image_height\` int unsigned DEFAULT NULL COMMENT '原图高度 px',
  \`link_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '跳转链接',
  \`link_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '跳转类型：none / page / miniprogram / webview',
  \`review_status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending / approved / rejected',
  \`review_note\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审核备注',
  \`reviewed_by\` int DEFAULT NULL COMMENT '审核管理员 ID',
  \`reviewed_at\` datetime DEFAULT NULL COMMENT '审核时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`content_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image' COMMENT '内容类型：image=图片 / text=纯文字',
  \`text_content\` text COLLATE utf8mb4_unicode_ci COMMENT '文字内容（content_type=text 时使用，原 SystemAnnouncement.content）',
  \`display_mode\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示模式：wide/horizontal/square/tall/slim/full_image（原 PopupBanner 的 6 种显示模式）',
  PRIMARY KEY (\`ad_creative_id\`),
  KEY \`reviewed_by\` (\`reviewed_by\`),
  KEY \`idx_acr_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_acr_review\` (\`review_status\`),
  CONSTRAINT \`ad_creatives_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_creatives_ibfk_2\` FOREIGN KEY (\`reviewed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告素材表 — Phase 3 素材审核';`, { transaction });

      // [13/106] ad_dau_daily_stats
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_dau_daily_stats\` (
  \`ad_dau_daily_stat_id\` bigint NOT NULL AUTO_INCREMENT COMMENT 'DAU 每日统计主键',
  \`stat_date\` date NOT NULL COMMENT '统计日期（唯一，每天一条记录）',
  \`dau_count\` int NOT NULL DEFAULT '0' COMMENT '当日活跃用户数',
  \`dau_coefficient\` decimal(10,4) DEFAULT NULL COMMENT '当日 DAU 系数（匹配档位后计算得出）',
  \`source\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'last_active_at' COMMENT 'DAU 数据来源字段',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`ad_dau_daily_stat_id\`),
  UNIQUE KEY \`stat_date\` (\`stat_date\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DAU 每日统计表（广告定价的 DAU 系数数据源）';`, { transaction });

      // [14/106] ad_impression_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_impression_logs\` (
  \`ad_impression_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '广告曝光日志主键',
  \`ad_campaign_id\` int NOT NULL COMMENT '广告计划 ID',
  \`user_id\` int NOT NULL COMMENT '曝光用户 ID',
  \`ad_slot_id\` int NOT NULL COMMENT '广告位 ID',
  \`is_valid\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否有效曝光（反作弊判定结果）',
  \`invalid_reason\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '无效原因：self_view / frequency_limit / batch_suspect',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '曝光时间',
  PRIMARY KEY (\`ad_impression_log_id\`),
  KEY \`ad_slot_id\` (\`ad_slot_id\`),
  KEY \`idx_ail_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_ail_user\` (\`user_id\`),
  KEY \`idx_ail_created\` (\`created_at\`),
  CONSTRAINT \`ad_impression_logs_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_impression_logs_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_impression_logs_ibfk_3\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告曝光日志表 — Phase 5 反作弊过滤';`, { transaction });

      // [15/106] ad_interaction_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_interaction_logs\` (
  \`ad_interaction_log_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '交互日志主键ID',
  \`ad_campaign_id\` int NOT NULL COMMENT '所属广告计划ID',
  \`user_id\` int NOT NULL COMMENT '用户ID',
  \`ad_slot_id\` int DEFAULT NULL COMMENT '广告位ID',
  \`interaction_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交互类型：impression=展示 / click=点击 / close=关闭 / swipe=滑动',
  \`extra_data\` json DEFAULT NULL COMMENT '异构扩展数据（如 show_duration_ms/close_method/is_manual_swipe 等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`ad_interaction_log_id\`),
  KEY \`ad_slot_id\` (\`ad_slot_id\`),
  KEY \`idx_ail_campaign\` (\`ad_campaign_id\`),
  KEY \`idx_ail_user\` (\`user_id\`),
  KEY \`idx_ail_type\` (\`interaction_type\`),
  KEY \`idx_ail_created\` (\`created_at\`),
  CONSTRAINT \`ad_interaction_logs_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`ad_interaction_logs_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`ad_interaction_logs_ibfk_3\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用内容交互日志表 — 统一记录弹窗/轮播/公告/广告的展示、点击、关闭等交互事件';`, { transaction });

      // [16/106] ad_price_adjustment_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_price_adjustment_logs\` (
  \`ad_price_adjustment_log_id\` int NOT NULL AUTO_INCREMENT,
  \`trigger_type\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发类型：dau_shift=DAU区间变化, manual=运营手动调整',
  \`old_coefficient\` decimal(10,4) DEFAULT NULL COMMENT '调价前的 DAU 系数',
  \`new_coefficient\` decimal(10,4) DEFAULT NULL COMMENT '调价后的 DAU 系数',
  \`affected_slots\` json DEFAULT NULL COMMENT '受影响的广告位列表（JSON 数组）',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending=待确认, confirmed=已确认, rejected=已拒绝, applied=已执行',
  \`confirmed_by\` int DEFAULT NULL COMMENT '确认操作人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`applied_at\` datetime DEFAULT NULL COMMENT '实际执行时间',
  PRIMARY KEY (\`ad_price_adjustment_log_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告调价历史记录表';`, { transaction });

      // [17/106] ad_report_daily_snapshots
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_report_daily_snapshots\` (
  \`snapshot_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '快照主键',
  \`snapshot_date\` date NOT NULL COMMENT '快照日期',
  \`ad_campaign_id\` int NOT NULL COMMENT '广告计划 ID',
  \`ad_slot_id\` int NOT NULL COMMENT '广告位 ID',
  \`impressions_total\` int NOT NULL DEFAULT '0' COMMENT '总曝光数',
  \`impressions_valid\` int NOT NULL DEFAULT '0' COMMENT '有效曝光数（去除作弊）',
  \`clicks_total\` int NOT NULL DEFAULT '0' COMMENT '总点击数',
  \`clicks_valid\` int NOT NULL DEFAULT '0' COMMENT '有效点击数（去除作弊）',
  \`conversions\` int NOT NULL DEFAULT '0' COMMENT '转化数',
  \`spend_diamond\` int NOT NULL DEFAULT '0' COMMENT '消耗钻石数',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`snapshot_id\`),
  UNIQUE KEY \`uk_ards_date_campaign_slot\` (\`snapshot_date\`,\`ad_campaign_id\`,\`ad_slot_id\`),
  KEY \`ad_campaign_id\` (\`ad_campaign_id\`),
  KEY \`ad_slot_id\` (\`ad_slot_id\`),
  CONSTRAINT \`ad_report_daily_snapshots_ibfk_1\` FOREIGN KEY (\`ad_campaign_id\`) REFERENCES \`ad_campaigns\` (\`ad_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`ad_report_daily_snapshots_ibfk_2\` FOREIGN KEY (\`ad_slot_id\`) REFERENCES \`ad_slots\` (\`ad_slot_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每日报表快照表 — Phase 6 凌晨4点聚合';`, { transaction });

      // [18/106] ad_zone_groups
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_zone_groups\` (
  \`group_id\` int NOT NULL AUTO_INCREMENT COMMENT '联合广告组ID',
  \`group_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '联合组名称',
  \`pricing_mode\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sum' COMMENT '定价方式：sum=成员单价之和, discount=总和×折扣, fixed=固定价',
  \`discount_rate\` decimal(3,2) NOT NULL DEFAULT '1.00' COMMENT '折扣率（pricing_mode=discount 时使用）',
  \`fixed_price\` int DEFAULT NULL COMMENT '固定联合价（pricing_mode=fixed 时使用）',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active/inactive',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`group_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='联合广告组（多地域打包投放）';`, { transaction });

      // [19/106] ad_zone_group_members
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`ad_zone_group_members\` (
  \`ad_zone_group_member_id\` int NOT NULL AUTO_INCREMENT,
  \`group_id\` int NOT NULL COMMENT '所属联合组ID',
  \`zone_id\` int NOT NULL COMMENT '关联地域ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`ad_zone_group_member_id\`),
  UNIQUE KEY \`uk_group_zone\` (\`group_id\`,\`zone_id\`),
  KEY \`zone_id\` (\`zone_id\`),
  CONSTRAINT \`ad_zone_group_members_ibfk_1\` FOREIGN KEY (\`group_id\`) REFERENCES \`ad_zone_groups\` (\`group_id\`) ON DELETE CASCADE,
  CONSTRAINT \`ad_zone_group_members_ibfk_2\` FOREIGN KEY (\`zone_id\`) REFERENCES \`ad_target_zones\` (\`zone_id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='联合广告组成员关联表';`, { transaction });

      // [20/106] admin_notifications
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`admin_notifications\` (
  \`admin_notification_id\` int NOT NULL AUTO_INCREMENT,
  \`admin_id\` int NOT NULL COMMENT '接收管理员ID',
  \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知标题',
  \`content\` text COLLATE utf8mb4_unicode_ci COMMENT '通知内容（详细描述）',
  \`notification_type\` enum('system','alert','reminder','task') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system' COMMENT '通知类型（system=系统通知, alert=告警, reminder=提醒, task=任务）',
  \`priority\` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '优先级（low=低, normal=普通, high=高, urgent=紧急）',
  \`is_read\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已读',
  \`read_at\` datetime DEFAULT NULL COMMENT '阅读时间',
  \`source_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源类型（如：lottery_alert, consumption, reminder_rule）',
  \`source_id\` int DEFAULT NULL COMMENT '来源ID（关联来源实体）',
  \`extra_data\` json DEFAULT NULL COMMENT '附加数据（JSON格式，如跳转链接、操作按钮等）',
  \`expires_at\` datetime DEFAULT NULL COMMENT '过期时间（超时后自动标记过期）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`admin_notification_id\`),
  KEY \`idx_admin_notifications_admin_read\` (\`admin_id\`,\`is_read\`),
  KEY \`idx_admin_notifications_type_created\` (\`notification_type\`,\`created_at\`),
  KEY \`idx_admin_notifications_priority_read\` (\`priority\`,\`is_read\`),
  KEY \`idx_admin_notifications_source\` (\`source_type\`,\`source_id\`),
  CONSTRAINT \`admin_notifications_ibfk_1\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员通知消息表 - 存储系统通知、告警提醒、任务通知等';`, { transaction });

      // [21/106] admin_operation_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`admin_operation_logs\` (
  \`admin_operation_log_id\` bigint NOT NULL AUTO_INCREMENT,
  \`operator_id\` int NOT NULL COMMENT '操作员ID（管理员user_id）',
  \`operation_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型（VARCHAR 存储，值校验在应用层 - 详见 constants/AuditOperationTypes.js）',
  \`target_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标对象类型（User/Product/Prize等）',
  \`target_id\` bigint NOT NULL COMMENT '目标对象ID',
  \`action\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作动作（create/update/delete/approve/reject等）',
  \`before_data\` json DEFAULT NULL COMMENT '操作前数据（JSON格式）',
  \`after_data\` json DEFAULT NULL COMMENT '操作后数据（JSON格式）',
  \`changed_fields\` json DEFAULT NULL COMMENT '变更字段列表',
  \`reason\` text COLLATE utf8mb4_unicode_ci COMMENT '操作原因/备注',
  \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址（支持IPv4和IPv6）',
  \`user_agent\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户代理字符串',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  \`target_type_raw\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始 target_type 值（用于审计追溯）',
  \`is_reversible\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可回滚（部分操作支持一键回滚）',
  \`reversal_data\` json DEFAULT NULL COMMENT '回滚所需数据（用于执行回滚操作的完整数据）',
  \`is_reversed\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已回滚',
  \`reversed_at\` datetime DEFAULT NULL COMMENT '回滚执行时间',
  \`reversed_by\` int DEFAULT NULL COMMENT '回滚操作者ID',
  \`risk_level\` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '操作风险等级',
  \`requires_approval\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要二次审批（高风险操作）',
  \`approval_status\` enum('not_required','pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_required' COMMENT '审批状态',
  \`affected_users\` int DEFAULT '0' COMMENT '影响用户数（用于评估操作影响范围）',
  \`affected_amount\` bigint DEFAULT '0' COMMENT '影响金额/积分数（分为单位，用于评估财务影响）',
  \`rollback_deadline\` datetime DEFAULT NULL COMMENT '回滚截止时间（超时后不可回滚，与 is_reversible 配合使用）',
  PRIMARY KEY (\`admin_operation_log_id\`),
  UNIQUE KEY \`uk_admin_operation_logs_idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_audit_logs_operator\` (\`operator_id\`),
  KEY \`idx_audit_logs_operation_type\` (\`operation_type\`),
  KEY \`idx_audit_logs_target\` (\`target_type\`,\`target_id\`),
  KEY \`idx_audit_logs_created\` (\`created_at\`),
  KEY \`idx_audit_logs_ip\` (\`ip_address\`),
  KEY \`idx_audit_logs_reversible\` (\`is_reversible\`),
  KEY \`idx_audit_logs_risk_level\` (\`risk_level\`),
  KEY \`idx_audit_logs_approval_status\` (\`approval_status\`),
  KEY \`idx_operation_logs_affected\` (\`affected_users\`,\`affected_amount\`),
  KEY \`idx_operation_logs_deadline\` (\`is_reversible\`,\`rollback_deadline\`),
  CONSTRAINT \`admin_operation_logs_ibfk_1\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作审计日志表（记录所有敏感操作）';`, { transaction });

      // [22/106] administrative_regions
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`administrative_regions\` (
  \`region_code\` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '行政区划代码（GB/T 2260标准，如110108）',
  \`parent_code\` varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '父级区划代码（省的parent_code为NULL）',
  \`region_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '区划名称（如"海淀区"）',
  \`level\` tinyint NOT NULL COMMENT '层级（1=省级, 2=市级, 3=区县级, 4=街道/乡镇）',
  \`short_name\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '简称（如"京"）',
  \`pinyin\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '拼音（如"haidian"，用于搜索）',
  \`longitude\` decimal(10,7) DEFAULT NULL COMMENT '经度（可选，用于地图展示）',
  \`latitude\` decimal(10,7) DEFAULT NULL COMMENT '纬度（可选）',
  \`status\` enum('active','merged','abolished') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态（active=有效, merged=已合并, abolished=已撤销）',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序权重（用于前端展示排序）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`region_code\`),
  KEY \`idx_administrative_regions_parent_code\` (\`parent_code\`),
  KEY \`idx_administrative_regions_level_status\` (\`level\`,\`status\`),
  KEY \`idx_administrative_regions_region_name\` (\`region_name\`),
  KEY \`idx_administrative_regions_pinyin\` (\`pinyin\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='行政区划字典表（省市区街道数据，支持级联选择）';`, { transaction });

      // [23/106] alert_silence_rules
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`alert_silence_rules\` (
  \`alert_silence_rule_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '静默规则主键ID',
  \`rule_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称（如：节假日静默、夜间静默）',
  \`alert_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型（如：risk、lottery、system）',
  \`alert_level\` enum('critical','warning','info','all') COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT '静默的告警级别（critical/warning/info/all）',
  \`condition_json\` json DEFAULT NULL COMMENT '静默条件JSON（如：{ user_id: [1,2], keyword: "测试" }）',
  \`start_time\` time DEFAULT NULL COMMENT '每日静默开始时间（如：22:00:00）',
  \`end_time\` time DEFAULT NULL COMMENT '每日静默结束时间（如：08:00:00）',
  \`effective_start_date\` date DEFAULT NULL COMMENT '规则生效开始日期',
  \`effective_end_date\` date DEFAULT NULL COMMENT '规则生效结束日期',
  \`is_active\` tinyint(1) DEFAULT '1' COMMENT '是否启用',
  \`created_by\` int NOT NULL COMMENT '创建人用户ID',
  \`updated_by\` int DEFAULT NULL COMMENT '最后修改人用户ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`alert_silence_rule_id\`),
  KEY \`idx_alert_silence_type_active\` (\`alert_type\`,\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警静默规则表（运营后台优化 DB-2）';`, { transaction });

      // [24/106] api_idempotency_requests
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`api_idempotency_requests\` (
  \`api_idempotency_request_id\` bigint NOT NULL AUTO_INCREMENT,
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（全局唯一）',
  \`api_path\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'API路径',
  \`http_method\` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'POST' COMMENT 'HTTP方法',
  \`request_hash\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '请求参数哈希（用于检测参数冲突）',
  \`request_params\` json DEFAULT NULL COMMENT '请求参数快照',
  \`user_id\` bigint NOT NULL COMMENT '用户ID',
  \`status\` enum('processing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'processing' COMMENT '处理状态',
  \`business_event_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务事件ID（如 lottery_session_id）',
  \`response_snapshot\` json DEFAULT NULL COMMENT '响应结果快照（重试时直接返回）',
  \`response_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '响应业务代码',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '请求创建时间',
  \`completed_at\` datetime DEFAULT NULL COMMENT '请求完成时间',
  \`expires_at\` datetime NOT NULL COMMENT '过期时间（24小时后可清理）',
  PRIMARY KEY (\`api_idempotency_request_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`idx_status_expires\` (\`status\`,\`expires_at\`),
  KEY \`idx_business_event\` (\`business_event_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API入口幂等表 - 实现重试返回首次结果';`, { transaction });

      // [25/106] asset_group_defs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`asset_group_defs\` (
  \`group_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分组代码（主键）：如 currency, points, red, orange, yellow, green, blue, purple',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分组描述',
  \`group_type\` enum('system','material','custom') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'material' COMMENT '分组类型：system=系统级（积分/货币）, material=材料组, custom=自定义',
  \`color_hex\` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主题颜色（HEX格式）：如 #FF0000',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序顺序（升序）',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`is_tradable\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '该分组资产是否允许交易',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`group_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产分组字典表（Asset Group Definitions - 可交易资产分组定义）';`, { transaction });

      // [26/106] asset_transactions
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`asset_transactions\` (
  \`asset_transaction_id\` bigint NOT NULL AUTO_INCREMENT,
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产, red_shard-碎红水晶, 等',
  \`delta_amount\` bigint NOT NULL COMMENT '变动金额（Delta Amount - 资产变动数量，正数表示增加，负数表示扣减，单位：1个资产单位）',
  \`balance_after\` bigint NOT NULL COMMENT '变动后余额（Balance After - 本次变动后的资产余额，用于快速查询和对账）',
  \`business_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型（Business Type - 业务场景分类）：market_purchase_buyer_debit-市场购买买家扣减, market_purchase_seller_credit-市场购买卖家入账, market_purchase_platform_fee_credit-市场购买平台手续费, exchange_debit-兑换扣减, material_convert_debit-材料转换扣减, material_convert_credit-材料转换入账',
  \`meta\` json DEFAULT NULL COMMENT '扩展信息（Meta - JSON格式存储业务扩展信息）：如order_no, item_id, conversion_rule等，用于业务追溯和审计',
  \`is_invalid\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否无效记录（标记 BIGINT 溢出等异常数据，对账时排除）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间，数据库内部存储UTC）',
  \`account_id\` bigint NOT NULL COMMENT '账户ID（外键：accounts.account_id）',
  \`counterpart_account_id\` bigint DEFAULT NULL COMMENT '对手方账户ID（双录记账：每笔变动同时记出方和入方）',
  \`balance_before\` bigint NOT NULL COMMENT '变动前余额（强制必填，对账必需）',
  \`lottery_session_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '抽奖会话ID（仅抽奖业务使用，非抽奖业务可为NULL，用于关联 consume+reward）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（每条流水唯一）：抽奖格式 {request_key}:consume/{request_key}:reward，其他格式 {type}_{account}_{ts}_{random}',
  \`frozen_amount_change\` bigint NOT NULL DEFAULT '0' COMMENT '冻结余额变动（正数=增加冻结，负数=减少冻结，0=仅影响可用余额）：用于冻结/解冻/结算操作的结构化记录',
  \`is_test_data\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '测试数据标记：0=生产数据，1=测试数据',
  PRIMARY KEY (\`asset_transaction_id\`),
  UNIQUE KEY \`uk_idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_business_type_time\` (\`business_type\`,\`created_at\`),
  KEY \`idx_asset_code_time\` (\`asset_code\`,\`created_at\`),
  KEY \`idx_account_asset_time\` (\`account_id\`,\`asset_code\`,\`created_at\`),
  KEY \`idx_lottery_session_id\` (\`lottery_session_id\`),
  KEY \`idx_frozen_change\` (\`account_id\`,\`asset_code\`,\`frozen_amount_change\`),
  KEY \`idx_asset_test_data\` (\`is_test_data\`,\`business_type\`),
  KEY \`idx_asset_tx_counterpart\` (\`counterpart_account_id\`),
  CONSTRAINT \`asset_transactions_account_id_foreign_idx\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产流水表（Asset Transactions）- 记录所有资产变动流水，支持幂等性控制和审计追溯';`, { transaction });

      // [27/106] authentication_sessions
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`authentication_sessions\` (
  \`authentication_session_id\` bigint NOT NULL AUTO_INCREMENT,
  \`session_token\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话令牌（JWT Token的jti）',
  \`user_type\` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户类型',
  \`user_id\` int NOT NULL,
  \`login_ip\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录IP',
  \`login_platform\` enum('web','wechat_mp','douyin_mp','alipay_mp','app','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown' COMMENT '登录平台：web=浏览器, wechat_mp=微信小程序, douyin_mp=抖音小程序, alipay_mp=支付宝小程序, app=原生App(预留), unknown=旧数据兜底',
  \`is_active\` tinyint(1) DEFAULT '1' COMMENT '是否活跃',
  \`last_activity\` datetime NOT NULL COMMENT '最后活动时间',
  \`expires_at\` datetime NOT NULL COMMENT '过期时间',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  PRIMARY KEY (\`authentication_session_id\`),
  UNIQUE KEY \`session_token\` (\`session_token\`),
  KEY \`idx_user_sessions_expires\` (\`expires_at\`,\`is_active\`),
  KEY \`idx_user_sessions_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`user_sessions_last_activity\` (\`last_activity\`),
  KEY \`idx_user_sessions_platform\` (\`user_type\`,\`user_id\`,\`login_platform\`,\`is_active\`),
  CONSTRAINT \`authentication_sessions_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话管理表';`, { transaction });

      // [28/106] batch_operation_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`batch_operation_logs\` (
  \`batch_operation_log_id\` int NOT NULL AUTO_INCREMENT,
  \`idempotency_key\` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（格式：{operation_type}:{operator_id}:{timestamp}:{hash}）- 防止重复提交',
  \`operation_type\` enum('quota_grant_batch','preset_batch','redemption_verify_batch','campaign_status_batch','budget_adjust_batch') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型：quota_grant_batch=批量赠送抽奖次数 | preset_batch=批量设置干预规则 | redemption_verify_batch=批量核销确认 | campaign_status_batch=批量活动状态切换 | budget_adjust_batch=批量预算调整',
  \`status\` enum('processing','partial_success','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'processing' COMMENT '操作状态：processing=处理中 | partial_success=部分成功 | completed=全部成功 | failed=全部失败',
  \`total_count\` int NOT NULL COMMENT '总操作数量',
  \`success_count\` int NOT NULL DEFAULT '0' COMMENT '成功数量',
  \`fail_count\` int NOT NULL DEFAULT '0' COMMENT '失败数量',
  \`operation_params\` json DEFAULT NULL COMMENT '操作参数JSON（存储原始请求参数，便于重试和审计）',
  \`result_summary\` json DEFAULT NULL COMMENT '结果摘要JSON（格式：{success_items: [{id, result}], failed_items: [{id, error}]}）',
  \`operator_id\` int NOT NULL COMMENT '操作人ID（外键，关联 users.user_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`completed_at\` datetime DEFAULT NULL COMMENT '完成时间（北京时间）- 操作完成（无论成功/失败）时记录',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`batch_operation_log_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`idx_batch_ops_idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_batch_ops_operator_created\` (\`operator_id\`,\`created_at\`),
  KEY \`idx_batch_ops_status\` (\`status\`),
  KEY \`idx_batch_ops_type_status\` (\`operation_type\`,\`status\`),
  KEY \`idx_batch_ops_created_at\` (\`created_at\`),
  CONSTRAINT \`batch_operation_logs_ibfk_1\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量操作日志表 - 幂等性控制与操作审计（阶段C核心基础设施）';`, { transaction });

      // [29/106] image_resources
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`image_resources\` (
  \`image_resource_id\` int NOT NULL AUTO_INCREMENT,
  \`business_type\` enum('lottery','exchange','trade','uploads') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型：抽奖/兑换/交易/上传（user_upload_review 已删除 - 2026-01-08）',
  \`category\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资源分类：prizes/products/items/pending_review等',
  \`context_id\` int NOT NULL COMMENT '上下文ID：用户ID/奖品ID/商品ID等',
  \`user_id\` int DEFAULT NULL COMMENT '关联用户ID（上传用户）',
  \`file_path\` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件存储路径',
  \`thumbnail_paths\` json DEFAULT NULL COMMENT '缩略图路径集合：{small: "", medium: "", large: ""}',
  \`original_filename\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始文件名',
  \`file_size\` int NOT NULL COMMENT '文件大小（字节）',
  \`mime_type\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MIME类型',
  \`status\` enum('active','archived','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '资源状态',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`upload_id\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传记录业务ID（兼容原UploadReview）',
  \`source_module\` enum('system','lottery','exchange','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system' COMMENT '来源模块：系统/抽奖/兑换/管理员',
  \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序序号（同一 context_id 内排序，数字越小越靠前）',
  PRIMARY KEY (\`image_resource_id\`),
  UNIQUE KEY \`upload_id\` (\`upload_id\`),
  KEY \`idx_business_category\` (\`business_type\`,\`category\`),
  KEY \`idx_user_business\` (\`user_id\`,\`business_type\`,\`status\`),
  KEY \`idx_context_category\` (\`context_id\`,\`category\`,\`status\`),
  KEY \`idx_created_status\` (\`created_at\`,\`status\`),
  CONSTRAINT \`fk_image_resources_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一图片资源管理表';`, { transaction });

      // [30/106] exchange_items
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`exchange_items\` (
  \`exchange_item_id\` bigint NOT NULL AUTO_INCREMENT,
  \`item_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商品名称（兑换商品的显示名称）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '商品描述',
  \`primary_image_id\` int DEFAULT NULL COMMENT '主图片ID，关联 image_resources.image_id',
  \`cost_price\` decimal(10,2) NOT NULL COMMENT '实际成本（人民币）',
  \`stock\` int DEFAULT '0' COMMENT '库存数量',
  \`sold_count\` int DEFAULT '0' COMMENT '已售数量',
  \`category\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '商品分类',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active' COMMENT '商品状态',
  \`sort_order\` int DEFAULT '0' COMMENT '排序序号',
  \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`cost_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '兑换成本资产代码（材料资产支付）',
  \`cost_amount\` bigint NOT NULL COMMENT '兑换成本数量（材料资产支付）',
  \`space\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lucky' COMMENT '所属空间：lucky=幸运空间, premium=臻选空间, both=两者都展示',
  \`original_price\` bigint DEFAULT NULL COMMENT '原价（材料数量），用于展示划线价对比',
  \`tags\` json DEFAULT NULL COMMENT '商品标签数组，如 ["限量","新品"]',
  \`is_new\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否新品',
  \`is_hot\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否热门',
  \`is_lucky\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否幸运商品（特殊标识）',
  \`has_warranty\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否有质保',
  \`free_shipping\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否包邮',
  \`is_limited\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否限量商品（前端触发旋转彩虹边框等视觉强调）',
  \`sell_point\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '营销卖点文案',
  PRIMARY KEY (\`exchange_item_id\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_category\` (\`category\`),
  KEY \`idx_exchange_items_primary_image_id\` (\`primary_image_id\`),
  KEY \`idx_space\` (\`space\`),
  KEY \`idx_space_status\` (\`space\`,\`status\`),
  CONSTRAINT \`fk_exchange_items_primary_image\` FOREIGN KEY (\`primary_image_id\`) REFERENCES \`image_resources\` (\`image_resource_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换市场商品表';`, { transaction });

      // [31/106] bid_products
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`bid_products\` (
  \`bid_product_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '竞价商品ID（自增主键）',
  \`exchange_item_id\` bigint NOT NULL COMMENT '关联兑换商品ID（exchange_items.exchange_item_id）',
  \`start_price\` bigint NOT NULL COMMENT '起拍价（材料资产数量）',
  \`price_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DIAMOND' COMMENT '竞价使用的资产类型（禁止 POINTS/BUDGET_POINTS，见决策1）',
  \`current_price\` bigint NOT NULL DEFAULT '0' COMMENT '当前最高出价（冗余字段，提升查询性能）',
  \`min_bid_increment\` bigint NOT NULL DEFAULT '10' COMMENT '最小加价幅度',
  \`start_time\` datetime NOT NULL COMMENT '竞价开始时间',
  \`end_time\` datetime NOT NULL COMMENT '竞价结束时间',
  \`winner_user_id\` int DEFAULT NULL COMMENT '中标用户ID',
  \`winner_bid_id\` bigint DEFAULT NULL COMMENT '中标出价记录ID（bid_records.bid_record_id）',
  \`status\` enum('pending','active','ended','cancelled','settled','settlement_failed','no_bid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '竞价状态：pending=待开始, active=进行中, ended=已结束待结算, cancelled=已取消, settled=已结算, settlement_failed=结算失败, no_bid=流拍',
  \`bid_count\` int NOT NULL DEFAULT '0' COMMENT '总出价次数',
  \`batch_no\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次号（预留字段，未来多批次竞价扩展用）',
  \`created_by\` int NOT NULL COMMENT '创建人（管理员用户ID）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`bid_product_id\`),
  KEY \`winner_user_id\` (\`winner_user_id\`),
  KEY \`created_by\` (\`created_by\`),
  KEY \`idx_bid_products_status_end\` (\`status\`,\`end_time\`),
  KEY \`idx_bid_products_exchange_item\` (\`exchange_item_id\`),
  KEY \`idx_bid_products_item_status\` (\`exchange_item_id\`,\`status\`),
  KEY \`idx_bid_products_item_batch\` (\`exchange_item_id\`,\`batch_no\`),
  KEY \`idx_bid_products_status_start\` (\`status\`,\`start_time\`),
  CONSTRAINT \`bid_products_ibfk_1\` FOREIGN KEY (\`exchange_item_id\`) REFERENCES \`exchange_items\` (\`exchange_item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`bid_products_ibfk_2\` FOREIGN KEY (\`winner_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`bid_products_ibfk_3\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价商品表（臻选空间/幸运空间竞价功能，7态状态机）';`, { transaction });

      // [32/106] bid_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`bid_records\` (
  \`bid_record_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '出价记录ID（自增主键）',
  \`bid_product_id\` bigint NOT NULL COMMENT '关联竞价商品ID（bid_products.bid_product_id）',
  \`user_id\` int NOT NULL COMMENT '出价用户ID（users.user_id）',
  \`bid_amount\` bigint NOT NULL COMMENT '出价金额（材料资产数量）',
  \`previous_highest\` bigint NOT NULL DEFAULT '0' COMMENT '出价时的前最高价（审计用）',
  \`is_winning\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否当前最高价（出价时标记，后续出价会将前一条改为 false）',
  \`is_final_winner\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否最终中标（结算时由定时任务标记）',
  \`freeze_transaction_id\` bigint DEFAULT NULL COMMENT '冻结流水ID（asset_transactions.asset_transaction_id，对账用）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（防止重复出价，UNIQUE 约束）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '出价时间',
  PRIMARY KEY (\`bid_record_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_bid_records_product_amount\` (\`bid_product_id\`,\`bid_amount\`),
  KEY \`idx_bid_records_user_bid\` (\`user_id\`,\`bid_product_id\`),
  CONSTRAINT \`bid_records_ibfk_1\` FOREIGN KEY (\`bid_product_id\`) REFERENCES \`bid_products\` (\`bid_product_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`bid_records_ibfk_2\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价出价记录表（含冻结流水对账、幂等性控制）';`, { transaction });

      // [33/106] category_defs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`category_defs\` (
  \`category_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '类目代码（主键）：如 food_drink, electronics, fashion',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类目描述',
  \`icon_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '图标URL',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序顺序（升序）',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`category_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品类目字典表（Category Definitions - 商品/物品分类定义）';`, { transaction });

      // [34/106] customer_service_issues
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`customer_service_issues\` (
  \`issue_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '工单主键ID',
  \`user_id\` int NOT NULL COMMENT '关联用户ID',
  \`created_by\` int NOT NULL COMMENT '创建人（客服管理员user_id）',
  \`assigned_to\` int DEFAULT NULL COMMENT '指派给（客服管理员user_id）',
  \`session_id\` bigint DEFAULT NULL COMMENT '关联的首次客服会话ID',
  \`issue_type\` enum('asset','trade','lottery','item','account','consumption','feedback','other') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '问题类型：资产/交易/抽奖/物品/账号/消费核销/反馈升级/其他',
  \`priority\` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'medium' COMMENT '优先级：低/中/高/紧急',
  \`status\` enum('open','processing','resolved','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open' COMMENT '工单状态：待处理/处理中/已解决/已关闭',
  \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '工单标题',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '问题描述',
  \`resolution\` text COLLATE utf8mb4_unicode_ci COMMENT '处理结果',
  \`compensation_log\` json DEFAULT NULL COMMENT '补偿记录JSON（自动填充，格式：[{type, asset_code, amount, item_template_id, quantity}]）',
  \`resolved_at\` datetime DEFAULT NULL COMMENT '解决时间',
  \`closed_at\` datetime DEFAULT NULL COMMENT '关闭时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`issue_id\`),
  KEY \`created_by\` (\`created_by\`),
  KEY \`session_id\` (\`session_id\`),
  KEY \`idx_cs_issues_user_id\` (\`user_id\`),
  KEY \`idx_cs_issues_assigned_to\` (\`assigned_to\`),
  KEY \`idx_cs_issues_status\` (\`status\`),
  KEY \`idx_cs_issues_created_at\` (\`created_at\`),
  KEY \`idx_cs_issues_type\` (\`issue_type\`),
  CONSTRAINT \`customer_service_issues_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_issues_ibfk_2\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_issues_ibfk_3\` FOREIGN KEY (\`assigned_to\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_issues_ibfk_4\` FOREIGN KEY (\`session_id\`) REFERENCES \`customer_service_sessions\` (\`customer_service_session_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服工单表 - GM工作台问题跟踪';`, { transaction });

      // [35/106] customer_service_sessions
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`customer_service_sessions\` (
  \`user_id\` int DEFAULT NULL COMMENT '外键引用（允许NULL）',
  \`admin_id\` int DEFAULT NULL COMMENT '分配的管理员ID（基于UUID角色系统验证管理员权限）',
  \`status\` enum('waiting','assigned','active','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'waiting' COMMENT '会话状态',
  \`source\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'mobile' COMMENT '来源渠道',
  \`priority\` int DEFAULT '1' COMMENT '优先级(1-5)',
  \`last_message_at\` datetime DEFAULT NULL COMMENT '最后消息时间',
  \`closed_at\` datetime DEFAULT NULL COMMENT '关闭时间',
  \`close_reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关闭原因（最长500字符，如：问题已解决、用户未回复、恶意会话等）',
  \`closed_by\` int DEFAULT NULL COMMENT '关闭操作人ID（外键关联users表的user_id，记录哪个管理员关闭的会话）',
  \`satisfaction_score\` int DEFAULT NULL COMMENT '满意度评分(1-5)',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间',
  \`customer_service_session_id\` bigint NOT NULL AUTO_INCREMENT,
  \`is_active_session\` tinyint(1) GENERATED ALWAYS AS ((case when (\`status\` in (_utf8mb4'waiting',_utf8mb4'assigned',_utf8mb4'active')) then 1 else NULL end)) VIRTUAL COMMENT '虚拟列:标识活跃会话(1=活跃,NULL=已关闭),用于部分唯一索引',
  \`first_response_at\` datetime DEFAULT NULL COMMENT '客服首次响应时间（用于计算响应时长）',
  \`issue_id\` bigint DEFAULT NULL COMMENT '关联工单ID（一个工单可关联多个会话）',
  \`tags\` json DEFAULT NULL COMMENT '会话标签JSON数组（如 ["交易纠纷","已补偿"]）',
  \`resolution_summary\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '处理摘要（关闭时填写，历史会话Tab展示）',
  PRIMARY KEY (\`customer_service_session_id\`),
  UNIQUE KEY \`idx_user_active_session\` (\`user_id\`,\`is_active_session\`),
  KEY \`idx_customer_sessions_user_id\` (\`user_id\`),
  KEY \`idx_customer_sessions_admin_id\` (\`admin_id\`),
  KEY \`idx_customer_sessions_status\` (\`status\`),
  KEY \`idx_customer_sessions_created_at\` (\`created_at\`),
  KEY \`idx_closed_by\` (\`closed_by\`),
  KEY \`idx_css_status_created_at\` (\`status\`,\`created_at\`),
  KEY \`idx_css_admin_status\` (\`admin_id\`,\`status\`),
  KEY \`idx_cs_sessions_issue_id\` (\`issue_id\`),
  CONSTRAINT \`customer_service_sessions_issue_id_foreign_idx\` FOREIGN KEY (\`issue_id\`) REFERENCES \`customer_service_issues\` (\`issue_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_customer_sessions_admin_id\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_customer_sessions_closed_by\` FOREIGN KEY (\`closed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_customer_sessions_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户聊天会话表';`, { transaction });

      // [36/106] chat_messages
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`chat_messages\` (
  \`customer_service_session_id\` bigint NOT NULL,
  \`sender_id\` int DEFAULT NULL COMMENT '发送者ID（系统消息为NULL）',
  \`sender_type\` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发送者类型',
  \`message_source\` enum('user_client','admin_client','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息来源：user_client=用户端，admin_client=管理员端，system=系统消息',
  \`content\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '消息内容',
  \`message_type\` enum('text','image','system') COLLATE utf8mb4_unicode_ci DEFAULT 'text' COMMENT '消息类型',
  \`status\` enum('sending','sent','delivered','read') COLLATE utf8mb4_unicode_ci DEFAULT 'sent' COMMENT '消息状态',
  \`reply_to_id\` bigint DEFAULT NULL COMMENT '回复的消息ID',
  \`temp_message_id\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '临时消息ID(前端生成)',
  \`metadata\` json DEFAULT NULL COMMENT '扩展数据(图片信息等)',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`chat_message_id\` bigint NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (\`chat_message_id\`),
  UNIQUE KEY \`new_message_id\` (\`chat_message_id\`),
  KEY \`idx_chat_messages_session_id\` (\`customer_service_session_id\`),
  KEY \`idx_chat_messages_sender_id\` (\`sender_id\`),
  KEY \`idx_chat_messages_created_at\` (\`created_at\`),
  KEY \`idx_chat_messages_temp_message_id\` (\`temp_message_id\`),
  KEY \`idx_chat_messages_source_type\` (\`message_source\`,\`sender_type\`),
  CONSTRAINT \`fk_chat_messages_sender_id\` FOREIGN KEY (\`sender_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_chat_messages_session\` FOREIGN KEY (\`customer_service_session_id\`) REFERENCES \`customer_service_sessions\` (\`customer_service_session_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';`, { transaction });

      // [37/106] merchants
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`merchants\` (
  \`merchant_id\` int NOT NULL AUTO_INCREMENT COMMENT '商家ID（主键）',
  \`merchant_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商家名称（如：某某餐厅、XX珠宝、YY小游戏）',
  \`merchant_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商家类型（字典表 system_dictionaries dict_type=merchant_type 校验：restaurant/shop/game/service）',
  \`contact_name\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系人姓名',
  \`contact_mobile\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  \`logo_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LOGO图片URL（Sealos对象存储）',
  \`status\` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '商家状态：active-正常/inactive-停用/suspended-暂停',
  \`settlement_account_id\` bigint DEFAULT NULL COMMENT '结算账户ID（预留，关联 accounts 表，MVP阶段为NULL）',
  \`commission_rate\` decimal(4,2) NOT NULL DEFAULT '0.00' COMMENT '平台抽佣比例（0.00~99.99%，0表示不抽佣）',
  \`notes\` text COLLATE utf8mb4_unicode_ci COMMENT '备注信息',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`merchant_id\`),
  KEY \`settlement_account_id\` (\`settlement_account_id\`),
  KEY \`idx_merchants_type\` (\`merchant_type\`),
  KEY \`idx_merchants_status\` (\`status\`),
  CONSTRAINT \`merchants_ibfk_1\` FOREIGN KEY (\`settlement_account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商家信息表（多商家接入：餐厅/商铺/小游戏/服务商）';`, { transaction });

      // [38/106] stores
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`stores\` (
  \`store_id\` int NOT NULL AUTO_INCREMENT COMMENT '门店ID（主键）',
  \`store_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '门店名称（如：某某餐厅XX店）',
  \`store_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店编号（唯一标识，如：ST20250101001）',
  \`store_address\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店地址（详细地址）',
  \`contact_name\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店联系人姓名',
  \`contact_mobile\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '门店联系电话',
  \`status\` enum('active','inactive','pending') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '门店状态：active-正常营业，inactive-已关闭，pending-待审核',
  \`assigned_to\` int DEFAULT NULL COMMENT '分配给哪个业务员（外键关联users.user_id）',
  \`merchant_id\` int DEFAULT NULL COMMENT '商户ID（关联商家用户，外键关联users.user_id）',
  \`notes\` text COLLATE utf8mb4_unicode_ci COMMENT '备注信息',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（门店信息录入时间），时区：北京时间（GMT+8）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（最后修改时间），时区：北京时间（GMT+8）',
  \`province_code\` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省级行政区划代码（必填，用于关联查询）',
  \`province_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '省级名称（冗余字段，必填，修改区域时刷新）',
  \`city_code\` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市级行政区划代码（必填，用于关联查询）',
  \`city_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市级名称（冗余字段，必填，修改区域时刷新）',
  \`district_code\` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '区县级行政区划代码（必填，用于关联查询）',
  \`district_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '区县级名称（冗余字段，必填，修改区域时刷新）',
  \`street_code\` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '街道级行政区划代码（必填，门店必须精确到街道）',
  \`street_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '街道级名称（冗余字段，必填，修改区域时刷新）',
  PRIMARY KEY (\`store_id\`),
  UNIQUE KEY \`store_code\` (\`store_code\`),
  UNIQUE KEY \`uk_store_code\` (\`store_code\`),
  KEY \`idx_stores_status\` (\`status\`),
  KEY \`idx_stores_assigned_to\` (\`assigned_to\`),
  KEY \`idx_stores_merchant_id\` (\`merchant_id\`),
  KEY \`idx_stores_province_code\` (\`province_code\`),
  KEY \`idx_stores_city_code\` (\`city_code\`),
  KEY \`idx_stores_district_code\` (\`district_code\`),
  KEY \`idx_stores_street_code\` (\`street_code\`),
  CONSTRAINT \`fk_store_assigned_to\` FOREIGN KEY (\`assigned_to\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`stores_ibfk_1\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`merchant_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店信息表（用于记录合作商家门店，业务员分派依据）';`, { transaction });

      // [39/106] consumption_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`consumption_records\` (
  \`consumption_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '消费用户ID',
  \`merchant_id\` int DEFAULT NULL COMMENT '商家ID（录入人，可为空）',
  \`consumption_amount\` decimal(10,2) NOT NULL COMMENT '消费金额（元）',
  \`points_to_award\` int NOT NULL COMMENT '预计奖励积分数（单位：分），计算规则：Math.round(consumption_amount)，即1元=1分，四舍五入',
  \`status\` enum('pending','approved','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending-待审核，approved-已通过，rejected-已拒绝，expired-已过期',
  \`qr_code\` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户动态二维码（v2格式: QRV2_{payload}_{signature}，约200-250字符）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`business_id\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务唯一键（格式：consumption_{merchant_id}_{timestamp}_{random}）- 必填',
  \`reward_transaction_id\` bigint DEFAULT NULL COMMENT '关联奖励积分流水ID（逻辑外键，用于对账，审核通过后填充）',
  \`merchant_notes\` text COLLATE utf8mb4_unicode_ci,
  \`created_at\` datetime NOT NULL COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间（北京时间）',
  \`admin_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '平台审核备注（审核员填写）',
  \`reviewed_by\` int DEFAULT NULL COMMENT '审核员ID（谁审核的？可为空）',
  \`reviewed_at\` datetime DEFAULT NULL COMMENT '审核时间（什么时候审核的？），时区：北京时间（GMT+8）',
  \`is_deleted\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '软删除标记：0=未删除，1=已删除',
  \`deleted_at\` datetime(3) DEFAULT NULL COMMENT '删除时间',
  \`final_status\` enum('pending_review','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_review' COMMENT '业务最终状态（审批通过/拒绝后落地）',
  \`settled_at\` datetime DEFAULT NULL COMMENT '结算时间（审批完成时落地，北京时间）',
  \`store_id\` int NOT NULL COMMENT '门店ID（外键关联 stores 表）',
  \`anomaly_flags\` json DEFAULT NULL COMMENT '异常标记JSON数组，如["large_amount","high_frequency"]',
  \`anomaly_score\` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '异常评分 0-100，0=正常，分数越高越可疑',
  PRIMARY KEY (\`consumption_record_id\`),
  UNIQUE KEY \`uk_consumption_records_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_consumption_records_business_id\` (\`business_id\`),
  KEY \`idx_user_status\` (\`user_id\`,\`status\`,\`created_at\`),
  KEY \`idx_merchant_time\` (\`merchant_id\`,\`created_at\`),
  KEY \`idx_status_created\` (\`status\`,\`created_at\`),
  KEY \`idx_qr_code\` (\`qr_code\`),
  KEY \`idx_reviewed\` (\`reviewed_by\`,\`reviewed_at\`),
  KEY \`idx_consumption_is_deleted\` (\`is_deleted\`),
  KEY \`idx_consumption_records_reward_tx_id\` (\`reward_transaction_id\`),
  KEY \`idx_consumption_final_status\` (\`final_status\`,\`settled_at\`),
  KEY \`idx_consumption_store_status\` (\`store_id\`,\`status\`,\`created_at\`),
  KEY \`idx_consumption_store_merchant\` (\`store_id\`,\`merchant_id\`,\`created_at\`),
  KEY \`idx_anomaly_score\` (\`anomaly_score\`),
  KEY \`idx_status_anomaly\` (\`status\`,\`anomaly_score\`),
  KEY \`idx_cr_status_created_at\` (\`status\`,\`created_at\`),
  CONSTRAINT \`fk_consumption_records_merchant_id\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_consumption_records_reviewed_by\` FOREIGN KEY (\`reviewed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_consumption_records_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_consumption_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`chk_approved_has_reward\` CHECK (((\`status\` <> _utf8mb4'approved') or (\`reward_transaction_id\` is not null)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消费记录表 - 记录用户通过商家扫码提交的消费信息';`, { transaction });

      // [40/106] content_review_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`content_review_records\` (
  \`content_review_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`auditable_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '审核对象类型（exchange/image/feedback等）',
  \`auditable_id\` bigint NOT NULL COMMENT '审核对象ID',
  \`audit_status\` enum('pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending-待审核，approved-已通过，rejected-已拒绝，cancelled-已取消',
  \`auditor_id\` int DEFAULT NULL COMMENT '审核员ID',
  \`audit_reason\` text COLLATE utf8mb4_unicode_ci COMMENT '审核意见/拒绝原因',
  \`audit_data\` json DEFAULT NULL COMMENT '审核相关数据（JSON格式，存储业务特定信息）',
  \`priority\` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '审核优先级',
  \`submitted_at\` datetime NOT NULL COMMENT '提交审核时间',
  \`audited_at\` datetime DEFAULT NULL COMMENT '审核完成时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`content_review_record_id\`),
  UNIQUE KEY \`uk_content_review_auditable\` (\`auditable_type\`,\`auditable_id\`),
  KEY \`idx_audit_records_status\` (\`audit_status\`),
  KEY \`idx_audit_records_auditor\` (\`auditor_id\`),
  KEY \`idx_audit_records_priority_time\` (\`priority\`,\`submitted_at\`),
  KEY \`idx_audit_records_created\` (\`created_at\`),
  CONSTRAINT \`content_review_records_ibfk_1\` FOREIGN KEY (\`auditor_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [41/106] customer_service_agents
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`customer_service_agents\` (
  \`customer_service_agent_id\` int NOT NULL AUTO_INCREMENT COMMENT '客服座席主键ID',
  \`user_id\` int NOT NULL COMMENT '关联用户ID（一个用户只能注册为一个客服座席）',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客服显示名称（在客服工作台和用户端展示）',
  \`max_concurrent_sessions\` int NOT NULL DEFAULT '10' COMMENT '最大并发会话数（超过此数不再自动分配新会话）',
  \`current_session_count\` int NOT NULL DEFAULT '0' COMMENT '当前活跃会话数（反规范化字段，由业务逻辑维护）',
  \`status\` enum('active','inactive','on_break') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '座席状态：active=在岗可分配、inactive=离线/停用、on_break=暂时休息',
  \`specialty\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '擅长领域标签（JSON数组字符串，如 ["售前咨询","技术支持","投诉处理"]）',
  \`priority\` int NOT NULL DEFAULT '0' COMMENT '分配优先级（数值越大越优先被分配）',
  \`total_sessions_handled\` int NOT NULL DEFAULT '0' COMMENT '累计处理会话总数',
  \`average_satisfaction_score\` decimal(3,2) NOT NULL DEFAULT '0.00' COMMENT '平均满意度评分（1.00-5.00）',
  \`is_auto_assign_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否参与自动分配（false 则只能手动分配会话给该客服）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`customer_service_agent_id\`),
  UNIQUE KEY \`user_id\` (\`user_id\`),
  KEY \`idx_cs_agents_status_priority\` (\`status\`,\`priority\`),
  KEY \`idx_cs_agents_auto_assign\` (\`is_auto_assign_enabled\`,\`status\`),
  CONSTRAINT \`customer_service_agents_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服座席管理表（记录哪些用户是客服、配置、状态）';`, { transaction });

      // [42/106] customer_service_notes
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`customer_service_notes\` (
  \`note_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '备注主键ID',
  \`user_id\` int NOT NULL COMMENT '关于哪个用户的备注',
  \`issue_id\` bigint DEFAULT NULL COMMENT '关联工单ID（可选）',
  \`session_id\` bigint DEFAULT NULL COMMENT '关联会话ID（可选）',
  \`author_id\` int NOT NULL COMMENT '备注作者（客服管理员user_id）',
  \`content\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '备注内容',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`note_id\`),
  KEY \`session_id\` (\`session_id\`),
  KEY \`author_id\` (\`author_id\`),
  KEY \`idx_cs_notes_user_id\` (\`user_id\`),
  KEY \`idx_cs_notes_issue_id\` (\`issue_id\`),
  CONSTRAINT \`customer_service_notes_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_notes_ibfk_2\` FOREIGN KEY (\`issue_id\`) REFERENCES \`customer_service_issues\` (\`issue_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_notes_ibfk_3\` FOREIGN KEY (\`session_id\`) REFERENCES \`customer_service_sessions\` (\`customer_service_session_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_notes_ibfk_4\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服内部备注表 - 仅客服可见，用户不可见';`, { transaction });

      // [43/106] customer_service_user_assignments
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`customer_service_user_assignments\` (
  \`customer_service_user_assignment_id\` int NOT NULL AUTO_INCREMENT COMMENT '分配记录主键ID',
  \`user_id\` int NOT NULL COMMENT '被分配的用户ID（客户）',
  \`agent_id\` int NOT NULL COMMENT '分配到的客服座席ID',
  \`assigned_by\` int NOT NULL COMMENT '执行分配操作的管理员ID',
  \`status\` enum('active','expired','transferred') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '分配状态：active=生效中、expired=已过期、transferred=已转移',
  \`notes\` text COLLATE utf8mb4_unicode_ci COMMENT '分配备注说明',
  \`expired_at\` datetime DEFAULT NULL COMMENT '过期时间（null 表示永不过期）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（即分配时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`customer_service_user_assignment_id\`),
  UNIQUE KEY \`uk_cs_user_assign_active\` (\`user_id\`,\`status\`),
  KEY \`assigned_by\` (\`assigned_by\`),
  KEY \`idx_cs_user_assign_agent\` (\`agent_id\`,\`status\`),
  KEY \`idx_cs_user_assign_status\` (\`status\`),
  CONSTRAINT \`customer_service_user_assignments_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_user_assignments_ibfk_2\` FOREIGN KEY (\`agent_id\`) REFERENCES \`customer_service_agents\` (\`customer_service_agent_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`customer_service_user_assignments_ibfk_3\` FOREIGN KEY (\`assigned_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服用户分配表（记录用户被分配给哪个客服）';`, { transaction });

      // [44/106] exchange_rates
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`exchange_rates\` (
  \`exchange_rate_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '汇率规则ID（主键）',
  \`from_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '源资产代码（兑换输入）：如 red_shard',
  \`to_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标资产代码（兑换输出）：如 DIAMOND',
  \`rate_numerator\` bigint NOT NULL COMMENT '汇率分子：to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)',
  \`rate_denominator\` bigint NOT NULL COMMENT '汇率分母：使用整数分子/分母避免浮点精度问题',
  \`min_from_amount\` bigint NOT NULL DEFAULT '1' COMMENT '最小兑换数量（保护性下限）',
  \`max_from_amount\` bigint DEFAULT NULL COMMENT '最大兑换数量（NULL表示无上限）',
  \`daily_user_limit\` bigint DEFAULT NULL COMMENT '每用户每日兑换限额（源资产数量，NULL表示无限制）',
  \`daily_global_limit\` bigint DEFAULT NULL COMMENT '全局每日兑换限额（源资产数量，NULL表示无限制）',
  \`fee_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '手续费费率：如 0.0500 = 5%，基于产出计算',
  \`status\` enum('active','paused','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active-生效中 / paused-暂停（运营手动暂停） / disabled-已禁用',
  \`priority\` int NOT NULL DEFAULT '0' COMMENT '优先级：同一币对多条规则时，取 priority 最高且生效的规则',
  \`effective_from\` datetime DEFAULT NULL COMMENT '生效起始时间（NULL表示立即生效）',
  \`effective_until\` datetime DEFAULT NULL COMMENT '生效截止时间（NULL表示永不过期）',
  \`description\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则描述（运营备注）',
  \`created_by\` int DEFAULT NULL COMMENT '创建人 user_id（用于审计）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`exchange_rate_id\`),
  UNIQUE KEY \`uk_exchange_rate_pair\` (\`from_asset_code\`,\`to_asset_code\`,\`priority\`,\`status\`),
  KEY \`idx_from_asset_status\` (\`from_asset_code\`,\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='固定汇率兑换规则表 — 平台设定的资产间兑换汇率配置';`, { transaction });

      // [45/106] exchange_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`exchange_records\` (
  \`exchange_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID',
  \`exchange_item_id\` bigint NOT NULL,
  \`item_snapshot\` json DEFAULT NULL COMMENT '商品快照（记录兑换时的商品信息：名称、价格、描述等）',
  \`quantity\` int NOT NULL DEFAULT '1' COMMENT '兑换数量（默认为1）',
  \`total_cost\` decimal(10,2) DEFAULT NULL COMMENT '总成本（管理员可见，= cost_price * quantity）',
  \`actual_cost\` decimal(10,2) DEFAULT NULL COMMENT '实际成本',
  \`order_no\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '订单号',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`business_id\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务唯一键（格式：exchange_{user_id}_{item_id}_{timestamp}）- 必填',
  \`debit_transaction_id\` bigint DEFAULT NULL COMMENT '关联扣减流水ID（逻辑外键，用于对账）',
  \`status\` enum('pending','approved','shipped','received','rated','rejected','refunded','cancelled','completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '订单状态：pending-待审核 | approved-审核通过 | shipped-已发货 | received-已收货 | rated-已评价 | rejected-审核拒绝 | refunded-已退款 | cancelled-已取消 | completed-已完成(历史兼容)',
  \`admin_remark\` text COLLATE utf8mb4_unicode_ci COMMENT '管理员备注（管理员操作订单时的备注信息）',
  \`exchange_time\` datetime DEFAULT NULL COMMENT '兑换时间（记录实际兑换时刻，北京时间）',
  \`shipped_at\` datetime DEFAULT NULL COMMENT '发货时间',
  \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`pay_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '实际支付资产代码（材料资产支付）',
  \`pay_amount\` bigint NOT NULL COMMENT '实际支付数量（材料资产支付）',
  \`source\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'exchange' COMMENT '来源：exchange=普通兑换, bid=竞价中标',
  \`rating\` tinyint DEFAULT NULL COMMENT '用户评分（1-5分，NULL表示未评分）',
  \`rated_at\` datetime DEFAULT NULL COMMENT '评分时间（用户提交评分的时间）',
  \`received_at\` datetime DEFAULT NULL COMMENT '收货时间（Received At）：用户确认收货或7天自动确认的时间',
  \`auto_confirmed\` tinyint(1) DEFAULT '0' COMMENT '是否自动确认收货（Auto Confirmed）：true-7天自动确认 | false-用户手动确认',
  \`rejected_at\` datetime DEFAULT NULL COMMENT '拒绝时间（Rejected At）：管理员审核拒绝的时间',
  \`refunded_at\` datetime DEFAULT NULL COMMENT '退款时间（Refunded At）：退款完成的时间',
  PRIMARY KEY (\`exchange_record_id\`),
  UNIQUE KEY \`order_no\` (\`order_no\`),
  UNIQUE KEY \`uk_order_no\` (\`order_no\`),
  UNIQUE KEY \`uk_exchange_records_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_exchange_records_business_id\` (\`business_id\`),
  KEY \`idx_user_id\` (\`user_id\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_created_at\` (\`created_at\`),
  KEY \`idx_exchange_records_debit_tx_id\` (\`debit_transaction_id\`),
  KEY \`idx_exchange_records_source\` (\`source\`),
  KEY \`idx_exchange_records_rating\` (\`exchange_item_id\`,\`rating\`),
  KEY \`idx_exchange_shipped_at\` (\`status\`,\`shipped_at\`),
  CONSTRAINT \`exchange_records_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_exchange_records_item\` FOREIGN KEY (\`exchange_item_id\`) REFERENCES \`exchange_items\` (\`exchange_item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换市场记录表';`, { transaction });

      // [46/106] feature_flags
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`feature_flags\` (
  \`feature_flag_id\` int NOT NULL AUTO_INCREMENT,
  \`flag_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能键名（唯一标识，如 lottery_pity_system）',
  \`flag_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能名称（显示用）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '功能描述（业务含义说明）',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否启用（总开关）',
  \`rollout_strategy\` enum('all','percentage','user_list','user_segment','schedule') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '发布策略（all-全量/percentage-百分比/user_list-名单/user_segment-分群/schedule-定时）',
  \`rollout_percentage\` decimal(5,2) NOT NULL DEFAULT '100.00' COMMENT '开放百分比（0.00-100.00，仅百分比策略生效）',
  \`whitelist_user_ids\` json DEFAULT NULL COMMENT '白名单用户ID列表（JSON数组，优先开放）',
  \`blacklist_user_ids\` json DEFAULT NULL COMMENT '黑名单用户ID列表（JSON数组，强制关闭）',
  \`target_segments\` json DEFAULT NULL COMMENT '目标用户分群（JSON数组，如 ["vip", "new_user"]）',
  \`effective_start\` datetime DEFAULT NULL COMMENT '生效开始时间（为空表示立即生效）',
  \`effective_end\` datetime DEFAULT NULL COMMENT '生效结束时间（为空表示永久生效）',
  \`related_config_group\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联的配置分组（关联 lottery_strategy_config.config_group）',
  \`fallback_behavior\` enum('disabled','default_value','old_logic') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'disabled' COMMENT '降级行为（disabled-禁用/default_value-默认值/old_logic-旧逻辑）',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID（关联 users.user_id）',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID（关联 users.user_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`feature_flag_id\`),
  UNIQUE KEY \`flag_key\` (\`flag_key\`),
  KEY \`idx_feature_flags_is_enabled\` (\`is_enabled\`),
  KEY \`idx_feature_flags_effective_time\` (\`effective_start\`,\`effective_end\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能开关表（Feature Flag）- 全系统通用灰度发布控制';`, { transaction });

      // [47/106] feedbacks
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`feedbacks\` (
  \`feedback_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int DEFAULT NULL COMMENT '外键引用（允许NULL）',
  \`category\` enum('technical','feature','bug','complaint','suggestion','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '反馈分类',
  \`content\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '反馈内容',
  \`attachments\` json DEFAULT NULL COMMENT '附件信息（图片URLs等）',
  \`status\` enum('pending','processing','replied','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  \`priority\` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '优先级',
  \`user_ip\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户IP（管理员可见）',
  \`device_info\` json DEFAULT NULL COMMENT '设备信息（管理员可见）',
  \`admin_id\` int DEFAULT NULL COMMENT '处理反馈的管理员ID（基于UUID角色系统验证管理员权限）',
  \`reply_content\` text COLLATE utf8mb4_unicode_ci COMMENT '回复内容',
  \`replied_at\` datetime DEFAULT NULL COMMENT '回复时间',
  \`internal_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（管理员可见）',
  \`estimated_response_time\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '预计响应时间',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (\`feedback_id\`),
  KEY \`idx_feedbacks_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_feedbacks_category_priority\` (\`category\`,\`priority\`),
  KEY \`idx_feedbacks_status_created\` (\`status\`,\`created_at\`),
  KEY \`idx_feedbacks_admin_id\` (\`admin_id\`),
  CONSTRAINT \`feedbacks_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`feedbacks_ibfk_2\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表 - 支持客服反馈功能';`, { transaction });

      // [48/106] items
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`items\` (
  \`item_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '物品ID（主键，自增）',
  \`tracking_code\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '人类可读追踪码（格式：{来源2位}{YYMMDD}{item_id补零6位}，如 LT260219028738）',
  \`owner_account_id\` bigint NOT NULL COMMENT '当前持有者账户ID（从 item_ledger 派生，关联 accounts.account_id）',
  \`status\` enum('available','held','used','expired','destroyed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available' COMMENT '物品状态：available=可用, held=锁定中, used=已使用, expired=已过期, destroyed=已销毁',
  \`item_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型：voucher=优惠券, product=实物商品, service=服务',
  \`item_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品名称（正式列，替代 meta.name）',
  \`item_description\` text COLLATE utf8mb4_unicode_ci COMMENT '物品描述',
  \`item_value\` int NOT NULL DEFAULT '0' COMMENT '物品价值（积分计）',
  \`prize_definition_id\` int DEFAULT NULL COMMENT '奖品定义ID（来自哪个奖品定义，关联 lottery_prizes.lottery_prize_id）',
  \`rarity_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'common' COMMENT '稀有度代码（关联 rarity_defs.rarity_code）',
  \`source\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '来源：lottery=抽奖, bid_settlement=竞价结算, exchange=兑换, admin=管理员, legacy=历史数据',
  \`source_ref_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源引用ID（lottery_draw_id / bid_product_id / exchange_record_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`merchant_id\` int DEFAULT NULL COMMENT '来源商家ID（NULL=平台自营，关联 merchants 表）',
  PRIMARY KEY (\`item_id\`),
  UNIQUE KEY \`tracking_code\` (\`tracking_code\`),
  KEY \`idx_items_owner\` (\`owner_account_id\`),
  KEY \`idx_items_status\` (\`status\`),
  KEY \`idx_items_source_ref\` (\`source_ref_id\`),
  KEY \`idx_items_type\` (\`item_type\`),
  KEY \`idx_items_source\` (\`source\`),
  KEY \`idx_items_merchant_id\` (\`merchant_id\`),
  CONSTRAINT \`items_ibfk_1\` FOREIGN KEY (\`owner_account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`items_merchant_id_foreign_idx\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`merchant_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品表（当前状态缓存，可从 item_ledger 重建）';`, { transaction });

      // [49/106] item_holds
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_holds\` (
  \`hold_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '锁定记录ID（主键，自增）',
  \`item_id\` bigint NOT NULL COMMENT '物品ID（关联 items.item_id）',
  \`hold_type\` enum('trade','redemption','security') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '锁定类型：trade=交易订单锁, redemption=兑换码锁, security=风控冻结锁',
  \`holder_ref\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '持有者引用（trade_order_id / redemption_order_id / risk_case_id）',
  \`priority\` tinyint NOT NULL DEFAULT '1' COMMENT '锁优先级：trade=1, redemption=2, security=3（高优先级可覆盖低优先级）',
  \`status\` enum('active','released','expired','overridden') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '锁状态：active=生效中, released=已释放, expired=已过期, overridden=被覆盖',
  \`reason\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '锁定原因说明',
  \`expires_at\` datetime DEFAULT NULL COMMENT '过期时间（NULL=永不过期，仅security类型）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`released_at\` datetime DEFAULT NULL COMMENT '释放时间（released/expired/overridden 时记录）',
  PRIMARY KEY (\`hold_id\`),
  KEY \`idx_holds_item\` (\`item_id\`,\`status\`),
  KEY \`idx_holds_active_expiry\` (\`status\`,\`expires_at\`),
  KEY \`idx_holds_holder\` (\`holder_ref\`),
  CONSTRAINT \`item_holds_ibfk_1\` FOREIGN KEY (\`item_id\`) REFERENCES \`items\` (\`item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品锁定记录表（替代 item_instances.locks JSON 字段，可索引、可查询）';`, { transaction });

      // [50/106] item_instance_events_legacy
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_instance_events_legacy\` (
  \`item_instance_event_id\` bigint NOT NULL AUTO_INCREMENT,
  \`item_instance_id\` bigint NOT NULL COMMENT '物品实例ID（关联 item_instances.item_instance_id）',
  \`event_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件类型（mint/lock/unlock/transfer/use/expire/destroy）',
  \`operator_user_id\` int DEFAULT NULL COMMENT '操作者用户ID（可为 NULL，系统操作时）',
  \`operator_type\` enum('user','admin','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '操作者类型（user/admin/system）',
  \`status_before\` enum('available','locked','transferred','used','expired') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变更前状态',
  \`status_after\` enum('available','locked','transferred','used','expired') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '变更后状态',
  \`owner_before\` int DEFAULT NULL COMMENT '变更前所有者',
  \`owner_after\` int DEFAULT NULL COMMENT '变更后所有者',
  \`business_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务类型（lottery_reward/market_transfer/redemption_use）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（业界标准命名）：派生自父级幂等键，用于事件去重',
  \`meta\` json DEFAULT NULL COMMENT '事件元数据（订单信息/转让原因/核销信息等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件时间（北京时间）',
  PRIMARY KEY (\`item_instance_event_id\`),
  UNIQUE KEY \`uk_item_instance_events_instance_idempotency\` (\`item_instance_id\`,\`idempotency_key\`),
  UNIQUE KEY \`uk_item_instance_events_business_idempotency\` (\`business_type\`,\`idempotency_key\`),
  KEY \`idx_item_instance_events_instance_time\` (\`item_instance_id\`,\`created_at\`),
  KEY \`idx_item_instance_events_type_time\` (\`event_type\`,\`created_at\`),
  KEY \`idx_item_instance_events_operator_time\` (\`operator_user_id\`,\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品实例事件表（记录所有物品变更事件）';`, { transaction });

      // [51/106] item_instances_legacy
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_instances_legacy\` (
  \`item_instance_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '物品实例ID（自增主键）',
  \`owner_user_id\` int NOT NULL COMMENT '所有者用户ID（所有权真相，关联 users.user_id）',
  \`item_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型（product/voucher/prize/tradable_item/service）',
  \`item_template_id\` bigint DEFAULT NULL COMMENT '物品模板ID（可选，关联物品模板表或奖品表）',
  \`status\` enum('available','locked','transferred','used','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available' COMMENT '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）',
  \`meta\` json DEFAULT NULL COMMENT '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间存储）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间存储）',
  \`locks\` json DEFAULT NULL COMMENT '锁定记录数组。格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]。lock_type: trade/redemption/security',
  \`source\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown' COMMENT '物品来源（lottery/exchange/bid_settlement/test/unknown）',
  PRIMARY KEY (\`item_instance_id\`),
  KEY \`idx_item_instances_owner_user_id\` (\`owner_user_id\`),
  KEY \`idx_item_instances_status\` (\`status\`),
  KEY \`idx_item_instances_type_template\` (\`item_type\`,\`item_template_id\`),
  KEY \`idx_item_instances_owner_status_created\` (\`owner_user_id\`,\`status\`,\`created_at\` DESC),
  CONSTRAINT \`fk_item_instances_owner_user_id\` FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品实例表（不可叠加物品所有权真相）';`, { transaction });

      // [52/106] item_ledger
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_ledger\` (
  \`ledger_entry_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '账本条目ID（主键，自增）',
  \`item_id\` bigint NOT NULL COMMENT '物品ID（关联 items.item_id）',
  \`account_id\` bigint NOT NULL COMMENT '当前方账户ID（关联 accounts.account_id）',
  \`delta\` tinyint NOT NULL COMMENT '变动方向：+1=入账（获得物品），-1=出账（失去物品）',
  \`counterpart_id\` bigint NOT NULL COMMENT '对手方账户ID（双录的另一方，关联 accounts.account_id）',
  \`event_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件类型：mint=铸造, transfer=转移, use=使用/核销, expire=过期, destroy=销毁',
  \`operator_id\` bigint DEFAULT NULL COMMENT '操作者ID（用户ID或管理员ID）',
  \`operator_type\` enum('user','admin','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system' COMMENT '操作者类型：user=用户, admin=管理员, system=系统',
  \`business_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型：lottery_mint=抽奖铸造, market_transfer=市场交易, redemption_use=兑换核销, backpack_use=背包使用, admin_mint=管理员发放',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（同一物品内唯一，防止重复记账）',
  \`meta\` json DEFAULT NULL COMMENT '扩展信息（仅存真正动态的信息，如交易价格、兑换码等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（不可变表，无 updated_at）',
  PRIMARY KEY (\`ledger_entry_id\`),
  UNIQUE KEY \`uk_item_idempotency\` (\`item_id\`,\`idempotency_key\`),
  KEY \`counterpart_id\` (\`counterpart_id\`),
  KEY \`idx_ledger_item_time\` (\`item_id\`,\`created_at\`),
  KEY \`idx_ledger_account_time\` (\`account_id\`,\`created_at\`),
  KEY \`idx_ledger_event_type\` (\`event_type\`,\`created_at\`),
  KEY \`idx_ledger_business\` (\`business_type\`,\`created_at\`),
  CONSTRAINT \`item_ledger_ibfk_1\` FOREIGN KEY (\`item_id\`) REFERENCES \`items\` (\`item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`item_ledger_ibfk_2\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`item_ledger_ibfk_3\` FOREIGN KEY (\`counterpart_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品所有权账本（唯一真相，双录记账，只追加不修改不删除）';`, { transaction });

      // [53/106] rarity_defs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`rarity_defs\` (
  \`rarity_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '稀有度代码（主键）：如 common, uncommon, rare, epic, legendary',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '稀有度描述',
  \`color_hex\` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主题颜色（HEX格式）：如 #FFFFFF',
  \`tier\` int NOT NULL DEFAULT '1' COMMENT '稀有度等级（数值越高越稀有）',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序顺序（升序）',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`rarity_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='稀有度字典表（Rarity Definitions - 物品稀有度等级定义）';`, { transaction });

      // [54/106] item_templates
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_templates\` (
  \`item_template_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '物品模板ID（主键）',
  \`template_code\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板代码（唯一业务标识）：如 prize_iphone_15_pro',
  \`item_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型：对应 item_instances.item_type',
  \`category_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类目代码（外键 → category_defs.category_code）',
  \`rarity_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '稀有度代码（外键 → rarity_defs.rarity_code）',
  \`display_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '物品描述',
  \`reference_price_points\` decimal(10,2) DEFAULT '0.00' COMMENT '参考价格（积分）：用于估值和建议定价',
  \`is_tradable\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否允许交易上架',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`meta\` json DEFAULT NULL COMMENT '扩展元数据（JSON格式）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`image_resource_id\` int DEFAULT NULL COMMENT '主图片ID（外键 → image_resources.image_resource_id，替代遗留 image_url 字段）',
  PRIMARY KEY (\`item_template_id\`),
  UNIQUE KEY \`template_code\` (\`template_code\`),
  KEY \`idx_item_templates_item_type\` (\`item_type\`),
  KEY \`idx_item_templates_category_code\` (\`category_code\`),
  KEY \`idx_item_templates_rarity_code\` (\`rarity_code\`),
  KEY \`idx_item_templates_tradable_enabled\` (\`is_tradable\`,\`is_enabled\`),
  KEY \`item_templates_image_resource_id_foreign_idx\` (\`image_resource_id\`),
  CONSTRAINT \`item_templates_ibfk_1\` FOREIGN KEY (\`category_code\`) REFERENCES \`category_defs\` (\`category_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`item_templates_ibfk_2\` FOREIGN KEY (\`rarity_code\`) REFERENCES \`rarity_defs\` (\`rarity_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`item_templates_image_resource_id_foreign_idx\` FOREIGN KEY (\`image_resource_id\`) REFERENCES \`image_resources\` (\`image_resource_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品模板表（Item Templates - 不可叠加物品模板定义）';`, { transaction });

      // [55/106] lottery_campaigns
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_campaigns\` (
  \`lottery_campaign_id\` int NOT NULL AUTO_INCREMENT,
  \`campaign_name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动名称',
  \`campaign_code\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动代码(唯一)',
  \`campaign_type\` enum('daily','weekly','event','permanent','pool_basic','pool_advanced','pool_vip','pool_newbie') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动类型，新增池类型支持',
  \`max_draws_per_user_daily\` int NOT NULL DEFAULT '1',
  \`max_draws_per_user_total\` int DEFAULT NULL COMMENT '每用户总最大抽奖次数',
  \`total_prize_pool\` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '总奖池价值',
  \`remaining_prize_pool\` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '剩余奖池价值',
  \`prize_distribution_config\` json NOT NULL COMMENT '奖品分布配置',
  \`start_time\` datetime NOT NULL COMMENT '活动开始时间',
  \`end_time\` datetime NOT NULL COMMENT '活动结束时间',
  \`daily_reset_time\` time NOT NULL DEFAULT '00:00:00',
  \`banner_image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动横幅图片',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '活动描述',
  \`rules_text\` text COLLATE utf8mb4_unicode_ci COMMENT '活动规则说明',
  \`status\` enum('draft','active','paused','ended','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '活动状态: draft=草稿, active=进行中, paused=已暂停, ended=已结束, cancelled=已取消',
  \`budget_mode\` enum('user','pool','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）',
  \`pick_method\` enum('normalize','tier_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tier_first' COMMENT '选奖方法：normalize=归一化百分比选奖, tier_first=先选档位再选奖品',
  \`tier_weight_scale\` int unsigned NOT NULL DEFAULT '1000000' COMMENT '档位权重比例因子（默认1,000,000，所有档位权重之和必须等于此值）',
  \`pool_budget_total\` bigint DEFAULT NULL COMMENT '活动池总预算（仅 budget_mode=pool 时使用）',
  \`pool_budget_remaining\` bigint DEFAULT NULL COMMENT '活动池剩余预算（仅 budget_mode=pool 时使用，实时扣减）',
  \`allowed_campaign_ids\` json DEFAULT NULL COMMENT '允许使用的用户预算来源活动ID列表（JSON数组，仅 budget_mode=user 时使用）',
  \`total_participants\` int NOT NULL DEFAULT '0',
  \`total_draws\` int NOT NULL DEFAULT '0',
  \`total_prizes_awarded\` int NOT NULL DEFAULT '0',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`participation_conditions\` json DEFAULT NULL COMMENT '参与条件配置（JSON格式，用途：存储活动参与条件规则，如用户积分≥100、用户类型=VIP等，业务场景：管理员在Web后台配置，用户端API自动验证，NULL表示无条件限制所有用户可参与）',
  \`condition_error_messages\` json DEFAULT NULL COMMENT '条件不满足时的提示语（JSON格式，用途：存储每个条件对应的用户友好错误提示，业务场景：用户不满足条件时显示具体原因，如"您的积分不足100分，快去消费获取积分吧！"）',
  \`preset_budget_policy\` enum('follow_campaign','pool_first','user_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'follow_campaign' COMMENT '预设预算扣减策略：follow_campaign-遵循budget_mode(默认), pool_first-先pool后user, user_first-先user后pool',
  \`default_quota\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '默认用户配额（pool+quota模式按需初始化时使用）',
  \`quota_init_mode\` enum('on_demand','pre_allocated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_demand' COMMENT '配额初始化模式：on_demand-按需初始化(默认), pre_allocated-预分配',
  \`public_pool_remaining\` decimal(12,2) DEFAULT NULL COMMENT '公共池剩余预算（普通用户可用，预留池模式时使用）',
  \`reserved_pool_remaining\` decimal(12,2) DEFAULT NULL COMMENT '预留池剩余预算（白名单专用，预留池模式时使用）',
  \`max_budget_debt\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '该活动预算欠账上限（0=不限制，强烈不推荐）',
  \`max_inventory_debt_quantity\` int NOT NULL DEFAULT '0' COMMENT '该活动库存欠账总数量上限（0=不限制，强烈不推荐）',
  \`daily_budget_limit\` decimal(15,2) DEFAULT NULL COMMENT '每日预算上限（积分），NULL表示不限制每日预算',
  \`display_mode\` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'grid_3x3' COMMENT '前端展示方式（14种玩法）: grid_3x3/grid_4x4/wheel/card_flip/golden_egg/scratch_card/blind_box/gashapon/lucky_bag/red_packet/slot_machine/whack_mole/pinball/card_collect/flash_sale',
  \`grid_cols\` int NOT NULL DEFAULT '3' COMMENT '网格列数（仅 grid 模式有效）: 3/4/5',
  \`effect_theme\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动级特效主题: null=继承全局app_theme | default/gold_luxury/purple_mystery/spring_festival/christmas/summer',
  \`rarity_effects_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用稀有度光效（前端根据 rarity_code 显示不同颜色光效）',
  \`win_animation\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simple' COMMENT '中奖动画类型: simple（简单弹窗）/card_flip（卡牌翻转）/fireworks（烟花特效）',
  \`background_image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动背景图URL（运营上传，可选）',
  PRIMARY KEY (\`lottery_campaign_id\`),
  UNIQUE KEY \`campaign_code\` (\`campaign_code\`),
  KEY \`idx_campaign_type\` (\`campaign_type\`),
  KEY \`idx_time_range\` (\`start_time\`,\`end_time\`),
  KEY \`idx_lc_status\` (\`status\`),
  KEY \`idx_lottery_campaigns_status_time\` (\`status\`,\`start_time\`,\`end_time\`),
  KEY \`idx_lc_pool_type\` (\`campaign_type\`),
  KEY \`idx_campaigns_status\` (\`status\`),
  KEY \`idx_campaigns_time_range\` (\`start_time\`,\`end_time\`),
  KEY \`idx_campaigns_budget_policy\` (\`preset_budget_policy\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖活动配置表';`, { transaction });

      // [56/106] lottery_alerts
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_alerts\` (
  \`lottery_alert_id\` int NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL,
  \`alert_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型（VARCHAR 存储）：win_rate | budget | inventory | user | system | simulation_bound',
  \`severity\` enum('info','warning','danger') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警严重程度：info=提示 | warning=警告 | danger=严重',
  \`status\` enum('active','acknowledged','resolved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '告警状态：active=待处理 | acknowledged=已确认 | resolved=已解决',
  \`rule_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则代码（如 RULE_001、WIN_RATE_HIGH）',
  \`threshold_value\` decimal(10,4) DEFAULT NULL COMMENT '阈值（规则定义的期望值）',
  \`actual_value\` decimal(10,4) DEFAULT NULL COMMENT '实际值（触发告警时的实际数值）',
  \`message\` text COLLATE utf8mb4_unicode_ci COMMENT '告警消息（人类可读的描述）',
  \`resolved_at\` datetime DEFAULT NULL COMMENT '解决时间（北京时间）',
  \`resolved_by\` int DEFAULT NULL COMMENT '处理人ID（外键，关联 users.user_id）',
  \`resolve_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '处理备注',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`lottery_alert_id\`),
  KEY \`resolved_by\` (\`resolved_by\`),
  KEY \`idx_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_status_created\` (\`status\`,\`created_at\`),
  KEY \`idx_alert_type\` (\`alert_type\`),
  KEY \`idx_severity\` (\`severity\`),
  CONSTRAINT \`lottery_alerts_ibfk_1\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`lottery_alerts_ibfk_2\` FOREIGN KEY (\`resolved_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖系统告警表 - 运营监控专用（独立于商家风控的 risk_alerts）';`, { transaction });

      // [57/106] lottery_campaign_pricing_config
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_campaign_pricing_config\` (
  \`lottery_campaign_pricing_config_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`lottery_campaign_id\` int NOT NULL,
  \`version\` int NOT NULL DEFAULT '1' COMMENT '版本号（同一活动递增，支持版本回滚）',
  \`pricing_config\` json NOT NULL COMMENT '定价配置JSON（draw_buttons数组：count/discount/label/enabled/sort_order）',
  \`status\` enum('draft','active','scheduled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态：draft-草稿, active-生效中, scheduled-待生效, archived-已归档',
  \`effective_at\` datetime DEFAULT NULL COMMENT '生效时间（NULL表示立即生效，用于定时生效/AB测试场景）',
  \`expired_at\` datetime DEFAULT NULL COMMENT '过期时间（NULL表示永不过期，用于限时活动折扣）',
  \`created_by\` int NOT NULL COMMENT '创建人ID（外键关联users.user_id）',
  \`updated_by\` int DEFAULT NULL COMMENT '最后修改人ID（外键关联users.user_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`lottery_campaign_pricing_config_id\`),
  UNIQUE KEY \`uk_campaign_version\` (\`lottery_campaign_id\`,\`version\`),
  KEY \`idx_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_campaign_version\` (\`lottery_campaign_id\`,\`version\`),
  KEY \`idx_effective_at\` (\`effective_at\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`fk_pricing_config_creator\` (\`created_by\`),
  KEY \`fk_pricing_config_updater\` (\`updated_by\`),
  CONSTRAINT \`fk_pricing_config_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_pricing_config_creator\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_pricing_config_updater\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动级定价配置表（可版本化/可回滚/可定时生效）';`, { transaction });

      // [58/106] lottery_campaign_quota_grants
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_campaign_quota_grants\` (
  \`lottery_campaign_quota_grant_id\` bigint NOT NULL AUTO_INCREMENT,
  \`quota_id\` bigint NOT NULL COMMENT '关联的配额记录ID（外键关联lottery_campaign_user_quota.quota_id）',
  \`user_id\` int NOT NULL COMMENT '用户ID（冗余，便于查询）',
  \`lottery_campaign_id\` int NOT NULL,
  \`grant_amount\` int unsigned NOT NULL COMMENT '发放配额金额（整数分值）',
  \`grant_source\` enum('initial','topup','refund','compensation','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '发放来源：initial-初始配额, topup-充值, refund-退款, compensation-补偿, admin-管理员调整',
  \`source_reference_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源引用ID（如订单ID、退款ID等，用于追溯）',
  \`grant_reason\` text COLLATE utf8mb4_unicode_ci COMMENT '发放原因/备注',
  \`granted_by\` int DEFAULT NULL COMMENT '操作人ID（管理员user_id，系统操作为null）',
  \`balance_after\` int unsigned NOT NULL COMMENT '发放后配额总余额',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`lottery_campaign_quota_grant_id\`),
  KEY \`idx_grants_quota_id\` (\`quota_id\`),
  KEY \`idx_grants_user_campaign\` (\`user_id\`,\`lottery_campaign_id\`),
  KEY \`idx_grants_source_time\` (\`grant_source\`,\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='配额发放记录表 - 记录配额的发放来源和金额';`, { transaction });

      // [59/106] lottery_campaign_user_quota
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_campaign_user_quota\` (
  \`lottery_campaign_user_quota_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（外键关联users.user_id）',
  \`lottery_campaign_id\` int NOT NULL,
  \`quota_total\` int unsigned NOT NULL DEFAULT '0' COMMENT '配额总额（整数分值）',
  \`quota_used\` int unsigned NOT NULL DEFAULT '0' COMMENT '已使用配额（整数分值）',
  \`quota_remaining\` int unsigned NOT NULL DEFAULT '0' COMMENT '剩余配额（quota_total - quota_used，冗余便于查询）',
  \`expires_at\` datetime DEFAULT NULL COMMENT '配额过期时间（null表示跟随活动结束时间）',
  \`status\` enum('active','exhausted','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '配额状态：active-正常, exhausted-已耗尽, expired-已过期',
  \`last_used_at\` datetime DEFAULT NULL COMMENT '最后一次使用配额的时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`lottery_campaign_user_quota_id\`),
  UNIQUE KEY \`uk_user_campaign_quota\` (\`user_id\`,\`lottery_campaign_id\`),
  KEY \`idx_quota_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_quota_user_status\` (\`user_id\`,\`status\`),
  CONSTRAINT \`fk_user_quota_campaign_id\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_quota_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动配额表 - pool+quota模式下追踪用户预算配额';`, { transaction });

      // [60/106] lottery_clear_setting_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_clear_setting_records\` (
  \`lottery_clear_setting_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '被清除设置的用户ID',
  \`admin_id\` int NOT NULL COMMENT '执行清除的管理员ID',
  \`setting_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT '清除的设置类型：all=全部/force_win=强制中奖/force_lose=强制不中奖/probability=概率调整/queue=用户队列',
  \`cleared_count\` int NOT NULL DEFAULT '0' COMMENT '本次清除的设置记录数量',
  \`reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '清除原因（管理员备注）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（格式：lottery_clear_{user_id}_{setting_type}_{admin_id}_{timestamp}）',
  \`metadata\` json DEFAULT NULL COMMENT '额外元数据（IP地址、用户代理、清除前的设置快照等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`lottery_clear_setting_record_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_clear_records_user_id\` (\`user_id\`),
  KEY \`idx_clear_records_admin_id\` (\`admin_id\`),
  KEY \`idx_clear_records_created_at\` (\`created_at\`),
  CONSTRAINT \`lottery_clear_setting_records_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`lottery_clear_setting_records_ibfk_2\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖清除设置记录表（为审计日志提供业务主键）';`, { transaction });

      // [61/106] lottery_daily_metrics
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_daily_metrics\` (
  \`lottery_daily_metric_id\` bigint NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL,
  \`metric_date\` date NOT NULL COMMENT '统计日期（格式: YYYY-MM-DD，北京时间）',
  \`total_draws\` int NOT NULL DEFAULT '0' COMMENT '当日总抽奖次数（从小时级汇总）',
  \`unique_users\` int NOT NULL DEFAULT '0' COMMENT '当日参与抽奖的唯一用户数',
  \`high_tier_count\` int NOT NULL DEFAULT '0' COMMENT '高价值奖品次数（high档位）',
  \`mid_tier_count\` int NOT NULL DEFAULT '0' COMMENT '中价值奖品次数（mid档位）',
  \`low_tier_count\` int NOT NULL DEFAULT '0' COMMENT '低价值奖品次数（low档位）',
  \`fallback_tier_count\` int NOT NULL DEFAULT '0' COMMENT '空奖次数（fallback档位）',
  \`total_budget_consumed\` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '当日总预算消耗（积分）',
  \`avg_budget_per_draw\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '当日平均单次消耗（积分）',
  \`total_prize_value\` decimal(20,2) NOT NULL DEFAULT '0.00' COMMENT '当日发放的总奖品价值（积分）',
  \`b0_count\` int NOT NULL DEFAULT '0' COMMENT 'B0档位（无预算）用户抽奖次数',
  \`b1_count\` int NOT NULL DEFAULT '0' COMMENT 'B1档位（低预算≤100）用户抽奖次数',
  \`b2_count\` int NOT NULL DEFAULT '0' COMMENT 'B2档位（中预算101-500）用户抽奖次数',
  \`b3_count\` int NOT NULL DEFAULT '0' COMMENT 'B3档位（高预算>500）用户抽奖次数',
  \`pity_trigger_count\` int NOT NULL DEFAULT '0' COMMENT 'Pity系统（保底）触发总次数',
  \`anti_empty_trigger_count\` int NOT NULL DEFAULT '0' COMMENT 'AntiEmpty（反连空）触发次数',
  \`anti_high_trigger_count\` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh（反连高）触发次数',
  \`luck_debt_trigger_count\` int NOT NULL DEFAULT '0' COMMENT '运气债务补偿触发次数',
  \`empty_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '当日空奖率（0.0000-1.0000）',
  \`high_value_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '当日高价值率（0.0000-1.0000）',
  \`avg_prize_value\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '当日平均奖品价值（积分）',
  \`aggregated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '聚合计算时间（北京时间）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  \`empty_count\` int NOT NULL DEFAULT '0' COMMENT '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）',
  PRIMARY KEY (\`lottery_daily_metric_id\`),
  UNIQUE KEY \`uk_daily_campaign_date\` (\`lottery_campaign_id\`,\`metric_date\`),
  KEY \`idx_daily_metrics_date\` (\`metric_date\`),
  KEY \`idx_daily_metrics_campaign\` (\`lottery_campaign_id\`),
  KEY \`idx_daily_metrics_empty_rate\` (\`empty_rate\`),
  CONSTRAINT \`fk_daily_metrics_campaign_id\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖日报统计表（按日聚合，永久保留，用于长期历史分析）';`, { transaction });

      // [62/106] lottery_draw_decisions
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_draw_decisions\` (
  \`lottery_draw_decision_id\` bigint NOT NULL AUTO_INCREMENT,
  \`lottery_draw_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '抽奖幂等键（与lottery_draws.idempotency_key对应）',
  \`pipeline_type\` enum('normal','preset','override') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT 'Pipeline类型：normal-普通抽奖, preset-预设发放, override-管理覆盖',
  \`segment_key\` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户分层标识（由SegmentResolver解析获得）',
  \`selected_tier\` enum('high','mid','low','fallback') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '选中的档位（包含fallback保底档位）',
  \`tier_downgrade_triggered\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否触发了档位降级（如high无可用奖品降级到mid）',
  \`random_seed\` int unsigned DEFAULT NULL COMMENT '原始随机数值（0-999999范围，用于审计复现）',
  \`budget_provider_type\` enum('user','pool','pool_quota','none') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '预算提供者类型：user-用户预算, pool-活动池, pool_quota-池+配额, none-无预算限制',
  \`budget_deducted\` int DEFAULT '0' COMMENT '本次抽奖扣减的预算金额',
  \`preset_used\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否使用了预设奖品',
  \`lottery_preset_id\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '使用的预设ID（如果是预设发放，关联 lottery_presets）',
  \`system_advance_triggered\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否触发了系统垫付（库存或预算垫付）',
  \`inventory_debt_created\` int NOT NULL DEFAULT '0' COMMENT '本次产生的库存欠账数量',
  \`budget_debt_created\` int NOT NULL DEFAULT '0' COMMENT '本次产生的预算欠账金额',
  \`guarantee_triggered\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否触发了保底机制',
  \`guarantee_type\` enum('consecutive','probability','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '保底类型：consecutive-连续失败保底, probability-概率保底, none-未触发',
  \`decision_context\` json DEFAULT NULL COMMENT '完整决策上下文JSON（包含候选奖品列表、权重计算过程等）',
  \`decision_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '决策时间戳',
  \`processing_time_ms\` int DEFAULT NULL COMMENT '决策处理耗时（毫秒）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`effective_budget\` int DEFAULT NULL COMMENT '有效预算（统一计算口径，来自 StrategyEngine.computeBudgetContext）',
  \`budget_tier\` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '预算分层（B0/B1/B2/B3，来自 BudgetTierCalculator）',
  \`pressure_tier\` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '活动压力分层（P0/P1/P2，来自 PressureTierCalculator）',
  \`cap_value\` int DEFAULT NULL COMMENT '预算上限值（该 BxPx 组合允许的最大奖品积分价值）',
  \`pity_decision\` json DEFAULT NULL COMMENT 'Pity 系统决策信息（包含 empty_streak, boost_multiplier, triggered）',
  \`luck_debt_decision\` json DEFAULT NULL COMMENT '运气债务决策信息（包含 debt_level, multiplier, historical_empty_rate）',
  \`experience_smoothing\` json DEFAULT NULL COMMENT '体验平滑机制应用记录（包含 Pity/AntiEmpty/AntiHigh 应用结果）',
  \`weight_adjustment\` json DEFAULT NULL COMMENT 'BxPx 矩阵权重调整信息（包含 base_weights, adjusted_weights, multiplier）',
  \`available_tiers\` json DEFAULT NULL COMMENT '可用档位列表（基于预算和库存过滤后的档位）',
  \`segment_version\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分层规则版本（如v1/v2，对应config/segment_rules.js）',
  \`matched_rule_id\` int DEFAULT NULL COMMENT '匹配的档位规则ID（lottery_tier_rules.tier_rule_id）',
  \`matched_reason\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '匹配原因说明（用于审计追溯）',
  \`original_tier\` enum('high','mid','low') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始命中档位（降级前）',
  \`final_tier\` enum('high','mid','low','fallback') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终发放档位（降级后）',
  \`downgrade_count\` int NOT NULL DEFAULT '0' COMMENT '降级次数（0=未降级）',
  \`fallback_triggered\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否触发兜底逻辑',
  PRIMARY KEY (\`lottery_draw_decision_id\`),
  UNIQUE KEY \`uk_decisions_draw_id\` (\`lottery_draw_id\`),
  KEY \`idx_decisions_idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_decisions_pipeline_time\` (\`pipeline_type\`,\`decision_at\`),
  KEY \`idx_decisions_advance_time\` (\`system_advance_triggered\`,\`decision_at\`),
  KEY \`idx_draw_decisions_budget_tier\` (\`budget_tier\`),
  KEY \`idx_draw_decisions_pressure_tier\` (\`pressure_tier\`),
  KEY \`idx_draw_decisions_bxpx_matrix\` (\`budget_tier\`,\`pressure_tier\`),
  KEY \`idx_decisions_lottery_preset_id\` (\`lottery_preset_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计';`, { transaction });

      // [63/106] lottery_draw_quota_rules
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_draw_quota_rules\` (
  \`lottery_draw_quota_rule_id\` bigint NOT NULL AUTO_INCREMENT,
  \`scope_type\` enum('global','campaign','role','user') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级',
  \`scope_id\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作用域ID：global固定为"global"，campaign存campaign_id，role存role_uuid，user存user_id',
  \`window_type\` enum('daily','campaign_total') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily' COMMENT '统计窗口类型：daily-每日重置, campaign_total-活动期间累计',
  \`limit_value\` int unsigned NOT NULL DEFAULT '50' COMMENT '配额上限值：>=0，0代表不限制（仅对global允许0）',
  \`timezone\` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '+08:00' COMMENT '时区：默认北京时间+08:00',
  \`effective_from\` datetime DEFAULT NULL COMMENT '生效开始时间：null表示立即生效',
  \`effective_to\` datetime DEFAULT NULL COMMENT '生效结束时间：null表示永久有效',
  \`priority\` int NOT NULL DEFAULT '0' COMMENT '优先级：同层级多条命中时决定优先级，数字越大优先级越高',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '规则状态：active-启用, inactive-停用',
  \`reason\` text COLLATE utf8mb4_unicode_ci COMMENT '规则说明/备注：记录为什么这么配置，便于审计',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID（管理员user_id）',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID（管理员user_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`lottery_draw_quota_rule_id\`),
  KEY \`idx_scope_status_effective\` (\`scope_type\`,\`scope_id\`,\`status\`,\`effective_from\`,\`effective_to\`),
  KEY \`idx_window_status\` (\`window_type\`,\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [64/106] lottery_prizes
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_prizes\` (
  \`lottery_prize_id\` int NOT NULL AUTO_INCREMENT,
  \`prize_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '奖品名称（前端显示）',
  \`prize_type\` enum('points','coupon','physical','virtual','service','product','special') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'points' COMMENT '奖品类型: points=积分/coupon=优惠券/physical=实物/virtual=虚拟/service=服务/product=商品/special=特殊',
  \`prize_value\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '奖品价值',
  \`angle\` int NOT NULL COMMENT '转盘角度（Canvas渲染位置，0-315度45度间隔）',
  \`color\` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#FF6B6B' COMMENT '转盘颜色（前端渲染，十六进制格式）',
  \`is_activity\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '特殊动效标记（差点中奖动画）',
  \`cost_points\` int NOT NULL DEFAULT '100' COMMENT '每次抽奖消耗积分',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '奖品状态: active=激活中, inactive=已停用',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`lottery_campaign_id\` int DEFAULT '1',
  \`prize_description\` text COLLATE utf8mb4_unicode_ci COMMENT '奖品描述',
  \`image_resource_id\` int DEFAULT NULL,
  \`win_probability\` decimal(8,6) NOT NULL DEFAULT '0.100000' COMMENT '中奖概率',
  \`stock_quantity\` int NOT NULL DEFAULT '0' COMMENT '库存数量',
  \`max_daily_wins\` int DEFAULT NULL COMMENT '每日最大中奖次数',
  \`max_user_wins\` int DEFAULT NULL COMMENT '每人总中奖上限（跨日累计），NULL表示不限制',
  \`total_win_count\` int NOT NULL DEFAULT '0' COMMENT '总中奖次数',
  \`daily_win_count\` int NOT NULL DEFAULT '0' COMMENT '今日中奖次数',
  \`sort_order\` int NOT NULL DEFAULT '100' COMMENT '排序权重',
  \`prize_value_points\` int DEFAULT '0' COMMENT '奖品价值积分（统一单位）',
  \`reward_tier\` enum('high','mid','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '奖品所属档位：high-高档位, mid-中档位, low-低档位（用于tier_first选奖法）',
  \`win_weight\` int unsigned NOT NULL DEFAULT '0' COMMENT '中奖权重（整数，同档位内权重之和用于概率计算，0表示不参与抽奖）',
  \`is_fallback\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否为保底奖品（prize_value_points=0的奖品应标记为true）',
  \`material_asset_code\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '材料资产代码（如red_shard、red_crystal），NULL表示不发放材料',
  \`material_amount\` bigint DEFAULT NULL COMMENT '材料数量（当material_asset_code非空时必须>0）',
  \`reserved_for_vip\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否仅限白名单/VIP用户可抽',
  \`rarity_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'common' COMMENT '稀有度代码（外键关联 rarity_defs.rarity_code）: common/uncommon/rare/epic/legendary',
  \`deleted_at\` datetime DEFAULT NULL COMMENT '软删除时间戳（Sequelize paranoid 模式）',
  \`merchant_id\` int DEFAULT NULL COMMENT '赞助商家ID（NULL=平台自营，关联 merchants 表）',
  PRIMARY KEY (\`lottery_prize_id\`),
  UNIQUE KEY \`idx_unique_campaign_sort_order\` (\`lottery_campaign_id\`,\`sort_order\`),
  KEY \`idx_angle\` (\`angle\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_prize_type\` (\`prize_type\`),
  KEY \`idx_status_probability\` (\`status\`),
  KEY \`idx_prizes_campaign_id\` (\`lottery_campaign_id\`),
  KEY \`idx_prizes_type\` (\`prize_type\`),
  KEY \`idx_value_points\` (\`prize_value_points\`),
  KEY \`idx_lp_material_asset_code\` (\`material_asset_code\`),
  KEY \`idx_lp_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_prizes_tier_status\` (\`reward_tier\`,\`status\`),
  KEY \`idx_prizes_campaign_tier_weight\` (\`lottery_campaign_id\`,\`reward_tier\`,\`win_weight\`),
  KEY \`idx_prizes_campaign_fallback\` (\`lottery_campaign_id\`,\`is_fallback\`),
  KEY \`idx_prizes_campaign_vip\` (\`lottery_campaign_id\`,\`reserved_for_vip\`),
  KEY \`fk_lottery_prizes_image\` (\`image_resource_id\`),
  KEY \`idx_lp_rarity_code\` (\`rarity_code\`),
  KEY \`idx_lp_deleted_at\` (\`deleted_at\`),
  KEY \`idx_lottery_prizes_merchant_id\` (\`merchant_id\`),
  CONSTRAINT \`fk_lottery_prizes_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_prizes_image\` FOREIGN KEY (\`image_resource_id\`) REFERENCES \`image_resources\` (\`image_resource_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_prizes_rarity_code\` FOREIGN KEY (\`rarity_code\`) REFERENCES \`rarity_defs\` (\`rarity_code\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`lottery_prizes_merchant_id_foreign_idx\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`merchant_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [65/106] lottery_draws
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_draws\` (
  \`lottery_draw_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`business_id\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务唯一键（格式：lottery_draw_{user_id}_{session_id}_{draw_index}）- 必填',
  \`lottery_session_id\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '抽奖会话ID（必填，关联扣款流水，用于对账）',
  \`asset_transaction_id\` bigint NOT NULL COMMENT '关联资产流水ID（必填，逻辑外键，用于对账）',
  \`lottery_batch_draw_id\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次内抽奖序号ID（连抽时区分同一批次内的每次抽奖）',
  \`user_id\` int NOT NULL COMMENT '用户ID',
  \`lottery_campaign_id\` int NOT NULL DEFAULT '2',
  \`lottery_prize_id\` int DEFAULT NULL,
  \`prize_name\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '奖品名称',
  \`prize_type\` enum('points','coupon','physical','virtual','service','product','special') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '奖品类型（已移除empty）',
  \`prize_value\` int DEFAULT NULL COMMENT '奖品价值',
  \`reward_tier\` enum('high','mid','low','fallback','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '奖品档位：high-高档, mid-中档, low-低档, fallback-保底, unknown-未知',
  \`draw_type\` enum('single','triple','five','ten','multi') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '抽奖类型：single=单抽，triple=3连，five=5连，ten=10连，multi=其他连抽',
  \`draw_sequence\` int DEFAULT NULL COMMENT '抽奖序号',
  \`cost_points\` int DEFAULT NULL COMMENT '消耗积分',
  \`stop_angle\` decimal(5,2) DEFAULT NULL COMMENT '停止角度',
  \`lottery_batch_id\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '抽奖批次ID（用于关联同一批次的多次抽奖）',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`draw_count\` int DEFAULT NULL COMMENT '抽奖次数',
  \`prize_description\` text COLLATE utf8mb4_unicode_ci COMMENT '奖品描述',
  \`prize_image\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '奖品图片',
  \`guarantee_triggered\` tinyint(1) DEFAULT '0' COMMENT '是否触发保底机制',
  \`remaining_guarantee\` int DEFAULT '0' COMMENT '剩余保底次数',
  \`draw_config\` json DEFAULT NULL COMMENT '抽奖配置快照',
  \`result_metadata\` json DEFAULT NULL COMMENT '抽奖结果元数据',
  \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户IP地址',
  \`lottery_id\` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联的抽奖活动ID，允许为空用于测试',
  \`prize_value_points\` int DEFAULT '0' COMMENT '奖品价值积分消耗',
  \`budget_points_before\` int DEFAULT NULL COMMENT '抽奖前预算积分',
  \`budget_points_after\` int DEFAULT NULL COMMENT '抽奖后预算积分',
  \`points_deducted\` int NOT NULL DEFAULT '0' COMMENT '实际积分扣减金额（连抽时子请求可能为0，由外层统一扣减）',
  \`pipeline_type\` enum('normal','preset','override') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '管线类型：normal-正常抽奖, preset-预设发放, override-管理干预',
  \`pick_method\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '选奖方法：normalize/fallback/tier_first',
  \`original_tier\` enum('high','mid','low') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始命中档位（tier_first模式下抽中的档位）',
  \`final_tier\` enum('high','mid','low','fallback') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终发放档位（降级后的档位，可能是fallback）',
  \`downgrade_count\` int NOT NULL DEFAULT '0' COMMENT '降级次数（0=未降级，便于快速统计）',
  \`fallback_triggered\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否触发fallback兜底',
  \`is_preset\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否为预设发放',
  \`lottery_preset_id\` int DEFAULT NULL COMMENT '关联预设ID（外键关联 lottery_presets.lottery_preset_id）',
  \`preset_inventory_debt_id\` int DEFAULT NULL COMMENT '关联库存欠账ID（外键关联 preset_inventory_debt.preset_inventory_debt_id）',
  \`preset_budget_debt_id\` int DEFAULT NULL COMMENT '关联预算欠账ID（外键关联 preset_budget_debt.preset_budget_debt_id）',
  \`has_debt\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否产生了欠账（便于快速筛选）',
  \`lottery_draw_decision_id\` bigint DEFAULT NULL COMMENT '关联决策快照ID（外键关联 lottery_draw_decisions.lottery_draw_decision_id）',
  PRIMARY KEY (\`lottery_draw_id\`),
  UNIQUE KEY \`uk_lottery_draws_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_lottery_draws_business_id\` (\`business_id\`),
  KEY \`idx_user_id\` (\`user_id\`),
  KEY \`idx_prize_id\` (\`lottery_prize_id\`),
  KEY \`idx_draw_type\` (\`draw_type\`),
  KEY \`idx_created_at\` (\`created_at\`),
  KEY \`idx_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`idx_user_type_time\` (\`user_id\`,\`draw_type\`,\`created_at\`),
  KEY \`lottery_records_draw_type_created_at\` (\`draw_type\`,\`created_at\`),
  KEY \`idx_prize_type\` (\`prize_type\`),
  KEY \`idx_lottery_records_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`idx_user_campaign_time\` (\`user_id\`,\`lottery_campaign_id\`,\`created_at\`),
  KEY \`idx_records_user_id\` (\`user_id\`),
  KEY \`idx_records_campaign_id\` (\`lottery_campaign_id\`),
  KEY \`idx_records_created_at\` (\`created_at\`),
  KEY \`idx_reward_tier\` (\`reward_tier\`),
  KEY \`idx_user_reward_tier\` (\`user_id\`,\`reward_tier\`),
  KEY \`idx_created_reward_tier\` (\`created_at\`,\`reward_tier\`),
  KEY \`idx_lottery_draws_user_reward_created\` (\`user_id\`,\`reward_tier\`,\`created_at\` DESC),
  KEY \`idx_lottery_draws_asset_tx_id\` (\`asset_transaction_id\`),
  KEY \`idx_lottery_draws_session_id\` (\`lottery_session_id\`),
  KEY \`idx_draws_pipeline_type\` (\`pipeline_type\`),
  KEY \`idx_draws_is_preset\` (\`is_preset\`),
  KEY \`idx_draws_has_debt\` (\`has_debt\`),
  KEY \`idx_draws_downgrade\` (\`downgrade_count\`,\`fallback_triggered\`),
  KEY \`idx_draws_tier\` (\`original_tier\`,\`final_tier\`),
  KEY \`idx_draws_lottery_preset_id\` (\`lottery_preset_id\`),
  KEY \`idx_draws_decision\` (\`lottery_draw_decision_id\`),
  KEY \`idx_draws_inventory_debt\` (\`preset_inventory_debt_id\`),
  KEY \`idx_draws_budget_debt\` (\`preset_budget_debt_id\`),
  KEY \`idx_draws_lottery_batch\` (\`lottery_batch_id\`),
  CONSTRAINT \`fk_lottery_draws_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_records_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`lottery_draws_ibfk_4\` FOREIGN KEY (\`lottery_prize_id\`) REFERENCES \`lottery_prizes\` (\`lottery_prize_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [66/106] lottery_hourly_metrics
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_hourly_metrics\` (
  \`lottery_hourly_metric_id\` bigint NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL,
  \`hour_bucket\` datetime NOT NULL COMMENT '统计小时（格式: YYYY-MM-DD HH:00:00，北京时间）',
  \`total_draws\` int NOT NULL DEFAULT '0' COMMENT '该小时总抽奖次数',
  \`unique_users\` int NOT NULL DEFAULT '0' COMMENT '该小时参与抽奖的唯一用户数',
  \`high_tier_count\` int NOT NULL DEFAULT '0' COMMENT '高价值奖品次数（high档位）',
  \`mid_tier_count\` int NOT NULL DEFAULT '0' COMMENT '中价值奖品次数（mid档位）',
  \`low_tier_count\` int NOT NULL DEFAULT '0' COMMENT '低价值奖品次数（low档位）',
  \`fallback_tier_count\` int NOT NULL DEFAULT '0' COMMENT '空奖次数（fallback档位）',
  \`total_budget_consumed\` bigint NOT NULL DEFAULT '0' COMMENT '该小时总预算消耗（积分）',
  \`total_prize_value\` bigint NOT NULL DEFAULT '0' COMMENT '该小时发放的总奖品价值（积分）',
  \`b0_tier_count\` int NOT NULL DEFAULT '0' COMMENT 'B0档位（无预算）用户抽奖次数',
  \`b1_tier_count\` int NOT NULL DEFAULT '0' COMMENT 'B1档位（低预算≤100）用户抽奖次数',
  \`b2_tier_count\` int NOT NULL DEFAULT '0' COMMENT 'B2档位（中预算101-500）用户抽奖次数',
  \`b3_tier_count\` int NOT NULL DEFAULT '0' COMMENT 'B3档位（高预算>500）用户抽奖次数',
  \`pity_triggered_count\` int NOT NULL DEFAULT '0' COMMENT 'Pity系统（软保底）触发次数',
  \`anti_empty_triggered_count\` int NOT NULL DEFAULT '0' COMMENT 'AntiEmpty（反连空）强制非空触发次数',
  \`anti_high_triggered_count\` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh（反连高）档位限制触发次数',
  \`luck_debt_triggered_count\` int NOT NULL DEFAULT '0' COMMENT '运气债务补偿触发次数（debt_level > none）',
  \`guarantee_triggered_count\` int NOT NULL DEFAULT '0' COMMENT '保底机制触发次数',
  \`tier_downgrade_count\` int NOT NULL DEFAULT '0' COMMENT '档位降级触发次数（如high无库存降级到mid）',
  \`empty_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '空奖率（0.0000-1.0000）',
  \`high_value_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '高价值率（0.0000-1.0000）',
  \`avg_prize_value\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '平均奖品价值（积分）',
  \`aggregated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '聚合计算时间（北京时间）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  \`empty_count\` int NOT NULL DEFAULT '0' COMMENT '真正空奖次数（系统异常导致的空奖，与正常fallback保底分开统计）',
  PRIMARY KEY (\`lottery_hourly_metric_id\`),
  UNIQUE KEY \`uk_campaign_hour\` (\`lottery_campaign_id\`,\`hour_bucket\`),
  KEY \`idx_hourly_metrics_hour\` (\`hour_bucket\`),
  KEY \`idx_hourly_metrics_campaign\` (\`lottery_campaign_id\`),
  KEY \`idx_hourly_metrics_empty_rate\` (\`empty_rate\`),
  CONSTRAINT \`fk_hourly_metrics_campaign_id\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖监控指标表（按小时聚合，用于监控和分析）';`, { transaction });

      // [67/106] lottery_management_settings
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_management_settings\` (
  \`lottery_management_setting_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`user_id\` int NOT NULL COMMENT '目标用户ID（设置对哪个用户生效）',
  \`setting_type\` enum('force_win','force_lose','probability_adjust','user_queue') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设置类型：force_win-强制中奖，force_lose-强制不中奖，probability_adjust-概率调整，user_queue-用户专属队列',
  \`setting_data\` json NOT NULL COMMENT '设置详情（JSON格式）：force_win={prize_id,reason}，force_lose={count,remaining,reason}，probability_adjust={multiplier,reason}，user_queue={queue_type,priority_level,custom_strategy}',
  \`expires_at\` datetime DEFAULT NULL COMMENT '过期时间（北京时间，NULL表示永不过期）',
  \`status\` enum('active','expired','used','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '设置状态：active-生效中，expired-已过期，used-已使用，cancelled-已取消',
  \`created_by\` int NOT NULL COMMENT '创建管理员ID（记录是哪个管理员创建的设置，用于审计追溯）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  \`lottery_campaign_id\` int DEFAULT NULL COMMENT '关联的抽奖活动ID（NULL=全局干预，非NULL=仅对指定活动生效）',
  PRIMARY KEY (\`lottery_management_setting_id\`),
  KEY \`idx_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_expires_at\` (\`expires_at\`),
  KEY \`idx_type_status\` (\`setting_type\`,\`status\`),
  KEY \`idx_created_by\` (\`created_by\`,\`created_at\`),
  KEY \`idx_user_type_status\` (\`user_id\`,\`setting_type\`,\`status\`),
  KEY \`idx_campaign_user_status\` (\`lottery_campaign_id\`,\`user_id\`,\`status\`),
  CONSTRAINT \`lottery_management_settings_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`lottery_management_settings_ibfk_2\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`lottery_management_settings_lottery_campaign_id_foreign_idx\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）';`, { transaction });

      // [68/106] lottery_presets
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_presets\` (
  \`lottery_preset_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`user_id\` int NOT NULL,
  \`lottery_prize_id\` int NOT NULL,
  \`lottery_campaign_id\` int DEFAULT NULL,
  \`queue_order\` int NOT NULL,
  \`status\` enum('pending','used') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  \`approval_status\` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved' COMMENT '审批状态：pending-待审批, approved-已批准, rejected-已拒绝',
  \`advance_mode\` enum('none','inventory','budget','both') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'both' COMMENT '垫付模式：none-不垫付, inventory-仅库存垫付, budget-仅预算垫付, both-全部垫付',
  \`approved_by\` int DEFAULT NULL COMMENT '审批人ID（外键关联users.user_id）',
  \`approved_at\` datetime DEFAULT NULL COMMENT '审批时间',
  \`rejection_reason\` text COLLATE utf8mb4_unicode_ci COMMENT '拒绝原因（审批拒绝时填写）',
  \`created_by\` int DEFAULT NULL,
  \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`reason\` text COLLATE utf8mb4_unicode_ci COMMENT '创建预设的原因/备注（审计追责用）',
  PRIMARY KEY (\`lottery_preset_id\`),
  KEY \`idx_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_queue_order\` (\`queue_order\`),
  KEY \`idx_created_by\` (\`created_by\`),
  KEY \`idx_created_at\` (\`created_at\`),
  KEY \`fk_lottery_presets_prize_id\` (\`lottery_prize_id\`),
  KEY \`idx_presets_approval_status\` (\`approval_status\`),
  KEY \`idx_presets_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  CONSTRAINT \`fk_lottery_presets_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_presets_prize_id\` FOREIGN KEY (\`lottery_prize_id\`) REFERENCES \`lottery_prizes\` (\`lottery_prize_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_presets_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖结果预设表（简化版）';`, { transaction });

      // [69/106] lottery_simulation_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_simulation_records\` (
  \`lottery_simulation_record_id\` int NOT NULL AUTO_INCREMENT COMMENT '模拟记录ID',
  \`lottery_campaign_id\` int NOT NULL COMMENT '关联的抽奖活动ID',
  \`simulation_name\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '模拟名称（运营者自定义）',
  \`simulation_count\` int NOT NULL COMMENT '模拟迭代次数',
  \`proposed_config\` json NOT NULL COMMENT '提议参数快照（tier_rules + matrix_config + strategy_config）',
  \`scenario\` json NOT NULL COMMENT '场景配置（budget_distribution + pressure_distribution + segment_distribution）',
  \`simulation_result\` json DEFAULT NULL COMMENT '模拟结果（tier_distribution + cost_metrics + experience_metrics）',
  \`comparison\` json DEFAULT NULL COMMENT '对比分析（tier_delta + cost_delta）',
  \`risk_assessment\` json DEFAULT NULL COMMENT '风险评估（high_tier_risk + empty_rate_risk + budget_depletion_risk + prize_cost_rate_risk）',
  \`created_by\` int DEFAULT NULL COMMENT '创建者用户ID',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态：draft=草稿 | applied=已应用到线上 | archived=已归档',
  \`applied_at\` datetime DEFAULT NULL COMMENT '配置应用到线上的时间',
  \`applied_by\` int DEFAULT NULL COMMENT '执行应用操作的用户ID',
  \`actual_result\` json DEFAULT NULL COMMENT '偏差追踪：实际数据统计结果（手动触发填充）',
  \`drift_metrics\` json DEFAULT NULL COMMENT '偏差追踪：各维度偏差百分比',
  \`drift_calculated_at\` datetime DEFAULT NULL COMMENT '偏差计算时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  \`scheduled_at\` datetime DEFAULT NULL COMMENT '计划生效时间（定时应用功能）',
  PRIMARY KEY (\`lottery_simulation_record_id\`),
  KEY \`applied_by\` (\`applied_by\`),
  KEY \`idx_simulation_records_campaign\` (\`lottery_campaign_id\`),
  KEY \`idx_simulation_records_creator\` (\`created_by\`),
  KEY \`idx_simulation_records_status\` (\`status\`),
  KEY \`idx_simulation_records_created\` (\`created_at\`),
  KEY \`idx_simulation_scheduled\` (\`status\`,\`scheduled_at\`),
  CONSTRAINT \`lottery_simulation_records_ibfk_1\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`lottery_simulation_records_ibfk_2\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`lottery_simulation_records_ibfk_3\` FOREIGN KEY (\`applied_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='策略效果模拟记录表 — 保存模拟参数、结果、对比、风险评估和偏差追踪';`, { transaction });

      // [70/106] lottery_strategy_config
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_strategy_config\` (
  \`lottery_strategy_config_id\` int NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL COMMENT '关联的抽奖活动ID（支持多活动策略隔离）',
  \`config_group\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置分组（budget_tier/pressure_tier/pity/luck_debt/anti_empty/anti_high/experience_state）',
  \`config_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键名',
  \`config_value\` json NOT NULL COMMENT '配置值（JSON格式）',
  \`value_type\` enum('number','boolean','string','array','object') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'number' COMMENT '配置值类型',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置描述',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`priority\` int NOT NULL DEFAULT '0' COMMENT '配置优先级（数值越大优先级越高）',
  \`effective_start\` datetime DEFAULT NULL COMMENT '生效开始时间',
  \`effective_end\` datetime DEFAULT NULL COMMENT '生效结束时间',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`lottery_strategy_config_id\`),
  UNIQUE KEY \`uk_strategy_campaign_group_key_priority\` (\`lottery_campaign_id\`,\`config_group\`,\`config_key\`,\`priority\`),
  KEY \`idx_strategy_config_group_active\` (\`config_group\`,\`is_active\`),
  KEY \`idx_strategy_config_campaign\` (\`lottery_campaign_id\`),
  CONSTRAINT \`fk_strategy_config_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等）';`, { transaction });

      // [71/106] lottery_tier_matrix_config
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_tier_matrix_config\` (
  \`lottery_tier_matrix_config_id\` int NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL COMMENT '关联的抽奖活动ID（支持多活动策略隔离）',
  \`budget_tier\` enum('B0','B1','B2','B3') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Budget Tier 预算层级',
  \`pressure_tier\` enum('P0','P1','P2') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Pressure Tier 活动压力层级',
  \`cap_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT '预算上限乘数（0表示强制空奖）',
  \`empty_weight_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT '空奖权重乘数（<1抑制空奖，>1增强空奖）',
  \`description\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置描述',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  \`high_multiplier\` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'high档位权重乘数',
  \`mid_multiplier\` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'mid档位权重乘数',
  \`low_multiplier\` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'low档位权重乘数',
  \`fallback_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT 'fallback档位权重乘数',
  PRIMARY KEY (\`lottery_tier_matrix_config_id\`),
  UNIQUE KEY \`uk_matrix_campaign_budget_pressure\` (\`lottery_campaign_id\`,\`budget_tier\`,\`pressure_tier\`),
  KEY \`idx_matrix_config_campaign\` (\`lottery_campaign_id\`),
  CONSTRAINT \`fk_matrix_config_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置）';`, { transaction });

      // [72/106] lottery_tier_rules
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_tier_rules\` (
  \`lottery_tier_rule_id\` int NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL,
  \`segment_key\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default' COMMENT '用户分层标识（如new_user/vip/default），由SegmentResolver解析获得',
  \`tier_name\` enum('high','mid','low') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '档位名称：high-高档位, mid-中档位, low-低档位（固定三档）',
  \`tier_weight\` int unsigned NOT NULL COMMENT '档位权重（整数，三个档位权重之和必须=1000000）',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '规则状态：active-启用, inactive-停用',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID（管理员user_id）',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID（管理员user_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`lottery_tier_rule_id\`),
  UNIQUE KEY \`uk_campaign_segment_tier\` (\`lottery_campaign_id\`,\`segment_key\`,\`tier_name\`),
  KEY \`idx_tier_rules_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  CONSTRAINT \`fk_tier_rules_campaign_id\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）';`, { transaction });

      // [73/106] lottery_user_daily_draw_quota
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_user_daily_draw_quota\` (
  \`lottery_user_daily_draw_quota_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID',
  \`lottery_campaign_id\` int NOT NULL,
  \`quota_date\` date NOT NULL COMMENT '配额日期：北京时间日期',
  \`limit_value\` int unsigned NOT NULL DEFAULT '50' COMMENT '当日上限：来自规则计算结果',
  \`used_draw_count\` int unsigned NOT NULL DEFAULT '0' COMMENT '已使用抽奖次数',
  \`bonus_draw_count\` int unsigned NOT NULL DEFAULT '0' COMMENT '当日临时补偿的抽奖次数（客服加次数用）',
  \`last_draw_at\` datetime DEFAULT NULL COMMENT '最后一次抽奖时间',
  \`matched_rule_id\` bigint DEFAULT NULL COMMENT '命中的规则ID（便于审计追溯）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`lottery_user_daily_draw_quota_id\`),
  UNIQUE KEY \`idx_user_campaign_date_unique\` (\`user_id\`,\`lottery_campaign_id\`,\`quota_date\`),
  KEY \`idx_date_campaign\` (\`quota_date\`,\`lottery_campaign_id\`),
  KEY \`idx_user_id\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [74/106] lottery_user_experience_state
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_user_experience_state\` (
  \`lottery_user_experience_state_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（外键关联users.user_id）',
  \`lottery_campaign_id\` int NOT NULL,
  \`empty_streak\` int NOT NULL DEFAULT '0' COMMENT '连续空奖次数（Pity系统：每次空奖+1，非空奖重置为0）',
  \`recent_high_count\` int NOT NULL DEFAULT '0' COMMENT '近期高价值奖品次数（AntiHigh：统计窗口内high档位次数）',
  \`anti_high_cooldown\` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh冷却剩余次数（触发降级后N次抽奖不再检测，0=不在冷却期）',
  \`max_empty_streak\` int NOT NULL DEFAULT '0' COMMENT '历史最大连续空奖次数（用于分析和优化）',
  \`total_draw_count\` int NOT NULL DEFAULT '0' COMMENT '该活动总抽奖次数',
  \`total_empty_count\` int NOT NULL DEFAULT '0' COMMENT '该活动总空奖次数',
  \`pity_trigger_count\` int NOT NULL DEFAULT '0' COMMENT 'Pity系统触发次数（用于监控效果）',
  \`last_draw_at\` datetime DEFAULT NULL COMMENT '最后一次抽奖时间（北京时间）',
  \`last_draw_tier\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后一次抽奖档位（high/mid/low/fallback）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`lottery_user_experience_state_id\`),
  UNIQUE KEY \`uk_user_campaign_experience\` (\`user_id\`,\`lottery_campaign_id\`),
  KEY \`idx_experience_user_id\` (\`user_id\`),
  KEY \`idx_experience_campaign_id\` (\`lottery_campaign_id\`),
  KEY \`idx_experience_empty_streak\` (\`empty_streak\`),
  CONSTRAINT \`fk_experience_state_campaign_id\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_experience_state_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）';`, { transaction });

      // [75/106] lottery_user_global_state
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_user_global_state\` (
  \`lottery_user_global_state_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（唯一，外键关联users.user_id）',
  \`global_draw_count\` int NOT NULL DEFAULT '0' COMMENT '全局总抽奖次数（跨所有活动）',
  \`global_empty_count\` int NOT NULL DEFAULT '0' COMMENT '全局总空奖次数（跨所有活动）',
  \`historical_empty_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '历史空奖率（0.0000-1.0000，运气债务核心指标）',
  \`luck_debt_level\` enum('none','low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '运气债务等级（none/low/medium/high）',
  \`luck_debt_multiplier\` decimal(4,2) NOT NULL DEFAULT '1.00' COMMENT '运气债务乘数（>1.0表示需补偿，用于提高非空奖概率）',
  \`global_high_count\` int NOT NULL DEFAULT '0' COMMENT '全局高价值奖品获取次数（high档位）',
  \`global_mid_count\` int NOT NULL DEFAULT '0' COMMENT '全局中价值奖品获取次数（mid档位）',
  \`global_low_count\` int NOT NULL DEFAULT '0' COMMENT '全局低价值奖品获取次数（low档位）',
  \`participated_campaigns\` int NOT NULL DEFAULT '0' COMMENT '参与过的活动数量',
  \`last_draw_at\` datetime DEFAULT NULL COMMENT '全局最后一次抽奖时间（北京时间）',
  \`last_lottery_campaign_id\` int DEFAULT NULL COMMENT '最后一次抽奖的活动ID（外键关联 lottery_campaigns.lottery_campaign_id）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`lottery_user_global_state_id\`),
  UNIQUE KEY \`user_id\` (\`user_id\`),
  KEY \`idx_global_state_luck_debt_level\` (\`luck_debt_level\`),
  KEY \`idx_global_state_empty_rate\` (\`historical_empty_rate\`),
  KEY \`idx_global_state_last_draw_at\` (\`last_draw_at\`),
  KEY \`idx_global_state_last_campaign\` (\`last_lottery_campaign_id\`),
  CONSTRAINT \`fk_global_state_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户全局抽奖统计表（LuckDebt运气债务机制）';`, { transaction });

      // [76/106] market_listings
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`market_listings\` (
  \`market_listing_id\` bigint NOT NULL AUTO_INCREMENT,
  \`listing_kind\` enum('item','fungible_asset') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '挂牌类型：item=不可叠加物品 | fungible_asset=可叠加资产',
  \`seller_user_id\` int NOT NULL COMMENT '卖家用户ID（Seller User ID）：挂牌创建者，外键关联 users.user_id',
  \`offer_item_id\` bigint DEFAULT NULL,
  \`offer_item_template_id\` bigint DEFAULT NULL COMMENT '挂牌物品模板ID（快照 → item_templates.item_template_id，仅 listing_kind=item_instance 时有值）',
  \`offer_item_category_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '挂牌物品类目代码（快照 → category_defs.category_code）',
  \`offer_item_rarity\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '挂牌物品稀有度（快照 → rarity_defs.rarity_code）',
  \`offer_item_display_name\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '挂牌物品显示名称（快照，便于搜索和展示）',
  \`offer_asset_group_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '挂牌资产分组代码（快照 → asset_group_defs.group_code，仅 listing_kind=fungible_asset 时有值）',
  \`offer_asset_display_name\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '挂牌资产显示名称（快照，便于搜索和展示）',
  \`offer_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '标的资产代码（Offer Asset Code）：当 listing_kind=fungible_asset 时必填，如 red_shard、DIAMOND；业务规则：挂牌时必须冻结卖家该资产的 offer_amount 数量',
  \`offer_amount\` bigint DEFAULT NULL COMMENT '标的资产数量（Offer Amount）：当 listing_kind=fungible_asset 时必填，单位为 offer_asset_code 的最小单位；业务规则：必须 >0，挂牌时冻结该数量',
  \`price_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DIAMOND' COMMENT '结算资产代码（Price Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND',
  \`price_amount\` bigint NOT NULL COMMENT '挂牌价格（Price Amount）：卖家设定的总价，单位为 price_asset_code（DIAMOND）；业务规则：必须 >0，成交时买家支付该金额（含手续费）',
  \`seller_offer_frozen\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '卖家标的是否已冻结（Seller Offer Frozen）：标记卖家标的资产是否已冻结；业务规则：listing_kind=fungible_asset 时必须为 true（挂牌时冻结卖家资产），listing_kind=item_instance 时为 false（物品实例不需要冻结）',
  \`locked_by_order_id\` bigint DEFAULT NULL COMMENT '锁定订单ID（Locked By Order ID）：记录当前锁定该挂牌的订单ID，外键关联 trade_orders.order_id；业务规则：status=locked 时必填，用于防止并发购买和超时解锁',
  \`locked_at\` datetime DEFAULT NULL COMMENT '锁定时间（Locked At）：记录挂牌被锁定的北京时间；业务规则：status=locked 时必填，用于超时解锁检查（默认超时时间：15分钟）',
  \`status\` enum('on_sale','locked','sold','withdrawn','admin_withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_sale' COMMENT '挂牌状态（Status）：on_sale-在售中 | locked-已锁定 | sold-已售出 | withdrawn-已撤回 | admin_withdrawn-管理员强制撤回',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（Created At）：挂牌创建的北京时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（Updated At）：挂牌最后更新的北京时间',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (\`market_listing_id\`),
  UNIQUE KEY \`uk_market_listings_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_market_listings_seller_idempotency\` (\`seller_user_id\`,\`idempotency_key\`),
  KEY \`idx_market_listings_seller_user_id\` (\`seller_user_id\`),
  KEY \`idx_market_listings_status\` (\`status\`),
  KEY \`idx_market_listings_listing_kind\` (\`listing_kind\`),
  KEY \`idx_market_listings_offer_asset_code\` (\`offer_asset_code\`),
  KEY \`idx_market_listings_locked_by_order_id\` (\`locked_by_order_id\`),
  KEY \`idx_market_listings_locked_at\` (\`locked_at\`),
  KEY \`idx_market_listings_created_at\` (\`created_at\`),
  KEY \`idx_market_listings_item_template\` (\`offer_item_template_id\`),
  KEY \`idx_market_listings_item_category\` (\`offer_item_category_code\`),
  KEY \`idx_market_listings_item_rarity\` (\`offer_item_rarity\`),
  KEY \`idx_market_listings_asset_group\` (\`offer_asset_group_code\`),
  KEY \`idx_market_listings_status_kind_category\` (\`status\`,\`listing_kind\`,\`offer_item_category_code\`),
  KEY \`idx_market_listings_status_kind_asset_group\` (\`status\`,\`listing_kind\`,\`offer_asset_group_code\`),
  KEY \`idx_market_listings_offer_item_id\` (\`offer_item_id\`),
  CONSTRAINT \`fk_market_listings_offer_item_id\` FOREIGN KEY (\`offer_item_id\`) REFERENCES \`items\` (\`item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_ibfk_1\` FOREIGN KEY (\`seller_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_asset_group_code_foreign_idx\` FOREIGN KEY (\`offer_asset_group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_category_code_foreign_idx\` FOREIGN KEY (\`offer_item_category_code\`) REFERENCES \`category_defs\` (\`category_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_rarity_foreign_idx\` FOREIGN KEY (\`offer_item_rarity\`) REFERENCES \`rarity_defs\` (\`rarity_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_template_id_foreign_idx\` FOREIGN KEY (\`offer_item_template_id\`) REFERENCES \`item_templates\` (\`item_template_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [77/106] market_price_snapshots
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`market_price_snapshots\` (
  \`snapshot_id\` int NOT NULL AUTO_INCREMENT COMMENT '快照主键ID',
  \`snapshot_date\` date NOT NULL COMMENT '快照日期（YYYY-MM-DD）',
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（offer_asset_code 或通过 item 关联的类目）',
  \`listing_kind\` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item' COMMENT '挂牌类型（item/fungible_asset）',
  \`price_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DIAMOND' COMMENT '定价币种代码',
  \`active_listings\` int NOT NULL DEFAULT '0' COMMENT '当日在售挂牌数量',
  \`min_price\` decimal(20,4) DEFAULT NULL COMMENT '最低挂牌价格',
  \`max_price\` decimal(20,4) DEFAULT NULL COMMENT '最高挂牌价格',
  \`avg_price\` decimal(20,4) DEFAULT NULL COMMENT '平均挂牌价格',
  \`total_volume\` decimal(20,4) NOT NULL DEFAULT '0.0000' COMMENT '当日成交总额（已完成订单的 gross_amount 之和）',
  \`completed_trades\` int NOT NULL DEFAULT '0' COMMENT '当日成交笔数',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`snapshot_id\`),
  UNIQUE KEY \`uk_snapshot_date_asset_kind_currency\` (\`snapshot_date\`,\`asset_code\`,\`listing_kind\`,\`price_asset_code\`),
  KEY \`idx_mps_snapshot_date\` (\`snapshot_date\`),
  KEY \`idx_mps_asset_code\` (\`asset_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='市场价格快照预聚合表（每日一次，按资产+类型+币种维度）';`, { transaction });

      // [78/106] material_asset_types
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`material_asset_types\` (
  \`material_asset_type_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '材料资产类型ID（主键）',
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"',
  \`group_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类',
  \`form\` enum('shard','crystal','currency','quota') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '形态：shard-碎片, crystal-水晶, currency-货币, quota-配额',
  \`tier\` int NOT NULL COMMENT '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序',
  \`visible_value_points\` bigint DEFAULT NULL COMMENT '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选',
  \`budget_value_points\` bigint DEFAULT NULL COMMENT '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）',
  \`created_at\` datetime NOT NULL COMMENT '创建时间（Created At - 北京时间）：记录创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间（Updated At - 北京时间）：记录最后更新时间',
  \`is_tradable\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可交易（Is Tradable - C2C市场交易开关）：TRUE-可在市场挂牌交易，FALSE-禁止市场交易',
  \`icon_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '资产图标URL（用于市场列表展示）',
  \`merchant_id\` int DEFAULT NULL COMMENT '归属商家ID（NULL=平台资产，关联 merchants 表）',
  PRIMARY KEY (\`material_asset_type_id\`),
  UNIQUE KEY \`asset_code\` (\`asset_code\`),
  UNIQUE KEY \`uk_material_asset_types_asset_code\` (\`asset_code\`),
  KEY \`idx_material_asset_types_group_code\` (\`group_code\`),
  KEY \`idx_material_asset_types_is_enabled\` (\`is_enabled\`),
  KEY \`idx_tradable_enabled\` (\`is_tradable\`,\`is_enabled\`),
  KEY \`material_asset_types_merchant_id_foreign_idx\` (\`merchant_id\`),
  CONSTRAINT \`fk_mat_group_code\` FOREIGN KEY (\`group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_material_asset_types_group_code\` FOREIGN KEY (\`group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`material_asset_types_merchant_id_foreign_idx\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`merchants\` (\`merchant_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [79/106] material_conversion_rules
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`material_conversion_rules\` (
  \`material_conversion_rule_id\` bigint NOT NULL AUTO_INCREMENT,
  \`from_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '源资产代码（From Asset Code - 转换源）：如 red_shard，表示从哪种资产转换出去',
  \`to_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标资产代码（To Asset Code - 转换目标）：如 DIAMOND/red_crystal，表示转换成哪种资产',
  \`from_amount\` bigint NOT NULL COMMENT '源资产数量（From Amount - 转换输入数量）：如 1，表示消耗 1 个源资产（如 1 red_shard）',
  \`to_amount\` bigint NOT NULL COMMENT '目标资产数量（To Amount - 转换输出数量）：如 20，表示获得 20 个目标资产（如 20 DIAMOND），比例 = to_amount / from_amount',
  \`effective_at\` datetime NOT NULL COMMENT '生效时间（Effective At - 版本化关键字段）：规则从此时间开始生效，查询时取当前时间前的最新已启用规则（WHERE effective_at <= NOW() AND is_enabled=true ORDER BY effective_at DESC LIMIT 1），确保历史流水可回放',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（Is Enabled - 启用状态）：true-启用（规则生效），false-禁用（规则不生效）',
  \`created_by\` int DEFAULT NULL COMMENT '创建人（Created By - 操作记录）：记录规则创建者的 user_id，用于审计',
  \`created_at\` datetime NOT NULL COMMENT '创建时间（Created At - 北京时间）：记录规则创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间（Updated At - 北京时间）：记录规则最后更新时间',
  \`min_from_amount\` bigint NOT NULL DEFAULT '1' COMMENT '最小转换数量（Min From Amount）：用户单次转换的最小源资产数量，用于保护性下限',
  \`max_from_amount\` bigint DEFAULT NULL COMMENT '最大转换数量（Max From Amount）：用户单次转换的最大源资产数量，NULL 表示无上限',
  \`fee_rate\` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '手续费费率（Fee Rate）：如 0.05 = 5%，基于产出 to_amount 计算手续费',
  \`fee_min_amount\` bigint NOT NULL DEFAULT '0' COMMENT '最低手续费（Fee Min Amount）：手续费下限，计算结果低于此值时取此值，0 表示无最低限制',
  \`fee_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手续费资产类型（Fee Asset Code）：手续费收取的资产类型，NULL 时默认与 to_asset_code 相同',
  \`title\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示标题（Title）：前端展示的规则名称，如"红晶片分解"',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '描述文案（Description）：前端展示的规则说明文案',
  \`display_icon\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示图标（Display Icon）：图标 URL 或 icon-name，用于前端渲染',
  \`risk_level\` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '风险等级（Risk Level）：low-低风险（绿色）/medium-中风险（黄色）/high-高风险（红色），用于前端提示',
  \`is_visible\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '前端可见（Is Visible）：true-前端可见/false-隐藏规则（仅后端内部使用）',
  \`rounding_mode\` enum('floor','ceil','round') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'floor' COMMENT '舍入模式（Rounding Mode）：floor-向下取整（默认保守）/ceil-向上取整/round-四舍五入',
  \`updated_by\` int DEFAULT NULL COMMENT '最后更新人（Updated By）：记录规则最后更新者的 user_id，用于审计',
  PRIMARY KEY (\`material_conversion_rule_id\`),
  KEY \`idx_material_conversion_rules_conversion_path\` (\`from_asset_code\`,\`to_asset_code\`,\`effective_at\`),
  KEY \`idx_material_conversion_rules_enabled_effective\` (\`is_enabled\`,\`effective_at\`),
  KEY \`idx_mcr_visible_enabled_effective\` (\`is_visible\`,\`is_enabled\`,\`effective_at\`),
  KEY \`idx_mcr_fee_asset_code\` (\`fee_asset_code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [80/106] merchant_operation_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`merchant_operation_logs\` (
  \`merchant_operation_log_id\` bigint NOT NULL AUTO_INCREMENT,
  \`operator_id\` int NOT NULL COMMENT '操作员ID（商家员工 user_id）',
  \`store_id\` int NOT NULL COMMENT '门店ID（操作发生的门店）',
  \`operation_type\` enum('scan_user','submit_consumption','view_consumption_list','view_consumption_detail','staff_login','staff_logout','staff_add','staff_transfer','staff_disable','staff_enable') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型（商家域专用枚举）',
  \`action\` enum('create','read','scan','update') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'create' COMMENT '操作动作',
  \`target_user_id\` int DEFAULT NULL COMMENT '目标用户ID（被扫码/被录入消费的用户，可为空）',
  \`consumption_record_id\` bigint DEFAULT NULL,
  \`consumption_amount\` decimal(10,2) DEFAULT NULL COMMENT '消费金额（仅提交消费记录时有值）',
  \`result\` enum('success','failed','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success' COMMENT '操作结果',
  \`error_message\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '错误信息（失败时记录）',
  \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址（支持 IPv4 和 IPv6）',
  \`user_agent\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户代理字符串（User-Agent）',
  \`request_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '请求ID（用于全链路追踪）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '幂等键（关联业务操作，如消费提交的幂等键）',
  \`extra_data\` json DEFAULT NULL COMMENT '扩展数据（JSON 格式，存储其他上下文信息）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (\`merchant_operation_log_id\`),
  KEY \`idx_merchant_logs_operator\` (\`operator_id\`),
  KEY \`idx_merchant_logs_store\` (\`store_id\`),
  KEY \`idx_merchant_logs_operation_type\` (\`operation_type\`),
  KEY \`idx_merchant_logs_target_user\` (\`target_user_id\`),
  KEY \`idx_merchant_logs_related_record\` (\`consumption_record_id\`),
  KEY \`idx_merchant_logs_result\` (\`result\`),
  KEY \`idx_merchant_logs_created_at\` (\`created_at\`),
  KEY \`idx_merchant_logs_request_id\` (\`request_id\`),
  KEY \`idx_merchant_logs_idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_merchant_logs_store_operator_time\` (\`store_id\`,\`operator_id\`,\`created_at\`),
  KEY \`idx_merchant_logs_store_type_time\` (\`store_id\`,\`operation_type\`,\`created_at\`),
  CONSTRAINT \`fk_merchant_logs_consumption_record\` FOREIGN KEY (\`consumption_record_id\`) REFERENCES \`consumption_records\` (\`consumption_record_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`merchant_operation_logs_ibfk_1\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`merchant_operation_logs_ibfk_2\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`merchant_operation_logs_ibfk_3\` FOREIGN KEY (\`target_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`merchant_operation_logs_ibfk_5\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商家操作审计日志表（商家员工域权限体系升级 - 2026-01-12）';`, { transaction });

      // [81/106] preset_budget_debt
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`preset_budget_debt\` (
  \`preset_budget_debt_id\` bigint NOT NULL AUTO_INCREMENT,
  \`lottery_preset_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`lottery_draw_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）',
  \`user_id\` int NOT NULL COMMENT '用户ID（收到预设奖品的用户）',
  \`lottery_campaign_id\` int NOT NULL,
  \`debt_amount\` int unsigned NOT NULL COMMENT '欠账金额（系统垫付的预算金额，整数分值）',
  \`debt_source\` enum('user_budget','pool_budget','pool_quota') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '欠账来源：user_budget-用户预算, pool_budget-活动池预算, pool_quota-池+配额',
  \`status\` enum('pending','cleared','written_off') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销',
  \`cleared_amount\` int unsigned NOT NULL DEFAULT '0' COMMENT '已清偿金额',
  \`cleared_at\` datetime DEFAULT NULL COMMENT '清偿时间',
  \`cleared_by_method\` enum('topup','manual','auto') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '清偿方式：topup-充值触发, manual-手动清偿, auto-自动核销',
  \`cleared_by_user_id\` int DEFAULT NULL COMMENT '清偿操作人ID',
  \`cleared_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '清偿备注',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（欠账产生时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`preset_budget_debt_id\`),
  KEY \`idx_budget_debt_preset\` (\`lottery_preset_id\`),
  KEY \`idx_budget_debt_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_budget_debt_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_budget_debt_status_time\` (\`status\`,\`created_at\`),
  CONSTRAINT \`fk_budget_debt_preset\` FOREIGN KEY (\`lottery_preset_id\`) REFERENCES \`lottery_presets\` (\`lottery_preset_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_budget_debt_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预设预算欠账表 - 记录预设强发时的预算垫付';`, { transaction });

      // [82/106] preset_debt_limits
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`preset_debt_limits\` (
  \`preset_debt_limit_id\` int NOT NULL AUTO_INCREMENT,
  \`limit_level\` enum('global','campaign','prize') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限制级别：global-全局, campaign-活动, prize-奖品',
  \`reference_id\` int DEFAULT NULL COMMENT '关联ID：campaign级别为campaign_id，prize级别为prize_id，global级别为null',
  \`inventory_debt_limit\` int unsigned NOT NULL DEFAULT '100' COMMENT '库存欠账上限数量',
  \`budget_debt_limit\` int unsigned NOT NULL DEFAULT '100000' COMMENT '预算欠账上限金额（整数分值）',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '配置状态：active-启用, inactive-停用',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '配置说明',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID',
  \`updated_by\` int DEFAULT NULL COMMENT '更新人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`preset_debt_limit_id\`),
  UNIQUE KEY \`uk_debt_limits_level_ref\` (\`limit_level\`,\`reference_id\`),
  KEY \`idx_debt_limits_status\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='欠账上限配置表 - 配置各级别的欠账风险上限';`, { transaction });

      // [83/106] preset_inventory_debt
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`preset_inventory_debt\` (
  \`preset_inventory_debt_id\` bigint NOT NULL AUTO_INCREMENT,
  \`lottery_preset_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`lottery_draw_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）',
  \`lottery_prize_id\` int NOT NULL,
  \`user_id\` int NOT NULL COMMENT '用户ID（收到预设奖品的用户）',
  \`lottery_campaign_id\` int NOT NULL,
  \`debt_quantity\` int unsigned NOT NULL DEFAULT '1' COMMENT '欠账数量（库存垫付数量）',
  \`status\` enum('pending','cleared','written_off') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销',
  \`cleared_quantity\` int unsigned NOT NULL DEFAULT '0' COMMENT '已清偿数量',
  \`cleared_at\` datetime DEFAULT NULL COMMENT '清偿时间',
  \`cleared_by_method\` enum('restock','manual','auto') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '清偿方式：restock-补货触发, manual-手动清偿, auto-自动核销',
  \`cleared_by_user_id\` int DEFAULT NULL COMMENT '清偿操作人ID',
  \`cleared_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '清偿备注',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（欠账产生时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`preset_inventory_debt_id\`),
  KEY \`idx_inv_debt_preset\` (\`lottery_preset_id\`),
  KEY \`idx_inv_debt_prize_status\` (\`lottery_prize_id\`,\`status\`),
  KEY \`idx_inv_debt_campaign_status\` (\`lottery_campaign_id\`,\`status\`),
  KEY \`idx_inv_debt_status_time\` (\`status\`,\`created_at\`),
  KEY \`fk_inv_debt_user_id\` (\`user_id\`),
  CONSTRAINT \`fk_inv_debt_preset\` FOREIGN KEY (\`lottery_preset_id\`) REFERENCES \`lottery_presets\` (\`lottery_preset_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_inv_debt_prize_id\` FOREIGN KEY (\`lottery_prize_id\`) REFERENCES \`lottery_prizes\` (\`lottery_prize_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_inv_debt_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预设库存欠账表 - 记录预设强发时的库存垫付';`, { transaction });

      // [84/106] store_staff
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`store_staff\` (
  \`store_staff_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID（自增）',
  \`user_id\` int NOT NULL COMMENT '员工用户ID（外键关联 users.user_id）',
  \`store_id\` int NOT NULL COMMENT '门店ID（外键关联 stores.store_id）',
  \`sequence_no\` int NOT NULL DEFAULT '1' COMMENT '序列号（同一用户在同一门店的第N次入职记录）',
  \`role_in_store\` enum('staff','manager') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff' COMMENT '门店内角色：staff=员工，manager=店长',
  \`status\` enum('active','inactive','pending','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：active=在职，inactive=离职，pending=待审核，deleted=已删除',
  \`joined_at\` datetime DEFAULT NULL COMMENT '入职时间（审核通过后设置）',
  \`left_at\` datetime DEFAULT NULL COMMENT '离职时间（离职时设置）',
  \`operator_id\` int DEFAULT NULL COMMENT '操作者ID（邀请/审批此员工的用户）',
  \`notes\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注信息',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`deleted_at\` datetime DEFAULT NULL COMMENT '删除时间（status=deleted 时设置）',
  \`delete_reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '删除原因',
  PRIMARY KEY (\`store_staff_id\`),
  UNIQUE KEY \`uk_store_staff_user_store_seq\` (\`user_id\`,\`store_id\`,\`sequence_no\`),
  KEY \`operator_id\` (\`operator_id\`),
  KEY \`idx_store_staff_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_store_staff_store_status\` (\`store_id\`,\`status\`),
  KEY \`idx_store_staff_status_role\` (\`status\`,\`role_in_store\`),
  KEY \`idx_store_staff_deleted\` (\`status\`,\`deleted_at\`),
  CONSTRAINT \`store_staff_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`store_staff_ibfk_2\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`store_staff_ibfk_3\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店员工关系表（员工-门店多对多，支持历史记录）';`, { transaction });

      // [85/106] redemption_orders
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`redemption_orders\` (
  \`redemption_order_id\` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`code_hash\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值（64位hex字符串），用于验证核销码，不存储明文',
  \`item_id\` bigint NOT NULL,
  \`redeemer_user_id\` int DEFAULT NULL COMMENT '核销用户ID（Redeemer User ID）：执行核销操作的用户ID，外键指向 users.user_id，核销前为NULL',
  \`status\` enum('pending','fulfilled','cancelled','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期',
  \`expires_at\` datetime NOT NULL COMMENT '过期时间（Expires At）：核销码过期时间，创建后30天，北京时间',
  \`fulfilled_at\` datetime DEFAULT NULL COMMENT '核销时间（Fulfilled At）：实际核销时间，北京时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（Created At）：记录创建时间，北京时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（Updated At）：记录最后更新时间，北京时间',
  \`fulfilled_store_id\` int DEFAULT NULL COMMENT '核销门店ID（Fulfilled Store ID）：记录核销发生在哪个门店',
  \`fulfilled_by_staff_id\` bigint DEFAULT NULL COMMENT '核销员工ID（Fulfilled By Staff ID）：执行核销操作的门店员工',
  PRIMARY KEY (\`redemption_order_id\`),
  UNIQUE KEY \`code_hash\` (\`code_hash\`),
  KEY \`idx_status_expires\` (\`status\`,\`expires_at\`),
  KEY \`idx_redeemer\` (\`redeemer_user_id\`),
  KEY \`idx_fulfilled_store\` (\`fulfilled_store_id\`),
  KEY \`idx_fulfilled_staff\` (\`fulfilled_by_staff_id\`),
  KEY \`idx_redemption_orders_item_id\` (\`item_id\`),
  KEY \`idx_redemption_orders_item_status\` (\`item_id\`,\`status\`),
  CONSTRAINT \`fk_redemption_orders_item_id\` FOREIGN KEY (\`item_id\`) REFERENCES \`items\` (\`item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`redemption_orders_fulfilled_by_staff_id_foreign_idx\` FOREIGN KEY (\`fulfilled_by_staff_id\`) REFERENCES \`store_staff\` (\`store_staff_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`redemption_orders_fulfilled_store_id_foreign_idx\` FOREIGN KEY (\`fulfilled_store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`redemption_orders_ibfk_2\` FOREIGN KEY (\`redeemer_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code';`, { transaction });

      // [86/106] reminder_rules
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`reminder_rules\` (
  \`reminder_rule_id\` int NOT NULL,
  \`rule_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则编码（唯一标识，如 pending_audit_24h）',
  \`rule_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称（中文，如"待审核超24小时提醒"）',
  \`rule_description\` text COLLATE utf8mb4_unicode_ci COMMENT '规则描述',
  \`rule_type\` enum('pending_timeout','stock_low','budget_alert','activity_status','anomaly_detect','scheduled','custom') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则类型',
  \`trigger_condition\` json NOT NULL COMMENT '触发条件配置（JSON格式，如 {"threshold": 24, "unit": "hours", "target_status": "pending"}）',
  \`target_entity\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标实体类型（如 consumption_record, lottery_campaign, exchange_record）',
  \`notification_channels\` json NOT NULL COMMENT '通知渠道配置（数组，如 ["admin_broadcast", "websocket", "wechat"]）',
  \`notification_template\` text COLLATE utf8mb4_unicode_ci COMMENT '通知模板（支持变量占位符，如 "有{count}条{entity}待处理超过{threshold}{unit}"）',
  \`notification_priority\` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '通知优先级（low=低, normal=普通, high=高, urgent=紧急）与 admin_notifications.priority 枚举一致',
  \`check_interval_minutes\` int NOT NULL DEFAULT '60' COMMENT '检测间隔（分钟）',
  \`last_check_at\` datetime DEFAULT NULL COMMENT '上次检测时间',
  \`next_check_at\` datetime DEFAULT NULL COMMENT '下次检测时间',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`is_system\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置规则（系统规则不可删除）',
  \`created_by\` int DEFAULT NULL COMMENT '创建者ID',
  \`updated_by\` int DEFAULT NULL COMMENT '最后更新者ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`reminder_rule_id\`),
  UNIQUE KEY \`rule_code\` (\`rule_code\`),
  UNIQUE KEY \`idx_reminder_rules_code\` (\`rule_code\`),
  KEY \`created_by\` (\`created_by\`),
  KEY \`updated_by\` (\`updated_by\`),
  KEY \`idx_reminder_rules_type\` (\`rule_type\`),
  KEY \`idx_reminder_rules_enabled\` (\`is_enabled\`),
  KEY \`idx_reminder_rules_next_check\` (\`next_check_at\`),
  CONSTRAINT \`reminder_rules_ibfk_1\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`reminder_rules_ibfk_2\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则表（运营后台提醒管理）';`, { transaction });

      // [87/106] reminder_history
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`reminder_history\` (
  \`reminder_history_id\` bigint NOT NULL AUTO_INCREMENT,
  \`reminder_rule_id\` int NOT NULL,
  \`trigger_time\` datetime NOT NULL COMMENT '触发时间',
  \`trigger_data\` json DEFAULT NULL COMMENT '触发时的数据快照（如匹配的记录数、具体ID列表等）',
  \`matched_count\` int NOT NULL DEFAULT '0' COMMENT '匹配的记录数量',
  \`notification_status\` enum('pending','sent','failed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '通知状态',
  \`notification_result\` json DEFAULT NULL COMMENT '通知结果详情（包含各渠道发送结果）',
  \`sent_at\` datetime DEFAULT NULL COMMENT '通知发送时间',
  \`error_message\` text COLLATE utf8mb4_unicode_ci COMMENT '错误信息（发送失败时记录）',
  \`is_acknowledged\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已确认（用于去重和追踪）',
  \`acknowledged_by\` int DEFAULT NULL COMMENT '确认者ID',
  \`acknowledged_at\` datetime DEFAULT NULL COMMENT '确认时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`reminder_history_id\`),
  KEY \`acknowledged_by\` (\`acknowledged_by\`),
  KEY \`idx_reminder_history_rule\` (\`reminder_rule_id\`),
  KEY \`idx_reminder_history_trigger_time\` (\`trigger_time\`),
  KEY \`idx_reminder_history_status\` (\`notification_status\`),
  KEY \`idx_reminder_history_created\` (\`created_at\`),
  CONSTRAINT \`fk_reminder_history_rule\` FOREIGN KEY (\`reminder_rule_id\`) REFERENCES \`reminder_rules\` (\`reminder_rule_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`reminder_history_ibfk_2\` FOREIGN KEY (\`acknowledged_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提醒历史记录表（存储每次提醒的触发和通知结果）';`, { transaction });

      // [88/106] report_templates
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`report_templates\` (
  \`report_template_id\` int NOT NULL,
  \`template_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板编码（唯一标识，如 daily_lottery_summary）',
  \`template_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称（中文）',
  \`template_description\` text COLLATE utf8mb4_unicode_ci COMMENT '模板描述',
  \`template_type\` enum('lottery','consumption','user','inventory','financial','operational','custom') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板类型',
  \`category\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报表分类（用于前端分组显示）',
  \`data_source_config\` json NOT NULL COMMENT '数据源配置（定义查询的表、字段、关联关系，如 {"tables": ["lottery_draws", "users"], "joins": [...]}）',
  \`columns_config\` json NOT NULL COMMENT '列配置（定义显示的列、排序、格式化，如 [{"field": "user_id", "label": "用户ID", "type": "number"}]）',
  \`filters_config\` json DEFAULT NULL COMMENT '筛选条件配置（定义可用的筛选项，如 [{"field": "created_at", "type": "date_range"}]）',
  \`aggregation_config\` json DEFAULT NULL COMMENT '聚合配置（定义统计和汇总方式，如 {"group_by": ["date"], "sum": ["amount"]}）',
  \`chart_config\` json DEFAULT NULL COMMENT '图表配置（定义可视化图表，如 {"type": "line", "x_axis": "date", "y_axis": "count"}）',
  \`export_formats\` json NOT NULL COMMENT '支持的导出格式（数组，如 ["excel", "csv", "pdf"]）',
  \`default_export_format\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'excel' COMMENT '默认导出格式',
  \`schedule_config\` json DEFAULT NULL COMMENT '定时调度配置（如 {"enabled": true, "cron": "0 8 * * *", "recipients": [1, 2, 3]}）',
  \`last_generated_at\` datetime DEFAULT NULL COMMENT '上次生成时间',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`is_system\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置模板（内置模板不可删除）',
  \`created_by\` int DEFAULT NULL COMMENT '创建者ID',
  \`updated_by\` int DEFAULT NULL COMMENT '最后更新者ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`report_template_id\`),
  UNIQUE KEY \`template_code\` (\`template_code\`),
  UNIQUE KEY \`idx_report_templates_code\` (\`template_code\`),
  KEY \`created_by\` (\`created_by\`),
  KEY \`updated_by\` (\`updated_by\`),
  KEY \`idx_report_templates_type\` (\`template_type\`),
  KEY \`idx_report_templates_enabled\` (\`is_enabled\`),
  KEY \`idx_report_templates_system\` (\`is_system\`),
  CONSTRAINT \`report_templates_ibfk_1\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`report_templates_ibfk_2\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报表模板表（自定义报表配置管理）';`, { transaction });

      // [89/106] risk_alerts
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`risk_alerts\` (
  \`risk_alert_id\` int NOT NULL AUTO_INCREMENT,
  \`alert_type\` enum('frequency_limit','amount_limit','duplicate_user','suspicious_pattern') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型：frequency_limit-频次超限、amount_limit-金额超限、duplicate_user-用户被多店录入、suspicious_pattern-可疑模式',
  \`severity\` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '严重程度：low-低、medium-中、high-高、critical-严重',
  \`operator_id\` int DEFAULT NULL COMMENT '操作员ID（触发告警的员工），外键关联 users.user_id',
  \`store_id\` int DEFAULT NULL COMMENT '门店ID，外键关联 stores.store_id',
  \`target_user_id\` int DEFAULT NULL COMMENT '目标用户ID（被录入消费的用户），外键关联 users.user_id',
  \`related_record_id\` int DEFAULT NULL COMMENT '关联消费记录ID，外键关联 consumption_records.record_id',
  \`rule_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发的规则名称（如 frequency_limit、single_amount_limit、duplicate_user_check）',
  \`rule_threshold\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则阈值（如 10次/60秒、5000元/笔、3个门店/10分钟）',
  \`actual_value\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实际值（如 12次/60秒、8000元、5个门店）',
  \`alert_message\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警消息（人类可读的完整描述）',
  \`is_blocked\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否阻断提交：true-硬阻断（如频次超限）、false-仅告警（如金额告警）',
  \`status\` enum('pending','reviewed','ignored') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：pending-待处理、reviewed-已复核、ignored-已忽略',
  \`reviewed_by\` int DEFAULT NULL COMMENT '复核人ID，外键关联 users.user_id',
  \`review_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '复核备注',
  \`reviewed_at\` datetime DEFAULT NULL COMMENT '复核时间，时区：北京时间（GMT+8）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，时区：北京时间（GMT+8）',
  PRIMARY KEY (\`risk_alert_id\`),
  KEY \`reviewed_by\` (\`reviewed_by\`),
  KEY \`idx_risk_alerts_status_created\` (\`status\`,\`created_at\`),
  KEY \`idx_risk_alerts_type\` (\`alert_type\`),
  KEY \`idx_risk_alerts_operator\` (\`operator_id\`,\`created_at\`),
  KEY \`idx_risk_alerts_store\` (\`store_id\`,\`created_at\`),
  KEY \`idx_risk_alerts_target_user\` (\`target_user_id\`),
  KEY \`idx_risk_alerts_severity_status\` (\`severity\`,\`status\`),
  CONSTRAINT \`risk_alerts_ibfk_1\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`risk_alerts_ibfk_2\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`risk_alerts_ibfk_3\` FOREIGN KEY (\`target_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`risk_alerts_ibfk_4\` FOREIGN KEY (\`reviewed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [90/106] roles
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`roles\` (
  \`role_id\` int NOT NULL AUTO_INCREMENT,
  \`role_uuid\` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色UUID标识（安全不可推测）',
  \`role_name\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名称（仅内部使用）',
  \`role_level\` int NOT NULL DEFAULT '0' COMMENT '角色级别（0=普通用户，100=超级管理员）',
  \`permissions\` json DEFAULT NULL COMMENT '角色权限配置（JSON格式）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '角色描述',
  \`is_active\` tinyint(1) DEFAULT '1' COMMENT '角色是否启用',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  PRIMARY KEY (\`role_id\`),
  UNIQUE KEY \`role_uuid\` (\`role_uuid\`),
  UNIQUE KEY \`role_name\` (\`role_name\`),
  KEY \`roles_role_level\` (\`role_level\`),
  KEY \`roles_is_active\` (\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色管理表';`, { transaction });

      // [91/106] segment_rule_configs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`segment_rule_configs\` (
  \`segment_rule_config_id\` int NOT NULL AUTO_INCREMENT COMMENT '分群规则配置ID',
  \`version_key\` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本标识，如 default、v1、custom_spring_2026',
  \`version_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本显示名称，如"不分群"、"新老用户分层"',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '版本描述',
  \`rules\` json NOT NULL COMMENT '分群规则数组（条件构建器生成的规则 JSON）',
  \`is_system\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置：1=内置（不可删除），0=自定义',
  \`status\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active=启用，archived=已归档',
  \`created_by\` int DEFAULT NULL COMMENT '创建人用户ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`segment_rule_config_id\`),
  UNIQUE KEY \`version_key\` (\`version_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户分群规则配置表（运营可视化搭建分群条件）';`, { transaction });

      // [92/106] system_configs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_configs\` (
  \`system_config_id\` int NOT NULL AUTO_INCREMENT,
  \`config_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键（唯一，如 batch_rate_limit_quota_grant）',
  \`config_value\` json NOT NULL COMMENT '配置值JSON（支持复杂配置结构）',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置说明（便于运营人员理解配置用途）',
  \`config_category\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general' COMMENT '配置分类：batch_operation=批量操作 | rate_limit=限流 | feature=功能开关 | general=通用',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用：true=启用 | false=禁用',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (\`system_config_id\`),
  UNIQUE KEY \`config_key\` (\`config_key\`),
  UNIQUE KEY \`idx_system_configs_key\` (\`config_key\`),
  KEY \`idx_system_configs_category_active\` (\`config_category\`,\`is_active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表 - 可动态调整的系统参数（阶段C核心基础设施）';`, { transaction });

      // [93/106] system_dictionaries
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_dictionaries\` (
  \`system_dictionary_id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`dict_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典类型（如：order_status, user_status）',
  \`dict_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典编码（英文值，如：pending, completed）',
  \`dict_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典名称（中文显示值）',
  \`dict_color\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '前端显示颜色（如：bg-success, bg-warning）',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序（同类型内排序）',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（0禁用 1启用）',
  \`remark\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注说明',
  \`version\` int unsigned NOT NULL DEFAULT '1' COMMENT '版本号（每次修改+1）',
  \`updated_by\` int unsigned DEFAULT NULL COMMENT '最后修改人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`system_dictionary_id\`),
  UNIQUE KEY \`uk_type_code\` (\`dict_type\`,\`dict_code\`),
  KEY \`idx_type\` (\`dict_type\`),
  KEY \`idx_enabled\` (\`is_enabled\`),
  KEY \`idx_version\` (\`version\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统字典表 - 存储各类枚举的中文显示名称映射';`, { transaction });

      // [94/106] system_dictionary_history
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_dictionary_history\` (
  \`system_dictionary_history_id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`system_dictionary_id\` int unsigned NOT NULL,
  \`dict_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典类型',
  \`dict_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典编码',
  \`dict_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '修改前的中文名称',
  \`dict_color\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '修改前的颜色',
  \`version\` int unsigned NOT NULL COMMENT '版本号',
  \`changed_by\` int unsigned NOT NULL COMMENT '修改人ID',
  \`changed_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改时间',
  \`change_reason\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '修改原因',
  PRIMARY KEY (\`system_dictionary_history_id\`),
  KEY \`idx_dict_id\` (\`system_dictionary_id\`),
  KEY \`idx_dict_version\` (\`system_dictionary_id\`,\`version\`),
  KEY \`idx_changed_at\` (\`changed_at\`),
  CONSTRAINT \`fk_dict_history_dict\` FOREIGN KEY (\`system_dictionary_id\`) REFERENCES \`system_dictionaries\` (\`system_dictionary_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统字典历史表 - 支持版本回滚';`, { transaction });

      // [95/106] system_settings
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_settings\` (
  \`system_setting_id\` int NOT NULL AUTO_INCREMENT,
  \`category\` enum('basic','points','notification','security','marketplace','redemption') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置分类：basic-基础设置，points-积分设置，notification-通知设置，security-安全设置，marketplace-市场设置，redemption-核销设置',
  \`setting_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置键名（唯一，如system_name、base_win_rate等）',
  \`setting_value\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置值（根据value_type解析）',
  \`value_type\` enum('string','number','boolean','json') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'string' COMMENT '值类型：string-字符串，number-数字，boolean-布尔值，json-JSON对象',
  \`description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置描述（说明此配置项的用途）',
  \`is_visible\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否在管理后台显示',
  \`is_readonly\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否只读（不可通过管理后台修改）',
  \`updated_by\` int DEFAULT NULL COMMENT '最后更新管理员ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`system_setting_id\`),
  UNIQUE KEY \`setting_key\` (\`setting_key\`),
  UNIQUE KEY \`idx_setting_key\` (\`setting_key\`) USING BTREE,
  KEY \`idx_category\` (\`category\`) USING BTREE,
  KEY \`idx_category_visible\` (\`category\`,\`is_visible\`) USING BTREE,
  KEY \`idx_updated_by\` (\`updated_by\`,\`updated_at\`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表：存储系统各模块的配置设置';`, { transaction });

      // [96/106] trade_orders
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`trade_orders\` (
  \`trade_order_id\` bigint NOT NULL AUTO_INCREMENT,
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`business_id\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务唯一键（格式：trade_order_{buyer_id}_{listing_id}_{timestamp}）- 必填',
  \`market_listing_id\` bigint NOT NULL,
  \`buyer_user_id\` int NOT NULL COMMENT '买家用户ID（Buyer User ID）：购买方用户，外键关联 users.user_id',
  \`seller_user_id\` int NOT NULL COMMENT '卖家用户ID（Seller User ID）：出售方用户，外键关联 users.user_id',
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DIAMOND' COMMENT '结算资产代码（Asset Code）：交易市场结算币种，固定为 DIAMOND；业务规则：前端和后端都强制校验只允许 DIAMOND',
  \`gross_amount\` bigint NOT NULL COMMENT '买家支付总额（Gross Amount）：买家本次交易支付的总金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 fee_amount + net_amount',
  \`fee_amount\` bigint NOT NULL DEFAULT '0' COMMENT '平台手续费（Fee Amount）：从成交总额中拆分的平台手续费，单位为 asset_code（DIAMOND）；业务规则：≥0，手续费入系统账户 SYSTEM_PLATFORM_FEE',
  \`net_amount\` bigint NOT NULL COMMENT '卖家实收金额（Net Amount）：卖家实际收到的金额，单位为 asset_code（DIAMOND）；业务规则：必须 >0，等于 gross_amount - fee_amount',
  \`status\` enum('created','frozen','completed','cancelled','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'created' COMMENT '订单状态（Status）：created-已创建（订单初始状态）| frozen-已冻结（买家资产已冻结，等待结算）| completed-已完成（成交完成，终态）| cancelled-已取消（订单取消，解冻买家资产，终态）| failed-失败（不可恢复错误，终态）；业务规则：created → frozen → completed/cancelled/failed',
  \`meta\` json DEFAULT NULL COMMENT '订单元数据（Meta）：保存关键请求参数指纹和扩展信息，用于 409 冲突保护和数据审计；示例：{ product_id, product_name, request_params_hash }',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（Created At）：订单创建的北京时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（Updated At）：订单最后更新的北京时间',
  \`completed_at\` datetime DEFAULT NULL COMMENT '完成时间（Completed At）：订单完成的北京时间，status=completed 时必填',
  \`cancelled_at\` datetime DEFAULT NULL COMMENT '取消时间（Cancelled At）：订单取消的北京时间，status=cancelled 时必填',
  PRIMARY KEY (\`trade_order_id\`),
  UNIQUE KEY \`uk_trade_orders_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_trade_orders_business_id\` (\`business_id\`),
  KEY \`idx_trade_orders_listing_id\` (\`market_listing_id\`),
  KEY \`idx_trade_orders_buyer_user_id\` (\`buyer_user_id\`),
  KEY \`idx_trade_orders_seller_user_id\` (\`seller_user_id\`),
  KEY \`idx_trade_orders_status\` (\`status\`),
  KEY \`idx_trade_orders_created_at\` (\`created_at\`),
  KEY \`idx_trade_orders_asset_code_status\` (\`asset_code\`,\`status\`),
  CONSTRAINT \`fk_trade_orders_listing\` FOREIGN KEY (\`market_listing_id\`) REFERENCES \`market_listings\` (\`market_listing_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`trade_orders_ibfk_2\` FOREIGN KEY (\`buyer_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`trade_orders_ibfk_3\` FOREIGN KEY (\`seller_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [97/106] user_ad_tags
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_ad_tags\` (
  \`user_ad_tag_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '用户标签主键',
  \`user_id\` int NOT NULL COMMENT '用户 ID',
  \`tag_key\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签键（如 lottery_active_7d / diamond_balance / new_user）',
  \`tag_value\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签值（如 true / false / 数字字符串）',
  \`calculated_at\` datetime NOT NULL COMMENT '标签计算时间（凌晨3点定时任务写入）',
  PRIMARY KEY (\`user_ad_tag_id\`),
  UNIQUE KEY \`uk_uat_user_tag\` (\`user_id\`,\`tag_key\`),
  KEY \`idx_uat_tag\` (\`tag_key\`,\`tag_value\`),
  CONSTRAINT \`user_ad_tags_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为标签表 — Phase 5 DMP 人群定向';`, { transaction });

      // [98/106] user_behavior_tracks
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_behavior_tracks\` (
  \`user_behavior_track_id\` bigint NOT NULL,
  \`user_id\` int NOT NULL COMMENT '用户ID',
  \`behavior_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '行为类型（如 login, lottery_draw, consumption, exchange, purchase）',
  \`behavior_action\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '行为动作（如 create, submit, complete, cancel）',
  \`behavior_target\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '行为目标类型（如 lottery_campaign, product, item_instance）',
  \`behavior_target_id\` bigint DEFAULT NULL COMMENT '行为目标ID',
  \`behavior_data\` json DEFAULT NULL COMMENT '行为详情数据（如抽奖结果、消费金额、兑换商品等）',
  \`behavior_result\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '行为结果（如 success, failed, pending）',
  \`behavior_session_id\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户行为会话ID（关联同一次会话内的多个行为记录）',
  \`device_info\` json DEFAULT NULL COMMENT '设备信息（如 {"platform": "wechat", "device": "iPhone"}）',
  \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址',
  \`behavior_time\` datetime NOT NULL COMMENT '行为发生时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`user_behavior_track_id\`),
  KEY \`idx_behavior_tracks_user\` (\`user_id\`),
  KEY \`idx_behavior_tracks_type\` (\`behavior_type\`),
  KEY \`idx_behavior_tracks_time\` (\`behavior_time\`),
  KEY \`idx_behavior_tracks_user_type\` (\`user_id\`,\`behavior_type\`),
  KEY \`idx_behavior_tracks_session\` (\`behavior_session_id\`),
  CONSTRAINT \`user_behavior_tracks_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为轨迹表（记录用户关键行为，用于轨迹分析）';`, { transaction });

      // [99/106] user_hierarchy
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_hierarchy\` (
  \`user_hierarchy_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（当前用户）',
  \`superior_user_id\` int DEFAULT NULL COMMENT '上级用户ID（NULL表示顶级区域负责人）',
  \`role_id\` int NOT NULL COMMENT '当前角色ID（关联roles表）',
  \`store_id\` int DEFAULT NULL COMMENT '所属门店ID（仅业务员有值，业务经理和区域负责人为NULL）',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '层级关系是否有效（1=激活，0=已停用）',
  \`activated_at\` datetime DEFAULT NULL COMMENT '激活时间（首次激活或重新激活时记录），时区：北京时间（GMT+8）',
  \`deactivated_at\` datetime DEFAULT NULL COMMENT '停用时间（停用时记录），时区：北京时间（GMT+8）',
  \`deactivated_by\` int DEFAULT NULL COMMENT '停用操作人ID（谁停用的？外键关联users.user_id）',
  \`deactivation_reason\` text COLLATE utf8mb4_unicode_ci COMMENT '停用原因（如：离职、调动、违规等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，时区：北京时间（GMT+8）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，时区：北京时间（GMT+8）',
  PRIMARY KEY (\`user_hierarchy_id\`),
  UNIQUE KEY \`uk_user_role\` (\`user_id\`,\`role_id\`),
  KEY \`idx_user_hierarchy_superior\` (\`superior_user_id\`),
  KEY \`idx_user_hierarchy_active\` (\`is_active\`),
  KEY \`fk_user_hierarchy_role\` (\`role_id\`),
  KEY \`fk_user_hierarchy_store\` (\`store_id\`),
  KEY \`fk_user_hierarchy_deactivator\` (\`deactivated_by\`),
  CONSTRAINT \`fk_user_hierarchy_deactivator\` FOREIGN KEY (\`deactivated_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_hierarchy_role\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`role_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_hierarchy_store\` FOREIGN KEY (\`store_id\`) REFERENCES \`stores\` (\`store_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_hierarchy_superior\` FOREIGN KEY (\`superior_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_hierarchy_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户层级关系表（简化版：仅保留核心字段和必要索引）';`, { transaction });

      // [100/106] user_notifications
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_notifications\` (
  \`notification_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '通知ID（主键）',
  \`user_id\` int NOT NULL COMMENT '接收用户ID',
  \`type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知类型（如 listing_created, purchase_completed, lottery_win 等）',
  \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知标题（如 "? 挂牌成功"）',
  \`content\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '通知正文',
  \`metadata\` json DEFAULT NULL COMMENT '附加业务数据（JSON，按通知类型存储不同业务上下文）',
  \`is_read\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '已读标记（0=未读，1=已读）',
  \`read_at\` datetime DEFAULT NULL COMMENT '已读时间',
  \`wx_push_status\` enum('skipped','pending','sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'skipped' COMMENT '微信订阅消息推送状态（预留，暂不启用）',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (\`notification_id\`),
  KEY \`idx_user_notifications_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`idx_user_notifications_user_unread\` (\`user_id\`,\`is_read\`),
  KEY \`idx_user_notifications_type\` (\`type\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户通知表 — 系统通知独立存储（方案B），永久保留交易凭证';`, { transaction });

      // [101/106] user_premium_status
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_premium_status\` (
  \`user_premium_status_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（关联users表，唯一约束确保一个用户只有一条记录，用于查询用户解锁状态）',
  \`is_unlocked\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已解锁高级空间（当前状态，TRUE=已解锁且在有效期内，FALSE=未解锁或已过期，用于前端权限判断）',
  \`unlock_time\` datetime DEFAULT NULL COMMENT '最近一次解锁时间（北京时间，每次解锁时更新，用于计算过期时间和运营分析）',
  \`unlock_method\` enum('points','exchange','vip','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'points' COMMENT '解锁方式（points=积分解锁100分，exchange=兑换码解锁，vip=VIP会员解锁，manual=管理员手动解锁，扩展性预留字段）',
  \`total_unlock_count\` int NOT NULL DEFAULT '0' COMMENT '累计解锁次数（包括首次解锁和重新解锁，每次解锁+1，用于运营分析用户活跃度和付费意愿）',
  \`expires_at\` datetime DEFAULT NULL COMMENT '过期时间（24小时有效期，unlock_time + 24小时，NULL表示未解锁或已过期，用于判断是否需要重新解锁，查询时WHERE expires_at > NOW()）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（首次解锁时间，永不更新，用于历史追溯和用户分析）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（每次解锁时自动更新，MySQL自动维护，用于追踪最后修改时间）',
  PRIMARY KEY (\`user_premium_status_id\`),
  UNIQUE KEY \`idx_user_id\` (\`user_id\`),
  KEY \`idx_is_unlocked\` (\`is_unlocked\`),
  KEY \`idx_expires_at\` (\`expires_at\`),
  CONSTRAINT \`fk_ups_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）';`, { transaction });

      // [102/106] user_risk_profiles
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_risk_profiles\` (
  \`user_risk_profile_id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int DEFAULT NULL COMMENT '用户ID（NULL 表示等级默认配置）',
  \`user_level\` enum('normal','vip','merchant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '用户等级（normal/vip/merchant）',
  \`config_type\` enum('user','level') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'level' COMMENT '配置类型（user-用户个人配置，level-等级默认配置）',
  \`thresholds\` json NOT NULL COMMENT 'JSON格式的风控阈值配置（按币种分组）',
  \`is_frozen\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '账户是否冻结（true-冻结，禁止所有交易）',
  \`frozen_reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '冻结原因（is_frozen=true 时必填）',
  \`frozen_at\` datetime DEFAULT NULL COMMENT '冻结时间',
  \`frozen_by\` int DEFAULT NULL COMMENT '冻结操作人ID（管理员）',
  \`remarks\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置备注',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`user_risk_profile_id\`),
  UNIQUE KEY \`uk_user_risk_profiles_user_config\` (\`user_id\`,\`config_type\`),
  KEY \`frozen_by\` (\`frozen_by\`),
  KEY \`idx_user_risk_profiles_user_id\` (\`user_id\`),
  KEY \`idx_user_risk_profiles_level_type\` (\`user_level\`,\`config_type\`),
  KEY \`idx_user_risk_profiles_is_frozen\` (\`is_frozen\`),
  CONSTRAINT \`user_risk_profiles_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`user_risk_profiles_ibfk_2\` FOREIGN KEY (\`frozen_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户风控配置表：存储用户等级默认配置和个人自定义配置';`, { transaction });

      // [103/106] user_role_change_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_role_change_records\` (
  \`user_role_change_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '被变更角色的用户ID',
  \`operator_id\` int NOT NULL COMMENT '执行变更的操作员ID',
  \`old_role\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变更前角色名（如 user、admin、merchant 等）',
  \`new_role\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变更后角色名（如 user、admin、merchant 等）',
  \`reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '角色变更原因（管理员备注）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（格式：role_change_{user_id}_{new_role}_{operator_id}_{timestamp}）',
  \`metadata\` json DEFAULT NULL COMMENT '额外元数据（IP地址、用户代理等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`user_role_change_record_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_urcr_user_id\` (\`user_id\`),
  KEY \`idx_urcr_operator_id\` (\`operator_id\`),
  KEY \`idx_urcr_created_at\` (\`created_at\`),
  CONSTRAINT \`user_role_change_records_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`user_role_change_records_ibfk_2\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色变更记录表（为审计日志提供业务主键）';`, { transaction });

      // [104/106] user_roles
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_roles\` (
  \`user_role_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL,
  \`role_id\` int NOT NULL,
  \`assigned_at\` datetime DEFAULT CURRENT_TIMESTAMP,
  \`assigned_by\` int DEFAULT NULL,
  \`is_active\` tinyint(1) DEFAULT '1',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`user_role_id\`),
  UNIQUE KEY \`user_role_unique\` (\`user_id\`,\`role_id\`),
  KEY \`idx_user_id\` (\`user_id\`),
  KEY \`idx_role_id\` (\`role_id\`),
  KEY \`idx_is_active\` (\`is_active\`),
  CONSTRAINT \`fk_user_roles_role_id\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\` (\`role_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_user_roles_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`, { transaction });

      // [105/106] user_status_change_records
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`user_status_change_records\` (
  \`user_status_change_record_id\` bigint NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '被变更状态的用户ID',
  \`operator_id\` int NOT NULL COMMENT '执行变更的操作员ID',
  \`old_status\` enum('active','inactive','banned','pending') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变更前状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活',
  \`new_status\` enum('active','inactive','banned','pending') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '变更后状态：active=活跃/inactive=禁用/banned=封禁/pending=待激活',
  \`reason\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '状态变更原因（管理员备注）',
  \`idempotency_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '幂等键（格式：status_change_{user_id}_{timestamp}_{operator_id}）',
  \`metadata\` json DEFAULT NULL COMMENT '额外元数据（IP地址、用户代理等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (\`user_status_change_record_id\`),
  UNIQUE KEY \`idempotency_key\` (\`idempotency_key\`),
  KEY \`idx_uscr_user_id\` (\`user_id\`),
  KEY \`idx_uscr_operator_id\` (\`operator_id\`),
  KEY \`idx_uscr_created_at\` (\`created_at\`),
  CONSTRAINT \`user_status_change_records_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`user_status_change_records_ibfk_2\` FOREIGN KEY (\`operator_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户状态变更记录表（为审计日志提供业务主键）';`, { transaction });

      // [106/106] websocket_startup_logs
      await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`websocket_startup_logs\` (
  \`websocket_startup_log_id\` bigint NOT NULL AUTO_INCREMENT,
  \`start_time\` datetime NOT NULL COMMENT '服务启动时间（北京时间）',
  \`process_id\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '进程ID（process.pid）',
  \`server_ip\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '服务器IP地址',
  \`server_hostname\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '服务器主机名',
  \`status\` enum('running','stopped','crashed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running' COMMENT '服务状态：running-运行中，stopped-正常停止，crashed-异常崩溃',
  \`stop_time\` datetime DEFAULT NULL COMMENT '服务停止时间（北京时间）',
  \`stop_reason\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '停止原因（如：部署、重启、崩溃等）',
  \`uptime_seconds\` int DEFAULT NULL COMMENT '运行时长（秒），stop_time - start_time',
  \`peak_connections\` int NOT NULL DEFAULT '0' COMMENT '峰值连接数（服务运行期间的最大连接数）',
  \`total_messages\` bigint NOT NULL DEFAULT '0' COMMENT '总消息数（服务运行期间的总消息数）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间（北京时间）',
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间（服务停止时更新）',
  PRIMARY KEY (\`websocket_startup_log_id\`),
  KEY \`idx_start_time\` (\`start_time\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_created_at\` (\`created_at\`),
  KEY \`idx_process_id\` (\`process_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WebSocket服务启动日志表（记录所有启动/停止事件）';`, { transaction });

      await transaction.commit();
      console.log('[baseline-v4] All 106 tables created successfully.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });

      const tables = [
        'websocket_startup_logs',
        'user_status_change_records',
        'user_roles',
        'user_role_change_records',
        'user_risk_profiles',
        'user_premium_status',
        'user_notifications',
        'user_hierarchy',
        'user_behavior_tracks',
        'user_ad_tags',
        'trade_orders',
        'system_settings',
        'system_dictionary_history',
        'system_dictionaries',
        'system_configs',
        'segment_rule_configs',
        'roles',
        'risk_alerts',
        'report_templates',
        'reminder_history',
        'reminder_rules',
        'redemption_orders',
        'store_staff',
        'preset_inventory_debt',
        'preset_debt_limits',
        'preset_budget_debt',
        'merchant_operation_logs',
        'material_conversion_rules',
        'material_asset_types',
        'market_price_snapshots',
        'market_listings',
        'lottery_user_global_state',
        'lottery_user_experience_state',
        'lottery_user_daily_draw_quota',
        'lottery_tier_rules',
        'lottery_tier_matrix_config',
        'lottery_strategy_config',
        'lottery_simulation_records',
        'lottery_presets',
        'lottery_management_settings',
        'lottery_hourly_metrics',
        'lottery_draws',
        'lottery_prizes',
        'lottery_draw_quota_rules',
        'lottery_draw_decisions',
        'lottery_daily_metrics',
        'lottery_clear_setting_records',
        'lottery_campaign_user_quota',
        'lottery_campaign_quota_grants',
        'lottery_campaign_pricing_config',
        'lottery_alerts',
        'lottery_campaigns',
        'item_templates',
        'rarity_defs',
        'item_ledger',
        'item_instances_legacy',
        'item_instance_events_legacy',
        'item_holds',
        'items',
        'feedbacks',
        'feature_flags',
        'exchange_records',
        'exchange_rates',
        'customer_service_user_assignments',
        'customer_service_notes',
        'customer_service_agents',
        'content_review_records',
        'consumption_records',
        'stores',
        'merchants',
        'chat_messages',
        'customer_service_sessions',
        'customer_service_issues',
        'category_defs',
        'bid_records',
        'bid_products',
        'exchange_items',
        'image_resources',
        'batch_operation_logs',
        'authentication_sessions',
        'asset_transactions',
        'asset_group_defs',
        'api_idempotency_requests',
        'alert_silence_rules',
        'administrative_regions',
        'admin_operation_logs',
        'admin_notifications',
        'ad_zone_group_members',
        'ad_zone_groups',
        'ad_report_daily_snapshots',
        'ad_price_adjustment_logs',
        'ad_interaction_logs',
        'ad_impression_logs',
        'ad_dau_daily_stats',
        'ad_creatives',
        'ad_billing_records',
        'ad_bid_logs',
        'ad_attribution_logs',
        'ad_click_logs',
        'ad_campaigns',
        'ad_slots',
        'ad_target_zones',
        'ad_antifraud_logs',
        'account_asset_balances',
        'accounts',
        'users',
      ];

      for (const table of tables) {
        await queryInterface.sequelize.query('DROP TABLE IF EXISTS `' + table + '`', { transaction });
      }

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });

      await transaction.commit();
      console.log('[baseline-v4] All tables dropped successfully.');
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
