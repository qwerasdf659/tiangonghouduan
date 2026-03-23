/**
 * 统一订单号 / 流水号 / 账单号生成器（编码规则统一方案 2026-03-22）
 *
 * 业务语义：
 * - 面向用户与客服的可读编号，与内部自增主键、UUID、幂等键分离
 * - 格式：{2位业务码}{YYMMDD}{6位序列}{2位随机十六进制大写}，总长度 16
 *
 * 业务码（bizCode）：
 * - EM 兑换、BD 竞价（exchange_records）
 * - TO 交易市场订单（trade_orders）
 * - RD 核销订单（redemption_orders）
 * - LT 抽奖记录（lottery_draws）
 * - CS 消费买单（consumption_records）
 * - TX 资产流水（asset_transactions.transaction_no）
 * - AB 广告计费账单（ad_billing_records.billing_no）
 *
 * 序列号：使用业务表主键或辅助自增列（如 draw_seq、redemption_seq）取模 1e6 后补零 6 位，
 * 保证 VARCHAR 定长且大表仍可生成（与文档「recordId 补零」一致，超长主键用低位 6 位）。
 *
 * @module utils/OrderNoGenerator
 */

'use strict'

const crypto = require('crypto')

/**
 * 将时间转为北京时间下的 YYMMDD 字符串
 * @param {Date} d - 时间点
 * @returns {string} 例如 260323
 */
function toBeijingYyMmDd(d) {
  const s = d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })
  const local = new Date(s)
  const yy = String(local.getFullYear()).slice(-2)
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const dd = String(local.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * 订单号/业务编号统一生成器
 * 格式: {BizCode}{YYMMDD}{sequence} 共 16 位
 */
class OrderNoGenerator {
  /**
   * 生成统一格式编号
   *
   * @param {string} bizCode - 两位业务大写字母，如 EM、TO、TX
   * @param {number|string} recordId - 序列来源（主键或 draw_seq / redemption_seq）
   * @param {Date|string|number} [createdAt] - 业务创建时间（决定日期段；默认当前时间）
   * @returns {string} 16 位编号
   */
  static generate(bizCode, recordId, createdAt) {
    if (!bizCode || typeof bizCode !== 'string' || bizCode.length !== 2) {
      throw new Error('OrderNoGenerator.generate: bizCode 必须为 2 位字符串')
    }
    const id = Number(recordId)
    if (!Number.isFinite(id) || id < 0) {
      throw new Error('OrderNoGenerator.generate: recordId 必须为有效非负数字')
    }
    const at = createdAt !== undefined && createdAt !== null ? new Date(createdAt) : new Date()
    if (Number.isNaN(at.getTime())) {
      throw new Error('OrderNoGenerator.generate: createdAt 无效')
    }
    const datePart = toBeijingYyMmDd(at)
    const seqPart = String(id % 1_000_000).padStart(6, '0')
    const randomPart = crypto.randomBytes(1).toString('hex').toUpperCase()
    return `${bizCode.toUpperCase()}${datePart}${seqPart}${randomPart}`
  }
}

module.exports = OrderNoGenerator
