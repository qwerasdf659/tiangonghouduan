'use strict'

/**
 * @file EventBudgetService - 活动专属预算/活动积分生命周期服务
 * @description 水晶奖品倍率活动设计方案 §12（防囤积套利）的领域服务。
 *
 * 职责（活动专属货币的"进货—隔离—清库"全生命周期）：
 * 1. 归集规则 CRUD（event_budget_collection_rules，运营在 Web 后台配置，写操作收口本服务）。
 * 2. 归集判定 resolveCollectionTarget：消费审核通过时判定预算去向
 *    （命中活动归集规则 → EVENT_<活动code> 专属桶 + 发 event_points；未命中 → 全局 CONSUMPTION_DEFAULT）。
 * 3. 到期清零 clearExpiredEventBudgets：活动 end_time 到期后清零该活动的专属预算桶 + event_points
 *    （防2 直接清零，不折算；供 jobs/daily-event-budget-expiry.js 调用）。
 *
 * 架构约束：
 * - 静态类，路由通过 ServiceManager('event_budget') 获取，不直连 models。
 * - 写操作强制外部传入 transaction（路由层 TransactionManager.execute() 管理事务边界）。
 * - 清零走 BalanceService.changeBalance（双录 + 幂等），保证 account_asset_balances ↔ asset_transactions 互锁不破。
 * - 预算桶键规范：EVENT_<campaign_code>（D-5 字符串桶键）。
 *
 * @module services/lottery/EventBudgetService
 */

const { Op } = require('sequelize')
const {
  EventBudgetCollectionRule,
  LotteryCampaign,
  AccountAssetBalance,
  Account,
  sequelize
} = require('../../models')
const BalanceService = require('../asset/BalanceService')
const BusinessError = require('../../utils/BusinessError')
const logger = require('../../utils/logger').logger
const { AssetCode } = require('../../constants/AssetCode')

/** 活动专属预算桶键前缀（D-5：EVENT_<活动campaign_code>） */
const EVENT_BUCKET_PREFIX = 'EVENT_'

/**
 * 活动专属预算/活动积分生命周期服务（静态类）
 * @class EventBudgetService
 */
class EventBudgetService {
  /**
   * 派生活动专属预算桶键（D-5 规范）
   * @param {string} campaign_code - 抽奖活动业务码（lottery_campaigns.campaign_code）
   * @returns {string} 桶键，如 EVENT_CAMP20250901001
   */
  static bucketKey(campaign_code) {
    return `${EVENT_BUCKET_PREFIX}${campaign_code}`
  }

  /**
   * 解析抽奖「入场资产」扣费上下文（双层货币可见层，方案 §12.7 / §23.5 遗留项①）
   *
   * 依据活动配置 lottery_campaigns.entry_asset_code 决定抽奖扣哪种可见资产及其分桶：
   * - points（默认，常驻活动）：全局可见积分，无活动分桶（lottery_campaign_id=null）。
   * - event_points（限时稀缺翻倍活动）：活动专属可见代币，按 EVENT_<campaign_code> 桶隔离（到期清零）。
   *
   * 供抽奖扣费链路（UnifiedLotteryEngine.execute_draw 外层统一扣费 + SettleStage 单抽扣费）统一取数，
   * 避免两处各自硬编码 asset_code / 分桶键，收口到本服务（event_points 生命周期归属地）。
   *
   * @param {Object} campaign - 活动对象（须含 entry_asset_code、campaign_code）
   * @returns {{ asset_code: string, lottery_campaign_id: (string|null), is_event: boolean }}
   *   asset_code：扣费资产码；lottery_campaign_id：分桶键（event_points 为 EVENT_<code>，points 为 null）；is_event：是否活动专属代币
   */
  static resolveEntryAsset(campaign) {
    const entryAssetCode =
      campaign && campaign.entry_asset_code ? campaign.entry_asset_code : AssetCode.POINTS
    if (entryAssetCode === AssetCode.EVENT_POINTS) {
      if (!campaign || !campaign.campaign_code) {
        throw new BusinessError(
          '活动入场资产为 event_points 但缺少 campaign_code，无法定位活动专属桶',
          'ENTRY_ASSET_BUCKET_MISSING',
          500
        )
      }
      return {
        asset_code: AssetCode.EVENT_POINTS,
        lottery_campaign_id: EventBudgetService.bucketKey(campaign.campaign_code),
        is_event: true
      }
    }
    // 默认与历史一致：全局可见积分 points，不分桶
    return { asset_code: AssetCode.POINTS, lottery_campaign_id: null, is_event: false }
  }

