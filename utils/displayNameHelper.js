/**
 * displayNameHelper - 中文显示名称辅助函数
 *
 * 用于在业务数据中自动附加中文显示名称和颜色信息
 *
 * 核心功能：
 * 1. 为单条数据对象添加 _display 和 _color 后缀字段
 * 2. 为数组数据批量添加显示名称（优化批量查询）
 * 3. 支持自定义字段映射配置
 *
 * 使用示例：
 * ```javascript
 * const { attachDisplayNames } = require('../utils/displayNameHelper')
 *
 * // 单条数据
 * const order = { trade_id: 1, status: 'completed' }
 * await attachDisplayNames(order, [
 *   { field: 'status', dictType: 'trade_order_status' }
 * ])
 * // 结果：{ trade_id: 1, status: 'completed', status_display: '已完成', status_color: 'bg-success' }
 *
 * // 数组数据
 * const orders = [{ status: 'pending' }, { status: 'completed' }]
 * await attachDisplayNames(orders, [
 *   { field: 'status', dictType: 'trade_order_status' }
 * ])
 * ```
 *
 * @module utils/displayNameHelper
 * @author 中文化显示名称系统
 * @since 2026-01-22
 * @see docs/中文化显示名称实施文档.md
 * @see services/DisplayNameService.js
 */

'use strict'

const DisplayNameService = require('../services/DisplayNameService')
const logger = require('./logger').logger

/**
 * 为数据对象/数组附加中文显示名称和颜色
 *
 * @param {Object|Array} data - 要处理的数据（单条或数组）
 * @param {Array} mappings - 字段映射配置数组
 * @param {string} mappings[].field - 原始字段名（如 'status'）
 * @param {string} mappings[].dictType - 字典类型（如 'trade_order_status'）
 * @param {string} [mappings[].displayField] - 自定义显示字段名，默认为 field_display
 * @param {string} [mappings[].colorField] - 自定义颜色字段名，默认为 field_color
 * @returns {Promise<Object|Array>} 附加了显示名称的数据（原地修改并返回）
 *
 * @example
 * // 基本用法
 * const data = { status: 'active' }
 * await attachDisplayNames(data, [{ field: 'status', dictType: 'user_status' }])
 * // 结果：{ status: 'active', status_display: '正常', status_color: 'bg-success' }
 *
 * @example
 * // 自定义字段名
 * const data = { trade_status: 'completed' }
 * await attachDisplayNames(data, [{
 *   field: 'trade_status',
 *   dictType: 'trade_order_status',
 *   displayField: 'trade_status_name',
 *   colorField: 'trade_status_badge'
 * }])
 */
async function attachDisplayNames(data, mappings) {
  // 参数校验
  if (!data) {
    return data
  }

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    logger.warn('[displayNameHelper] 未提供字段映射配置')
    return data
  }

  // 判断是数组还是单条数据
  const isArray = Array.isArray(data)
  const items = isArray ? data : [data]

  if (items.length === 0) {
    return data
  }

  try {
    // 收集所有需要查询的 dict_type:dict_code 组合
    const queryItems = new Set()

    for (const item of items) {
      for (const mapping of mappings) {
        const { field, dictType } = mapping
        const code = item[field]

        // 跳过空值
        if (code === null || code === undefined || code === '') {
          continue
        }

        // 处理可能的数字或其他类型，转为字符串
        const codeStr = String(code)
        queryItems.add(JSON.stringify({ type: dictType, code: codeStr }))
      }
    }

    // 批量查询显示名称
    const queryArray = Array.from(queryItems).map(item => JSON.parse(item))
    const displayMap = await DisplayNameService.batchGet(queryArray)

    // 为每条数据附加显示名称和颜色
    for (const item of items) {
      for (const mapping of mappings) {
        const { field, dictType, displayField, colorField } = mapping
        const code = item[field]

        // 计算目标字段名
        const targetDisplayField = displayField || `${field}_display`
        const targetColorField = colorField || `${field}_color`

        // 跳过空值，设置默认值
        if (code === null || code === undefined || code === '') {
          item[targetDisplayField] = null
          item[targetColorField] = null
          continue
        }

        // 查找显示名称
        const codeStr = String(code)
        const key = `${dictType}:${codeStr}`
        const displayInfo = displayMap.get(key)

        if (displayInfo) {
          item[targetDisplayField] = displayInfo.name
          item[targetColorField] = displayInfo.color
        } else {
          // 未找到映射，记录警告并设置默认值
          logger.debug('[displayNameHelper] 未找到字典映射', {
            dict_type: dictType,
            dict_code: codeStr
          })
          item[targetDisplayField] = codeStr // 使用原始值作为显示值
          item[targetColorField] = null
        }
      }
    }

    return data
  } catch (error) {
    logger.error('[displayNameHelper] 附加显示名称失败', {
      error: error.message,
      mappings: mappings.map(m => m.field)
    })

    // 错误时返回原始数据，不影响业务流程
    return data
  }
}

