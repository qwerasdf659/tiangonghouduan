/**
 * 统一中文显示名称映射
 *
 * 文件路径：constants/DisplayNames.js
 *
 * 设计原则：
 * - 单一真相源：所有中文显示名称集中在此文件
 * - 后端服务返回数据时统一添加 display_name 字段
 * - 前端直接使用后端返回的中文名称，无需维护映射表
 *
 * 使用方式：
 * const { getDisplayName, STATUS_NAMES, OPERATION_TYPE_NAMES } = require('../constants/DisplayNames')
 *
 * 创建时间：2026-01-21
 * 版本：V4.6.0
 */

'use strict'

// ==================== 状态中文名称 ====================

/**
 * 通用状态名称
 */
const STATUS_NAMES = Object.freeze({
  // 用户状态
  active: '正常',
  inactive: '未激活',
  banned: '已封禁',
  suspended: '已暂停',
  deleted: '已删除',

  // 订单/交易状态
  created: '已创建',
  pending: '待处理',
  processing: '处理中',
  frozen: '已冻结',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败',
  refunded: '已退款',
  expired: '已过期',

  // 审核状态
  approved: '已通过',
  rejected: '已拒绝',
  reviewing: '审核中',

  // 商品状态
  on_sale: '上架中',
  off_sale: '已下架',
  sold_out: '已售罄',

  // 通知状态
  sent: '已发送',
  read: '已读',
  unread: '未读',

  // 挂牌状态
  listed: '挂牌中',
  delisted: '已下架',
  sold: '已售出',

  // 开关状态
  enabled: '已启用',
  disabled: '已禁用',
  on: '开启',
  off: '关闭',

  // 执行结果
  success: '成功',
  error: '错误',
  timeout: '超时'
})

// ==================== 审计操作类型中文名称 ====================

/**
 * 审计操作类型名称
 * 与 AuditOperationTypes.js 中的 OPERATION_TYPES 对应
 */
const OPERATION_TYPE_NAMES = Object.freeze({
  // 积分资产类
  points_adjust: '积分调整',
  asset_adjustment: '资产调整',
  asset_orphan_cleanup: '孤儿冻结清理',

  // 商品管理类
  exchange_audit: '兑换审核',
  product_update: '商品修改',
  product_create: '商品创建',
  product_delete: '商品删除',

  // 用户管理类
  user_status_change: '用户状态变更',
  role_assign: '角色分配',
  role_change: '角色变更',
  user_update: '用户信息更新',
  user_create: '用户创建',
  user_delete: '用户删除',
  user_ban: '用户封禁',
  user_unban: '用户解封',

  // 奖品活动类
  prize_config: '奖品配置',
  prize_create: '奖品创建',
  prize_update: '奖品修改',
  prize_delete: '奖品删除',
  campaign_create: '活动创建',
  campaign_update: '活动修改',
  campaign_delete: '活动删除',

  // 抽奖管理类
  lottery_force_win: '强制中奖',
  lottery_reset_luck: '重置运气值',
  lottery_adjust_rate: '概率调整',
  lottery_draw: '抽奖执行',
  lottery_config: '抽奖配置',

  // 库存操作类
  inventory_add: '库存新增',
  inventory_use: '库存使用',
  inventory_transfer: '库存转让',
  inventory_expire: '库存过期',
  inventory_verify: '库存核销',

  // 系统配置类
  system_config: '系统配置',
  system_update: '系统更新',
  session_login: '登录',
  session_logout: '登出',
  login_success: '登录成功',
  login_failed: '登录失败',

  // 消费审核类
  consumption_audit: '消费审核',
  consumption_approve: '消费审核通过',
  consumption_reject: '消费审核拒绝',

  // 市场交易类
  market_listing_create: '创建挂牌',
  market_listing_cancel: '取消挂牌',
  market_trade_create: '创建交易',
  market_trade_complete: '完成交易',

  // 通知类
  notification_send: '发送通知',
  announcement_publish: '发布公告'
})

// ==================== 目标类型中文名称 ====================

/**
 * 审计目标类型名称
 */