  /**
   * 断言外部事务已传入（写操作强制事务边界，禁止 Service 自管理事务）
   * @param {Object} options - 选项（须含 transaction）
   * @returns {Object} transaction
   * @throws {BusinessError} 未传入事务时抛错
   * @private
   */
  static _assertTransaction(options) {
    if (!options || !options.transaction) {
      throw new BusinessError('归集规则写操作必须在事务内执行', 'TRANSACTION_REQUIRED', 500)
    }
    return options.transaction
  }

  /* ==================== 归集规则 CRUD ==================== */

  /**
   * 分页查询归集规则列表（含所属活动摘要）
   * @param {Object} filters - { lottery_campaign_id?, status?, page?, page_size? }
   * @returns {Promise<Object>} { rows, total, page, page_size }
   */
  static async listRules(filters = {}) {
    const page = Math.max(1, parseInt(filters.page, 10) || 1)
    const page_size = Math.min(100, Math.max(1, parseInt(filters.page_size, 10) || 20))
    const where = {}
    if (filters.lottery_campaign_id) {
      where.lottery_campaign_id = parseInt(filters.lottery_campaign_id, 10)
    }
    if (filters.status) {
      where.status = filters.status
    }

    const { count, rows } = await EventBudgetCollectionRule.findAndCountAll({
      where,
      include: [
        {
          model: LotteryCampaign,
          as: 'lottery_campaign',
          attributes: [
            'lottery_campaign_id',
            'campaign_code',
            'campaign_name',
            'end_time',
            'status'
          ]
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['collection_rule_id', 'DESC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return { rows, total: count, page, page_size }
  }

  /**
   * 获取单条归集规则详情
   * @param {number} collection_rule_id - 规则ID
   * @returns {Promise<Object>} 规则实例（含所属活动摘要）
   * @throws {BusinessError} 不存在时抛 404
   */
  static async getRule(collection_rule_id) {
    const rule = await EventBudgetCollectionRule.findByPk(collection_rule_id, {
      include: [
        {
          model: LotteryCampaign,
          as: 'lottery_campaign',
          attributes: [
            'lottery_campaign_id',
            'campaign_code',
            'campaign_name',
            'end_time',
            'status'
          ]
        }
      ]
    })
    if (!rule) {
      throw new BusinessError('归集规则不存在', 'COLLECTION_RULE_NOT_FOUND', 404)
    }
    return rule
  }

  /**
   * 校验并规范化归集规则字段（创建/更新共用）
   * @param {Object} payload - 请求体
   * @param {boolean} isCreate - 是否创建
   * @returns {Object} 规范化后的字段对象
   * @throws {BusinessError} 校验失败
   * @private
   */
  static _validateAndNormalize(payload, isCreate) {
    const data = {}

    if (isCreate) {
      if (!payload.lottery_campaign_id) {
        throw new BusinessError('lottery_campaign_id 必填（归集去向活动）', 'INVALID_PARAMS', 400)
      }
      data.lottery_campaign_id = parseInt(payload.lottery_campaign_id, 10)
    }

    if (payload.rule_name !== undefined) {
      const name = String(payload.rule_name).trim()
      if (!name) throw new BusinessError('rule_name 不能为空', 'INVALID_PARAMS', 400)
      data.rule_name = name
    }

    // store_ids / merchant_ids：NULL=不限，否则必须为非空数组
    for (const key of ['store_ids', 'merchant_ids']) {
      if (payload[key] !== undefined) {
        if (payload[key] === null) {
          data[key] = null
        } else {
          if (!Array.isArray(payload[key]) || payload[key].length === 0) {
            throw new BusinessError(
              `${key} 必须为非空数组或 null（null=不限）`,
              'INVALID_PARAMS',
              400
            )
          }
          data[key] = payload[key].map(v => parseInt(v, 10))
        }
      }
    }

    if (payload.event_points_ratio !== undefined) {
      const ratio = Number(payload.event_points_ratio)
      if (!(ratio >= 0)) {
        throw new BusinessError(
          'event_points_ratio 必须 >= 0（0=只归集预算不发活动积分）',
          'INVALID_PARAMS',
          400
        )
      }
      data.event_points_ratio = ratio
    }

    if (payload.priority !== undefined) data.priority = parseInt(payload.priority, 10) || 0
    if (payload.start_at !== undefined) data.start_at = payload.start_at || null
    if (payload.end_at !== undefined) data.end_at = payload.end_at || null

    if (payload.status !== undefined) {
      if (!['active', 'inactive'].includes(payload.status)) {
        throw new BusinessError('status 非法（仅 active/inactive）', 'INVALID_PARAMS', 400)
      }
      data.status = payload.status
    }

    if (payload.remark !== undefined) data.remark = payload.remark || null

    return data
  }

  /**
   * 创建归集规则（写操作收口 + 强制事务）
   * @param {Object} payload - 请求体
   * @param {number} admin_id - 操作人（预留审计）
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 创建的规则
   */
  static async createRule(payload, admin_id, options = {}) {
    const transaction = EventBudgetService._assertTransaction(options)
    const data = EventBudgetService._validateAndNormalize(payload, true)

    if (!data.rule_name) throw new BusinessError('rule_name 必填', 'INVALID_PARAMS', 400)

    // 归集去向活动必须存在
    const campaign = await LotteryCampaign.findByPk(data.lottery_campaign_id, { transaction })
    if (!campaign) {
      throw new BusinessError('归集去向的抽奖活动不存在', 'CAMPAIGN_NOT_FOUND', 404)
    }

    const rule = await EventBudgetCollectionRule.create(data, { transaction })
    return rule
  }

  /**
   * 更新归集规则（禁止改绑活动，避免历史归集桶错位）
   * @param {number} collection_rule_id - 规则ID
   * @param {Object} payload - 请求体
   * @param {number} admin_id - 操作人
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的规则
   */
  static async updateRule(collection_rule_id, payload, admin_id, options = {}) {
    const transaction = EventBudgetService._assertTransaction(options)

    const rule = await EventBudgetCollectionRule.findByPk(collection_rule_id, { transaction })
    if (!rule) {
      throw new BusinessError('归集规则不存在', 'COLLECTION_RULE_NOT_FOUND', 404)
    }

    const data = EventBudgetService._validateAndNormalize(payload, false)
    delete data.lottery_campaign_id // 禁止改绑活动（专属桶键随活动派生，改绑会导致历史桶错位）

    await rule.update(data, { transaction })
    return rule
  }

  /**
   * 开关归集规则状态（active/inactive）
   * @param {number} collection_rule_id - 规则ID
   * @param {string} status - active/inactive
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的规则
   */
  static async setStatus(collection_rule_id, status, options = {}) {
    const transaction = EventBudgetService._assertTransaction(options)
    if (!['active', 'inactive'].includes(status)) {
      throw new BusinessError('status 非法（仅 active/inactive）', 'INVALID_PARAMS', 400)
    }
    const rule = await EventBudgetCollectionRule.findByPk(collection_rule_id, { transaction })
    if (!rule) {
      throw new BusinessError('归集规则不存在', 'COLLECTION_RULE_NOT_FOUND', 404)
    }
    await rule.update({ status }, { transaction })
    return rule
  }

  /**
   * 删除归集规则
   * @param {number} collection_rule_id - 规则ID
   * @param {Object} options - { transaction }
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteRule(collection_rule_id, options = {}) {
    const transaction = EventBudgetService._assertTransaction(options)
    const rule = await EventBudgetCollectionRule.findByPk(collection_rule_id, { transaction })
    if (!rule) {
      throw new BusinessError('归集规则不存在', 'COLLECTION_RULE_NOT_FOUND', 404)
    }
    await rule.destroy({ transaction })
    return true
  }

  /* ==================== 归集判定（消费审核通过时调用） ==================== */

  /**
   * 判定一笔消费的预算归集去向（§12.10 后端规则自动判定，无人工选择口）
   *
   * 命中条件（全部满足）：
   * - 规则 status='active'
   * - 时间窗覆盖 now（start_at/end_at 为 NULL 时对齐活动 start_time/end_time）
   * - 归集去向活动 status='active'
   * - store_ids 为 NULL 或包含消费 store_id；merchant_ids 为 NULL 或包含消费 merchant_id
   *
   * 多规则同时命中取最高 priority 一条。
   *
   * @param {Object} params - 参数
   * @param {number|null} params.store_id - 消费门店ID
   * @param {number|null} params.merchant_id - 消费商家ID
   * @param {Date} [params.now] - 当前时间（默认 new Date()）
   * @param {Object} params.transaction - 事务（消费审核事务内调用，必传）
   * @returns {Promise<Object|null>} 命中结果或 null（未命中 → 维持全局 CONSUMPTION_DEFAULT）：
   *   { rule, campaign, bucket_key, event_points_ratio }
   */
  static async resolveCollectionTarget(params) {
    const { store_id = null, merchant_id = null, now = new Date(), transaction } = params

    const rules = await EventBudgetCollectionRule.findAll({
      where: { status: 'active' },
      include: [
        {
          model: LotteryCampaign,
          as: 'lottery_campaign',
          attributes: [
            'lottery_campaign_id',
            'campaign_code',
            'campaign_name',
            'start_time',
            'end_time',
            'status'
          ]
        }
      ],
      order: [['priority', 'DESC']],
      transaction
    })

    for (const rule of rules) {
      const campaign = rule.lottery_campaign
      // 归集去向活动必须进行中（活动结束/暂停即停止归集）
      if (!campaign || campaign.status !== 'active') continue

      // 时间窗：规则自身窗口优先，NULL 对齐活动窗口
      const windowStart = rule.start_at || campaign.start_time
      const windowEnd = rule.end_at || campaign.end_time
      if (windowStart && now < new Date(windowStart)) continue
      if (windowEnd && now > new Date(windowEnd)) continue

      // 门店/商家条件（NULL=不限）
      if (Array.isArray(rule.store_ids) && rule.store_ids.length) {
        if (!store_id || !rule.store_ids.includes(Number(store_id))) continue
      }
      if (Array.isArray(rule.merchant_ids) && rule.merchant_ids.length) {
        if (!merchant_id || !rule.merchant_ids.includes(Number(merchant_id))) continue
      }

      return {
        rule,
        campaign,
        bucket_key: EventBudgetService.bucketKey(campaign.campaign_code),
        event_points_ratio: Number(rule.event_points_ratio) || 0
      }
    }

    return null
  }

  /* ==================== 到期清零运维视图（§13.4，读 asset_transactions 清零流水） ==================== */

  /**
   * 到期清零执行历史（§13.4 运维视图：执行记录 + 历史清零量）
   *
   * 数据源：asset_transactions（business_type='event_budget_expiry_clear'，清零 job 双录写入），
   * 按天聚合清零笔数/清零总量，供运维观测「到期清零 job 每次跑了多少、清了多少」。
   * 不新增 job 日志表（YAGNI）：清零流水本身即权威执行记录，且与余额互锁可对账。
   *
   * @param {Object} [filters] - { days?: number（默认30，最大180） }
   * @returns {Promise<Object>} { enabled, range_days, total_cleared_amount, total_cleared_count, daily: [{ date, cleared_count, cleared_amount }] }
   */
  static async getExpiryClearHistory(filters = {}) {
    const days = Math.min(180, Math.max(1, parseInt(filters.days, 10) || 30))
    const daily = await sequelize.query(
      `SELECT
          DATE(created_at) AS stat_date,
          COUNT(*) AS cleared_count,
          COALESCE(SUM(-delta_amount), 0) AS cleared_amount
        FROM asset_transactions
        WHERE business_type = 'event_budget_expiry_clear'
          AND is_invalid = 0
          AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
        GROUP BY DATE(created_at)
        ORDER BY stat_date ASC`,
      { replacements: { days }, type: sequelize.QueryTypes.SELECT }
    )
    const total_cleared_amount = daily.reduce((s, r) => s + (Number(r.cleared_amount) || 0), 0)
    const total_cleared_count = daily.reduce((s, r) => s + (Number(r.cleared_count) || 0), 0)
    return {
      // 清零任务是否启用（环境开关，运维据此判断"没清是关了还是没到期"）
      enabled: process.env.ENABLE_EVENT_BUDGET_EXPIRY === 'true',
      range_days: days,
      total_cleared_amount,
      total_cleared_count,
      daily: daily.map(r => ({
        date: r.stat_date,
        cleared_count: Number(r.cleared_count) || 0,
        cleared_amount: Number(r.cleared_amount) || 0
      }))
    }
  }

  /* ==================== 到期清零（防2，job 调用） ==================== */

  /**
   * 清零所有"活动已结束"的活动专属预算桶 + event_points（防2 直接清零，不折算）
   *
   * 处理范围：曾配置过归集规则的活动，其 end_time < now 且仍有非零余额的
   * - budget_points（lottery_campaign_id = EVENT_<code> 桶）
   * - event_points（lottery_campaign_id = EVENT_<code> 桶）
   *
   * 清零方式：逐余额行调 BalanceService.changeBalance（负 delta，双录到 SYSTEM_BURN，幂等键含活动+账户+资产），
   * 保证 account_asset_balances ↔ asset_transactions 互锁不破、可对账追溯。
   * 活动池 pool_budget_remaining 到期由运营手动回收（D-7），本方法不处理。
   *
   * @param {Object} [params] - 参数
   * @param {Date} [params.now] - 当前时间（默认 new Date()）
   * @param {Object} params.transaction - 事务（job 通过 TransactionManager 传入，必传）
   * @returns {Promise<Object>} 清零报告 { campaigns_processed, balances_cleared, total_cleared_amount, details }
   */
  static async clearExpiredEventBudgets(params = {}) {
    const { now = new Date(), transaction } = params
    if (!transaction) {
      throw new BusinessError('到期清零必须在事务内执行', 'TRANSACTION_REQUIRED', 500)
    }

    // 1. 找出"配置过归集规则 + 活动已结束"的活动
    const expiredCampaigns = await LotteryCampaign.findAll({
      attributes: ['lottery_campaign_id', 'campaign_code', 'campaign_name', 'end_time'],
      where: {
        end_time: { [Op.lt]: now },
        lottery_campaign_id: {
          [Op.in]: sequelize.literal(
            '(SELECT DISTINCT lottery_campaign_id FROM event_budget_collection_rules)'
          )
        }
      },
      transaction
    })

    const report = {
      campaigns_processed: 0,
      balances_cleared: 0,
      total_cleared_amount: 0,
      details: []
    }

    for (const campaign of expiredCampaigns) {
      const bucket_key = EventBudgetService.bucketKey(campaign.campaign_code)

      // 2. 该活动专属桶内仍有非零可用余额的行（budget_points + event_points）
      // eslint-disable-next-line no-await-in-loop
      const balances = await AccountAssetBalance.findAll({
        where: {
          lottery_campaign_id: bucket_key,
          asset_code: { [Op.in]: [AssetCode.BUDGET_POINTS, AssetCode.EVENT_POINTS] },
          available_amount: { [Op.gt]: 0 }
        },
        include: [
          {
            model: Account,
            as: 'account',
            attributes: ['account_id', 'account_type', 'user_id']
          }
        ],
        transaction
      })

      let campaignCleared = 0
      for (const balance of balances) {
        // 只清用户账户（系统账户余额不在"个人活动预算"清零范围）
        if (!balance.account || balance.account.account_type !== 'user') continue

        const amount = Number(balance.available_amount)
        if (amount <= 0) continue

        // 双录清零：用户账户扣减，对手方 SYSTEM_BURN（销毁语义），幂等键含活动+账户+资产
        // eslint-disable-next-line no-await-in-loop -- 清零需逐余额行串行双录，量小（仅到期活动的非零余额）
        const burnAccount = await BalanceService.getOrCreateAccount(
          { system_code: 'SYSTEM_BURN' },
          { transaction }
        )
        // eslint-disable-next-line no-await-in-loop, no-restricted-syntax -- 已传递 transaction；串行保证行锁顺序稳定
        await BalanceService.changeBalance(
          {
            user_id: balance.account.user_id,
            asset_code: balance.asset_code,
            delta_amount: -amount,
            business_type: 'event_budget_expiry_clear',
            idempotency_key: `event_budget_expiry:${campaign.lottery_campaign_id}:${balance.account_id}:${balance.asset_code}`,
            lottery_campaign_id: bucket_key,
            counterpart_account_id: burnAccount.account_id,
            meta: {
              reference_type: 'lottery_campaign',
              reference_id: campaign.lottery_campaign_id,
              bucket_key,
              campaign_end_time: campaign.end_time,
              description: `活动"${campaign.campaign_name}"已结束，专属${balance.asset_code === AssetCode.EVENT_POINTS ? '活动积分' : '预算积分'}到期清零（防囤积套利 防2）`
            }
          },
          { transaction }
        )

        report.balances_cleared += 1
        report.total_cleared_amount += amount
        campaignCleared += amount
      }

      if (balances.length > 0) {
        report.campaigns_processed += 1
        report.details.push({
          lottery_campaign_id: campaign.lottery_campaign_id,
          campaign_code: campaign.campaign_code,
          bucket_key,
          cleared_amount: campaignCleared
        })
        logger.info('[EventBudgetService] 活动专属预算到期清零', {
          lottery_campaign_id: campaign.lottery_campaign_id,
          bucket_key,
          cleared_amount: campaignCleared
        })
      }
    }

    return report
  }
}

module.exports = EventBudgetService