/**
 * 为单条数据附加单个字段的显示名称
 * （便捷方法，适用于只需要处理一个字段的场景）
 *
 * @param {Object} data - 要处理的数据对象
 * @param {string} field - 原始字段名
 * @param {string} dictType - 字典类型
 * @returns {Promise<Object>} 附加了显示名称的数据
 *
 * @example
 * const data = { status: 'pending' }
 * await attachSingleDisplayName(data, 'status', 'order_status')
 * // 结果：{ status: 'pending', status_display: '待处理', status_color: 'bg-warning' }
 */
async function attachSingleDisplayName(data, field, dictType) {
  return attachDisplayNames(data, [{ field, dictType }])
}

/**
 * 直接获取单个显示名称（不修改原数据）
 *
 * @param {string} dictType - 字典类型
 * @param {string} code - 字典编码
 * @returns {Promise<Object>} 显示名称和颜色对象，包含 name 和 color 属性
 *
 * @example
 * const { name, color } = await getDisplayNameInfo('user_status', 'active')
 * // 结果：{ name: '正常', color: 'bg-success' }
 */
async function getDisplayNameInfo(dictType, code) {
  if (!dictType || !code) {
    return { name: null, color: null }
  }

  try {
    const [name, color] = await Promise.all([
      DisplayNameService.getDisplayName(dictType, String(code)),
      DisplayNameService.getDisplayColor(dictType, String(code))
    ])

    return { name, color }
  } catch (error) {
    logger.error('[displayNameHelper] 获取显示名称失败', {
      error: error.message,
      dict_type: dictType,
      dict_code: code
    })
    return { name: null, color: null }
  }
}

/**
 * 获取指定类型的所有字典项（用于下拉选择等场景）
 *
 * @param {string} dictType - 字典类型
 * @returns {Promise<Array<{code: string, name: string, color: string}>>} 字典项列表
 *
 * @example
 * const options = await getDictOptions('user_status')
 * // 结果：[{ code: 'active', name: '正常', color: 'bg-success' }, ...]
 */
async function getDictOptions(dictType) {
  if (!dictType) {
    return []
  }

  try {
    return await DisplayNameService.getByType(dictType)
  } catch (error) {
    logger.error('[displayNameHelper] 获取字典选项失败', {
      error: error.message,
      dict_type: dictType
    })
    return []
  }
}

/**
 * 系统字典类型常量（完整版 - 56种）
 *
 * 与数据库 system_dictionaries.dict_type 完全对应
 * 方便业务代码引用，避免硬编码字符串
 *
 * 使用方式：
 * ```javascript
 * const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')
 *
 * await attachDisplayNames(data, [
 *   { field: 'status', dictType: DICT_TYPES.USER_STATUS }
 * ])
 * ```
 */
