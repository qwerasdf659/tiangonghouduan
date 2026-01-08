/**
 * 可交易资产类型常量
 *
 * 文件路径：constants/TradableAssetTypes.js
 *
 * 职责：
 * - 定义C2C市场可交易/不可交易的资产类型黑白名单
 * - 提供资产交易权限验证函数
 * - 作为硬编码保护层，防止积分类资产被误交易
 *
 * 🔴 P0-4已拍板决策：
 * - POINTS 和 BUDGET_POINTS 永久禁止在C2C市场交易
 * - 即使数据库 is_tradable=true 也不允许
 * - 黑名单优先级高于数据库配置
 *
 * 创建时间：2026-01-09
 * 版本：V4.0.0
 */

'use strict'

/**
 * C2C市场禁止交易的资产类型（硬编码黑名单）
 *
 * 🔴 重要：
 * - 这些资产类型永远不允许在C2C市场交易
 * - 即使数据库 material_asset_types.is_tradable = true 也会被拒绝
 * - 黑名单检查优先于数据库字段检查
 *
 * 业务原因：
 * - POINTS：系统积分，只能通过官方渠道获取/消耗
 * - BUDGET_POINTS：预算积分，专用于特定活动
 * - 积分类资产如果可交易，会导致：
 *   1. 积分价值体系崩溃
 *   2. 刷分/洗分风险
 *   3. 用户投诉和运营混乱
 *
 * @type {string[]}
 */
const C2C_BLACKLISTED_ASSET_CODES = Object.freeze([
  'POINTS', // 系统积分 - 永久禁止C2C交易
  'BUDGET_POINTS' // 预算积分 - 永久禁止C2C交易
])

/**
 * 检查资产类型是否被C2C交易黑名单禁止
 *
 * @param {string} asset_code - 资产代码
 * @returns {boolean} true=禁止交易，false=允许（但仍需检查数据库is_tradable字段）
 *
 * @example
 * isBlacklistedForC2C('POINTS') // true - 禁止交易
 * isBlacklistedForC2C('BUDGET_POINTS') // true - 禁止交易
 * isBlacklistedForC2C('GOLD_COIN') // false - 允许（需继续检查数据库）
 */
function isBlacklistedForC2C(asset_code) {
  return C2C_BLACKLISTED_ASSET_CODES.includes(asset_code)
}

/**
 * 获取资产禁止交易的原因
 *
 * @param {string} asset_code - 资产代码
 * @returns {string|null} 禁止原因，如果允许交易则返回null
 *
 * @example
 * getBlacklistReason('POINTS') // '积分类资产禁止在C2C市场交易'
 * getBlacklistReason('GOLD_COIN') // null
 */
function getBlacklistReason(asset_code) {
  if (!isBlacklistedForC2C(asset_code)) {
    return null
  }

  const reasons = {
    POINTS: '系统积分禁止在C2C市场交易（只能通过官方渠道获取/消耗）',
    BUDGET_POINTS: '预算积分禁止在C2C市场交易（专用于特定活动预算）'
  }

  return reasons[asset_code] || '该资产类型禁止在C2C市场交易'
}

/**
 * 验证资产类型是否可在C2C市场交易（综合检查）
 *
 * 检查顺序（优先级从高到低）：
 * 1. 黑名单检查（硬编码保护，最高优先级）
 * 2. 数据库 is_tradable 字段（由调用方额外检查）
 *
 * @param {string} asset_code - 资产代码
 * @returns {Object} 验证结果
 * @returns {boolean} returns.allowed - 是否允许交易
 * @returns {string|null} returns.reason - 不允许的原因
 *
 * @example
 * validateC2CTradability('POINTS')
 * // { allowed: false, reason: '系统积分禁止在C2C市场交易...' }
 *
 * validateC2CTradability('GOLD_COIN')
 * // { allowed: true, reason: null } // 但仍需检查数据库is_tradable
 */
function validateC2CTradability(asset_code) {
  // 1. 黑名单检查（最高优先级）
  const blacklistReason = getBlacklistReason(asset_code)
  if (blacklistReason) {
    return {
      allowed: false,
      reason: blacklistReason,
      source: 'HARDCODED_BLACKLIST'
    }
  }

  // 2. 允许交易（但调用方需继续检查数据库is_tradable字段）
  return {
    allowed: true,
    reason: null,
    source: null
  }
}

/**
 * 创建C2C交易资产禁止错误对象
 *
 * @param {string} asset_code - 资产代码
 * @param {string} display_name - 资产显示名称
 * @returns {Error} 带有标准化字段的错误对象
 */
function createC2CBlacklistError(asset_code, display_name = asset_code) {
  const reason = getBlacklistReason(asset_code) || `资产${asset_code}禁止在C2C市场交易`

  const error = new Error(`该资产类型禁止在C2C市场交易: ${display_name}`)
  error.code = 'ASSET_C2C_BLACKLISTED' // 区别于 ASSET_NOT_TRADABLE
  error.statusCode = 400
  error.details = {
    asset_code,
    display_name,
    reason,
    blacklist_source: 'HARDCODED_PROTECTION',
    suggestion: '积分类资产请通过官方活动/商城获取和使用'
  }

  return error
}

module.exports = {
  // 黑名单常量
  C2C_BLACKLISTED_ASSET_CODES,

  // 验证函数
  isBlacklistedForC2C,
  getBlacklistReason,
  validateC2CTradability,
  createC2CBlacklistError
}
