/**
 * 审计日志 target_type 标准化常量和工具函数
 *
 * 文件路径：constants/AuditTargetTypes.js
 *
 * 职责：
 * - 定义标准资源码集合（单数 snake_case）
 * - 提供规范化和校验工具函数
 *
 * 设计原则：
 * - 资源码与代码重构/模型更名解耦
 * - 统一使用单数 snake_case 格式
 * - 保留原始值用于审计追溯
 *
 * 重构记录：
 * - 2026-01-21: 删除 TARGET_TYPE_LEGACY_MAPPING（数据库已100%标准化，无旧格式数据）
 *
 * 创建时间：2026-01-09
 * 版本：V4.6.0
 */

'use strict'

/**
 * 标准资源码集合（单数 snake_case）
 *
 * 分类：
 * - 用户与权限
 * - 资产与账本
 * - 物品与库存
 * - 商品与兑换
 * - 消费与审核
 * - 抽奖系统
 * - 市场交易
 * - 系统配置
 *
 * @constant {Object}
 */
const AUDIT_TARGET_TYPES = Object.freeze({
  // ========== 用户与权限 ==========
  USER: 'user',
  ROLE: 'role', // 角色（角色管理功能 2026-01-26）
  USER_ROLE_CHANGE_RECORD: 'user_role_change_record',
  USER_STATUS_CHANGE_RECORD: 'user_status_change_record',
  CUSTOMER_SERVICE_SESSION: 'customer_service_session',

  // ========== 资产与账本 ==========
  ACCOUNT: 'account',
  ACCOUNT_ASSET_BALANCE: 'account_asset_balance',
  ASSET_TRANSACTION: 'asset_transaction',

  // ========== 物品与库存 ==========
  ITEM_INSTANCE: 'item_instance',
  ITEM_INSTANCE_EVENT: 'item_instance_event',
  REDEMPTION_ORDER: 'redemption_order',

  // ========== 商品与兑换 ==========
  PRODUCT: 'product',
  EXCHANGE_ITEM: 'exchange_item',
  EXCHANGE_RECORD: 'exchange_record',

  // ========== 消费与审核 ==========
  CONSUMPTION_RECORD: 'consumption_record',
  CONTENT_REVIEW_RECORD: 'content_review_record',

  // ========== 抽奖系统 ==========
  LOTTERY_CAMPAIGN: 'lottery_campaign',
  LOTTERY_PRIZE: 'lottery_prize',
  LOTTERY_DRAW: 'lottery_draw',
  LOTTERY_MANAGEMENT_SETTING: 'lottery_management_setting',
  LOTTERY_CLEAR_SETTING_RECORD: 'lottery_clear_setting_record',
  LOTTERY_SIMULATION_RECORD: 'lottery_simulation_record',

  // ========== 市场交易 ==========
  MARKET_LISTING: 'market_listing',
  TRADE_ORDER: 'trade_order',

  // ========== 系统配置 ==========
  SYSTEM_SETTING: 'system_setting',
  AD_CAMPAIGN: 'ad_campaign',
  FEATURE_FLAG: 'feature_flag'
})

/**
 * 所有有效的 target_type 值（标准码集合）
 * @constant {string[]}
 */
const VALID_TARGET_TYPES = Object.freeze(Object.values(AUDIT_TARGET_TYPES))

/**
 * 规范化 target_type 值
 *
 * 处理逻辑：
 * 1. 如果已经是标准码，直接返回
 * 2. 尝试自动转换 PascalCase → snake_case
 * 3. 如果是未知值，返回原值（由调用方决定是否报错）
 *
 * @param {string} targetType - 原始 target_type 值
 * @returns {string} 规范化后的 target_type 值
 */
function normalizeTargetType(targetType) {
  if (!targetType || typeof targetType !== 'string') {
    return targetType
  }

  // 1. 检查是否已经是标准码
  if (VALID_TARGET_TYPES.includes(targetType)) {
    return targetType
  }

  // 2. 尝试自动转换 PascalCase → snake_case
  const autoConverted = targetType
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')

  if (VALID_TARGET_TYPES.includes(autoConverted)) {
    return autoConverted
  }

  // 3. 无法识别，返回原值
  return targetType
}

/**
 * 检查 target_type 是否为有效的标准码
 *
 * @param {string} targetType - target_type 值（应为规范化后的值）
 * @returns {boolean} 是否为有效的标准码
 */
function isValidTargetType(targetType) {
  return VALID_TARGET_TYPES.includes(targetType)
}

/**
 * 获取 target_type 的显示名称（用于前端展示）
 *
 * @param {string} targetType - target_type 值
 * @returns {string} 显示名称
 */