const DICT_TYPES = {
  // ==================== 用户相关 ====================
  USER_STATUS: 'user_status', // 用户状态
  USER_LEVEL: 'user_level', // 用户等级
  ACCOUNT_STATUS: 'account_status', // 账户状态
  ACCOUNT_TYPE: 'account_type', // 账户类型

  // ==================== 订单交易相关 ====================
  TRADE_ORDER_STATUS: 'trade_order_status', // 交易订单状态
  LISTING_STATUS: 'listing_status', // 挂牌状态
  LISTING_KIND: 'listing_kind', // 挂牌类型
  EXCHANGE_STATUS: 'exchange_status', // 兑换状态
  REDEMPTION_STATUS: 'redemption_status', // 核销状态
  DEBT_STATUS: 'debt_status', // 债务状态

  // ==================== 活动抽奖相关 ====================
  CAMPAIGN_STATUS: 'campaign_status', // 活动状态
  CAMPAIGN_TYPE: 'campaign_type', // 活动类型
  PRIZE_TYPE: 'prize_type', // 奖品类型
  REWARD_TIER: 'reward_tier', // 奖励档位
  DRAW_TYPE: 'draw_type', // 抽奖类型
  PIPELINE_TYPE: 'pipeline_type', // 管道类型
  BUDGET_MODE: 'budget_mode', // 预算模式
  FALLBACK_BEHAVIOR: 'fallback_behavior', // 降级行为
  ROLLOUT_STRATEGY: 'rollout_strategy', // 发布策略

  // ==================== 审计日志相关 ====================
  OPERATION_TYPE: 'operation_type', // 操作类型（30种）
  OPERATION_RESULT: 'operation_result', // 操作结果
  TARGET_TYPE: 'target_type', // 操作对象类型（12种）
  AUDIT_STATUS: 'audit_status', // 审核状态

  // ==================== 物品库存相关 ====================
  ITEM_STATUS: 'item_status', // 物品状态（available/locked/transferred/used/expired）
  ITEM_TYPE: 'item_type', // 物品类型（prize/product/voucher/tradable_item/service）
  PRODUCT_STATUS: 'product_status', // 商品状态
  PRODUCT_SPACE: 'product_space', // 商品空间

  // ==================== 门店商家相关 ====================
  STORE_STATUS: 'store_status', // 门店状态
  STORE_STAFF_STATUS: 'store_staff_status', // 门店员工状态
  STORE_STAFF_ROLE: 'store_staff_role', // 门店员工角色
  REGION_STATUS: 'region_status', // 区域状态
  MERCHANT_OPERATION_TYPE: 'merchant_operation_type', // 商家操作类型

  // ==================== 消费相关 ====================
  CONSUMPTION_STATUS: 'consumption_status', // 消费状态
  CONSUMPTION_FINAL_STATUS: 'consumption_final_status', // 消费最终状态

  // ==================== 客服消息相关 ====================
  CS_SESSION_STATUS: 'cs_session_status', // 客服会话状态
  MESSAGE_TYPE: 'message_type', // 消息类型
  MESSAGE_STATUS: 'message_status', // 消息状态
  MESSAGE_SOURCE: 'message_source', // 消息来源
  SENDER_TYPE: 'sender_type', // 发送者类型

  // ==================== 反馈相关 ====================
  FEEDBACK_CATEGORY: 'feedback_category', // 反馈分类
  FEEDBACK_STATUS: 'feedback_status', // 反馈状态

  // ==================== 风险告警相关 ====================
  RISK_ALERT_TYPE: 'risk_alert_type', // 风险告警类型
  RISK_ALERT_STATUS: 'risk_alert_status', // 风险告警状态
  RISK_SEVERITY: 'risk_severity', // 风险严重程度

  // ==================== 图片资源相关 ====================
  IMAGE_BUSINESS_TYPE: 'image_business_type', // 图片业务类型
  IMAGE_STATUS: 'image_status', // 图片状态

  // ==================== 公告系统相关 ====================
  ANNOUNCEMENT_TYPE: 'announcement_type', // 公告类型

  // ==================== 系统配置相关 ====================
  ENABLED_STATUS: 'enabled_status', // 启用状态
  YES_NO: 'yes_no', // 是/否
  PRIORITY: 'priority', // 优先级
  WEBSOCKET_STATUS: 'websocket_status', // WebSocket状态
  IDEMPOTENCY_STATUS: 'idempotency_status', // 幂等状态
  MANAGEMENT_SETTING_TYPE: 'management_setting_type', // 管理设置类型
  MANAGEMENT_SETTING_STATUS: 'management_setting_status', // 管理设置状态

  // ==================== 预设相关 ====================
  PRESET_STATUS: 'preset_status', // 预设状态
  PRESET_APPROVAL_STATUS: 'preset_approval_status', // 预设审批状态
  UNLOCK_METHOD: 'unlock_method', // 解锁方式

  // ==================== 抽奖告警相关（2026-02-06 新增） ====================
  LOTTERY_ALERT_TYPE: 'lottery_alert_type', // 抽奖告警类型（13种：预算/库存/中奖率/用户/系统等）
  LOTTERY_ALERT_STATUS: 'lottery_alert_status', // 抽奖告警状态（active/acknowledged/resolved）
  LOTTERY_ALERT_SEVERITY: 'lottery_alert_severity', // 抽奖告警级别（danger/warning/info）

  // ==================== P2 中文化新增（2026-02-06） ====================
  BANNER_POSITION: 'banner_position', // 弹窗广告位置（home/lottery/activity/profile）
  BANNER_LINK_TYPE: 'banner_link_type', // 弹窗链接类型（none/page/miniprogram/webview）
  ADVANCE_MODE: 'advance_mode', // 预设垫付模式（none/inventory/budget/both）
  PAYMENT_METHOD: 'payment_method', // 支付方式（wechat/alipay/cash/card）
  SCOPE_TYPE: 'scope_type', // 配额范围类型（global/campaign/rule）
  BATCH_OPERATION_TYPE: 'batch_operation_type', // 批量操作类型（quota_grant/campaign_status等）
  BUDGET_STATUS: 'budget_status', // 预算运行状态（active/paused/exhausted/warning）
  USER_PHASE: 'user_phase', // 用户生命周期阶段（newcomer/growth/mature/decline）
  DIMENSION_TYPE: 'dimension_type', // 分析维度类型（store/campaign/user_segment/time_period）
  ASSET_TYPE: 'asset_type' // 资产类型（points/balance/coupon/diamond/item）
}

module.exports = {
  attachDisplayNames,
  attachSingleDisplayName,
  getDisplayNameInfo,
  getDictOptions,
  DICT_TYPES
}
