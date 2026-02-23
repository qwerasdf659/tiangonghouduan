/**
 * 物品追踪码生成器（TrackingCodeGenerator）
 *
 * 编码规则：{来源2位}{YYMMDD}{item_id补零到6位}
 *
 * 来源前缀映射：
 * - LT = lottery（抽奖）
 * - BD = bid_settlement（竞价结算）
 * - EX = exchange（兑换）
 * - AD = admin（管理员赠送）
 * - LG = legacy（历史数据/未知来源）
 * - TS = test（测试数据）
 *
 * 示例：LT260219028738 = 抽奖来源，2026年2月19日，第 28738 号物品
 *
 * 设计参考：
 * - 美团唯一券码（人类可读，客服能直接使用）
 * - Steam assetid（三层标识中的可读层）
 *
 * @module utils/TrackingCodeGenerator
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

/**
 * 来源 → 2位前缀映射
 * @type {Object<string, string>}
 */
const SOURCE_PREFIX_MAP = {
  lottery: 'LT',
  bid_settlement: 'BD',
  exchange: 'EX',
  admin: 'AD',
  legacy: 'LG',
  unknown: 'LG',
  test: 'TS'
}

/**
 * 追踪码生成器
 *
 * @class TrackingCodeGenerator
 */
class TrackingCodeGenerator {
  /**
   * 生成追踪码
   *
   * @param {Object} params - 参数对象
   * @param {number} params.item_id - 物品ID（自增主键）
   * @param {string} params.source - 物品来源（lottery/bid_settlement/exchange/admin/legacy/test）
   * @param {Date} [params.created_at] - 创建时间（默认当前时间）
   * @returns {string} 追踪码（格式：LT260219028738）
   */
  static generate({ item_id, source, created_at }) {
    const prefix = SOURCE_PREFIX_MAP[source] || 'LG'
    const date = created_at ? new Date(created_at) : new Date()

    // 北京时间（UTC+8）
    const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
    const yy = String(beijingDate.getUTCFullYear()).slice(-2)
    const mm = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(beijingDate.getUTCDate()).padStart(2, '0')

    const idPart = String(item_id).padStart(6, '0')

    return `${prefix}${yy}${mm}${dd}${idPart}`
  }

  /**
   * 解析追踪码
   *
   * @param {string} trackingCode - 追踪码
   * @returns {{ source_prefix: string, date_part: string, item_id: number } | null} 解析结果，格式错误返回 null
   */
  static parse(trackingCode) {
    if (!trackingCode || trackingCode.length < 10) return null

    const sourcePrefix = trackingCode.slice(0, 2)
    const datePart = trackingCode.slice(2, 8)
    const idPart = trackingCode.slice(8)

    const itemId = parseInt(idPart, 10)
    if (isNaN(itemId)) return null

    return {
      source_prefix: sourcePrefix,
      date_part: datePart,
      item_id: itemId
    }
  }

  /**
   * 验证追踪码格式
   *
   * @param {string} trackingCode - 待验证的追踪码
   * @returns {boolean} 格式是否有效
   */
  static validate(trackingCode) {
    if (!trackingCode || typeof trackingCode !== 'string') return false
    // 格式：2位字母 + 6位日期 + 至少1位数字ID
    return /^[A-Z]{2}\d{6,}$/.test(trackingCode)
  }

  /**
   * 判断标识符是追踪码还是数字ID
   * 用于 API 路由中 :identifier 的解析
   *
   * @param {string} identifier - 标识符
   * @returns {Object} 解析结果，包含 type ('tracking_code' 或 'item_id') 和 value
   */
  static resolveIdentifier(identifier) {
    if (this.validate(identifier)) {
      return { type: 'tracking_code', value: identifier }
    }

    const numericId = parseInt(identifier, 10)
    if (!isNaN(numericId) && numericId > 0) {
      return { type: 'item_id', value: numericId }
    }

    return { type: 'tracking_code', value: identifier }
  }
}

module.exports = TrackingCodeGenerator
