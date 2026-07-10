/**
 * 业务序号编码生成器（BusinessSeqCodeGenerator）
 *
 * 编码规则：{PREFIX}{YYYYMMDD}{序号}，与 CampaignCodeGenerator 同范式。
 * 用于 S1 采购单号（PO）、S2 批次码（BC）、S3 寄卖单号（CS）等运营可读编号。
 *
 * @module utils/BusinessSeqCodeGenerator
 */

'use strict'

/* eslint-disable no-await-in-loop */

const BeijingTimeHelper = require('./timeHelper')
const { Op } = require('sequelize')

/** 默认序号位数（每日上限 999） */
const DEFAULT_SEQ_DIGITS = 3

/** 唯一约束冲突最大重试次数 */
const MAX_RETRY = 3

/**
 * @class BusinessSeqCodeGenerator
 */
class BusinessSeqCodeGenerator {
  /**
   * 生成业务序号编码
   *
   * @param {Object} options - 参数
   * @param {string} options.prefix - 前缀（如 PO、BC、CS）
   * @param {Object} options.model - Sequelize 模型（用于 count 当天数量）
   * @param {string} options.field - 唯一编码字段名（如 order_no、batch_code）
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @param {number} [options.seqDigits=3] - 序号补零位数
   * @returns {Promise<string>} 生成的编码
   */
  static async generate({ prefix, model, field, transaction, seqDigits = DEFAULT_SEQ_DIGITS }) {
    if (!prefix || typeof prefix !== 'string') {
      throw new Error('BusinessSeqCodeGenerator.generate: prefix 必填')
    }
    if (!model || !field || !transaction) {
      throw new Error('BusinessSeqCodeGenerator.generate: model/field/transaction 必填')
    }

    const now = BeijingTimeHelper.createBeijingTime()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}${mm}${dd}`
    const dayPrefix = `${prefix}${dateStr}`

    const todayCount = await model.count({
      where: { [field]: { [Op.like]: `${dayPrefix}%` } },
      transaction
    })

    const seq = String(todayCount + 1).padStart(seqDigits, '0')
    return `${dayPrefix}${seq}`
  }

  /**
   * 带重试的编码生成（处理极端并发 UNIQUE 冲突）
   *
   * @param {Object} options - 同 generate
   * @returns {Promise<string>} 唯一编码
   */
  static async generateWithRetry(options) {
    const { prefix, model, field, transaction, seqDigits = DEFAULT_SEQ_DIGITS } = options

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const code = await BusinessSeqCodeGenerator.generate(options)

      const existing = await model.findOne({
        where: { [field]: code },
        attributes: [Object.keys(model.rawAttributes).find(k => model.rawAttributes[k].primaryKey)],
        transaction
      })

      if (!existing) return code

      const dayPrefix = code.slice(0, prefix.length + 8)
      const maxCode = await model.max(field, {
        where: { [field]: { [Op.like]: `${dayPrefix}%` } },
        transaction
      })

      if (maxCode) {
        const maxSeq = parseInt(maxCode.slice(prefix.length + 8), 10) || 0
        return `${dayPrefix}${String(maxSeq + 1).padStart(seqDigits, '0')}`
      }
    }

    throw new Error(`业务编码生成失败：重试 ${MAX_RETRY} 次后仍有冲突`)
  }

  /**
   * 验证编码格式
   *
   * @param {string} code - 待验证编码
   * @param {string} prefix - 期望前缀
   * @returns {boolean} 是否有效
   */
  static validate(code, prefix) {
    if (!code || typeof code !== 'string' || !prefix) return false
    const re = new RegExp(`^${prefix}\\d{11,}$`)
    return re.test(code)
  }
}

module.exports = BusinessSeqCodeGenerator
