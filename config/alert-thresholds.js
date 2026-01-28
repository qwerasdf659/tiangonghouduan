'use strict'

/**
 * @file 抽奖运营后台警报阈值配置
 * @description 定义抽奖监控和运营日报的警报阈值
 *
 * 设计原则（ADR-004）：
 * - 硬编码默认值：快速实现，减少配置复杂度
 * - 预留配置入口：未来可通过环境变量或数据库覆盖
 * - 分级告警：支持 warning 和 danger 两级
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md ADR-004
 * @version 1.0.0
 * @date 2026-01-28
 */

/**
 * 预算相关警报阈值
 * @constant
 */
const BUDGET_THRESHOLDS = {
  /**
   * 预算消耗率警告阈值（百分比）
   * 当日预算消耗达到此比例时显示 warning 状态
   */
  consumption_warning: parseFloat(process.env.ALERT_BUDGET_CONSUMPTION_WARNING) || 70,

  /**
   * 预算消耗率危险阈值（百分比）
   * 当日预算消耗达到此比例时显示 danger 状态
   */
  consumption_danger: parseFloat(process.env.ALERT_BUDGET_CONSUMPTION_DANGER) || 90,

  /**
   * 预算透支警告阈值（百分比）
   * 超出预算比例达到此值时触发警告
   */
  overdraft_warning: parseFloat(process.env.ALERT_BUDGET_OVERDRAFT_WARNING) || 5,

  /**
   * 预算透支危险阈值（百分比）
   * 超出预算比例达到此值时触发危险警报
   */
  overdraft_danger: parseFloat(process.env.ALERT_BUDGET_OVERDRAFT_DANGER) || 10
}

/**
 * 库存相关警报阈值
 * @constant
 */
const STOCK_THRESHOLDS = {
  /**
   * 库存不足警告阈值（数量）
   * 奖品库存低于此数量时显示 warning 状态
   */
  low_stock_warning: parseInt(process.env.ALERT_STOCK_LOW_WARNING) || 50,

  /**
   * 库存不足危险阈值（数量）
   * 奖品库存低于此数量时显示 danger 状态
   */
  low_stock_danger: parseInt(process.env.ALERT_STOCK_LOW_DANGER) || 10,

  /**
   * 库存不足警告阈值（百分比）
   * 相对于初始库存的百分比
   */
  low_stock_percent_warning: parseFloat(process.env.ALERT_STOCK_PERCENT_WARNING) || 20,

  /**
   * 库存不足危险阈值（百分比）
   * 相对于初始库存的百分比
   */
  low_stock_percent_danger: parseFloat(process.env.ALERT_STOCK_PERCENT_DANGER) || 5
}

/**
 * 转化率相关警报阈值
 * @constant
 */
const CONVERSION_THRESHOLDS = {
  /**
   * 高档中奖率过高警告阈值（百分比）
   * 高档奖品中奖率超过此值时警告（可能预算消耗过快）
   */
  high_tier_rate_warning: parseFloat(process.env.ALERT_HIGH_TIER_RATE_WARNING) || 30,

  /**
   * 高档中奖率过高危险阈值（百分比）
   */
  high_tier_rate_danger: parseFloat(process.env.ALERT_HIGH_TIER_RATE_DANGER) || 50,

  /**
   * 空奖率过高警告阈值（百分比）
   * 真正空奖（系统异常）比例超过此值时警告
   */
  empty_rate_warning: parseFloat(process.env.ALERT_EMPTY_RATE_WARNING) || 5,

  /**
   * 空奖率过高危险阈值（百分比）
   */
  empty_rate_danger: parseFloat(process.env.ALERT_EMPTY_RATE_DANGER) || 10,

  /**
   * 保底触发率过高警告阈值（百分比）
   * fallback 机制触发比例超过此值时警告（可能奖品配置有问题）
   */
  fallback_rate_warning: parseFloat(process.env.ALERT_FALLBACK_RATE_WARNING) || 20,

  /**
   * 保底触发率过高危险阈值（百分比）
   */
  fallback_rate_danger: parseFloat(process.env.ALERT_FALLBACK_RATE_DANGER) || 40
}

/**
 * ROI 相关警报阈值
 * @constant
 */
const ROI_THRESHOLDS = {
  /**
   * ROI 过低警告阈值
   * 活动 ROI 低于此值时警告（投入产出比不理想）
   */
  low_roi_warning: parseFloat(process.env.ALERT_ROI_LOW_WARNING) || 0.8,

  /**
   * ROI 过低危险阈值
   */
  low_roi_danger: parseFloat(process.env.ALERT_ROI_LOW_DANGER) || 0.5,

  /**
   * ROI 过高警告阈值
   * 活动 ROI 高于此值时警告（可能奖励不够吸引人）
   */
  high_roi_warning: parseFloat(process.env.ALERT_ROI_HIGH_WARNING) || 3.0,

  /**
   * ROI 过高危险阈值
   */
  high_roi_danger: parseFloat(process.env.ALERT_ROI_HIGH_DANGER) || 5.0
}

/**
 * 用户行为相关警报阈值
 * @constant
 */
const USER_BEHAVIOR_THRESHOLDS = {
  /**
   * 复购率过低警告阈值（百分比）
   * 复购用户比例低于此值时警告
   */
  repeat_rate_low_warning: parseFloat(process.env.ALERT_REPEAT_RATE_LOW_WARNING) || 10,

  /**
   * 复购率过低危险阈值（百分比）
   */
  repeat_rate_low_danger: parseFloat(process.env.ALERT_REPEAT_RATE_LOW_DANGER) || 5,

  /**
   * 单用户日抽奖次数过高警告阈值
   * 可能存在刷奖行为
   */
  user_daily_draws_warning: parseInt(process.env.ALERT_USER_DAILY_DRAWS_WARNING) || 50,

  /**
   * 单用户日抽奖次数过高危险阈值
   */
  user_daily_draws_danger: parseInt(process.env.ALERT_USER_DAILY_DRAWS_DANGER) || 100
}