const TARGET_TYPE_NAMES = Object.freeze({
  user: '用户',
  admin: '管理员',
  product: '商品',
  prize: '奖品',
  campaign: '活动',
  lottery: '抽奖',
  order: '订单',
  trade_order: '交易订单',
  market_listing: '市场挂牌',
  inventory: '库存',
  item: '物品',
  points: '积分',
  asset: '资产',
  system: '系统',
  config: '配置',
  notification: '通知',
  announcement: '公告',
  session: '会话',
  role: '角色',
  permission: '权限'
})

// ==================== 资产类型中文名称 ====================

/**
 * 资产类型名称
 */
const ASSET_TYPE_NAMES = Object.freeze({
  POINTS: '积分',
  BUDGET_POINTS: '预算积分',
  DIAMOND: '钻石',
  red_shard: '红晶',
  gold_coin: '金币',
  silver_coin: '银币'
})

// ==================== 用户类型中文名称 ====================

/**
 * 用户类型名称
 */
const USER_TYPE_NAMES = Object.freeze({
  normal: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员',
  merchant: '商户',
  customer_service: '客服',
  operator: '运营',
  developer: '开发者'
})

// ==================== 角色中文名称 ====================

/**
 * 角色名称
 */
const ROLE_NAMES = Object.freeze({
  super_admin: '超级管理员',
  admin: '管理员',
  operator: '运营人员',
  customer_service: '客服人员',
  merchant: '商户',
  user: '普通用户',
  guest: '访客'
})

// ==================== 通用工具函数 ====================

/**
 * 获取中文显示名称
 * @param {string} key - 英文键名
 * @param {string} category - 分类（status/operation/target/asset/user_type/role）
 * @returns {string} 中文名称，如果没有则返回原始key
 */
function getDisplayName(key, category = 'status') {
  if (!key) return '-'

  const maps = {
    status: STATUS_NAMES,
    operation: OPERATION_TYPE_NAMES,
    operation_type: OPERATION_TYPE_NAMES,
    target: TARGET_TYPE_NAMES,
    target_type: TARGET_TYPE_NAMES,
    asset: ASSET_TYPE_NAMES,
    asset_type: ASSET_TYPE_NAMES,
    user_type: USER_TYPE_NAMES,
    role: ROLE_NAMES
  }

  const map = maps[category]
  if (map && map[key]) {
    return map[key]
  }

  // 尝试从所有映射中查找
  for (const m of Object.values(maps)) {
    if (m[key]) return m[key]
  }

  return key
}

/**
 * 批量添加显示名称到数据数组
 * @param {Array} dataList - 数据数组
 * @param {Object} fieldMappings - 字段映射 { 原字段名: 分类 }
 * @returns {Array} 添加了display_name字段的数据数组
 *
 * @example
 * const orders = addDisplayNames(orders, {
 *   status: 'status',
 *   operation_type: 'operation'
 * })
 */
function addDisplayNames(dataList, fieldMappings) {
  if (!Array.isArray(dataList)) return dataList

  return dataList.map(item => {
    const newItem = { ...item }

    for (const [field, category] of Object.entries(fieldMappings)) {
      if (item[field] !== undefined) {
        newItem[`${field}_display`] = getDisplayName(item[field], category)
      }
    }

    return newItem
  })
}

/**
 * 为单个对象添加显示名称
 * @param {Object} data - 数据对象
 * @param {Object} fieldMappings - 字段映射
 * @returns {Object} 添加了display字段的数据对象
 */
function addDisplayName(data, fieldMappings) {
  if (!data || typeof data !== 'object') return data

  const newData = { ...data }

  for (const [field, category] of Object.entries(fieldMappings)) {
    if (data[field] !== undefined) {
      newData[`${field}_display`] = getDisplayName(data[field], category)
    }
  }

  return newData
}

module.exports = {
  // 映射表
  STATUS_NAMES,
  OPERATION_TYPE_NAMES,
  TARGET_TYPE_NAMES,
  ASSET_TYPE_NAMES,
  USER_TYPE_NAMES,
  ROLE_NAMES,

  // 工具函数
  getDisplayName,
  addDisplayNames,
  addDisplayName
}
