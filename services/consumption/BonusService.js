'use strict'

/**
 * ConsumptionBonusService - 消费加成活动服务（多活动独立倍率，方案C，2026-07-15）
 *
 * 职责：
 * 1. 命中判定 resolveConsumptionBonusRate：消费提交时按门店/商家/时间窗自动匹配活动，
 *    商家专属活动优先于全平台活动，同组按 priority 取最高；返回命中的加成率（夹紧上限）。
 * 2. 规则 CRUD（运营在 Web 后台配置，写操作收口本服务）。
 * 3. C 端展示 getActiveRulesForDisplay：返回当前对某门店/商家生效的活动展示信息（脱敏）。
 *
 * 架构约束：
 * - 静态类，路由通过 ServiceManager('consumption_bonus') 获取，不直连 models。
 * - 写操作强制外部传入 transaction（路由层 TransactionManager.execute() 管理事务边界）。
 * - 命中判定为只读，供 consumption/CoreService 提交时调用（可选传入 transaction）。
 *
 * @module services/consumption/BonusService
 */

const { ConsumptionBonusRule } = require('../../models')
const BusinessError = require('../../utils/BusinessError')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const logger = require('../../utils/logger').logger

/**
 * 消费加成活动服务（静态类）
 * @class ConsumptionBonusService
 */
class ConsumptionBonusService {
  /**
   * 判定规则是否命中某笔消费（时间窗 + 门店 + 商家条件，NULL=不限）
   * @param {Object} rule - ConsumptionBonusRule 实例
   * @param {Object} ctx - { store_id, merchant_id, now }
   * @returns {boolean} 是否命中
   * @private
   */
  static _isRuleHit(rule, ctx) {
    const { store_id, merchant_id, now } = ctx

    // 时间窗（NULL=不限）
    if (rule.start_at && now < new Date(rule.start_at)) return false
    if (rule.end_at && now > new Date(rule.end_at)) return false

    // 门店条件（store_ids 非空时，消费 store_id 必须在列表内）
    if (Array.isArray(rule.store_ids) && rule.store_ids.length) {
      if (!store_id || !rule.store_ids.includes(Number(store_id))) return false
    }
    // 商家条件（merchant_ids 非空时，消费 merchant_id 必须在列表内）
    if (Array.isArray(rule.merchant_ids) && rule.merchant_ids.length) {
      if (!merchant_id || !rule.merchant_ids.includes(Number(merchant_id))) return false
    }

    return true
  }

  /**
   * 解析某笔消费命中的活动加成率（商家专属优先，同组按 priority 取最高）
   *
   * 决策口径（已拍板）：
   * - 命中规则分两组：商家专属组（store_ids 或 merchant_ids 任一非空）、全平台组（均 NULL）。
   * - 商家专属组非空 → 取该组最高优先级；否则取全平台组最高优先级。
   * - 命中 → 返回 min(bonus_rate, max_bonus_rate)；无命中 → 返回 0。
   *
   * @param {Object} params - { store_id, merchant_id, now?, transaction? }
   * @returns {Promise<{bonus_rate: number, rule: (Object|null)}>} 加成率与命中规则（未命中 rule=null，rate=0）
   */
  static async resolveConsumptionBonusRate(params = {}) {
    const { store_id = null, merchant_id = null, now = new Date(), transaction = null } = params

    const rules = await ConsumptionBonusRule.findAll({
      where: { status: 'active' },
      order: [['priority', 'DESC']],
      transaction
    })

    const ctx = { store_id, merchant_id, now }
    const hitRules = rules.filter(r => ConsumptionBonusService._isRuleHit(r, ctx))
    if (hitRules.length === 0) {
      return { bonus_rate: 0, rule: null }
    }

    // 商家专属优先：先取商家专属组，无则取全平台组（组内已按 priority DESC 排序，取第一条）
    const merchantSpecific = hitRules.filter(r => r.isMerchantSpecific())
    const chosen = merchantSpecific.length > 0 ? merchantSpecific[0] : hitRules[0]

    // 加成率二次夹紧上限（防运营配错）
    const rate = Math.max(
      0,
      Math.min(Number(chosen.bonus_rate) || 0, Number(chosen.max_bonus_rate) || 0)
    )

    logger.info('[消费加成] 命中活动', {
      consumption_bonus_rule_id: chosen.consumption_bonus_rule_id,
      rule_name: chosen.rule_name,
      merchant_specific: chosen.isMerchantSpecific(),
      bonus_rate: rate
    })

    return { bonus_rate: rate, rule: chosen }
  }

  /**
   * C 端展示：查询当前对某门店/商家生效的活动（脱敏，只下发展示信息）
   *
   * 脱敏口径：只返回 display_name / bonus_rate / start_at / end_at，
   * 不下发 priority / max_bonus_rate / store_ids / merchant_ids / rule_name 等内部字段。
   *
   * @param {Object} params - { store_id, merchant_id, now? }
   * @returns {Promise<Object|null>} { display_name, bonus_rate, start_at, end_at } 或 null（无生效活动）
   */
  static async getActiveRuleForDisplay(params = {}) {
    const { bonus_rate, rule } = await ConsumptionBonusService.resolveConsumptionBonusRate(params)
    if (!rule) return null
    return {
      display_name: rule.display_name,
      bonus_rate,
      start_at: rule.start_at,
      end_at: rule.end_at
    }
  }

