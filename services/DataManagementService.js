'use strict'

/**
 * 数据管理服务 - 数据一键删除功能核心业务逻辑
 *
 * 职责：
 * - 数据量统计（按安全等级分组）
 * - 清理影响预览（计算各表将删除行数 + FK 级联分析）
 * - 清理执行（分批删除 + FK 拓扑排序 + 审计日志）
 * - 自动清理策略管理（读写 system_settings）
 *
 * 数据安全等级：
 * - L0 不可删（系统基石）：sequelizemeta, administrative_regions, accounts(system), roles 等
 * - L1 仅归档可删（金融级）：asset_transactions, item_ledger, account_asset_balances 等
 * - L2 审批后可删（业务运营）：lottery_draws, customer_service_sessions 等
 * - L3 可自动清理（日志/临时）：api_idempotency_requests, websocket_startup_logs 等
 *
 * @module services/DataManagementService
 */

const BusinessError = require('../utils/BusinessError')
const { sequelize } = require('../config/database')
const { logger } = require('../utils/logger')
const AuditLogService = require('./AuditLogService')
const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
const { AUDIT_TARGET_TYPES } = require('../constants/AuditTargetTypes')
const BeijingTimeHelper = require('../utils/timeHelper')
const TransactionManager = require('../utils/TransactionManager')
const ItemLifecycleService = require('./asset/ItemLifecycleService')
const crypto = require('crypto')
const { getRawClient } = require('../utils/UnifiedRedisClient')
const AdminSystemService = require('./AdminSystemService')
const UserService = require('./UserService')
const { UserRole, Role } = require('../models')

/**
 * 数据库表名中文映射字典
 * 用于数据管理页面展示中文表名
 * @constant {Object<string, string>}
 */
const TABLE_DISPLAY_NAMES = Object.freeze({
  // L0 系统基石
  sequelizemeta: '数据库迁移记录',
  administrative_regions: '行政区域',
  accounts: '系统账户',
  roles: '角色定义',
  material_asset_types: '材料资产类型',
  asset_group_defs: '资产分组定义',
  rarity_defs: '稀有度定义',
  categories: '分类定义',
  // L1 金融级
  asset_transactions: '资产流水',
  item_ledger: '物品账本',
  account_asset_balances: '账户资产余额',
  items: '物品持有',
  item_holds: '物品锁定',
  // L2 业务运营
  lottery_draw_decisions: '抽奖决策记录',
  lottery_draws: '抽奖记录',
  lottery_presets: '抽奖预设',
  lottery_user_daily_draw_quota: '用户每日抽奖配额',
  lottery_campaign_user_quota: '活动用户配额',
  lottery_campaign_quota_grants: '活动配额发放',
  lottery_user_experience_state: '用户体验状态',
  lottery_user_global_state: '用户全局状态',
  lottery_alerts: '抽奖告警',
  lottery_simulation_records: '抽奖模拟记录',
  lottery_hourly_metrics: '抽奖小时指标',
  lottery_daily_metrics: '抽奖日指标',
  consumption_records: '消费记录',
  redemption_orders: '核销订单',
  content_review_records: '内容审核记录',
  chat_messages: '聊天消息',
  customer_service_notes: '客服备注',
  customer_service_issues: '客服工单',
  customer_service_user_assignments: '客服分配',
  customer_service_sessions: '客服会话',
  customer_service_agents: '客服坐席',
  user_notifications: '用户通知',
  admin_notifications: '管理员通知',
  feedbacks: '用户反馈',
  exchange_rates: '兑换汇率',
  exchange_records: '兑换记录',
  bid_records: '竞拍记录',
  bid_products: '竞拍商品',
  preset_inventory_debt: '预设库存垫付',
  preset_budget_debt: '预设预算垫付',
  // L3 可自动清理
  api_idempotency_requests: '幂等性请求',
  websocket_startup_logs: 'WebSocket启动日志',
  authentication_sessions: '认证会话',
  admin_operation_logs: '管理员操作日志',
  ad_impression_logs: '广告曝光日志',
  ad_click_logs: '广告点击日志',
  ad_interaction_logs: '广告互动日志',
  ad_bid_logs: '广告竞价日志',
  ad_antifraud_logs: '广告反欺诈日志',
  ad_attribution_logs: '广告归因日志',
  reminder_history: '提醒历史',
  merchant_operation_logs: '商家操作日志',
  batch_operation_logs: '批量操作日志',
  risk_alerts: '风控告警',
  alert_silence_rules: '告警静默规则',
  ad_report_daily_snapshots: '广告日报快照',
  ad_dau_daily_stats: '广告DAU日统计',
  system_dictionary_history: '系统字典历史',
  ad_billing_records: '广告计费记录',
  // 其他常见表
  lottery_campaigns: '抽奖活动',
  lottery_campaign_prizes: '活动奖品配置',
  prize_definitions: '奖品目录',
  asset_conversion_rules: '资产转换规则',
  users: '用户',
  user_roles: '用户角色',
  merchants: '商家',
  stores: '门店',
  system_settings: '系统设置',
  popup_banners: '弹窗横幅',
  announcements: '公告',
  feature_switches: '功能开关',
  data_dictionaries: '数据字典',
  exchange_items: '兑换物品',
  ad_campaigns: '广告活动',
  ad_creatives: '广告素材',
  ad_placements: '广告位',
  reminder_rules: '提醒规则'
})

/**
 * L0 不可删表白名单（硬编码，任何清理操作均跳过）
 * @constant {Set<string>}
 */
const L0_PROTECTED_TABLES = Object.freeze(
  new Set([
    'sequelizemeta',
    'administrative_regions',
    'accounts',
    'roles',
    'material_asset_types',
    'asset_group_defs',
    'rarity_defs',
    'categories'
  ])
)

/**
 * accounts 表条件删除白名单 WHERE 子句
 * 即使 accounts 在 L0 中，pre_launch 清档仍需删除 user 类型账户
 * 执行删除时必须验证 WHERE 子句包含 account_type 过滤，防止误删系统账户
 * @constant {string}
 */
const _ACCOUNTS_SAFE_DELETE_CONDITION = "account_type = 'user'" // eslint-disable-line no-unused-vars

/**
 * L1 金融级数据表（清理前需对账校验通过）
 * @constant {Set<string>}
 */
const L1_FINANCIAL_TABLES = Object.freeze(
  new Set(['asset_transactions', 'item_ledger', 'account_asset_balances', 'items', 'item_holds'])
)

/**
 * L3 可自动清理表及其时间字段映射
 * @constant {Object}
 */
const L3_AUTO_CLEANUP_TABLES = Object.freeze({
  api_idempotency_requests: 'created_at',
  websocket_startup_logs: 'created_at',
  authentication_sessions: 'created_at',
  admin_operation_logs: 'created_at',
  ad_impression_logs: 'created_at',
  ad_click_logs: 'created_at',
  ad_interaction_logs: 'created_at',
  ad_bid_logs: 'created_at',
  ad_antifraud_logs: 'created_at',
  ad_attribution_logs: 'created_at',
  reminder_history: 'created_at',
  merchant_operation_logs: 'created_at',
  batch_operation_logs: 'created_at',
  risk_alerts: 'created_at',
  alert_silence_rules: 'created_at',
  // 修正（2026-05-30）：以真实表结构为准，原 report_date 列不存在，实际清理依据为业务日期列 snapshot_date
  ad_report_daily_snapshots: 'snapshot_date',
  ad_dau_daily_stats: 'stat_date',
  // 修正（2026-05-30）：system_dictionary_history 无 created_at 列，实际时间列为 changed_at（字典变更时间）
  system_dictionary_history: 'changed_at',
  ad_billing_records: 'created_at'
})

/**
 * 系统定时任务操作员用户ID（数据库已有专用用户：user_id=11021, nickname='系统定时任务'）
 *
 * 用途：自动清理等无人工操作员的系统任务写审计日志时使用。
 * admin_operation_logs.operator_id 为 NOT NULL + 外键→users.user_id，
 * 因此系统任务不能用 0（违反外键），须用真实存在的系统用户ID。
 * @constant {number}
 */
