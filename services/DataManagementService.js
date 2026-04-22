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
  new Set([
    'asset_transactions',
    'item_ledger',
    'account_asset_balances',
    'items',
    'trade_orders',
    'item_holds'
  ])
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
  ad_report_daily_snapshots: 'report_date',
  ad_dau_daily_stats: 'stat_date',
  system_dictionary_history: 'created_at',
  ad_billing_records: 'created_at'
})

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
      'lottery_management_settings',
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
  market_listings: {
    label: '市场挂牌',
    tables: ['market_listings'],
    time_field: 'created_at',
    status_filter: { field: 'status', exclude: ['active'] }
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
  market_snapshots: {
    label: '市场快照',
    tables: ['market_price_snapshots', 'exchange_rates'],
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
    'lottery_management_settings',
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
    'market_price_snapshots',
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
    'trade_orders',
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
  ['market_listings', 'customer_service_sessions', 'ad_campaigns'],
  /*
   * 第四层
   * products 表由 ExchangeItem 模型管理（原 exchange_items 已 DROP）
   */
  ['items', 'lottery_prizes', 'exchange_items'],
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
      throw new Error('清理策略配置不存在')
    }

    const policy = config.policies.find(p => p.table === tableName)
    if (!policy) {
      throw new Error(`未找到表 ${tableName} 的清理策略`)
    }

    const beforeData = { ...policy }

    if (updates.retention_days !== undefined) {
      if (updates.retention_days < 1 || updates.retention_days > 365) {
        throw new Error('保留天数必须在 1-365 之间')
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
      throw new Error('预览令牌存储失败，请检查 Redis 连接')
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
      throw new Error('确认文字不正确，请输入"确认删除"')
    }

    let cached
    try {
      const redisClient = await getRawClient()
      const cachedStr = await redisClient.get(`${PREVIEW_TOKEN_PREFIX}${preview_token}`)
      if (!cachedStr) {
        throw new Error('预览令牌无效或已过期，请重新预览')
      }
      cached = JSON.parse(cachedStr)
    } catch (redisErr) {
      if (redisErr.message.includes('预览令牌')) throw redisErr
      logger.error('[数据清理] 读取预览令牌失败:', { error: redisErr.message })
      throw new Error('预览令牌读取失败，请检查 Redis 连接')
    }

    if (new Date() > new Date(cached.expires_at)) {
      try {
        const redisClient = await getRawClient()
        await redisClient.del(`${PREVIEW_TOKEN_PREFIX}${preview_token}`)
      } catch (_) {}
      throw new Error('预览令牌已过期，请重新预览')
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
        throw new Error('无法进入维护模式，清档操作已中止: ' + mmError.message)
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
          operator_id: 0,
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
              'lottery_management_settings',
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
}

module.exports = DataManagementService