  /* ==================== 规则 CRUD（运营 Web 后台配置） ==================== */

  /**
   * 分页查询消费加成规则列表
   * @param {Object} filters - { status?, page?, page_size? }
   * @returns {Promise<Object>} { rows, total, page, page_size }
   */
  static async listRules(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1)
    const page_size = Math.min(100, Math.max(1, parseInt(filters.page_size, 10) || 20))
    const where = {}
    if (filters.status) {
      where.status = filters.status
    }

    const { count, rows } = await ConsumptionBonusRule.findAndCountAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['consumption_bonus_rule_id', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return { rows, total: count, page, page_size }
  }

  /**
   * 获取单条规则详情
   * @param {number} consumption_bonus_rule_id - 规则ID
   * @returns {Promise<Object>} 规则实例
   * @throws {BusinessError} 不存在时抛 404
   */
  static async getRule(consumption_bonus_rule_id) {
    const rule = await ConsumptionBonusRule.findByPk(consumption_bonus_rule_id)
    if (!rule) {
      throw new BusinessError('消费加成规则不存在', 'CONSUMPTION_BONUS_RULE_NOT_FOUND', 404)
    }
    return rule
  }

  /**
   * 创建规则（写操作，强制外部事务）
   * @param {Object} data - 规则字段
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<Object>} 创建的规则实例
   */
  static async createRule(data, options = {}) {
    const transaction = assertAndGetTransaction(options)
    ConsumptionBonusService._validatePayload(data)
    const rule = await ConsumptionBonusRule.create(
      {
        rule_name: data.rule_name,
        display_name: data.display_name,
        bonus_rate: data.bonus_rate,
        store_ids: data.store_ids ?? null,
        merchant_ids: data.merchant_ids ?? null,
        start_at: data.start_at ?? null,
        end_at: data.end_at ?? null,
        priority: data.priority ?? 0,
        max_bonus_rate: data.max_bonus_rate ?? 2.0,
        status: data.status ?? 'inactive',
        remark: data.remark ?? null
      },
      { transaction }
    )
    logger.info('[消费加成] 规则已创建', {
      consumption_bonus_rule_id: rule.consumption_bonus_rule_id
    })
    return rule
  }

  /**
   * 更新规则（写操作，强制外部事务）
   * @param {number} consumption_bonus_rule_id - 规则ID
   * @param {Object} data - 待更新字段（仅更新传入项）
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<Object>} 更新后的规则实例
   */
  static async updateRule(consumption_bonus_rule_id, data, options = {}) {
    const transaction = assertAndGetTransaction(options)
    const rule = await ConsumptionBonusRule.findByPk(consumption_bonus_rule_id, { transaction })
    if (!rule) {
      throw new BusinessError('消费加成规则不存在', 'CONSUMPTION_BONUS_RULE_NOT_FOUND', 404)
    }
    ConsumptionBonusService._validatePayload({ ...rule.toJSON(), ...data }, true)
    await rule.update(data, { transaction })
    logger.info('[消费加成] 规则已更新', { consumption_bonus_rule_id })
    return rule
  }

  /**
   * 删除规则（写操作，强制外部事务；配置数据硬删除）
   * @param {number} consumption_bonus_rule_id - 规则ID
   * @param {Object} options - { transaction }（必填）
   * @returns {Promise<void>} 无返回值（删除成功即 resolve）
   */
  static async deleteRule(consumption_bonus_rule_id, options = {}) {
    const transaction = assertAndGetTransaction(options)
    const rule = await ConsumptionBonusRule.findByPk(consumption_bonus_rule_id, { transaction })
    if (!rule) {
      throw new BusinessError('消费加成规则不存在', 'CONSUMPTION_BONUS_RULE_NOT_FOUND', 404)
    }
    await rule.destroy({ transaction })
    logger.info('[消费加成] 规则已删除', { consumption_bonus_rule_id })
  }

  /**
   * 校验规则字段合法性
   * @param {Object} data - 规则数据
   * @param {boolean} [isUpdate=false] - 是否更新场景（更新时必填项已有旧值）
   * @returns {void}
   * @throws {BusinessError} 校验失败
   * @private
   */
  static _validatePayload(data, isUpdate = false) {
    if (!isUpdate) {
      if (!data.rule_name) {
        throw new BusinessError('规则名不能为空', 'CONSUMPTION_BONUS_INVALID', 400)
      }
      if (!data.display_name) {
        throw new BusinessError('展示名不能为空', 'CONSUMPTION_BONUS_INVALID', 400)
      }
    }
    const rate = Number(data.bonus_rate)
    if (!Number.isFinite(rate) || rate < 0) {
      throw new BusinessError('加成率必须为非负数', 'CONSUMPTION_BONUS_INVALID', 400)
    }
    const cap = Number(data.max_bonus_rate ?? 2.0)
    if (rate > cap) {
      throw new BusinessError(`加成率 ${rate} 超过上限 ${cap}`, 'CONSUMPTION_BONUS_INVALID', 400)
    }
    // store_ids / merchant_ids 若传入必须为数组
    for (const key of ['store_ids', 'merchant_ids']) {
      if (data[key] !== null && data[key] !== undefined && !Array.isArray(data[key])) {
        throw new BusinessError(`${key} 必须为数组或 null`, 'CONSUMPTION_BONUS_INVALID', 400)
      }
    }
  }
}

module.exports = ConsumptionBonusService
