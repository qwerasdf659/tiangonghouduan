/**
 * Baseline V3.0.0 - 从生产数据库 squash 生成
 *
 * 此迁移文件由 generate_baseline_migration.js 自动生成
 * 基于 restaurant_points_dev 数据库的真实 schema
 *
 * 包含 77 张业务表的完整定义
 * 使用 CREATE TABLE IF NOT EXISTS（幂等安全）
 *
 * 生成时间：2026-02-06T12:16:45.400+08:00
 * 替代：旧 baseline-v2.0.0（6258行）+ 114个增量迁移
 */

'use strict'

module.exports = {
  /**
   * 创建所有业务表（幂等 - 已存在的表不会被影响）
   */
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 Baseline V3.0.0: 开始创建 77 张业务表...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
    // 1/77 users
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
  PRIMARY KEY (\`user_id\`),
  UNIQUE KEY \`mobile\` (\`mobile\`),
  UNIQUE KEY \`idx_users_user_uuid_unique\` (\`user_uuid\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`users_last_login\` (\`last_login\`),
  KEY \`users_history_total_points\` (\`history_total_points\`),
  KEY \`idx_users_user_level\` (\`user_level\`),
  KEY \`idx_users_last_active_at\` (\`last_active_at\`)
) ENGINE=InnoDB AUTO_INCREMENT=11488 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 2/77 accounts
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
) ENGINE=InnoDB AUTO_INCREMENT=174 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户表（统一用户账户与系统账户）'`, { transaction });

    // 3/77 account_asset_balances
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
) ENGINE=InnoDB AUTO_INCREMENT=195 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户资产余额表（可用余额 + 冻结余额）'`, { transaction });

    // 4/77 admin_notifications
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员通知消息表 - 存储系统通知、告警提醒、任务通知等'`, { transaction });

    // 5/77 admin_operation_logs
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`admin_operation_logs\` (
  \`admin_operation_log_id\` bigint NOT NULL AUTO_INCREMENT,
  \`operator_id\` int NOT NULL COMMENT '操作员ID（管理员user_id）',
  \`operation_type\` enum('points_adjust','asset_adjustment','asset_orphan_cleanup','exchange_audit','product_update','product_create','product_delete','user_status_change','role_assign','role_change','role_create','role_update','role_delete','prize_config','prize_create','prize_delete','prize_stock_adjust','campaign_config','lottery_force_win','lottery_force_lose','lottery_probability_adjust','lottery_user_queue','lottery_clear_settings','inventory_operation','inventory_transfer','market_listing_admin_withdraw','system_config','session_assign','consumption_audit','feature_flag_create','feature_flag_update','feature_flag_delete','feature_flag_toggle','staff_permanent_delete') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型：积分调整、资产调整、产品管理、用户管理、角色管理（含创建/更新/删除）、奖品管理、活动管理、抽奖配置、库存操作、市场管理、系统配置、会话分配、消费审核、功能开关管理、员工删除',
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
) ENGINE=InnoDB AUTO_INCREMENT=5608 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作审计日志表（记录所有敏感操作）'`, { transaction });

    // 6/77 administrative_regions
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='行政区划字典表（省市区街道数据，支持级联选择）'`, { transaction });

    // 7/77 alert_silence_rules
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警静默规则表（运营后台优化 DB-2）'`, { transaction });

    // 8/77 api_idempotency_requests
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
) ENGINE=InnoDB AUTO_INCREMENT=1764272 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API入口幂等表 - 实现重试返回首次结果'`, { transaction });

    // 9/77 asset_group_defs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产分组字典表（Asset Group Definitions - 可交易资产分组定义）'`, { transaction });

    // 10/77 asset_transactions
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`asset_transactions\` (
  \`asset_transaction_id\` bigint NOT NULL AUTO_INCREMENT,
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code - 资产类型标识）：DIAMOND-钻石资产, red_shard-碎红水晶, 等',
  \`delta_amount\` bigint NOT NULL COMMENT '变动金额（Delta Amount - 资产变动数量，正数表示增加，负数表示扣减，单位：1个资产单位）',
  \`balance_after\` bigint NOT NULL COMMENT '变动后余额（Balance After - 本次变动后的资产余额，用于快速查询和对账）',
  \`business_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务类型（Business Type - 业务场景分类）：market_purchase_buyer_debit-市场购买买家扣减, market_purchase_seller_credit-市场购买卖家入账, market_purchase_platform_fee_credit-市场购买平台手续费, exchange_debit-兑换扣减, material_convert_debit-材料转换扣减, material_convert_credit-材料转换入账',
  \`meta\` json DEFAULT NULL COMMENT '扩展信息（Meta - JSON格式存储业务扩展信息）：如order_no, item_id, conversion_rule等，用于业务追溯和审计',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间，数据库内部存储UTC）',
  \`account_id\` bigint NOT NULL COMMENT '账户ID（外键：accounts.account_id）',
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
  CONSTRAINT \`asset_transactions_account_id_foreign_idx\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`account_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=36829 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产流水表（Asset Transactions）- 记录所有资产变动流水，支持幂等性控制和审计追溯'`, { transaction });

    // 11/77 authentication_sessions
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`authentication_sessions\` (
  \`authentication_session_id\` bigint NOT NULL AUTO_INCREMENT,
  \`session_token\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '会话令牌（JWT Token的jti）',
  \`user_type\` enum('user','admin') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户类型',
  \`user_id\` int NOT NULL,
  \`login_ip\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '登录IP',
  \`is_active\` tinyint(1) DEFAULT '1' COMMENT '是否活跃',
  \`last_activity\` datetime NOT NULL COMMENT '最后活动时间',
  \`expires_at\` datetime NOT NULL COMMENT '过期时间',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  PRIMARY KEY (\`authentication_session_id\`),
  UNIQUE KEY \`session_token\` (\`session_token\`),
  KEY \`idx_user_sessions_user_active\` (\`user_type\`,\`user_id\`,\`is_active\`),
  KEY \`idx_user_sessions_expires\` (\`expires_at\`,\`is_active\`),
  KEY \`idx_user_sessions_user_created\` (\`user_id\`,\`created_at\`),
  KEY \`user_sessions_last_activity\` (\`last_activity\`),
  CONSTRAINT \`authentication_sessions_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6032 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话管理表'`, { transaction });

    // 12/77 batch_operation_logs
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
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='批量操作日志表 - 幂等性控制与操作审计（阶段C核心基础设施）'`, { transaction });

    // 13/77 category_defs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品类目字典表（Category Definitions - 商品/物品分类定义）'`, { transaction });

    // 14/77 customer_service_sessions
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
  PRIMARY KEY (\`customer_service_session_id\`),
  UNIQUE KEY \`idx_user_active_session\` (\`user_id\`,\`is_active_session\`),
  KEY \`idx_customer_sessions_user_id\` (\`user_id\`),
  KEY \`idx_customer_sessions_admin_id\` (\`admin_id\`),
  KEY \`idx_customer_sessions_status\` (\`status\`),
  KEY \`idx_customer_sessions_created_at\` (\`created_at\`),
  KEY \`idx_closed_by\` (\`closed_by\`),
  KEY \`idx_css_status_created_at\` (\`status\`,\`created_at\`),
  KEY \`idx_css_admin_status\` (\`admin_id\`,\`status\`),
  CONSTRAINT \`fk_customer_sessions_admin_id\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`fk_customer_sessions_closed_by\` FOREIGN KEY (\`closed_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_customer_sessions_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1870 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户聊天会话表'`, { transaction });

    // 15/77 chat_messages
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
) ENGINE=InnoDB AUTO_INCREMENT=18411 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表'`, { transaction });

    // 16/77 stores
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
  CONSTRAINT \`fk_store_merchant\` FOREIGN KEY (\`merchant_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=138 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店信息表（用于记录合作商家门店，业务员分派依据）'`, { transaction });

    // 17/77 consumption_records
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
) ENGINE=InnoDB AUTO_INCREMENT=2160 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消费记录表 - 记录用户通过商家扫码提交的消费信息'`, { transaction });

    // 18/77 content_review_records
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
) ENGINE=InnoDB AUTO_INCREMENT=4591 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 19/77 image_resources
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
  PRIMARY KEY (\`image_resource_id\`),
  UNIQUE KEY \`upload_id\` (\`upload_id\`),
  KEY \`idx_business_category\` (\`business_type\`,\`category\`),
  KEY \`idx_user_business\` (\`user_id\`,\`business_type\`,\`status\`),
  KEY \`idx_context_category\` (\`context_id\`,\`category\`,\`status\`),
  KEY \`idx_created_status\` (\`created_at\`,\`status\`),
  CONSTRAINT \`fk_image_resources_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一图片资源管理表'`, { transaction });

    // 20/77 exchange_items
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
  PRIMARY KEY (\`exchange_item_id\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_category\` (\`category\`),
  KEY \`idx_exchange_items_primary_image_id\` (\`primary_image_id\`),
  CONSTRAINT \`fk_exchange_items_primary_image\` FOREIGN KEY (\`primary_image_id\`) REFERENCES \`image_resources\` (\`image_resource_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=934 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换市场商品表'`, { transaction });

    // 21/77 exchange_records
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
  \`status\` enum('pending','completed','shipped','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '订单状态',
  \`admin_remark\` text COLLATE utf8mb4_unicode_ci COMMENT '管理员备注（管理员操作订单时的备注信息）',
  \`exchange_time\` datetime DEFAULT NULL COMMENT '兑换时间（记录实际兑换时刻，北京时间）',
  \`shipped_at\` datetime DEFAULT NULL COMMENT '发货时间',
  \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  \`pay_asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '实际支付资产代码（材料资产支付）',
  \`pay_amount\` bigint NOT NULL COMMENT '实际支付数量（材料资产支付）',
  PRIMARY KEY (\`exchange_record_id\`),
  UNIQUE KEY \`order_no\` (\`order_no\`),
  UNIQUE KEY \`uk_order_no\` (\`order_no\`),
  UNIQUE KEY \`uk_exchange_records_idempotency_key\` (\`idempotency_key\`),
  UNIQUE KEY \`uk_exchange_records_business_id\` (\`business_id\`),
  KEY \`idx_user_id\` (\`user_id\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_created_at\` (\`created_at\`),
  KEY \`idx_exchange_records_debit_tx_id\` (\`debit_transaction_id\`),
  KEY \`fk_exchange_records_item\` (\`exchange_item_id\`),
  CONSTRAINT \`exchange_records_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT,
  CONSTRAINT \`fk_exchange_records_item\` FOREIGN KEY (\`exchange_item_id\`) REFERENCES \`exchange_items\` (\`exchange_item_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2657 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换市场记录表'`, { transaction });

    // 22/77 feature_flags
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
) ENGINE=InnoDB AUTO_INCREMENT=1580 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='功能开关表（Feature Flag）- 全系统通用灰度发布控制'`, { transaction });

    // 23/77 feedbacks
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
) ENGINE=InnoDB AUTO_INCREMENT=167 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户反馈表 - 支持客服反馈功能'`, { transaction });

    // 24/77 item_instances
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_instances\` (
  \`item_instance_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '物品实例ID（自增主键）',
  \`owner_user_id\` int NOT NULL COMMENT '所有者用户ID（所有权真相，关联 users.user_id）',
  \`item_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物品类型（如 voucher/product/service/equipment/card）',
  \`item_template_id\` bigint DEFAULT NULL COMMENT '物品模板ID（可选，关联物品模板表或奖品表）',
  \`status\` enum('available','locked','transferred','used','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available' COMMENT '物品状态（available=可用/locked=锁定中/transferred=已转移/used=已使用/expired=已过期）',
  \`meta\` json DEFAULT NULL COMMENT '物品元数据（JSON格式，包含：name/description/icon/value/attributes/serial_number等）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间存储）',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间存储）',
  \`locks\` json DEFAULT NULL COMMENT '锁定记录数组。格式: [{lock_type, lock_id, locked_at, expires_at, auto_release, reason}]。lock_type: trade/redemption/security',
  PRIMARY KEY (\`item_instance_id\`),
  KEY \`idx_item_instances_owner_user_id\` (\`owner_user_id\`),
  KEY \`idx_item_instances_status\` (\`status\`),
  KEY \`idx_item_instances_type_template\` (\`item_type\`,\`item_template_id\`),
  KEY \`idx_item_instances_owner_status_created\` (\`owner_user_id\`,\`status\`,\`created_at\` DESC),
  CONSTRAINT \`fk_item_instances_owner_user_id\` FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27667 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品实例表（不可叠加物品所有权真相）'`, { transaction });

    // 25/77 item_instance_events
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_instance_events\` (
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
  KEY \`idx_item_instance_events_operator_time\` (\`operator_user_id\`,\`created_at\`),
  CONSTRAINT \`item_instance_events_ibfk_1\` FOREIGN KEY (\`item_instance_id\`) REFERENCES \`item_instances\` (\`item_instance_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6132 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品实例事件表（记录所有物品变更事件）'`, { transaction });

    // 26/77 rarity_defs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='稀有度字典表（Rarity Definitions - 物品稀有度等级定义）'`, { transaction });

    // 27/77 item_templates
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`item_templates\` (
  \`item_template_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '物品模板ID（主键）',
  \`template_code\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板代码（唯一业务标识）：如 prize_iphone_15_pro',
  \`item_type\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型：对应 item_instances.item_type',
  \`category_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类目代码（外键 → category_defs.category_code）',
  \`rarity_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '稀有度代码（外键 → rarity_defs.rarity_code）',
  \`display_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '物品描述',
  \`image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物品图片URL',
  \`thumbnail_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '缩略图URL',
  \`reference_price_points\` decimal(10,2) DEFAULT '0.00' COMMENT '参考价格（积分）：用于估值和建议定价',
  \`is_tradable\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否允许交易上架',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  \`meta\` json DEFAULT NULL COMMENT '扩展元数据（JSON格式）',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`item_template_id\`),
  UNIQUE KEY \`template_code\` (\`template_code\`),
  KEY \`idx_item_templates_item_type\` (\`item_type\`),
  KEY \`idx_item_templates_category_code\` (\`category_code\`),
  KEY \`idx_item_templates_rarity_code\` (\`rarity_code\`),
  KEY \`idx_item_templates_tradable_enabled\` (\`is_tradable\`,\`is_enabled\`),
  CONSTRAINT \`item_templates_ibfk_1\` FOREIGN KEY (\`category_code\`) REFERENCES \`category_defs\` (\`category_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`item_templates_ibfk_2\` FOREIGN KEY (\`rarity_code\`) REFERENCES \`rarity_defs\` (\`rarity_code\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品模板表（Item Templates - 不可叠加物品模板定义）'`, { transaction });

    // 28/77 lottery_campaigns
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_campaigns\` (
  \`lottery_campaign_id\` int NOT NULL AUTO_INCREMENT,
  \`campaign_name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动名称',
  \`campaign_code\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动代码(唯一)',
  \`campaign_type\` enum('daily','weekly','event','permanent','pool_basic','pool_advanced','pool_vip','pool_newbie') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '活动类型，新增池类型支持',
  \`cost_per_draw\` decimal(10,2) NOT NULL COMMENT '每次抽奖消耗积分',
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
  \`status\` enum('draft','active','paused','ended','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  \`budget_mode\` enum('user','pool','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '预算模式：user=用户预算账户扣减，pool=活动池预算扣减，none=不限制预算（测试用）',
  \`pick_method\` enum('normalize','fallback','tier_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tier_first' COMMENT '选奖方法：normalize-归一化, fallback-保底, tier_first-先选档位（推荐）',
  \`tier_fallback_lottery_prize_id\` int DEFAULT NULL COMMENT '档位保底奖品ID（所有档位无货时发放，外键关联 lottery_prizes.lottery_prize_id）',
  \`tier_weight_scale\` int unsigned NOT NULL DEFAULT '1000000' COMMENT '档位权重比例因子（默认1,000,000，所有档位权重之和必须等于此值）',
  \`segment_resolver_version\` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1' COMMENT '分层解析器配置版本号（如v1/v2），用于匹配config/segment_rules.js中的配置',
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
  \`fallback_lottery_prize_id\` int DEFAULT NULL COMMENT '兜底奖品ID（pick_method=fallback时使用，外键关联 lottery_prizes.lottery_prize_id）',
  \`preset_debt_enabled\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '预设是否允许欠账（核心开关）：TRUE-允许欠账发放，FALSE-资源不足直接失败',
  \`preset_budget_policy\` enum('follow_campaign','pool_first','user_first') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'follow_campaign' COMMENT '预设预算扣减策略：follow_campaign-遵循budget_mode(默认), pool_first-先pool后user, user_first-先user后pool',
  \`default_quota\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '默认用户配额（pool+quota模式按需初始化时使用）',
  \`quota_init_mode\` enum('on_demand','pre_allocated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'on_demand' COMMENT '配额初始化模式：on_demand-按需初始化(默认), pre_allocated-预分配',
  \`public_pool_remaining\` decimal(12,2) DEFAULT NULL COMMENT '公共池剩余预算（普通用户可用，预留池模式时使用）',
  \`reserved_pool_remaining\` decimal(12,2) DEFAULT NULL COMMENT '预留池剩余预算（白名单专用，预留池模式时使用）',
  \`max_budget_debt\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '该活动预算欠账上限（0=不限制，强烈不推荐）',
  \`max_inventory_debt_quantity\` int NOT NULL DEFAULT '0' COMMENT '该活动库存欠账总数量上限（0=不限制，强烈不推荐）',
  \`daily_budget_limit\` decimal(15,2) DEFAULT NULL COMMENT '每日预算上限（积分），NULL表示不限制每日预算',
  PRIMARY KEY (\`lottery_campaign_id\`),
  UNIQUE KEY \`campaign_code\` (\`campaign_code\`),
  KEY \`idx_campaign_type\` (\`campaign_type\`),
  KEY \`idx_time_range\` (\`start_time\`,\`end_time\`),
  KEY \`idx_cost_per_draw\` (\`cost_per_draw\`),
  KEY \`idx_lc_status\` (\`status\`),
  KEY \`idx_lottery_campaigns_status_time\` (\`status\`,\`start_time\`,\`end_time\`),
  KEY \`idx_lc_pool_type\` (\`campaign_type\`),
  KEY \`idx_campaigns_status\` (\`status\`),
  KEY \`idx_campaigns_time_range\` (\`start_time\`,\`end_time\`),
  KEY \`idx_campaigns_preset_debt\` (\`preset_debt_enabled\`),
  KEY \`idx_campaigns_budget_policy\` (\`preset_budget_policy\`),
  KEY \`idx_campaigns_fallback_prize\` (\`fallback_lottery_prize_id\`),
  KEY \`idx_campaigns_tier_fallback_prize\` (\`tier_fallback_lottery_prize_id\`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖活动配置表'`, { transaction });

    // 29/77 lottery_alerts
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_alerts\` (
  \`lottery_alert_id\` int NOT NULL AUTO_INCREMENT,
  \`lottery_campaign_id\` int NOT NULL,
  \`alert_type\` enum('win_rate','budget','inventory','user','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型：win_rate=中奖率异常 | budget=预算告警 | inventory=库存告警 | user=用户异常 | system=系统告警',
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖系统告警表 - 运营监控专用（独立于商家风控的 risk_alerts）'`, { transaction });

    // 30/77 lottery_campaign_pricing_config
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动级定价配置表（可版本化/可回滚/可定时生效）'`, { transaction });

    // 31/77 lottery_campaign_quota_grants
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='配额发放记录表 - 记录配额的发放来源和金额'`, { transaction });

    // 32/77 lottery_campaign_user_quota
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动配额表 - pool+quota模式下追踪用户预算配额'`, { transaction });

    // 33/77 lottery_clear_setting_records
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
) ENGINE=InnoDB AUTO_INCREMENT=986 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖清除设置记录表（为审计日志提供业务主键）'`, { transaction });

    // 34/77 lottery_daily_metrics
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖日报统计表（按日聚合，永久保留，用于长期历史分析）'`, { transaction });

    // 35/77 lottery_draw_decisions
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
) ENGINE=InnoDB AUTO_INCREMENT=1698 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计'`, { transaction });

    // 36/77 lottery_draw_quota_rules
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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 37/77 lottery_prizes
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_prizes\` (
  \`lottery_prize_id\` int NOT NULL AUTO_INCREMENT,
  \`prize_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '奖品名称（前端显示）',
  \`prize_type\` enum('points','coupon','physical','virtual','service','product','special') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '奖品类型（V4.0语义清理版 - 已移除empty）',
  \`prize_value\` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '奖品价值',
  \`angle\` int NOT NULL COMMENT '转盘角度（Canvas渲染位置，0-315度45度间隔）',
  \`color\` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#FF6B6B' COMMENT '转盘颜色（前端渲染，十六进制格式）',
  \`is_activity\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '特殊动效标记（差点中奖动画）',
  \`cost_points\` int NOT NULL DEFAULT '100' COMMENT '每次抽奖消耗积分',
  \`status\` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '奖品状态',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`lottery_campaign_id\` int DEFAULT '1',
  \`prize_description\` text COLLATE utf8mb4_unicode_ci COMMENT '奖品描述',
  \`image_resource_id\` int DEFAULT NULL,
  \`win_probability\` decimal(8,6) NOT NULL DEFAULT '0.100000' COMMENT '中奖概率',
  \`stock_quantity\` int NOT NULL DEFAULT '0' COMMENT '库存数量',
  \`max_daily_wins\` int DEFAULT NULL COMMENT '每日最大中奖次数',
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
  CONSTRAINT \`fk_lottery_prizes_campaign\` FOREIGN KEY (\`lottery_campaign_id\`) REFERENCES \`lottery_campaigns\` (\`lottery_campaign_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_lottery_prizes_image\` FOREIGN KEY (\`image_resource_id\`) REFERENCES \`image_resources\` (\`image_resource_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=135 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 38/77 lottery_draws
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 39/77 lottery_hourly_metrics
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
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖监控指标表（按小时聚合，用于监控和分析）'`, { transaction });

    // 40/77 lottery_management_settings
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
  PRIMARY KEY (\`lottery_management_setting_id\`),
  KEY \`idx_user_status\` (\`user_id\`,\`status\`),
  KEY \`idx_expires_at\` (\`expires_at\`),
  KEY \`idx_type_status\` (\`setting_type\`,\`status\`),
  KEY \`idx_created_by\` (\`created_by\`,\`created_at\`),
  KEY \`idx_user_type_status\` (\`user_id\`,\`setting_type\`,\`status\`),
  CONSTRAINT \`lottery_management_settings_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`lottery_management_settings_ibfk_2\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖管理设置表：存储管理员的抽奖干预设置（强制中奖、强制不中奖、概率调整、用户专属队列）'`, { transaction });

    // 41/77 lottery_presets
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖结果预设表（简化版）'`, { transaction });

    // 42/77 lottery_strategy_config
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_strategy_config\` (
  \`lottery_strategy_config_id\` int NOT NULL AUTO_INCREMENT,
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
  UNIQUE KEY \`uk_strategy_config_group_key_priority\` (\`config_group\`,\`config_key\`,\`priority\`),
  KEY \`idx_strategy_config_group_active\` (\`config_group\`,\`is_active\`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖策略全局配置表（Budget Tier阈值/Pity配置/功能开关等）'`, { transaction });

    // 43/77 lottery_tier_matrix_config
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_tier_matrix_config\` (
  \`lottery_tier_matrix_config_id\` int NOT NULL AUTO_INCREMENT,
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
  UNIQUE KEY \`uk_tier_matrix_budget_pressure\` (\`budget_tier\`,\`pressure_tier\`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置）'`, { transaction });

    // 44/77 lottery_tier_rules
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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）'`, { transaction });

    // 45/77 lottery_user_daily_draw_quota
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
) ENGINE=InnoDB AUTO_INCREMENT=143 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 46/77 lottery_user_experience_state
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`lottery_user_experience_state\` (
  \`lottery_user_experience_state_id\` int NOT NULL AUTO_INCREMENT,
  \`user_id\` int NOT NULL COMMENT '用户ID（外键关联users.user_id）',
  \`lottery_campaign_id\` int NOT NULL,
  \`empty_streak\` int NOT NULL DEFAULT '0' COMMENT '连续空奖次数（Pity系统：每次空奖+1，非空奖重置为0）',
  \`recent_high_count\` int NOT NULL DEFAULT '0' COMMENT '近期高价值奖品次数（AntiHigh：统计窗口内high档位次数）',
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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）'`, { transaction });

    // 47/77 lottery_user_global_state
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户全局抽奖统计表（LuckDebt运气债务机制）'`, { transaction });

    // 48/77 market_listings
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`market_listings\` (
  \`market_listing_id\` bigint NOT NULL AUTO_INCREMENT,
  \`listing_kind\` enum('item_instance','fungible_asset') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '挂牌类型（Listing Kind）：item_instance-不可叠加物品实例（如装备、卡牌）| fungible_asset-可叠加资产（如材料、钻石）；业务规则：决定标的资产字段的填充规则',
  \`seller_user_id\` int NOT NULL COMMENT '卖家用户ID（Seller User ID）：挂牌创建者，外键关联 users.user_id',
  \`offer_item_instance_id\` bigint DEFAULT NULL COMMENT '挂牌标的物品实例ID（关联 item_instances.item_instance_id）',
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
  KEY \`idx_market_listings_offer_item_instance_id\` (\`offer_item_instance_id\`),
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
  CONSTRAINT \`fk_market_listings_offer_item_instance_id\` FOREIGN KEY (\`offer_item_instance_id\`) REFERENCES \`item_instances\` (\`item_instance_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_ibfk_1\` FOREIGN KEY (\`seller_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_asset_group_code_foreign_idx\` FOREIGN KEY (\`offer_asset_group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_category_code_foreign_idx\` FOREIGN KEY (\`offer_item_category_code\`) REFERENCES \`category_defs\` (\`category_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_rarity_foreign_idx\` FOREIGN KEY (\`offer_item_rarity\`) REFERENCES \`rarity_defs\` (\`rarity_code\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`market_listings_offer_item_template_id_foreign_idx\` FOREIGN KEY (\`offer_item_template_id\`) REFERENCES \`item_templates\` (\`item_template_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5125 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 49/77 material_asset_types
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`material_asset_types\` (
  \`material_asset_type_id\` bigint NOT NULL AUTO_INCREMENT COMMENT '材料资产类型ID（主键）',
  \`asset_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联',
  \`display_name\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"',
  \`group_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类',
  \`form\` enum('shard','crystal','currency') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '形态（Form）：shard-碎片，crystal-水晶，currency-货币',
  \`tier\` int NOT NULL COMMENT '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序',
  \`visible_value_points\` bigint DEFAULT NULL COMMENT '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选',
  \`budget_value_points\` bigint DEFAULT NULL COMMENT '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选',
  \`is_enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）',
  \`created_at\` datetime NOT NULL COMMENT '创建时间（Created At - 北京时间）：记录创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间（Updated At - 北京时间）：记录最后更新时间',
  \`is_tradable\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可交易（Is Tradable - C2C市场交易开关）：TRUE-可在市场挂牌交易，FALSE-禁止市场交易',
  \`icon_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '资产图标URL（用于市场列表展示）',
  PRIMARY KEY (\`material_asset_type_id\`),
  UNIQUE KEY \`asset_code\` (\`asset_code\`),
  UNIQUE KEY \`uk_material_asset_types_asset_code\` (\`asset_code\`),
  KEY \`idx_material_asset_types_group_code\` (\`group_code\`),
  KEY \`idx_material_asset_types_is_enabled\` (\`is_enabled\`),
  KEY \`idx_tradable_enabled\` (\`is_tradable\`,\`is_enabled\`),
  CONSTRAINT \`fk_mat_group_code\` FOREIGN KEY (\`group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`fk_material_asset_types_group_code\` FOREIGN KEY (\`group_code\`) REFERENCES \`asset_group_defs\` (\`group_code\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1091 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 50/77 material_conversion_rules
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
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 51/77 merchant_operation_logs
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
) ENGINE=InnoDB AUTO_INCREMENT=182 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='商家操作审计日志表（商家员工域权限体系升级 - 2026-01-12）'`, { transaction });

    // 52/77 popup_banners
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`popup_banners\` (
  \`popup_banner_id\` int NOT NULL AUTO_INCREMENT,
  \`title\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '弹窗标题（便于后台管理识别）',
  \`image_url\` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '弹窗图片URL（Sealos对象存储）',
  \`link_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '点击跳转链接（可选）',
  \`link_type\` enum('none','page','miniprogram','webview') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '跳转类型：none-不跳转, page-小程序页面, miniprogram-其他小程序, webview-H5页面',
  \`position\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'home' COMMENT '显示位置：home-首页, profile-个人中心等',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否启用',
  \`display_order\` int NOT NULL DEFAULT '0' COMMENT '显示顺序（数字小的优先）',
  \`start_time\` datetime DEFAULT NULL COMMENT '开始展示时间（NULL表示立即生效）',
  \`end_time\` datetime DEFAULT NULL COMMENT '结束展示时间（NULL表示永不过期）',
  \`created_by\` int DEFAULT NULL COMMENT '创建人ID',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`popup_banner_id\`),
  KEY \`created_by\` (\`created_by\`),
  KEY \`idx_popup_banners_position_active\` (\`position\`,\`is_active\`),
  KEY \`idx_popup_banners_display_order\` (\`display_order\`),
  KEY \`idx_popup_banners_time_range\` (\`start_time\`,\`end_time\`),
  CONSTRAINT \`popup_banners_ibfk_1\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 53/77 preset_budget_debt
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预设预算欠账表 - 记录预设强发时的预算垫付'`, { transaction });

    // 54/77 preset_debt_limits
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='欠账上限配置表 - 配置各级别的欠账风险上限'`, { transaction });

    // 55/77 preset_inventory_debt
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预设库存欠账表 - 记录预设强发时的库存垫付'`, { transaction });

    // 56/77 products
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`products\` (
  \`product_id\` int NOT NULL AUTO_INCREMENT COMMENT '商品唯一ID（主键）',
  \`product_name\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商品名称（产品的显示名称）',
  \`description\` text COLLATE utf8mb4_unicode_ci COMMENT '商品描述',
  \`category\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商品分类（前端筛选用）',
  \`exchange_points\` int NOT NULL COMMENT '兑换所需积分（前端价格显示）',
  \`stock\` int NOT NULL DEFAULT '0' COMMENT '库存数量（前端实时显示，WebSocket同步）',
  \`status\` enum('active','offline','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '商品状态',
  \`is_hot\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '热门商品标记（前端推荐）',
  \`sort_order\` int NOT NULL DEFAULT '0' COMMENT '排序权重（前端排序）',
  \`rating\` decimal(3,2) NOT NULL DEFAULT '5.00' COMMENT '评分（前端星级显示）',
  \`sales_count\` int NOT NULL DEFAULT '0' COMMENT '销量（前端排序用）',
  \`created_at\` datetime NOT NULL,
  \`updated_at\` datetime NOT NULL,
  \`space\` enum('lucky','premium','both') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lucky' COMMENT '所属空间：lucky-幸运空间，premium-臻选空间，both-两个空间都有',
  \`original_price\` decimal(10,2) DEFAULT NULL COMMENT '原价（显示用）',
  \`discount\` int NOT NULL DEFAULT '0' COMMENT '折扣百分比',
  \`low_stock_threshold\` int NOT NULL DEFAULT '5' COMMENT '低库存预警阈值',
  \`is_new\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否新品',
  \`is_limited\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否限量商品',
  \`view_count\` int NOT NULL DEFAULT '0' COMMENT '浏览次数统计',
  \`warranty\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '售后说明信息',
  \`delivery_info\` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配送信息',
  \`expires_at\` datetime DEFAULT NULL COMMENT '商品过期时间',
  \`created_by\` int DEFAULT NULL COMMENT '创建者用户ID',
  \`updated_by\` int DEFAULT NULL COMMENT '最后更新者用户ID',
  \`primary_image_id\` int DEFAULT NULL COMMENT '主图片ID',
  \`premium_exchange_points\` int DEFAULT NULL COMMENT '臻选空间专属积分（NULL表示使用exchange_points）',
  \`premium_stock\` int DEFAULT NULL COMMENT '臻选空间独立库存（NULL表示与幸运空间共享stock）',
  PRIMARY KEY (\`product_id\`),
  KEY \`idx_category\` (\`category\`),
  KEY \`idx_exchange_points\` (\`exchange_points\`),
  KEY \`idx_status\` (\`status\`),
  KEY \`idx_stock\` (\`stock\`),
  KEY \`idx_is_hot\` (\`is_hot\`),
  KEY \`idx_sort_order\` (\`sort_order\`),
  KEY \`idx_sales_count\` (\`sales_count\`),
  KEY \`idx_category_points_stock\` (\`category\`,\`exchange_points\`,\`stock\`),
  KEY \`idx_products_space_status\` (\`space\`,\`status\`),
  KEY \`idx_products_is_new_hot\` (\`is_new\`,\`is_hot\`),
  KEY \`idx_products_created_at\` (\`created_at\`),
  KEY \`idx_products_premium_points\` (\`premium_exchange_points\`),
  KEY \`idx_products_premium_stock\` (\`premium_stock\`)
) ENGINE=InnoDB AUTO_INCREMENT=141 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 57/77 redemption_orders
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`redemption_orders\` (
  \`redemption_order_id\` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  \`code_hash\` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '核销码哈希（Code Hash）：12位Base32核销码的SHA-256哈希值（64位hex字符串），用于验证核销码，不存储明文',
  \`item_instance_id\` bigint NOT NULL COMMENT '物品实例ID（Item Instance ID）：关联的物品实例，外键指向 item_instances.item_instance_id',
  \`redeemer_user_id\` int DEFAULT NULL COMMENT '核销用户ID（Redeemer User ID）：执行核销操作的用户ID，外键指向 users.user_id，核销前为NULL',
  \`status\` enum('pending','fulfilled','cancelled','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '订单状态（Status）：pending-待核销 | fulfilled-已核销 | cancelled-已取消 | expired-已过期',
  \`expires_at\` datetime NOT NULL COMMENT '过期时间（Expires At）：核销码过期时间，创建后30天，北京时间',
  \`fulfilled_at\` datetime DEFAULT NULL COMMENT '核销时间（Fulfilled At）：实际核销时间，北京时间',
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（Created At）：记录创建时间，北京时间',
  \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（Updated At）：记录最后更新时间，北京时间',
  PRIMARY KEY (\`redemption_order_id\`),
  UNIQUE KEY \`code_hash\` (\`code_hash\`),
  KEY \`idx_status_expires\` (\`status\`,\`expires_at\`),
  KEY \`idx_item_instance\` (\`item_instance_id\`),
  KEY \`idx_redeemer\` (\`redeemer_user_id\`),
  KEY \`idx_redemption_orders_item_status\` (\`item_instance_id\`,\`status\`),
  CONSTRAINT \`redemption_orders_ibfk_1\` FOREIGN KEY (\`item_instance_id\`) REFERENCES \`item_instances\` (\`item_instance_id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`redemption_orders_ibfk_2\` FOREIGN KEY (\`redeemer_user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换订单表（Redemption Orders）：管理核销码生成和核销流程，替代 UserInventory.verification_code'`, { transaction });

    // 58/77 reminder_rules
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
  \`notification_priority\` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '通知优先级',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能提醒规则表（运营后台提醒管理）'`, { transaction });

    // 59/77 reminder_history
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
) ENGINE=InnoDB AUTO_INCREMENT=137 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提醒历史记录表（存储每次提醒的触发和通知结果）'`, { transaction });

    // 60/77 report_templates
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报表模板表（自定义报表配置管理）'`, { transaction });

    // 61/77 risk_alerts
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
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 62/77 roles
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
) ENGINE=InnoDB AUTO_INCREMENT=137 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色管理表'`, { transaction });

    // 63/77 store_staff
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店员工关系表（员工-门店多对多，支持历史记录）'`, { transaction });

    // 64/77 system_announcements
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_announcements\` (
  \`system_announcement_id\` int NOT NULL AUTO_INCREMENT,
  \`title\` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '公告标题',
  \`content\` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '公告内容',
  \`type\` enum('system','activity','maintenance','notice') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'notice' COMMENT '公告类型：系统/活动/维护/通知',
  \`priority\` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium' COMMENT '优先级：高/中/低',
  \`target_groups\` json DEFAULT NULL COMMENT '目标用户组（管理员可见）',
  \`is_active\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否激活',
  \`expires_at\` datetime DEFAULT NULL COMMENT '过期时间',
  \`admin_id\` int NOT NULL COMMENT '发布公告的管理员ID（基于UUID角色系统验证管理员权限）',
  \`internal_notes\` text COLLATE utf8mb4_unicode_ci COMMENT '内部备注（管理员可见）',
  \`view_count\` int NOT NULL DEFAULT '0' COMMENT '查看次数',
  \`created_at\` datetime NOT NULL COMMENT '创建时间',
  \`updated_at\` datetime NOT NULL COMMENT '更新时间',
  PRIMARY KEY (\`system_announcement_id\`),
  KEY \`admin_id\` (\`admin_id\`),
  KEY \`idx_announcements_type_active\` (\`type\`,\`is_active\`),
  KEY \`idx_announcements_priority_expires\` (\`priority\`,\`expires_at\`),
  KEY \`idx_announcements_created_at\` (\`created_at\`),
  CONSTRAINT \`system_announcements_ibfk_1\` FOREIGN KEY (\`admin_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统公告表 - 支持首页公告功能'`, { transaction });

    // 65/77 system_configs
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表 - 可动态调整的系统参数（阶段C核心基础设施）'`, { transaction });

    // 66/77 system_dictionaries
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
) ENGINE=InnoDB AUTO_INCREMENT=375 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统字典表 - 存储各类枚举的中文显示名称映射'`, { transaction });

    // 67/77 system_dictionary_history
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统字典历史表 - 支持版本回滚'`, { transaction });

    // 68/77 system_settings
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS \`system_settings\` (
  \`system_setting_id\` int NOT NULL AUTO_INCREMENT,
  \`category\` enum('basic','points','notification','security','marketplace') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配置分类（仅运营配置）',
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
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表：存储系统各模块的配置设置'`, { transaction });

    // 69/77 trade_orders
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
) ENGINE=InnoDB AUTO_INCREMENT=3023 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 70/77 user_behavior_tracks
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为轨迹表（记录用户关键行为，用于轨迹分析）'`, { transaction });

    // 71/77 user_hierarchy
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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户层级关系表（简化版：仅保留核心字段和必要索引）'`, { transaction });

    // 72/77 user_premium_status
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）'`, { transaction });

    // 73/77 user_risk_profiles
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
  UNIQUE KEY \`uk_user_risk_profiles_level_default\` (\`user_level\`),
  KEY \`frozen_by\` (\`frozen_by\`),
  KEY \`idx_user_risk_profiles_user_id\` (\`user_id\`),
  KEY \`idx_user_risk_profiles_level_type\` (\`user_level\`,\`config_type\`),
  KEY \`idx_user_risk_profiles_is_frozen\` (\`is_frozen\`),
  CONSTRAINT \`user_risk_profiles_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`user_id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`user_risk_profiles_ibfk_2\` FOREIGN KEY (\`frozen_by\`) REFERENCES \`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户风控配置表：存储用户等级默认配置和个人自定义配置'`, { transaction });

    // 74/77 user_role_change_records
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
) ENGINE=InnoDB AUTO_INCREMENT=255 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色变更记录表（为审计日志提供业务主键）'`, { transaction });

    // 75/77 user_roles
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
) ENGINE=InnoDB AUTO_INCREMENT=489 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, { transaction });

    // 76/77 user_status_change_records
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
) ENGINE=InnoDB AUTO_INCREMENT=255 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户状态变更记录表（为审计日志提供业务主键）'`, { transaction });

    // 77/77 websocket_startup_logs
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
) ENGINE=InnoDB AUTO_INCREMENT=1813 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WebSocket服务启动日志表（记录所有启动/停止事件）';`, { transaction });

      await transaction.commit()
      console.log('✅ Baseline V3.0.0: 77 张表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline V3.0.0 执行失败:', error.message)
      throw error
    }
  },

  /**
   * 按依赖顺序删除所有业务表
   */
  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Baseline V3.0.0: 开始回滚（删除所有业务表）...')
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 先禁用外键检查以避免依赖顺序问题
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });

    // 1/77 删除 websocket_startup_logs
    await queryInterface.dropTable('websocket_startup_logs', { transaction });

    // 2/77 删除 user_status_change_records
    await queryInterface.dropTable('user_status_change_records', { transaction });

    // 3/77 删除 user_roles
    await queryInterface.dropTable('user_roles', { transaction });

    // 4/77 删除 user_role_change_records
    await queryInterface.dropTable('user_role_change_records', { transaction });

    // 5/77 删除 user_risk_profiles
    await queryInterface.dropTable('user_risk_profiles', { transaction });

    // 6/77 删除 user_premium_status
    await queryInterface.dropTable('user_premium_status', { transaction });

    // 7/77 删除 user_hierarchy
    await queryInterface.dropTable('user_hierarchy', { transaction });

    // 8/77 删除 user_behavior_tracks
    await queryInterface.dropTable('user_behavior_tracks', { transaction });

    // 9/77 删除 trade_orders
    await queryInterface.dropTable('trade_orders', { transaction });

    // 10/77 删除 system_settings
    await queryInterface.dropTable('system_settings', { transaction });

    // 11/77 删除 system_dictionary_history
    await queryInterface.dropTable('system_dictionary_history', { transaction });

    // 12/77 删除 system_dictionaries
    await queryInterface.dropTable('system_dictionaries', { transaction });

    // 13/77 删除 system_configs
    await queryInterface.dropTable('system_configs', { transaction });

    // 14/77 删除 system_announcements
    await queryInterface.dropTable('system_announcements', { transaction });

    // 15/77 删除 store_staff
    await queryInterface.dropTable('store_staff', { transaction });

    // 16/77 删除 roles
    await queryInterface.dropTable('roles', { transaction });

    // 17/77 删除 risk_alerts
    await queryInterface.dropTable('risk_alerts', { transaction });

    // 18/77 删除 report_templates
    await queryInterface.dropTable('report_templates', { transaction });

    // 19/77 删除 reminder_history
    await queryInterface.dropTable('reminder_history', { transaction });

    // 20/77 删除 reminder_rules
    await queryInterface.dropTable('reminder_rules', { transaction });

    // 21/77 删除 redemption_orders
    await queryInterface.dropTable('redemption_orders', { transaction });

    // 22/77 删除 products
    await queryInterface.dropTable('products', { transaction });

    // 23/77 删除 preset_inventory_debt
    await queryInterface.dropTable('preset_inventory_debt', { transaction });

    // 24/77 删除 preset_debt_limits
    await queryInterface.dropTable('preset_debt_limits', { transaction });

    // 25/77 删除 preset_budget_debt
    await queryInterface.dropTable('preset_budget_debt', { transaction });

    // 26/77 删除 popup_banners
    await queryInterface.dropTable('popup_banners', { transaction });

    // 27/77 删除 merchant_operation_logs
    await queryInterface.dropTable('merchant_operation_logs', { transaction });

    // 28/77 删除 material_conversion_rules
    await queryInterface.dropTable('material_conversion_rules', { transaction });

    // 29/77 删除 material_asset_types
    await queryInterface.dropTable('material_asset_types', { transaction });

    // 30/77 删除 market_listings
    await queryInterface.dropTable('market_listings', { transaction });

    // 31/77 删除 lottery_user_global_state
    await queryInterface.dropTable('lottery_user_global_state', { transaction });

    // 32/77 删除 lottery_user_experience_state
    await queryInterface.dropTable('lottery_user_experience_state', { transaction });

    // 33/77 删除 lottery_user_daily_draw_quota
    await queryInterface.dropTable('lottery_user_daily_draw_quota', { transaction });

    // 34/77 删除 lottery_tier_rules
    await queryInterface.dropTable('lottery_tier_rules', { transaction });

    // 35/77 删除 lottery_tier_matrix_config
    await queryInterface.dropTable('lottery_tier_matrix_config', { transaction });

    // 36/77 删除 lottery_strategy_config
    await queryInterface.dropTable('lottery_strategy_config', { transaction });

    // 37/77 删除 lottery_presets
    await queryInterface.dropTable('lottery_presets', { transaction });

    // 38/77 删除 lottery_management_settings
    await queryInterface.dropTable('lottery_management_settings', { transaction });

    // 39/77 删除 lottery_hourly_metrics
    await queryInterface.dropTable('lottery_hourly_metrics', { transaction });

    // 40/77 删除 lottery_draws
    await queryInterface.dropTable('lottery_draws', { transaction });

    // 41/77 删除 lottery_prizes
    await queryInterface.dropTable('lottery_prizes', { transaction });

    // 42/77 删除 lottery_draw_quota_rules
    await queryInterface.dropTable('lottery_draw_quota_rules', { transaction });

    // 43/77 删除 lottery_draw_decisions
    await queryInterface.dropTable('lottery_draw_decisions', { transaction });

    // 44/77 删除 lottery_daily_metrics
    await queryInterface.dropTable('lottery_daily_metrics', { transaction });

    // 45/77 删除 lottery_clear_setting_records
    await queryInterface.dropTable('lottery_clear_setting_records', { transaction });

    // 46/77 删除 lottery_campaign_user_quota
    await queryInterface.dropTable('lottery_campaign_user_quota', { transaction });

    // 47/77 删除 lottery_campaign_quota_grants
    await queryInterface.dropTable('lottery_campaign_quota_grants', { transaction });

    // 48/77 删除 lottery_campaign_pricing_config
    await queryInterface.dropTable('lottery_campaign_pricing_config', { transaction });

    // 49/77 删除 lottery_alerts
    await queryInterface.dropTable('lottery_alerts', { transaction });

    // 50/77 删除 lottery_campaigns
    await queryInterface.dropTable('lottery_campaigns', { transaction });

    // 51/77 删除 item_templates
    await queryInterface.dropTable('item_templates', { transaction });

    // 52/77 删除 rarity_defs
    await queryInterface.dropTable('rarity_defs', { transaction });

    // 53/77 删除 item_instance_events
    await queryInterface.dropTable('item_instance_events', { transaction });

    // 54/77 删除 item_instances
    await queryInterface.dropTable('item_instances', { transaction });

    // 55/77 删除 feedbacks
    await queryInterface.dropTable('feedbacks', { transaction });

    // 56/77 删除 feature_flags
    await queryInterface.dropTable('feature_flags', { transaction });

    // 57/77 删除 exchange_records
    await queryInterface.dropTable('exchange_records', { transaction });

    // 58/77 删除 exchange_items
    await queryInterface.dropTable('exchange_items', { transaction });

    // 59/77 删除 image_resources
    await queryInterface.dropTable('image_resources', { transaction });

    // 60/77 删除 content_review_records
    await queryInterface.dropTable('content_review_records', { transaction });

    // 61/77 删除 consumption_records
    await queryInterface.dropTable('consumption_records', { transaction });

    // 62/77 删除 stores
    await queryInterface.dropTable('stores', { transaction });

    // 63/77 删除 chat_messages
    await queryInterface.dropTable('chat_messages', { transaction });

    // 64/77 删除 customer_service_sessions
    await queryInterface.dropTable('customer_service_sessions', { transaction });

    // 65/77 删除 category_defs
    await queryInterface.dropTable('category_defs', { transaction });

    // 66/77 删除 batch_operation_logs
    await queryInterface.dropTable('batch_operation_logs', { transaction });

    // 67/77 删除 authentication_sessions
    await queryInterface.dropTable('authentication_sessions', { transaction });

    // 68/77 删除 asset_transactions
    await queryInterface.dropTable('asset_transactions', { transaction });

    // 69/77 删除 asset_group_defs
    await queryInterface.dropTable('asset_group_defs', { transaction });

    // 70/77 删除 api_idempotency_requests
    await queryInterface.dropTable('api_idempotency_requests', { transaction });

    // 71/77 删除 alert_silence_rules
    await queryInterface.dropTable('alert_silence_rules', { transaction });

    // 72/77 删除 administrative_regions
    await queryInterface.dropTable('administrative_regions', { transaction });

    // 73/77 删除 admin_operation_logs
    await queryInterface.dropTable('admin_operation_logs', { transaction });

    // 74/77 删除 admin_notifications
    await queryInterface.dropTable('admin_notifications', { transaction });

    // 75/77 删除 account_asset_balances
    await queryInterface.dropTable('account_asset_balances', { transaction });

    // 76/77 删除 accounts
    await queryInterface.dropTable('accounts', { transaction });

    // 77/77 删除 users
    await queryInterface.dropTable('users', { transaction });

      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      await transaction.commit()
      console.log('✅ Baseline V3.0.0: 所有表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Baseline V3.0.0 回滚失败:', error.message)
      throw error
    }
  }
}