const SYSTEM_DAILY_JOB_USER_ID = 11021

/**
 * 上线前清档保留的用户ID白名单
 *
 * 业务说明（文档第十九/二十/二十三章拍板）：
 * - 32：超管 13612227910（用户指定保留）
 * - 11021：系统定时任务账号（.env SYSTEM_DAILY_JOB_USER_ID 写死依赖，删除会致定时任务外键报错）
 * 其余用户（含原管理员 31、测试号 135 等）连同行为数据一并清除。
 * @constant {number[]}
 */
const PRE_LAUNCH_KEEP_USER_IDS = Object.freeze([32, SYSTEM_DAILY_JOB_USER_ID])

/**
 * 上线前一次性「清行为」表清单（按外键拓扑顺序：子表在前、父表在后）
 *
 * 业务定位（文档第十九章 19.4 + 第二十章 20.4 + 第二十三章 23.1 最终基线）：
 * - 仅清"用户/测试号操作产生 + 系统运行累积"的行为/流水数据；
 * - 不含任何业务配置表（活动/奖品/门店/商户/字典等配置一律保留）；
 * - 金融互锁组（asset_transactions/item_ledger/items/item_holds/account_asset_balances）
 *   在 FINANCIAL_INTERLOCK_TABLES 中单独整组、单事务清理，不在此普通清单内。
 * @constant {string[]}
 */
const PRE_LAUNCH_BEHAVIOR_WIPE_TABLES = Object.freeze([
  // —— 广告行为日志 ——
  'ad_interaction_logs',
  'ad_impression_logs',
  'ad_click_logs',
  'ad_attribution_logs',
  'ad_antifraud_logs',
  'ad_billing_records',
  'ad_bid_logs',
  'ad_report_daily_snapshots',
  'ad_dau_daily_stats',
  'ad_price_adjustment_logs',
  // ad 投放内容（23.1-3：「首页」联调投放随测试清，ad_slots 槽位保留不在此列）
  'ad_creatives',
  'ad_zone_group_members',
  'ad_target_zones',
  'ad_campaigns',
  // —— 通知/会话/消息 ——
  'admin_notifications',
  'user_notifications',
  'chat_messages',
  'customer_service_notes',
  'customer_service_user_assignments',
  'customer_service_issues',
  'customer_service_sessions',
  'customer_service_agents',
  'feedbacks',
  // —— 抽奖行为 ——
  'lottery_simulation_records',
  'lottery_user_daily_draw_quota',
  'lottery_campaign_user_quota',
  'lottery_campaign_quota_grants',
  'lottery_user_experience_state',
  'lottery_user_global_state',
  'lottery_hourly_metrics',
  'lottery_daily_metrics',
  'lottery_alerts',
  'lottery_draw_decisions',
  'lottery_presets',
  'lottery_draws',
  // —— 交易/兑换/核销行为（20.4：兑换市场物品/SKU/渠道价全是测试，连带清）——
  'exchange_order_events',
  'shipping_tracks',
  'exchange_channel_prices',
  'sku_attribute_values',
  'exchange_records',
  'consumption_records',
  'content_review_records',
  'redemption_orders',
  'trade_disputes',
  // 兑换商品配置（20.4 决定清，须在 item_templates 之前、子表之后）
  'exchange_item_attribute_values',
  'exchange_redeem_requirement',
  'exchange_item_skus',
  'exchange_items',
  // —— 竞拍行为 ——
  'bid_records',
  'bid_products',
  // —— 系统垫付/审批运行实例（模板保留，实例清）——
  'preset_inventory_debt',
  'preset_budget_debt',
  'approval_chain_instances',
  // —— 日志/会话/临时（系统运行产生）——
  'admin_operation_logs',
  'merchant_operation_logs',
  'authentication_sessions',
  'websocket_startup_logs',
  'batch_operation_logs',
  'reminder_history',
  'api_idempotency_requests',
  'system_dictionary_history',
  'risk_alerts',
  'alert_silence_rules',
  /*
   * 测试用户衍生数据（随测试用户一起清）
   * 注：store_staff 含保留用户 32 的绑定，需在 _cleanupTestUsers 内按"孤儿（指向被删用户）"硬删，故不在此整表清
   */
  'user_behavior_tracks',
  'user_ad_tags',
  'user_addresses',
  'user_risk_profiles',
  'user_premium_status',
  'user_ratio_overrides',
  'user_hierarchy',
  'diy_works'
])

/**
 * 金融互锁组（清前后跑对账、整组单事务清理）
 *
 * 业务说明（文档第二十二/二十三章 拍板项1）：余额=流水累计、持有=账本推导，
 * 必须整组一起清，不能只清其中一张表，否则账实对不上。
 * 顺序：子表/明细在前，余额缓存表在后。
 * @constant {string[]}
 */
const FINANCIAL_INTERLOCK_TABLES = Object.freeze([
  'item_holds',
  'item_ledger',
  'items',
  'asset_transactions',
  'account_asset_balances'
])

/**
 * L2 业务数据 - 按清理类目分组
 * @constant {Object}
 */
const L2_CLEANUP_CATEGORIES = Object.freeze({
  lottery_records: {
    label: '抽奖记录',
    tables: [
      'lottery_draw_decisions',
      'lottery_draws',
      'lottery_presets',
      'lottery_user_daily_draw_quota',
      'lottery_campaign_user_quota',
      'lottery_campaign_quota_grants',
      'lottery_user_experience_state',
      'lottery_user_global_state'
    ],
    time_field: 'created_at'
  },
  lottery_monitoring: {
    label: '抽奖监控（告警与模拟）',
    tables: ['lottery_alerts', 'lottery_simulation_records'],
    time_field: 'created_at'
  },
  monitoring_metrics: {
    label: '监控指标',
    tables: ['lottery_hourly_metrics', 'lottery_daily_metrics'],
    time_field: 'created_at'
  },
  consumption_records: {
    label: '消费与核销',
    tables: ['consumption_records', 'redemption_orders', 'content_review_records'],
    time_field: 'created_at'
  },
  customer_service: {
    label: '客服会话',
    tables: [
      'chat_messages',
      'customer_service_notes',
      'customer_service_issues',
      'customer_service_user_assignments',
      'customer_service_sessions',
      'customer_service_agents'
    ],
    time_field: 'created_at'
  },
  notifications: {
    label: '用户通知',
    tables: ['user_notifications', 'admin_notifications'],
    time_field: 'created_at'
  },
  feedbacks: {
    label: '用户反馈',
    tables: ['feedbacks'],
    time_field: 'created_at'
  },
  exchange_records: {
    label: '兑换记录',
    tables: ['exchange_records'],
    time_field: 'created_at'
  },
  bid_records: {
    label: '竞拍记录',
    tables: ['bid_records', 'bid_products'],
    time_field: 'created_at'
  },
  system_debts: {
    label: '系统垫付',
    tables: ['preset_inventory_debt', 'preset_budget_debt'],
    time_field: 'created_at'
  },
  /*
   * 配置数据清理类目（上线后日常运营工具，慎用：清空后需重新录入）
   * tables 严格按外键依赖排序（子表在前、父表在后），执行时再经 DELETE_TOPOLOGY 全局拓扑二次排序
   */
  exchange_catalog: {
    label: '兑换商品配置（含SKU/属性/兑换记录）',
    tables: [
      'exchange_order_events',
      'shipping_tracks',
      'exchange_channel_prices',
      'sku_attribute_values',
      'exchange_records',
      'exchange_item_attribute_values',
      'exchange_redeem_requirement',
      'exchange_item_skus',
      'exchange_items'
    ],
    time_field: 'created_at'
  },
  store_catalog: {
    label: '门店配置（含员工/层级）',
    tables: ['store_staff', 'user_hierarchy', 'stores'],
    time_field: 'created_at'
  },
  item_template_catalog: {
    label: '物品模板配置',
    tables: ['items', 'item_templates'],
    time_field: 'created_at'
  }
})

