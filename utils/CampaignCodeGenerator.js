/**
 * 活动编码生成器（CampaignCodeGenerator）
 *
 * 编码规则：CAMP{YYYYMMDD}{4位自增序号}
 *
 * 示例：
 * - CAMP202602230001 = 2026年2月23日创建的第1个活动
 * - CAMP202602230002 = 同一天创建的第2个活动
 * - CAMP202603150001 = 2026年3月15日创建的第1个活动
 *
 * 设计决策（2026-02-22）：
 * - 后端自动生成，前端不参与（行业通用做法）
 * - 日期部分使用北京时间（复用 BeijingTimeHelper）
 * - 序号部分：当天已有同前缀活动数 + 1，补零到 4 位
 * - 唯一约束：数据库 UNIQUE 索引保底，冲突时序号 +1 重试
 * - 旧编码（如 BASIC_LOTTERY、CAMP_xxx_xxx）保留不动，新旧共存
 *
 * 参考：utils/TrackingCodeGenerator.js 的静态类 generate/parse/validate 三件套模式
 *
 * @module utils/CampaignCodeGenerator
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const BeijingTimeHelper = require('./timeHelper')
const { Op } = require('sequelize')

/**
 * 活动编码前缀（与现有 4 条旧编码 CAMP_xxx 自然过渡，无割裂感）
 * @type {string}
 */
const PREFIX = 'CAMP'

/**
 * 序号位数（每日上限 9999 个活动，远超实际需求）
 * @type {number}
 */
const SEQ_DIGITS = 4

/**
 * 唯一约束冲突时的最大重试次数
 * @type {number}
 */
const MAX_RETRY = 3

/**
 * 活动编码生成器
 *
 * @class CampaignCodeGenerator
 */
class CampaignCodeGenerator {
  /**
   * 生成活动编码
   *
   * 格式：CAMP{YYYYMMDD}{4位序号}
   * 示例：CAMP202602230001
   *
   * 生成逻辑：
   * 1. 取北京时间当天日期 YYYYMMDD
   * 2. 查询当天已有的同前缀活动数量
   * 3. 序号 = 数量 + 1，补零到 4 位
   *
   * @param {Object} options - 参数对象
   * @param {Object} options.transaction - Sequelize 事务对象（必填，遵循项目事务规范）
   * @returns {Promise<string>} 活动编码（如 CAMP202602230001）
   */
  static async generate({ transaction }) {
    const { LotteryCampaign } = require('../models')

    const now = BeijingTimeHelper.createBeijingTime()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}${mm}${dd}`
    const dayPrefix = `${PREFIX}${dateStr}`

    // 查询当天已有的同前缀活动数量（在事务内查询，保证并发安全）
    const todayCount = await LotteryCampaign.count({
      where: {
        campaign_code: { [Op.like]: `${dayPrefix}%` }
      },
      transaction
    })

    const seq = String(todayCount + 1).padStart(SEQ_DIGITS, '0')
    return `${dayPrefix}${seq}`
  }

  /**
   * 带重试的活动编码生成（处理极端并发场景下的 UNIQUE 冲突）
   *
   * 当两个管理员同时创建活动时，可能生成相同编码。
   * 冲突时序号 +1 重试，最多重试 MAX_RETRY 次。
   * 当前规模（4 个活动、1-2 个管理员），冲突概率为零。
   *
   * @param {Object} options - 参数对象
   * @param {Object} options.transaction - Sequelize 事务对象（必填）
   * @returns {Promise<string>} 唯一的活动编码
   * @throws {Error} 超过最大重试次数后抛出异常
   */
  static async generateWithRetry({ transaction }) {
    const { LotteryCampaign } = require('../models')

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      const code = await CampaignCodeGenerator.generate({ transaction })

      // 检查是否已存在（双重保险，配合数据库 UNIQUE 约束）
      const existing = await LotteryCampaign.findOne({
        where: { campaign_code: code },
        attributes: ['lottery_campaign_id'],
        transaction
      })

      if (!existing) {
        return code
      }

      // 冲突：使用当天最大序号 + 1
      const maxCode = await LotteryCampaign.max('campaign_code', {
        where: {
          campaign_code: {
            [Op.like]: `${code.slice(0, PREFIX.length + 8)}%`
          }
        },
        transaction
      })

      if (maxCode) {
        const maxSeq = parseInt(maxCode.slice(PREFIX.length + 8), 10) || 0
        return `${code.slice(0, PREFIX.length + 8)}${String(maxSeq + 1).padStart(SEQ_DIGITS, '0')}`
      }
    }

    throw new Error(`活动编码生成失败：重试 ${MAX_RETRY} 次后仍有冲突`)
  }

  /**
   * 解析活动编码
   *
   * @param {string} code - 活动编码（如 CAMP202602230001）
   * @returns {{ date_part: string, seq: number } | null} 解析结果，格式不匹配返回 null
   *
   * @example
   * CampaignCodeGenerator.parse('CAMP202602230001')
   * // { date_part: '20260223', seq: 1 }
   *
   * CampaignCodeGenerator.parse('BASIC_LOTTERY')
   * // null（旧格式，不符合新规则）
   */
  static parse(code) {
    if (!code || typeof code !== 'string') return null
    if (!code.startsWith(PREFIX) || code.length < PREFIX.length + 8 + 1) return null

    const datePart = code.slice(PREFIX.length, PREFIX.length + 8)
    const seqPart = code.slice(PREFIX.length + 8)

    // 验证日期部分为纯数字
    if (!/^\d{8}$/.test(datePart)) return null

    const seq = parseInt(seqPart, 10)
    if (isNaN(seq) || seq <= 0) return null

    return { date_part: datePart, seq }
  }

  /**
   * 验证活动编码是否符合新格式
   *
   * 注意：旧格式（BASIC_LOTTERY、CAMP_xxx_xxx）不符合此校验，这是预期行为。
   * 此方法仅用于验证新生成的编码格式。
   *
   * @param {string} code - 待验证编码
   * @returns {boolean} 是否符合 CAMP{YYYYMMDD}{4+位数字} 格式
   */
  static validate(code) {
    if (!code || typeof code !== 'string') return false
    // CAMP + 8位日期 + 至少1位序号
    return /^CAMP\d{12,}$/.test(code)
  }
}

module.exports = CampaignCodeGenerator
