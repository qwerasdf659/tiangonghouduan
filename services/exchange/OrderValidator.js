'use strict'

/**
 * 天工商户营销平台 V4.7.0 - 兑换订单校验器
 * Exchange Order Validator（技术债务方案 7.4-4：CoreService 拆分）
 *
 * 职责范围：下单/逆向操作的资格与限购校验（只校验不落库，扣减执行仍在 CoreService）
 * - assertRedeemRequirement(): 复合门槛校验（成长等级 + 额外多资产 + 消耗道具，扣费前校验）
 * - assertNotPropOrder(): 校验订单不是虚拟道具单（道具买入即消耗、禁止退款）
 * - assertNotBarterOrder(): 校验订单不是以物易物单（换物成交即不可逆）
 * - checkRefundRules(): 退款防刷检查（配置驱动三层防护）
 *
 * 设计原则：
 * - 不独立注册服务键，由 CoreService 构造注入持有（防单例状态分裂）；
 * - 事务上下文经 options.transaction 透传，不改变事务传递的调用链层级；
 * - 全部方法纯搬移自原 services/exchange/CoreService.js 私有方法（逻辑不变，
 *   仅去掉下划线前缀作为本校验器的对外方法名）。
 *
 * @module services/exchange/OrderValidator
 * @created 2026-07-11（技术债务方案 7.4-4 拆分）
 */

const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const BalanceService = require('../asset/BalanceService')
const AssetQueryService = require('../asset/QueryService') // 累计积分账本派生（拍板 4：users.history_total_points 冗余列已删除）
const AssetProductGuard = require('../shared/AssetProductGuard')
const { Op } = require('sequelize')
const { getRedisClient } = require('../../utils/UnifiedRedisClient')

/**
 * 兑换订单校验器类
 *
 * @class OrderValidator
 */