/**
 * FK 拓扑排序 - 删除顺序（先子表后父表）
 * 基于 174 条外键约束分析
 * @constant {string[][]}
 */
const DELETE_TOPOLOGY = Object.freeze([
  // 第一层（叶子表）
  [
    'ad_interaction_logs',
    'ad_impression_logs',
    'ad_click_logs',
    'ad_attribution_logs',
    'ad_antifraud_logs',
    'ad_billing_records',
    'ad_bid_logs',
    'ad_report_daily_snapshots',
    'ad_dau_daily_stats',
    'ad_creatives',
    'ad_price_adjustment_logs',
    'websocket_startup_logs',
    'authentication_sessions',
    'api_idempotency_requests',
    'admin_notifications',
    'user_notifications',
    'user_behavior_tracks',
    'user_ad_tags',
    'batch_operation_logs',
    'reminder_history',
    'alert_silence_rules',
    'lottery_simulation_records',
    'lottery_user_daily_draw_quota',
    'lottery_campaign_user_quota',
    'lottery_campaign_quota_grants',
    'lottery_user_experience_state',
    'lottery_user_global_state',
    'lottery_hourly_metrics',
    'lottery_daily_metrics',
    'lottery_alerts',
    'lottery_draw_decisions',
    'lottery_campaign_pricing_config',
    'lottery_tier_rules',
    'lottery_strategy_config',
    'lottery_tier_matrix_config',
    'lottery_draw_quota_rules',
    'preset_inventory_debt',
    'preset_budget_debt',
    'content_review_records',
    'merchant_operation_logs',
    'feedbacks',
    'item_holds',
    'item_ledger',
    'exchange_records',
    'bid_records',
    'chat_messages',
    'customer_service_notes',
    'system_dictionary_history',
    'user_premium_status',
    'user_risk_profiles',
    'store_staff',
    'user_hierarchy',
    'user_ratio_overrides',
    'risk_alerts'
  ],
  // 第二层
  [
    'redemption_orders',
    'lottery_draws',
    'consumption_records',
    'customer_service_user_assignments',
    'customer_service_issues',
    'ad_zone_group_members',
    'bid_products',
    'lottery_presets',
    'preset_debt_limits',
    'report_templates',
    'reminder_rules',
    'segment_rule_configs',
    'customer_service_agents'
  ],
  // 第三层
  ['customer_service_sessions', 'ad_campaigns'],
  // 第四层（exchange_items 真实存在并由 ExchangeItem 模型映射，见 models/ExchangeItem.js）
  ['items', 'lottery_campaign_prizes', 'exchange_items'],
  // 第五层（核心配置表 - 通常不删，仅清档模式时按需处理）
  [
    'lottery_campaigns',
    'item_templates',
    'ad_slots',
    'ad_target_zones',
    'asset_transactions',
    'account_asset_balances'
  ]
])

/**
 * 预览令牌 Redis 键前缀（5 分钟有效）
 * 使用 Redis 存储，支持进程重启后令牌保持有效、多实例部署共享
 * @constant {string}
 */
const PREVIEW_TOKEN_PREFIX = 'data_mgmt:preview_token:'
const PREVIEW_TOKEN_TTL_SECONDS = 300

/**
 * 数据管理服务
 *
 * @class DataManagementService
 */