/**
 * 获取警报级别
 * @param {number} value - 当前值
 * @param {number} warningThreshold - 警告阈值
 * @param {number} dangerThreshold - 危险阈值
 * @param {string} [direction='above'] - 判断方向：'above'（值越高越危险）或 'below'（值越低越危险）
 * @returns {string} 警报级别：'normal' | 'warning' | 'danger'
 */
function getAlertLevel(value, warningThreshold, dangerThreshold, direction = 'above') {
  if (direction === 'above') {
    // 值越高越危险
    if (value >= dangerThreshold) return 'danger'
    if (value >= warningThreshold) return 'warning'
    return 'normal'
  } else {
    // 值越低越危险
    if (value <= dangerThreshold) return 'danger'
    if (value <= warningThreshold) return 'warning'
    return 'normal'
  }
}

/**
 * 评估预算消耗警报状态
 * @param {number} consumptionRate - 消耗率（百分比，0-100）
 * @returns {Object} { level: string, message: string }
 */
function evaluateBudgetAlert(consumptionRate) {
  const level = getAlertLevel(
    consumptionRate,
    BUDGET_THRESHOLDS.consumption_warning,
    BUDGET_THRESHOLDS.consumption_danger,
    'above'
  )

  const messages = {
    normal: '预算消耗正常',
    warning: `预算消耗率达 ${consumptionRate.toFixed(1)}%，接近上限`,
    danger: `预算消耗率达 ${consumptionRate.toFixed(1)}%，即将耗尽`
  }

  return { level, message: messages[level] }
}

/**
 * 评估库存警报状态
 * @param {number} currentStock - 当前库存
 * @param {number} initialStock - 初始库存（可选，用于计算百分比）
 * @returns {Object} { level: string, message: string }
 */
function evaluateStockAlert(currentStock, initialStock = null) {
  // 优先使用绝对数量判断
  let level = getAlertLevel(
    currentStock,
    STOCK_THRESHOLDS.low_stock_warning,
    STOCK_THRESHOLDS.low_stock_danger,
    'below'
  )

  // 如果提供了初始库存，同时检查百分比
  if (initialStock && initialStock > 0 && level === 'normal') {
    const percentRemaining = (currentStock / initialStock) * 100
    level = getAlertLevel(
      percentRemaining,
      STOCK_THRESHOLDS.low_stock_percent_warning,
      STOCK_THRESHOLDS.low_stock_percent_danger,
      'below'
    )
  }

  const messages = {
    normal: '库存充足',
    warning: `库存不足，剩余 ${currentStock} 件`,
    danger: `库存紧急，仅剩 ${currentStock} 件`
  }

  return { level, message: messages[level] }
}

/**
 * 评估 ROI 警报状态
 * @param {number} roi - ROI 值
 * @returns {Object} { level: string, message: string, direction: string }
 */
function evaluateROIAlert(roi) {
  // ROI 过低
  if (roi <= ROI_THRESHOLDS.low_roi_danger) {
    return {
      level: 'danger',
      message: `ROI 过低 (${roi.toFixed(2)})，投入产出比不理想`,
      direction: 'low'
    }
  }
  if (roi <= ROI_THRESHOLDS.low_roi_warning) {
    return { level: 'warning', message: `ROI 偏低 (${roi.toFixed(2)})，建议优化`, direction: 'low' }
  }

  // ROI 过高
  if (roi >= ROI_THRESHOLDS.high_roi_danger) {
    return {
      level: 'danger',
      message: `ROI 过高 (${roi.toFixed(2)})，奖励可能不够吸引人`,
      direction: 'high'
    }
  }
  if (roi >= ROI_THRESHOLDS.high_roi_warning) {
    return {
      level: 'warning',
      message: `ROI 偏高 (${roi.toFixed(2)})，可考虑增加奖励`,
      direction: 'high'
    }
  }

  return { level: 'normal', message: 'ROI 正常', direction: 'normal' }
}

/**
 * 评估复购率警报状态
 * @param {number} repeatRate - 复购率（百分比，0-100）
 * @returns {Object} { level: string, message: string }
 */
function evaluateRepeatRateAlert(repeatRate) {
  const level = getAlertLevel(
    repeatRate,
    USER_BEHAVIOR_THRESHOLDS.repeat_rate_low_warning,
    USER_BEHAVIOR_THRESHOLDS.repeat_rate_low_danger,
    'below'
  )

  const messages = {
    normal: '复购率正常',
    warning: `复购率偏低 (${repeatRate.toFixed(1)}%)，用户粘性可能不足`,
    danger: `复购率过低 (${repeatRate.toFixed(1)}%)，需要关注用户留存`
  }

  return { level, message: messages[level] }
}

module.exports = {
  // 阈值配置
  BUDGET_THRESHOLDS,
  STOCK_THRESHOLDS,
  CONVERSION_THRESHOLDS,
  ROI_THRESHOLDS,
  USER_BEHAVIOR_THRESHOLDS,

  // 工具函数
  getAlertLevel,
  evaluateBudgetAlert,
  evaluateStockAlert,
  evaluateROIAlert,
  evaluateRepeatRateAlert
}