class OrderValidator {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeRedeemRequirement = models.ExchangeRedeemRequirement
    this.UserGrowthLevel = models.UserGrowthLevel
    this.ItemTemplate = models.ItemTemplate
    /*
     * ⚠️ this.sequelize 有意不赋值（与拆分前 CoreService 完全一致——原构造函数同样未赋值，
     * checkRefundRules 内部 getSettingValue 的 try/catch 会吞掉 TypeError 并返回 0）。
     * 纯搬移不改行为：如需修复请单独提缺陷单（见技术债务方案 7.5 硬性规范）。
     */
  }

  /**
   * 复合门槛校验（路线B 模块C·第3步）— 扣费前只校验不扣减
   *
   * 校验项（全满足才放行）：
   * ① 成长等级 ≥ min_growth_level_key（按资产账本派生的累计积分判定，拍板 4）
   * ② extra_cost_assets 每项余额足够，且逐项过 AssetProductGuard 守卫（实物侧禁星石）
   * ③ required_consume_items 每项持有量足够（status available 的 item 实例计数）
   *
   * @param {Object} ctx - { user_id, exchange_item_id, sku_id, quantity, itemTemplateId }
   * @param {Object} options - { transaction }
   * @returns {Promise<Object|null>} 待执行的额外消耗清单（无门槛返回 null）
   * @throws {BusinessError} 缺项时抛出（提示具体缺哪项）
   */
  async assertRedeemRequirement(ctx, options = {}) {
    const { transaction } = options
    const { user_id, exchange_item_id, sku_id, quantity, itemTemplateId } = ctx

    if (!this.ExchangeRedeemRequirement) return null

    const req = await this.ExchangeRedeemRequirement.getEffectiveRequirement(
      exchange_item_id,
      sku_id,
      { transaction }
    )
    if (!req) return null

    // 判断兑换目标是否"有价值"（实物/券），用于守卫分叉
    let targetTemplate = null
    if (itemTemplateId && this.ItemTemplate) {
      targetTemplate = await this.ItemTemplate.findByPk(itemTemplateId, {
        attributes: ['item_type', 'reference_price_points'],
        transaction
      })
    }
    const targetIsValuable = AssetProductGuard.isValuable(targetTemplate)

    /*
     * ① 成长等级区间门槛（拍板⑪，2026-07-10 扩展为 min/max 区间）
     * 组合语义：min 单配=及以上（高价值门槛）、max 单配=及以下（新人专享）、
     * min=max=仅某等级（专属纪念品）、双 NULL=不限。
     * 比较口径：按 user_growth_levels.sort_order 区间比较（等级高低的唯一权威排序）。
     */
    if ((req.min_growth_level_key || req.max_growth_level_key) && this.UserGrowthLevel) {
      // 累计积分账本派生（拍板 4：users.history_total_points 冗余列已删除，事务内直查账本）
      const userHistoryPoints = await AssetQueryService.getHistoryTotalPoints(user_id, {
        transaction
      })
      const levels = await this.UserGrowthLevel.getActiveLevels({ transaction })
      const userLevel = await this.UserGrowthLevel.resolveLevel(Number(userHistoryPoints || 0), {
        transaction
      })
      const userSortOrder = userLevel ? Number(userLevel.sort_order) : -1

      const minLevel = req.min_growth_level_key
        ? levels.find(l => l.level_key === req.min_growth_level_key)
        : null
      if (minLevel && userSortOrder < Number(minLevel.sort_order)) {
        throw new BusinessError(
          `成长等级不足：需达到「${minLevel.level_name}」及以上（累计积分 ${minLevel.min_history_points}），当前等级 ${userLevel ? userLevel.level_name : '无'}`,
          'REDEEM_GROWTH_LEVEL_INSUFFICIENT',
          400
        )
      }

      const maxLevel = req.max_growth_level_key
        ? levels.find(l => l.level_key === req.max_growth_level_key)
        : null
      if (maxLevel && userSortOrder > Number(maxLevel.sort_order)) {
        throw new BusinessError(
          `超出等级上限：本商品为「${maxLevel.level_name}」及以下会员专享，当前等级 ${userLevel ? userLevel.level_name : '无'}`,
          'REDEEM_GROWTH_LEVEL_EXCEEDED',
          400
        )
      }
    }

    // ② 额外多资产：校验余额 + 逐项过守卫
    const extraAssets = Array.isArray(req.extra_cost_assets) ? req.extra_cost_assets : []
    const assetDeductions = []
    for (const entry of extraAssets) {
      const asset_code = entry.asset_code
      const amount = Number(entry.amount) * quantity
      if (!asset_code || !(amount > 0)) continue

      // 守卫分叉：目标为实物/券时，额外资产禁含 star_stone（仅水晶系），由守卫统一裁决
      AssetProductGuard.assertPriceAssetAllowed(
        targetIsValuable ? { item_type: 'product' } : { item_type: 'prop' },
        asset_code
      )

      // 同一事务内的顺序读：Sequelize 事务不支持并发查询，必须串行（禁止 Promise.all）
      // eslint-disable-next-line no-await-in-loop
      const balanceResult = await BalanceService.getBalance(
        { user_id, asset_code },
        { transaction }
      )
      const available = Number(balanceResult.available_amount || 0)
      if (available < amount) {
        throw new BusinessError(
          `门槛资产不足：需 ${amount} 个 ${asset_code}，当前可用 ${available}`,
          'REDEEM_EXTRA_ASSET_INSUFFICIENT',
          400
        )
      }
      assetDeductions.push({ asset_code, amount })
    }

    // ③ 需消耗的指定道具：校验持有量
    const consumeItems = Array.isArray(req.required_consume_items) ? req.required_consume_items : []
    const itemConsumptions = []
    if (consumeItems.length > 0) {
      const userAccount = await this.models.Account.findOne({
        where: { user_id, account_type: 'user' },
        transaction
      })
      for (const ci of consumeItems) {
        const item_template_id = ci.item_template_id
        const needQty = Number(ci.quantity) * quantity
        if (!item_template_id || !(needQty > 0)) continue

        // 同一事务内的顺序读：事务不支持并发查询，必须串行（禁止 Promise.all）
        let heldItems = []
        if (userAccount) {
          // eslint-disable-next-line no-await-in-loop
          heldItems = await this.models.Item.findAll({
            where: {
              owner_account_id: userAccount.account_id,
              item_template_id,
              status: 'available'
            },
            attributes: ['item_id'],
            limit: needQty,
            transaction
          })
        }
        if (heldItems.length < needQty) {
          throw new BusinessError(
            `门槛道具不足：模板 ${item_template_id} 需 ${needQty} 件，当前持有 ${heldItems.length} 件`,
            'REDEEM_CONSUME_ITEM_INSUFFICIENT',
            400
          )
        }
        itemConsumptions.push({
          item_template_id,
          item_ids: heldItems.map(i => i.item_id)
        })
      }
    }

    return { assetDeductions, itemConsumptions }
  }

  /**
   * 校验订单不是虚拟道具单（F1 选 A：道具买入即消耗、禁止退款）
   *
   * 合规约束（§10.16-D / §10.15 Step 5）：
   * - 虚拟道具（item_type='prop'）单不可走 cancel/reject/refund，否则等于变相"官方回收"，
   *   给星石装"可回笼"货币属性，撞代币红线。
   * - 实物单（需发货）不受影响：未消耗可退=解冻；本守卫只拦截 prop 单。
   * - 通过订单关联的 exchange_item → item_template 的 item_type 判定。
   *
   * @param {Object} order - ExchangeRecord 订单实例
   * @param {Transaction} transaction - 事务对象
   * @throws {BusinessError} PROP_NO_REFUND - 虚拟道具单禁止退款
   * @returns {Promise<void>} 校验通过无返回，违规抛 BusinessError(400)
   */
  async assertNotPropOrder(order, transaction) {
    if (!order || !order.exchange_item_id) return
    const { ExchangeItem, ItemTemplate } = this.models
    if (!ExchangeItem || !ItemTemplate) return

    const exchangeItem = await ExchangeItem.findByPk(order.exchange_item_id, {
      attributes: ['item_template_id'],
      transaction
    })
    if (!exchangeItem || !exchangeItem.item_template_id) return

    const template = await ItemTemplate.findByPk(exchangeItem.item_template_id, {
      attributes: ['item_type'],
      transaction
    })
    if (template && template.item_type === 'prop') {
      throw new BusinessError(
        '虚拟道具买入即消耗，不可退款/取消（禁止官方回收，守星石单向铁律）',
        'PROP_NO_REFUND',
        400
      )
    }
  }

  /**
   * 校验订单不是以物易物单（拍板⑩边界：换物成交即不可逆）
   *
   * 业务约束（换物快递履约改造后 barter 实物单进入 pending 发货链新增的守卫）：
   * - 换物投入的旧物已通过 ItemService.consumeItem 真销毁（status='used' 不可复活）；
   * - 换物订单 pay_amount=0（无货币支付），取消/拒绝/退款的"退还材料资产"语义不成立；
   * - 故 barter 单成交后不可取消/拒绝/退款，只能沿发货链走完（pending→shipped→received）。
   *   异常场景（如缺货）由运营线下与用户协商补偿，不走资金退还链路。
   *
   * @param {Object} order - ExchangeRecord 订单实例
   * @param {string} action_name - 被拦截的动作名（用于错误提示，如"取消"/"拒绝"/"退款"）
   * @throws {BusinessError} BARTER_ORDER_IRREVERSIBLE - 换物订单不可逆
   * @returns {void} 校验通过无返回，违规抛 BusinessError(400)
   */
  assertNotBarterOrder(order, action_name) {
    if (order && order.source === 'barter') {
      throw new BusinessError(
        `以物易物订单不可${action_name}：投入旧物已核销销毁且无货币可退，请沿发货流程完成履约（异常请联系运营处理）`,
        'BARTER_ORDER_IRREVERSIBLE',
        400
      )
    }
  }

  /**
   * 退款防刷检查（配置驱动三层防护）
   * 从 system_settings 读取规则，初始值全 0 = 关闭，上线后按需开启
   *
   * @param {Object} order - 兑换订单记录
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>} 检查通过无返回值，违规时抛出异常
   * @throws {Error} 违反退款规则时抛出
   */
  async checkRefundRules(order, transaction) {
    /**
     * 从 system_settings 读取退款防刷配置（白名单管控）
     * @param {string} settingKey - 配置键名
     * @returns {Promise<number>} 配置值（数字），读取失败返回 0
     */
    const getSettingValue = async settingKey => {
      try {
        const [rows] = await this.sequelize.query(
          'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
          { replacements: [settingKey], transaction }
        )
        if (rows.length > 0) {
          return parseInt(rows[0].setting_value) || 0
        }
      } catch {
        /* 配置读取失败不阻断退款 */
      }
      return 0
    }

    // 第一层：冷却期检查
    const cooldownHours = await getSettingValue('exchange/refund_cooldown_hours')
    if (cooldownHours > 0) {
      const redis = await getRedisClient()
      const cooldownKey = `app:v4:refund_cooldown:${order.user_id}:${order.exchange_item_id || order.exchange_item_id}`
      const exists = await redis.exists(cooldownKey)
      if (exists) {
        const error = new Error(`退款冷却期内不可再次兑换同一商品（冷却${cooldownHours}小时）`)
        error.statusCode = 429
        error.code = 'REFUND_COOLDOWN'
        throw error
      }
    }

    // 第二层：月限检查
    const monthlyLimit = await getSettingValue('exchange/refund_monthly_limit')
    if (monthlyLimit > 0) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const refundCount = await this.models.ExchangeOrderEvent.count({
        where: {
          new_status: 'refunded',
          operator_id: order.user_id,
          created_at: { [Op.gte]: startOfMonth }
        },
        transaction
      })

      if (refundCount >= monthlyLimit) {
        const error = new Error(`本月退款次数已达上限（${monthlyLimit}次/月）`)
        error.statusCode = 429
        error.code = 'REFUND_MONTHLY_LIMIT'
        throw error
      }
    }

    // 第三层：大额审批（记录日志，由路由层决定是否走审批链）
    const approvalThreshold = await getSettingValue('exchange/refund_approval_threshold')
    if (approvalThreshold > 0 && Number(order.pay_amount) > approvalThreshold) {
      logger.warn('[兑换市场] 大额退款触发审批检查', {
        order_no: order.order_no,
        pay_amount: order.pay_amount,
        threshold: approvalThreshold
      })
    }
  }
}

module.exports = OrderValidator