function getTargetTypeDisplayName(targetType) {
  const displayNames = {
    user: '用户',
    role: '角色',
    user_role_change_record: '角色变更记录',
    user_status_change_record: '状态变更记录',
    customer_service_session: '客服会话',
    account: '账户',
    account_asset_balance: '资产余额',
    asset_transaction: '资产流水',
    item_instance: '道具实例',
    item_instance_event: '道具事件',
    redemption_order: '兑换订单',
    product: '商品',
    exchange_item: '兑换物品',
    exchange_record: '兑换记录',
    consumption_record: '消费记录',
    content_review_record: '内容审核记录',
    lottery_campaign: '抽奖活动',
    lottery_prize: '抽奖奖品',
    lottery_draw: '抽奖记录',
    lottery_management_setting: '抽奖管理设置',
    lottery_clear_setting_record: '清库存设置记录',
    lottery_simulation_record: '策略模拟记录',
    market_listing: '市场挂牌',
    trade_order: '交易订单',
    system_setting: '系统设置',
    ad_campaign: '广告计划',
    feature_flag: '功能开关'
  }

  return displayNames[targetType] || targetType
}

/**
 * 批量规范化 target_type 值
 *
 * @param {string[]} targetTypes - 原始 target_type 值数组
 * @returns {Object} { normalized: string[], mapping: Object } 规范化结果和映射关系
 */
function normalizeTargetTypes(targetTypes) {
  const mapping = {}
  const normalized = targetTypes.map(t => {
    const n = normalizeTargetType(t)
    if (n !== t) {
      mapping[t] = n
    }
    return n
  })
  return { normalized, mapping }
}

/**
 * 启动时校验数据库 target_type 一致性
 *
 * @description 【P0-5 修复】防止 target_type 漂移
 * 在应用启动时校验数据库 admin_operation_logs.target_type 字段
 * 是否存在未在常量中定义的值（可能的数据漂移）
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Promise<{valid: boolean, unknown: string[], stats: Object}>} 校验结果
 *
 * @example
 * // 在 app.js 启动时调用
 * const { validateTargetTypeConsistency } = require('./constants/AuditTargetTypes')
 * const result = await validateTargetTypeConsistency(sequelize)
 * if (!result.valid) {
 *   console.error('target_type 存在未知值：', result.unknown)
 * }
 */
async function validateTargetTypeConsistency(sequelize) {
  const logger = require('../utils/logger').logger

  try {
    logger.info('[启动校验] 开始校验审计日志 target_type 一致性...')

    // 1. 查询数据库中所有不同的 target_type 值
    const [results] = await sequelize.query(`
      SELECT target_type, COUNT(*) as count
      FROM admin_operation_logs
      WHERE target_type IS NOT NULL
      GROUP BY target_type
      ORDER BY count DESC
    `)

    if (results.length === 0) {
      logger.info('[启动校验] admin_operation_logs 表为空，跳过 target_type 校验')
      return { valid: true, unknown: [], stats: {}, skipped: true }
    }

    // 2. 检查每个 target_type 是否在有效集合中
    const unknown = []
    const stats = {
      total_types: results.length,
      total_records: 0,
      valid_records: 0,
      unknown_records: 0,
      distribution: {}
    }

    results.forEach(row => {
      const targetType = row.target_type
      const count = parseInt(row.count, 10)
      stats.total_records += count
      stats.distribution[targetType] = count

      if (!isValidTargetType(targetType)) {
        unknown.push({
          value: targetType,
          count,
          normalized: normalizeTargetType(targetType),
          is_normalizable: isValidTargetType(normalizeTargetType(targetType))
        })
        stats.unknown_records += count
      } else {
        stats.valid_records += count
      }
    })

    // 3. 生成校验结果
    if (unknown.length > 0) {
      logger.warn('[启动校验] ⚠️ target_type 一致性校验发现未知值', {
        unknown_count: unknown.length,
        unknown_records: stats.unknown_records,
        unknown_values: unknown.map(u => ({
          value: u.value,
          count: u.count,
          suggestion: u.is_normalizable
            ? `可规范化为 ${u.normalized}`
            : '需要添加到 AUDIT_TARGET_TYPES'
        }))
      })

      // 如果所有未知值都可以规范化，则只是警告
      const allNormalizable = unknown.every(u => u.is_normalizable)
      if (allNormalizable) {
        logger.info('[启动校验] 所有未知值都可通过 normalizeTargetType() 规范化，不阻断启动')
        return { valid: true, unknown, stats, warning: true }
      }

      // 存在无法规范化的值，校验失败
      logger.error('[启动校验] ❌ 存在无法规范化的 target_type 值，请检查数据或添加到常量定义')
      return { valid: false, unknown, stats }
    }

    logger.info('[启动校验] ✅ target_type 一致性校验通过', {
      total_types: stats.total_types,
      total_records: stats.total_records
    })

    return { valid: true, unknown: [], stats }
  } catch (error) {
    logger.error('[启动校验] target_type 校验出错', {
      error: error.message,
      stack: error.stack
    })

    // 校验出错不阻断启动，但记录错误
    return { valid: true, unknown: [], stats: {}, error: error.message }
  }
}

module.exports = {
  // 常量
  AUDIT_TARGET_TYPES,
  VALID_TARGET_TYPES,

  // 工具函数
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  normalizeTargetTypes,

  // 启动校验函数
  validateTargetTypeConsistency
}