class DataManagementService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取数据量统计（按安全等级分组）
   *
   * @returns {Promise<Object>} 统计结果：各表行数、安全等级分组、数据库大小
   */
  async getStats() {
    /*
     * information_schema 列名在 MySQL 中返回大写（如 TABLE_NAME），
     * 必须用显式别名统一为小写，否则 JS 端 row.table_name === undefined
     */
    const [tableRows] = await sequelize.query(`
      SELECT table_name AS table_name,
             table_rows AS estimated_rows,
             ROUND(data_length / 1024 / 1024, 2) AS data_size_mb,
             ROUND(index_length / 1024 / 1024, 2) AS index_size_mb
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY data_length DESC
    `)

    const [dbSize] = await sequelize.query(`
      SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS total_size_mb
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `)

    const byLevel = { L0: [], L1: [], L2: [], L3: [], other: [] }

    for (const row of tableRows) {
      const tableName = row.table_name
      row.display_name = TABLE_DISPLAY_NAMES[tableName] || tableName
      if (L0_PROTECTED_TABLES.has(tableName)) {
        byLevel.L0.push(row)
      } else if (L1_FINANCIAL_TABLES.has(tableName)) {
        byLevel.L1.push(row)
      } else if (L3_AUTO_CLEANUP_TABLES[tableName]) {
        byLevel.L3.push(row)
      } else {
        const isL2 = Object.values(L2_CLEANUP_CATEGORIES).some(cat =>
          cat.tables.includes(tableName)
        )
        if (isL2) {
          byLevel.L2.push(row)
        } else {
          byLevel.other.push(row)
        }
      }
    }

    return {
      database_size_mb: dbSize[0]?.total_size_mb || 0,
      table_count: tableRows.length,
      by_level: {
        L0: { count: byLevel.L0.length, tables: byLevel.L0 },
        L1: { count: byLevel.L1.length, tables: byLevel.L1 },
        L2: { count: byLevel.L2.length, tables: byLevel.L2 },
        L3: { count: byLevel.L3.length, tables: byLevel.L3 },
        other: { count: byLevel.other.length, tables: byLevel.other }
      },
      top_tables: tableRows.slice(0, 20),
      categories: Object.entries(L2_CLEANUP_CATEGORIES).map(([key, cat]) => ({
        key,
        label: cat.label,
        table_count: cat.tables.length
      }))
    }
  }

  /**
   * 获取自动清理策略列表
   *
   * @returns {Promise<Object>} 策略配置
   */
  async getPolicies() {
    const config = await AdminSystemService.getConfigValue('data_cleanup_policies')

    if (!config) {
      return { policies: [], schedule_cron: '0 3 * * *', max_execution_time_seconds: 300 }
    }

    return config
  }

  /**
   * 更新清理策略（保留天数/启用禁用）
   *
   * @param {string} tableName - 策略对应的表名
   * @param {Object} updates - { retention_days?: number, enabled?: boolean }
   * @param {number} operatorId - 操作人用户ID
   * @returns {Promise<Object>} 更新后的策略
   */
  async updatePolicy(tableName, updates, operatorId) {
    const config = await AdminSystemService.getConfigValue('data_cleanup_policies')

    if (!config || !config.policies) {
      throw new BusinessError('清理策略配置不存在', 'SERVICE_NOT_FOUND', 404)
    }

    const policy = config.policies.find(p => p.table === tableName)
    if (!policy) {
      throw new BusinessError(`未找到表 ${tableName} 的清理策略`, 'SERVICE_NOT_FOUND', 404)
    }

    const beforeData = { ...policy }

    if (updates.retention_days !== undefined) {
      if (updates.retention_days < 1 || updates.retention_days > 365) {
        throw new BusinessError('保留天数必须在 1-365 之间', 'SERVICE_REQUIRED', 400)
      }
      policy.retention_days = updates.retention_days
    }
    if (updates.enabled !== undefined) {
      policy.enabled = Boolean(updates.enabled)
    }

    await AdminSystemService.upsertConfig('data_cleanup_policies', config, {
      category: 'data_management'
    })

    await AuditLogService.logOperation({
      operator_id: operatorId,
      operation_type: OPERATION_TYPES.SYSTEM_CONFIG,
      target_type: AUDIT_TARGET_TYPES.DATA_MANAGEMENT,
      target_id: tableName,
      action: '更新数据清理策略',
      before_data: beforeData,
      after_data: policy
    })

    return policy
  }

  /**
   * 预览清理影响（计算各表将删除行数）
   *
   * @param {Object} options - 预览参数
   * @param {string} options.mode - 清理模式：'manual'（手动）/ 'auto'（自动）/ 'pre_launch'（清档）
   * @param {string[]} [options.categories] - 清理类目（manual 模式）
   * @param {Object} [options.time_range] - 时间范围 { start, end }
   * @param {Object} [options.filters] - 额外筛选条件
   * @returns {Promise<Object>} 预览结果，含 preview_token
   */
  async previewCleanup(options) {
    const { mode, categories = [], time_range, filters = {} } = options
    const details = []
    const warnings = []
    const blocked = []

    if (mode === 'pre_launch') {
      await this._previewPreLaunchWipe(details, warnings, blocked)
    } else if (mode === 'manual') {
      await this._previewManualCleanup(categories, time_range, filters, details, warnings, blocked)
    } else if (mode === 'auto') {
      await this._previewAutoCleanup(details, warnings)
    }

    const totalRows = details.reduce((sum, d) => sum + d.rows_to_delete, 0)
    const tablesAffected = details.filter(d => d.rows_to_delete > 0).length

    const previewToken = `pv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const expiresAt = new Date(Date.now() + PREVIEW_TOKEN_TTL_SECONDS * 1000)

    try {
      const redisClient = await getRawClient()
      await redisClient.set(
        `${PREVIEW_TOKEN_PREFIX}${previewToken}`,
        JSON.stringify({ options, details, expires_at: expiresAt, created_at: new Date() }),
        'EX',
        PREVIEW_TOKEN_TTL_SECONDS
      )
    } catch (redisErr) {
      logger.error('[数据清理] 预览令牌写入 Redis 失败:', { error: redisErr.message })
      throw new BusinessError('预览令牌存储失败，请检查 Redis 连接', 'SERVICE_FAILED', 500)
    }

    return {
      preview_token: previewToken,
      expires_at: BeijingTimeHelper.apiTimestamp(expiresAt),
      summary: {
        total_rows_to_delete: totalRows,
        tables_affected: tablesAffected,
        estimated_duration_seconds: Math.ceil(totalRows / 5000) + 2
      },
      details: details.filter(d => d.rows_to_delete > 0),
      warnings,
      blocked
    }
  }

  /**
   * 执行清理操作
   *
   * @param {Object} options - 执行参数
   * @param {string} options.preview_token - 预览令牌（5 分钟有效）
   * @param {boolean} [options.dry_run=false] - 干跑模式（只输出不删除）
   * @param {string} options.reason - 操作原因
   * @param {string} options.confirmation_text - 确认文字（必须为"确认删除"）
   * @param {number} operatorId - 操作人用户ID
   * @returns {Promise<Object>} 执行结果
   */
  async executeCleanup(options, operatorId) {
    const { preview_token, dry_run = false, reason, confirmation_text } = options

    if (confirmation_text !== '确认删除') {
      throw new BusinessError('确认文字不正确，请输入"确认删除"', 'SERVICE_ERROR', 400)
    }

    let cached
    try {
      const redisClient = await getRawClient()
      const cachedStr = await redisClient.get(`${PREVIEW_TOKEN_PREFIX}${preview_token}`)
      if (!cachedStr) {
        throw new BusinessError('预览令牌无效或已过期，请重新预览', 'SERVICE_INVALID', 400)
      }
      cached = JSON.parse(cachedStr)
    } catch (redisErr) {
      if (redisErr.message.includes('预览令牌')) throw redisErr
      logger.error('[数据清理] 读取预览令牌失败:', { error: redisErr.message })
      throw new BusinessError('预览令牌读取失败，请检查 Redis 连接', 'SERVICE_FAILED', 500)
    }

    if (new Date() > new Date(cached.expires_at)) {
      try {
        const redisClient = await getRawClient()
        await redisClient.del(`${PREVIEW_TOKEN_PREFIX}${preview_token}`)
      } catch (_) {}
      throw new BusinessError('预览令牌已过期，请重新预览', 'SERVICE_EXPIRED', 400)
    }

    const { details } = cached
    const mode = cached.options.mode
    const startTime = Date.now()
    const results = []

    /*
     * pre_launch 清档：自动进入维护模式，阻止用户端访问
     * 清档完成后（finally）自动退出维护模式
     */
    let maintenanceModeActivated = false
    if (mode === 'pre_launch' && !dry_run) {
      try {
        await this._setMaintenanceMode(true, operatorId, '数据清档 - 系统自动进入维护模式')
        maintenanceModeActivated = true
        logger.info('[数据清理] pre_launch 清档：已进入维护模式')
      } catch (mmError) {
        logger.error('[数据清理] 进入维护模式失败，中止清档:', { error: mmError.message })
        throw new BusinessError(
          '无法进入维护模式，清档操作已中止: ' + mmError.message,
          'SERVICE_FAILED',
          500
        )
      }
    }

    /*
     * L1 金融级数据对账校验
     * 清理包含 L1 表时，先调用 ItemLifecycleService 做资产/物品守恒校验
     * 校验不通过则拒绝清理 L1 表
     */
    const hasL1Tables = details.some(d => L1_FINANCIAL_TABLES.has(d.table_name))
    let reconciliationPassed = true
    if (hasL1Tables && !dry_run) {
      try {
        const [assetResult, itemResult] = await Promise.all([
          ItemLifecycleService.reconcileAssets(),
          ItemLifecycleService.reconcileItems()
        ])

        const assetOk = assetResult.balance_consistency.status === 'PASS'
        const itemOk =
          itemResult.item_conservation.status === 'PASS' &&
          itemResult.owner_consistency.status === 'PASS'

        if (!assetOk || !itemOk) {
          reconciliationPassed = false
          logger.warn('[数据清理] L1 对账校验未通过，L1 表将被跳过', {
            asset_balance: assetResult.balance_consistency.status,
            item_conservation: itemResult.item_conservation.status,
            item_owner: itemResult.owner_consistency.status
          })
        } else {
          logger.info('[数据清理] L1 对账校验通过')
        }
      } catch (reconcileError) {
        reconciliationPassed = false
        logger.error('[数据清理] L1 对账校验执行失败，L1 表将被跳过:', {
          error: reconcileError.message
        })
      }
    }

    const flatDeleteOrder = DELETE_TOPOLOGY.flat()

    const sortedDetails = [...details].sort((a, b) => {
      const idxA = flatDeleteOrder.indexOf(a.table_name)
      const idxB = flatDeleteOrder.indexOf(b.table_name)
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB)
    })

    try {
      for (const item of sortedDetails) {
        if (item.rows_to_delete === 0) continue

        /*
         * L0 保护：accounts 表允许条件删除（仅删 user 类型，保留 system 类型）
         * 其他 L0 表一律跳过
         */
        if (L0_PROTECTED_TABLES.has(item.table_name)) {
          if (item.table_name === 'accounts') {
            if (!item.where_clause || !item.where_clause.includes('account_type')) {
              results.push({
                table_name: 'accounts',
                deleted_count: 0,
                status: 'skipped',
                error: 'accounts 表缺少系统账户保护条件，拒绝执行（必须指定 account_type 筛选）'
              })
              continue
            }
          } else {
            continue
          }
        }

        /* L1 对账未通过时跳过金融级表 */
        if (L1_FINANCIAL_TABLES.has(item.table_name) && !reconciliationPassed) {
          results.push({
            table_name: item.table_name,
            deleted_count: 0,
            status: 'skipped',
            error: 'L1 对账校验未通过，跳过金融级表'
          })
          continue
        }

        try {
          let deletedCount = 0

          if (dry_run) {
            deletedCount = item.rows_to_delete
            logger.info(`[数据清理][干跑] ${item.table_name}: 将删除 ${deletedCount} 行`)
          } else {
            // eslint-disable-next-line no-await-in-loop
            deletedCount = await this._batchDelete(
              item.table_name,
              item.where_clause || '1=1',
              item.batch_size || 1000,
              item.where_replacements
            )
            logger.info(`[数据清理] ${item.table_name}: 已删除 ${deletedCount} 行`)
          }

          results.push({
            table_name: item.table_name,
            deleted_count: deletedCount,
            status: 'success'
          })
        } catch (error) {
          logger.error(`[数据清理] ${item.table_name} 删除失败:`, { error: error.message })
          results.push({
            table_name: item.table_name,
            deleted_count: 0,
            status: 'error',
            error: error.message
          })
        }
      }

      const totalDeleted = results.reduce((sum, r) => sum + r.deleted_count, 0)
      const durationSeconds = (Date.now() - startTime) / 1000

      if (!dry_run) {
        try {
          await AuditLogService.logOperation({
            operator_id: operatorId,
            operation_type: OPERATION_TYPES.DATA_CLEANUP,
            target_type: AUDIT_TARGET_TYPES.DATA_MANAGEMENT,
            target_id: `cleanup_${mode}`,
            action: `数据清理（${mode === 'pre_launch' ? '上线前清档' : mode === 'auto' ? '自动清理' : '手动清理'}）`,
            before_data: { mode, tables_affected: details.length },
            after_data: { total_deleted: totalDeleted, duration_seconds: durationSeconds, results },
            reason,
            idempotency_key: `data_cleanup_${Date.now()}`
          })
        } catch (auditError) {
          logger.error('[数据清理] 审计日志写入失败:', { error: auditError.message })
        }
      }

      try {
        const redisClient = await getRawClient()
        await redisClient.del(`${PREVIEW_TOKEN_PREFIX}${preview_token}`)
      } catch (_) {}

      /*
       * pre_launch 清档完成后自动重建超管账号
       * 读取 .env SUPER_ADMIN_MOBILE 配置，创建用户并关联 admin 角色（role_id=2）
       */
      let super_admin_rebuilt = false
      if (mode === 'pre_launch' && !dry_run && totalDeleted > 0) {
        try {
          const superAdminMobile = process.env.SUPER_ADMIN_MOBILE
          if (!superAdminMobile) {
            logger.warn('[数据清理] 未配置 SUPER_ADMIN_MOBILE 环境变量，跳过超管重建')
          } else {
            await TransactionManager.execute(async transaction => {
              let user
              try {
                user = await UserService.registerUser(superAdminMobile, {
                  nickname: '超级管理员',
                  status: 'active',
                  transaction
                })
              } catch (regErr) {
                if (regErr.code === 'MOBILE_EXISTS') {
                  user = { user_id: regErr.data.user_id }
                  logger.info('[数据清理] 超管账号已存在，跳过创建', { user_id: user.user_id })
                } else {
                  throw regErr
                }
              }

              const adminRole = await Role.findOne({
                where: { role_id: 2 },
                transaction
              })
              if (adminRole) {
                await UserRole.findOrCreate({
                  where: { user_id: user.user_id, role_id: 2 },
                  defaults: { user_id: user.user_id, role_id: 2 },
                  transaction
                })
                logger.info('[数据清理] 超管角色关联成功', {
                  user_id: user.user_id,
                  role_id: 2,
                  role_name: adminRole.role_name
                })
              } else {
                logger.warn('[数据清理] role_id=2 不存在，请手动创建 admin 角色')
              }
            })

            super_admin_rebuilt = true
            logger.info('[数据清理] pre_launch 清档后超管重建完成', { mobile: superAdminMobile })
          }
        } catch (rebuildError) {
          logger.error('[数据清理] 超管重建失败（非致命）:', { error: rebuildError.message })
        }
      }

      return {
        mode,
        dry_run,
        total_deleted: totalDeleted,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        details: results,
        reconciliation_passed: reconciliationPassed,
        super_admin_rebuilt
      }
    } finally {
      /* pre_launch 清档完成后退出维护模式（无论成功或失败） */
      if (maintenanceModeActivated) {
        try {
          await this._setMaintenanceMode(false, operatorId, '数据清档完成 - 系统自动退出维护模式')
          logger.info('[数据清理] pre_launch 清档：已退出维护模式')
        } catch (mmError) {
          logger.error('[数据清理] 退出维护模式失败（需手动关闭）:', { error: mmError.message })
        }
      }
    }
  }

  /**
   * 获取清理历史（从 admin_operation_logs 查询）
   *
   * @param {Object} pagination - { page, page_size }
   * @returns {Promise<Object>} 分页清理历史
   */
  async getHistory(pagination = {}) {
    const { page = 1, page_size = 20 } = pagination
    const offset = (page - 1) * page_size

    const [rows] = await sequelize.query(
      `
      SELECT aol.admin_operation_log_id, aol.operator_id, u.mobile AS operator_mobile,
             aol.action, aol.before_data, aol.after_data, aol.reason,
             aol.created_at
      FROM admin_operation_logs aol
      LEFT JOIN users u ON u.user_id = aol.operator_id
      WHERE aol.operation_type = 'data_cleanup'
      ORDER BY aol.created_at DESC
      LIMIT :limit OFFSET :offset
    `,
      { replacements: { limit: page_size, offset } }
    )

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) AS total
      FROM admin_operation_logs
      WHERE operation_type = 'data_cleanup'
    `)

    const total = countResult[0]?.total || 0

    return {
      items: rows.map(r => ({
        log_id: r.admin_operation_log_id,
        operator_id: r.operator_id,
        operator_mobile: r.operator_mobile,
        action: r.action,
        before_data: this._safeJsonParse(r.before_data),
        after_data: this._safeJsonParse(r.after_data),
        reason: r.reason,
        created_at: r.created_at
      })),
      pagination: {
        page,
        page_size,
        total: Number(total),
        total_pages: Math.ceil(Number(total) / page_size)
      }
    }
  }

  /**
   * 执行自动清理（定时任务调用）
   *
   * @param {number} maxExecutionSeconds - 最大执行时间（秒）
   * @returns {Promise<Object>} 各表清理结果
   */
  async runAutoCleanup(maxExecutionSeconds = 300) {
    const startTime = Date.now()
    const config = await this.getPolicies()

    if (config.max_execution_time_seconds) {
      maxExecutionSeconds = config.max_execution_time_seconds
    }

    if (!config.policies || config.policies.length === 0) {
      logger.info('[自动清理] 无清理策略配置，跳过')
      return { skipped: true, reason: 'no_policies' }
    }

    const results = []

    for (const policy of config.policies) {
      if (!policy.enabled) continue

      const elapsed = (Date.now() - startTime) / 1000
      if (elapsed >= maxExecutionSeconds) {
        logger.warn(
          `[自动清理] 超时中止（已执行 ${elapsed.toFixed(1)}s / 上限 ${maxExecutionSeconds}s）`
        )
        break
      }

      const timeField = L3_AUTO_CLEANUP_TABLES[policy.table]
      if (!timeField) {
        logger.warn(`[自动清理] 表 ${policy.table} 不在自动清理白名单中，跳过`)
        continue
      }

      const cutoffDate = new Date(Date.now() - policy.retention_days * 24 * 60 * 60 * 1000)
      const whereClause = `\`${timeField}\` < :cutoff_date`
      const replacements = { cutoff_date: cutoffDate.toISOString().slice(0, 19) }

      try {
        // eslint-disable-next-line no-await-in-loop
        const deletedCount = await this._batchDelete(
          policy.table,
          whereClause,
          policy.batch_size || 1000,
          replacements
        )

        results.push({
          table: policy.table,
          deleted_count: deletedCount,
          retention_days: policy.retention_days,
          status: 'success'
        })

        if (deletedCount > 0) {
          logger.info(
            `[自动清理] ${policy.table}: 删除 ${deletedCount} 行（保留 ${policy.retention_days} 天）`
          )
        }
      } catch (error) {
        logger.error(`[自动清理] ${policy.table} 失败:`, { error: error.message })
        results.push({
          table: policy.table,
          deleted_count: 0,
          status: 'error',
          error: error.message
        })
      }
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted_count, 0)

    if (totalDeleted > 0) {
      try {
        await AuditLogService.logOperation({
          // 修正（2026-05-30）：原 operator_id:0 违反外键约束（无 user_id=0），改用系统定时任务专用用户
          operator_id: SYSTEM_DAILY_JOB_USER_ID,
          operation_type: OPERATION_TYPES.DATA_CLEANUP,
          target_type: AUDIT_TARGET_TYPES.DATA_MANAGEMENT,
          target_id: 'auto_cleanup',
          action: '定时自动清理',
          after_data: { total_deleted: totalDeleted, results },
          reason: '定时自动清理任务',
          idempotency_key: `auto_cleanup_${Date.now()}`
        })
      } catch (auditError) {
        logger.error('[自动清理] 审计日志写入失败:', { error: auditError.message })
      }
    }

    return {
      total_deleted: totalDeleted,
      duration_seconds: Math.round((Date.now() - startTime) / 100) / 10,
      results
    }
  }

  /**
   * 上线前一次性「清行为」治理任务（文档第二十三章 23.1 最终基线）
   *
   * 与 pre_launch 全量清档不同：本方法只清"用户行为/流水数据"，保留全部业务配置 +
   * 系统字典 + 账号权限（仅保留 user 32 / 11021）。包含：
   * 1) 金融互锁组整组清理（清前记录对账、清后断言守恒，拍板项1）；
   * 2) 普通行为表批量清理；
   * 3) 测试用户清理（reattribute 保留配置的 created_by → 32、孤儿 store_staff 硬删、删账号/角色/用户）；
   * 4) 活动统计归零（拍板：保配置、清行为）。
   *
   * @param {Object} options - { dry_run, reason, confirmation_text }
   * @param {number} operatorId - 操作人用户ID
   * @returns {Promise<Object>} 执行/干跑结果
   */
  async executePreLaunchBehaviorWipe(options, operatorId) {
    const { dry_run = false, reason, confirmation_text } = options

    if (process.env.NODE_ENV === 'production') {
      throw new BusinessError('生产环境禁止执行清档操作', 'SERVICE_FORBIDDEN', 403)
    }
    if (!dry_run && confirmation_text !== '确认删除') {
      throw new BusinessError('确认文字不正确，请输入"确认删除"', 'SERVICE_ERROR', 400)
    }
    const startTime = Date.now()
    const results = { behavior_tables: [], financial_tables: [], test_users: {}, zeroed: {} }

    /*
     * 步骤0：清前对账（仅信息记录）。测试数据天然不守恒，故不作为前置门，
     * 真正的安全保证 = 金融组整组单事务清 + 清后断言残留为 0（见步骤2）。
     */
    const reconcileBefore = await Promise.all([
      ItemLifecycleService.reconcileAssets(),
      ItemLifecycleService.reconcileItems()
    ])
    results.reconcile_before = {
      asset_balance: reconcileBefore[0].balance_consistency.status,
      asset_global: reconcileBefore[0].global_conservation.status,
      item_conservation: reconcileBefore[1].item_conservation.status,
      item_owner: reconcileBefore[1].owner_consistency.status
    }
    // 步骤1：普通行为表批量清理（按拓扑顺序，子表在前）
    for (const tableName of PRE_LAUNCH_BEHAVIOR_WIPE_TABLES) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const [cntRows] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``)
        const before = Number(cntRows[0]?.cnt || 0)
        let deleted = 0
        if (before > 0 && !dry_run) {
          // eslint-disable-next-line no-await-in-loop
          deleted = await this._batchDelete(tableName, '1=1', 2000)
        } else if (dry_run) {
          deleted = before
        }
        results.behavior_tables.push({
          table_name: tableName,
          rows: before,
          deleted,
          status: 'success'
        })
      } catch (error) {
        results.behavior_tables.push({
          table_name: tableName,
          rows: 0,
          deleted: 0,
          status: 'error',
          error: error.message
        })
      }
    }
    // 步骤2：金融互锁组（整组单事务清 + 清后断言残留=0）
    if (dry_run) {
      for (const t of FINANCIAL_INTERLOCK_TABLES) {
        // eslint-disable-next-line no-await-in-loop
        const [r] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``)
        results.financial_tables.push({
          table_name: t,
          rows: Number(r[0]?.cnt || 0),
          deleted: 0,
          status: 'dry_run'
        })
      }
    } else {
      await this._wipeFinancialInterlockGroup(results)
    }
    // 步骤3：测试用户清理（仅保留 32 / 11021）
    if (dry_run) {
      const [u] = await sequelize.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE user_id NOT IN (${PRE_LAUNCH_KEEP_USER_IDS.join(',')})`
      )
      results.test_users = { to_delete: Number(u[0]?.cnt || 0), status: 'dry_run' }
    } else {
      await this._cleanupTestUsers(results)
    }
    // 步骤3.5：媒体分类清理（§16.3：保留 materials/categories 图标，清 products/uploads 及其挂载、清孤儿挂载）
    if (dry_run) {
      const [mf] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM media_files WHERE folder IN ('products','uploads')"
      )
      const [ma] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM media_attachments WHERE attachable_type NOT IN ('material_asset_type','category')"
      )
      results.media = {
        media_files_to_delete: Number(mf[0]?.cnt || 0),
        media_attachments_to_delete: Number(ma[0]?.cnt || 0),
        status: 'dry_run'
      }
    } else {
      await this._cleanupMediaByClassification(results)
    }
    // 步骤4：活动统计归零（保配置、清行为）
    if (!dry_run) {
      const [pz] = await sequelize.query(
        'UPDATE lottery_campaign_prizes SET total_win_count = 0, daily_win_count = 0'
      )
      const [cz] = await sequelize.query(
        'UPDATE lottery_campaigns SET remaining_prize_pool = total_prize_pool, ' +
          'pool_budget_remaining = pool_budget_total, total_draws = 0'
      )
      results.zeroed = {
        lottery_campaign_prizes: pz?.affectedRows ?? 0,
        lottery_campaigns: cz?.affectedRows ?? 0
      }
    } else {
      results.zeroed = { status: 'dry_run' }
    }

    // 步骤5：清后对账（非 dry_run 时断言金融组守恒/残留为 0）
    if (!dry_run) {
      const after = await Promise.all([
        ItemLifecycleService.reconcileAssets(),
        ItemLifecycleService.reconcileItems()
      ])
      results.reconcile_after = {
        asset_balance: after[0].balance_consistency.status,
        item_conservation: after[1].item_conservation.status,
        item_owner: after[1].owner_consistency.status
      }
    }

    const durationSeconds = Math.round(((Date.now() - startTime) / 1000) * 10) / 10
    if (!dry_run) {
      await this._auditPreLaunchBehaviorWipe(operatorId, reason, results, durationSeconds)
    }
    return { mode: 'pre_launch_behavior', dry_run, duration_seconds: durationSeconds, ...results }
  }

  /**
   * 安全 JSON 解析（不抛出异常）
   * @param {*} value - 待解析值
   * @returns {*} 解析结果，失败时返回原值
   * @private
   */
  _safeJsonParse(value) {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 预览上线前清档影响
   * @param {Array} details - 影响详情列表（输出参数）
   * @param {Array} warnings - 警告列表（输出参数）
   * @param {Array} blocked - 阻断列表（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过输出参数写入
   * @private
   */
  async _previewPreLaunchWipe(details, warnings, blocked) {
    if (process.env.NODE_ENV === 'production') {
      blocked.push('生产环境禁止执行清档操作')
      return
    }

    const FeatureFlag = this.models.FeatureFlag
    if (FeatureFlag) {
      const flag = await FeatureFlag.findOne({ where: { flag_key: 'data_pre_launch_wipe' } })
      if (!flag || !flag.is_enabled) {
        blocked.push('清档功能未启用（feature_flag: data_pre_launch_wipe 需要设置为 enabled）')
        return
      }
    }

    const allTables = DELETE_TOPOLOGY.flat()

    for (const tableName of allTables) {
      if (L0_PROTECTED_TABLES.has(tableName)) continue

      try {
        // eslint-disable-next-line no-await-in-loop
        const [result] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``, {
          raw: true
        })
        const count = result[0]?.cnt || 0

        if (count > 0) {
          let safetyLevel = 'L2'
          if (L1_FINANCIAL_TABLES.has(tableName)) safetyLevel = 'L1'
          if (L3_AUTO_CLEANUP_TABLES[tableName]) safetyLevel = 'L3'

          details.push({
            table_name: tableName,
            rows_to_delete: Number(count),
            safety_level: safetyLevel,
            where_clause: '1=1',
            batch_size: 2000,
            cascade_effects: []
          })
        }
      } catch (_) {
        // 表可能已不存在（如 legacy 表已 DROP）
      }
    }

    // accounts 表特殊处理：只删 user 类型，保留 system 类型
    try {
      const [accountResult] = await sequelize.query(
        "SELECT COUNT(*) AS cnt FROM accounts WHERE account_type = 'user'"
      )
      const userAccountCount = accountResult[0]?.cnt || 0
      if (userAccountCount > 0) {
        details.push({
          table_name: 'accounts',
          rows_to_delete: Number(userAccountCount),
          safety_level: 'L1',
          where_clause: "account_type = 'user'",
          batch_size: 500,
          cascade_effects: ['系统账户（account_type=system）将被保留']
        })
      }
    } catch (_) {}

    // users 表：清档时全部清除
    try {
      const [userResult] = await sequelize.query('SELECT COUNT(*) AS cnt FROM users')
      const userCount = userResult[0]?.cnt || 0
      if (userCount > 0) {
        details.push({
          table_name: 'users',
          rows_to_delete: Number(userCount),
          safety_level: 'L2',
          where_clause: '1=1',
          batch_size: 500,
          cascade_effects: ['清档后将通过 SUPER_ADMIN_MOBILE 重建超管账号']
        })
      }
    } catch (_) {}

    warnings.push('清档操作将清空全部测试数据，保留 L0 系统基石数据')
    warnings.push('7 个系统账户（account_type=system）将被保留')
    warnings.push('清档完成后将自动重建超管账号')
  }

  /**
   * 预览手动清理影响
   * @param {string[]} categories - 清理类目
   * @param {Object} timeRange - 时间范围
   * @param {Object} filters - 筛选条件
   * @param {Array} details - 影响详情列表（输出参数）
   * @param {Array} warnings - 警告列表（输出参数）
   * @param {Array} _blocked - 阻断列表（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过输出参数写入
   * @private
   */
  async _previewManualCleanup(categories, timeRange, filters, details, warnings, _blocked) {
    for (const catKey of categories) {
      const category = L2_CLEANUP_CATEGORIES[catKey]
      if (!category) {
        warnings.push(`未知清理类目: ${catKey}`)
        continue
      }

      for (const tableName of category.tables) {
        const conditions = []
        const replacements = {}

        if (timeRange?.start) {
          conditions.push(`\`${category.time_field}\` >= :time_start`)
          replacements.time_start = timeRange.start
        }
        if (timeRange?.end) {
          conditions.push(`\`${category.time_field}\` <= :time_end`)
          replacements.time_end = timeRange.end
        }

        if (category.status_filter) {
          const excludeList = category.status_filter.exclude.map(s => `'${s}'`).join(',')
          conditions.push(`\`${category.status_filter.field}\` NOT IN (${excludeList})`)
        }

        if (filters.user_id) {
          const userId = parseInt(filters.user_id, 10)
          if (!isNaN(userId) && userId > 0) {
            conditions.push('user_id = :filter_user_id')
            replacements.filter_user_id = userId
          }
        }

        if (filters.lottery_campaign_id) {
          const campaignId = parseInt(filters.lottery_campaign_id, 10)
          if (!isNaN(campaignId) && campaignId > 0) {
            const campaignTables = new Set([
              'lottery_draws',
              'lottery_draw_decisions',
              'lottery_user_daily_draw_quota',
              'lottery_campaign_user_quota',
              'lottery_campaign_quota_grants',
              'lottery_hourly_metrics',
              'lottery_daily_metrics',
              'lottery_alerts',
              'lottery_simulation_records',
              'lottery_presets'
            ])
            if (campaignTables.has(tableName)) {
              conditions.push('lottery_campaign_id = :filter_campaign_id')
              replacements.filter_campaign_id = campaignId
            }
          }
        }

        if (filters.business_type_prefix && typeof filters.business_type_prefix === 'string') {
          const prefix = filters.business_type_prefix.trim()
          if (prefix.length > 0 && prefix.length <= 50) {
            const businessTypeTables = new Set(['asset_transactions', 'item_ledger'])
            if (businessTypeTables.has(tableName)) {
              conditions.push('business_type LIKE :filter_biz_prefix')
              replacements.filter_biz_prefix = `${prefix}%`
            }
          }
        }

        const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1'

        try {
          // eslint-disable-next-line no-await-in-loop
          const [result] = await sequelize.query(
            `SELECT COUNT(*) AS cnt FROM \`${tableName}\` WHERE ${whereClause}`,
            { replacements }
          )
          const count = result[0]?.cnt || 0

          details.push({
            table_name: tableName,
            rows_to_delete: Number(count),
            safety_level: 'L2',
            category: catKey,
            category_label: category.label,
            where_clause: whereClause,
            where_replacements: replacements,
            batch_size: 1000,
            cascade_effects: []
          })
        } catch (error) {
          warnings.push(`表 ${tableName} 查询失败: ${error.message}`)
        }
      }
    }
  }

  /**
   * 预览自动清理影响
   * @param {Array} details - 影响详情列表（输出参数）
   * @param {Array} warnings - 警告列表（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过输出参数写入
   * @private
   */
  async _previewAutoCleanup(details, warnings) {
    const config = await this.getPolicies()
    if (!config.policies) return

    for (const policy of config.policies) {
      if (!policy.enabled) continue

      const timeField = L3_AUTO_CLEANUP_TABLES[policy.table]
      if (!timeField) continue

      const cutoffDate = new Date(Date.now() - policy.retention_days * 24 * 60 * 60 * 1000)
      const cutoffStr = cutoffDate.toISOString().slice(0, 19)
      const whereClause = `\`${timeField}\` < :cutoff_date`

      try {
        // eslint-disable-next-line no-await-in-loop
        const [result] = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM \`${policy.table}\` WHERE ${whereClause}`,
          { replacements: { cutoff_date: cutoffStr } }
        )
        const count = result[0]?.cnt || 0

        details.push({
          table_name: policy.table,
          rows_to_delete: Number(count),
          safety_level: 'L3',
          where_clause: whereClause,
          batch_size: policy.batch_size || 1000,
          retention_days: policy.retention_days,
          cascade_effects: []
        })
      } catch (error) {
        warnings.push(`表 ${policy.table} 查询失败: ${error.message}`)
      }
    }
  }

  /**
   * 设置/取消维护模式
   *
   * @param {boolean} enabled - true=进入维护模式，false=退出维护模式
   * @param {number} operatorId - 操作人用户ID
   * @param {string} reason - 操作原因
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _setMaintenanceMode(enabled, operatorId, reason) {
    await TransactionManager.execute(async transaction => {
      await AdminSystemService.updateSettings(
        'basic',
        {
          maintenance_mode: enabled,
          maintenance_message: enabled ? '系统正在执行数据清档操作，请稍后再访问' : ''
        },
        operatorId,
        { transaction, reason }
      )
    })
  }

  /**
   * 分批删除（避免长事务锁表）
   *
   * @param {string} tableName - 表名
   * @param {string} whereClause - WHERE 条件（支持 :named 占位符）
   * @param {number} batchSize - 每批删除行数
   * @param {Object} [replacements] - 参数化查询的替换值
   * @returns {Promise<number>} 总删除行数
   * @private
   */
  async _batchDelete(tableName, whereClause, batchSize = 1000, replacements = {}) {
    let totalDeleted = 0
    let batchDeleted = 0

    do {
      // eslint-disable-next-line no-await-in-loop
      const [, meta] = await sequelize.query(
        `DELETE FROM \`${tableName}\` WHERE ${whereClause} LIMIT :batch_limit`,
        { replacements: { ...replacements, batch_limit: batchSize } }
      )
      batchDeleted = meta?.affectedRows || 0
      totalDeleted += batchDeleted

      if (batchDeleted > 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => {
          setTimeout(resolve, 100)
        })
      }
    } while (batchDeleted >= batchSize)

    return totalDeleted
  }

  /**
   * 金融互锁组整组清理（单事务）+ 清后断言残留为 0
   *
   * 业务说明（拍板项1）：余额=流水累计、持有=账本推导，必须整组一起清。
   * 全量清空后表为空 = 天然守恒，故安全保证 = 单事务原子性 + 清后残留断言，
   * 任一表未清空则整体回滚。
   * @param {Object} results - 结果收集对象（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过 results 输出
   * @private
   */
  async _wipeFinancialInterlockGroup(results) {
    await TransactionManager.execute(async transaction => {
      for (const t of FINANCIAL_INTERLOCK_TABLES) {
        // eslint-disable-next-line no-await-in-loop
        const [before] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``, {
          transaction
        })
        // eslint-disable-next-line no-await-in-loop
        const [, meta] = await sequelize.query(`DELETE FROM \`${t}\``, { transaction })
        // eslint-disable-next-line no-await-in-loop
        const [after] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``, {
          transaction
        })
        const remaining = Number(after[0]?.cnt || 0)
        if (remaining !== 0) {
          throw new BusinessError(
            `金融互锁组清理后 ${t} 仍残留 ${remaining} 行，事务回滚`,
            'SERVICE_FAILED',
            500
          )
        }
        results.financial_tables.push({
          table_name: t,
          rows: Number(before[0]?.cnt || 0),
          deleted: meta?.affectedRows ?? 0,
          status: 'success'
        })
      }
    })
  }

  /**
   * 测试用户清理（仅保留 PRE_LAUNCH_KEEP_USER_IDS）
   *
   * 处理保留配置表对待删用户的 RESTRICT 外键阻塞（已拍板）：
   * - lottery_campaign_pricing_config.created_by → 改归属到超管 32（保留配置，仅换作者）；
   * - store_staff 指向被删用户的绑定行 → 硬删孤儿（门店保留，仅去失效员工关系）。
   * 随后按 子表→accounts→user_roles→users 顺序删除，全部在单事务内。
   * @param {Object} results - 结果收集对象（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过 results 输出
   * @private
   */
  async _cleanupTestUsers(results) {
    const keep = PRE_LAUNCH_KEEP_USER_IDS.join(',')
    await TransactionManager.execute(async transaction => {
      // 1) 解开保留配置表的 RESTRICT 外键：created_by 改归属超管 32
      const [reattr] = await sequelize.query(
        `UPDATE lottery_campaign_pricing_config SET created_by = 32 ` +
          `WHERE created_by NOT IN (${keep})`,
        { transaction }
      )
      // updated_by 同样可能指向待删用户（SET NULL 外键，置空即可）
      await sequelize.query(
        `UPDATE lottery_campaign_pricing_config SET updated_by = NULL ` +
          `WHERE updated_by IS NOT NULL AND updated_by NOT IN (${keep})`,
        { transaction }
      )

      // 2) 硬删指向待删用户的 store_staff 孤儿绑定（门店保留）
      const [staffDel] = await sequelize.query(
        `DELETE FROM store_staff WHERE user_id NOT IN (${keep})`,
        { transaction }
      )

      // 3) 删账号体系：account_asset_balances → accounts → user_roles → users
      const balDelSql =
        `DELETE aab FROM account_asset_balances aab ` +
        `JOIN accounts a ON a.account_id = aab.account_id ` +
        `WHERE a.user_id NOT IN (${keep})`
      const [balDel] = await sequelize.query(balDelSql, { transaction })
      const [acctDel] = await sequelize.query(
        `DELETE FROM accounts WHERE user_id NOT IN (${keep})`,
        { transaction }
      )
      const [roleDel] = await sequelize.query(
        `DELETE FROM user_roles WHERE user_id NOT IN (${keep})`,
        { transaction }
      )
      const [userDel] = await sequelize.query(`DELETE FROM users WHERE user_id NOT IN (${keep})`, {
        transaction
      })

      results.test_users = {
        pricing_created_by_reattributed: reattr?.affectedRows ?? 0,
        store_staff_orphans_deleted: staffDel?.affectedRows ?? 0,
        account_asset_balances_deleted: balDel?.affectedRows ?? 0,
        accounts_deleted: acctDel?.affectedRows ?? 0,
        user_roles_deleted: roleDel?.affectedRows ?? 0,
        users_deleted: userDel?.affectedRows ?? 0,
        status: 'success'
      }
    })
  }

  /**
   * 媒体分类清理（文档第十六章 §16.3）
   *
   * 业务说明：media_files 是平台统一图库，含配置类图标（materials 材料图标 / categories 品类图标，
   * 引用方 material_asset_types / categories 已决定保留，图标必须跟着留）。
   * 故不整表清，而是：
   * - media_attachments：清 attachable_type NOT IN ('material_asset_type','category')（清商品等业务挂载，含父已清空的孤儿）；
   * - media_files：清 folder IN ('products','uploads')（测试商品图/杂图），保留 materials/categories 图标。
   * 顺序：先清挂载（子）再清文件（父），避免 media_attachments.media_id 外键阻塞。
   * @param {Object} results - 结果收集对象（输出参数）
   * @returns {Promise<void>} 无返回值，结果通过 results 输出
   * @private
   */
  async _cleanupMediaByClassification(results) {
    const [, maMeta] = await sequelize.query(
      "DELETE FROM media_attachments WHERE attachable_type NOT IN ('material_asset_type','category')"
    )
    const [, mfMeta] = await sequelize.query(
      "DELETE FROM media_files WHERE folder IN ('products','uploads')"
    )
    results.media = {
      media_attachments_deleted: maMeta?.affectedRows ?? 0,
      media_files_deleted: mfMeta?.affectedRows ?? 0,
      kept: 'materials/categories 图标保留',
      status: 'success'
    }
  }

  /**
   * 写入上线前清行为治理任务的审计日志
   *
   * 说明（拍板项2）：admin_operation_logs 在步骤1已整表清空，本审计在清理完成后写入，
   * 因此"本次清档审计"被自然保留（新记录晚于清空动作）。
   * @param {number} operatorId - 操作人用户ID
   * @param {string} reason - 操作原因
   * @param {Object} results - 执行结果
   * @param {number} durationSeconds - 耗时（秒）
   * @returns {Promise<void>} 无返回值，仅写入审计日志
   * @private
   */
  async _auditPreLaunchBehaviorWipe(operatorId, reason, results, durationSeconds) {
    try {
      const behaviorDeleted = results.behavior_tables.reduce((s, r) => s + (r.deleted || 0), 0)
      const financialDeleted = results.financial_tables.reduce((s, r) => s + (r.deleted || 0), 0)
      await AuditLogService.logOperation({
        operator_id: operatorId,
        operation_type: OPERATION_TYPES.DATA_CLEANUP,
        target_type: AUDIT_TARGET_TYPES.DATA_MANAGEMENT,
        target_id: 'pre_launch_behavior_wipe',
        action: '上线前一次性清行为（保配置/清行为/归零统计）',
        after_data: {
          behavior_deleted: behaviorDeleted,
          financial_deleted: financialDeleted,
          test_users: results.test_users,
          media: results.media,
          zeroed: results.zeroed,
          reconcile_after: results.reconcile_after,
          duration_seconds: durationSeconds
        },
        reason: reason || '上线前清测试数据',
        idempotency_key: `pre_launch_behavior_${Date.now()}`
      })
    } catch (auditError) {
      logger.error('[清行为] 审计日志写入失败:', { error: auditError.message })
    }
  }
}

module.exports = DataManagementService
