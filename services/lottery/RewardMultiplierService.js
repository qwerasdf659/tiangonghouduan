'use strict'

/**
 * @file RewardMultiplierService - 水晶奖品倍率规则管理服务（运营后台 CRUD + 成本看板 + 人群选项）
 * @description 水晶奖品倍率活动设计方案 §16.1/§16.2 的管理域领域服务。
 *
 * 职责（与运行时计算的 CrystalMultiplierService 分离，职责单一）：
 * - 倍率规则 reward_multiplier_campaigns / reward_multiplier_targets 的 CRUD（写操作收口本服务）。
 * - 成本水位查询（extra_cost_used/limit + 受益人数 + 多发水晶总量，读 lottery_draws 快照）。
 * - 人群选项数据源：segment（从活动 resolver_version 对应 segment_rule_configs.rules[].segment_key 取，D-12）。
 *
 * 架构约束：
 * - 静态类，路由通过 ServiceManager('reward_multiplier') 获取，不直连 models。
 * - 写操作由路由层 TransactionManager.execute() 管理事务边界，本服务方法强制要求外部传入 transaction。
 * - 校验语义：segment target_ref 必须是该活动 resolver_version 内存在的 segment_key（§16.2 权威语义）。
 *
 * @module services/lottery/RewardMultiplierService
 */

const {
  RewardMultiplierCampaign,
  RewardMultiplierTarget,
  LotteryCampaign,
  LotteryStrategyConfig,
  SegmentRuleConfig,
  UserGrowthLevel,
  UserAdTag,
  sequelize
} = require('../../models')
const BusinessError = require('../../utils/BusinessError')

/** 允许的作用人群类型 */
const TARGET_TYPES = ['all', 'segment', 'tag', 'growth_level', 'user']
/** 允许的作用对象行类型（不含 all） */
const TARGET_ROW_TYPES = ['segment', 'tag', 'growth_level', 'user']
/** 允许的奖品范围 */
const REWARD_SCOPES = ['crystal_all', 'group', 'asset_codes']
/** 允许的取整方式 */
const ROUNDING_MODES = ['round', 'floor', 'ceil']

/**
 * 水晶奖品倍率规则管理服务（静态类）
 * @class RewardMultiplierService
 */
class RewardMultiplierService {
  /**
   * 断言外部事务已传入（写操作强制事务边界，禁止 Service 自管理事务）
   * @param {Object} options - 选项（须含 transaction）
   * @returns {Object} transaction
   * @throws {BusinessError} 未传入事务时抛错
   * @private
   */
  static _assertTransaction(options) {
    if (!options || !options.transaction) {
      throw new BusinessError('倍率规则写操作必须在事务内执行', 'TRANSACTION_REQUIRED', 500)
    }
    return options.transaction
  }

  /**
   * 分页查询倍率规则列表
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

    const { count, rows } = await RewardMultiplierCampaign.findAndCountAll({
      where,
      include: [{ model: RewardMultiplierTarget, as: 'targets' }],
      order: [
        ['priority', 'DESC'],
        ['multiplier_campaign_id', 'DESC']
      ],
      distinct: true,
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return { rows, total: count, page, page_size }
  }

  /**
   * 获取单条倍率规则详情（含 targets）
   * @param {number} multiplier_campaign_id - 规则ID
   * @returns {Promise<Object>} 规则实例
   * @throws {BusinessError} 不存在时抛 404
   */
  static async getRule(multiplier_campaign_id) {
    const rule = await RewardMultiplierCampaign.findByPk(multiplier_campaign_id, {
      include: [{ model: RewardMultiplierTarget, as: 'targets' }]
    })
    if (!rule) {
      throw new BusinessError('倍率规则不存在', 'MULTIPLIER_RULE_NOT_FOUND', 404)
    }
    return rule
  }

  /**
   * 校验并规范化规则主体字段（创建/更新共用）
   * @param {Object} payload - 请求体
   * @param {boolean} isCreate - 是否创建（创建时 extra_cost_limit 必填）
   * @returns {Object} 规范化后的字段对象
   * @throws {BusinessError} 校验失败
   * @private
   */
  static _validateAndNormalize(payload, isCreate) {
    const data = {}

    if (isCreate) {
      if (!payload.lottery_campaign_id) {
        throw new BusinessError(
          'lottery_campaign_id 必填（活动隔离，禁止全局规则）',
          'INVALID_PARAMS',
          400
        )
      }
      data.lottery_campaign_id = parseInt(payload.lottery_campaign_id, 10)
    }

    if (payload.campaign_name !== undefined) {
      data.campaign_name = String(payload.campaign_name).trim()
    }
    if (payload.display_name !== undefined) data.display_name = String(payload.display_name).trim()

    if (payload.multiplier !== undefined) {
      const m = Number(payload.multiplier)
      if (!(m >= 1)) throw new BusinessError('multiplier 必须 >= 1', 'INVALID_PARAMS', 400)
      data.multiplier = m
    }

    if (payload.max_multiplier_cap !== undefined) {
      const cap = Number(payload.max_multiplier_cap)
      if (!(cap >= 1)) {
        throw new BusinessError('max_multiplier_cap 必须 >= 1', 'INVALID_PARAMS', 400)
      }
      data.max_multiplier_cap = cap
    }

    if (payload.reward_scope !== undefined) {
      if (!REWARD_SCOPES.includes(payload.reward_scope)) {
        throw new BusinessError('reward_scope 非法', 'INVALID_PARAMS', 400)
      }
      data.reward_scope = payload.reward_scope
      if (payload.reward_scope === 'crystal_all') {
        data.scope_values = null
      } else {
        if (!Array.isArray(payload.scope_values) || payload.scope_values.length === 0) {
          throw new BusinessError(
            'reward_scope=group/asset_codes 时 scope_values 必须为非空数组',
            'INVALID_PARAMS',
            400
          )
        }
        data.scope_values = payload.scope_values
      }
    }

    if (payload.target_type !== undefined) {
      if (!TARGET_TYPES.includes(payload.target_type)) {
        throw new BusinessError('target_type 非法', 'INVALID_PARAMS', 400)
      }
      data.target_type = payload.target_type
    }

    if (payload.rounding_mode !== undefined) {
      if (!ROUNDING_MODES.includes(payload.rounding_mode)) {
        throw new BusinessError('rounding_mode 非法', 'INVALID_PARAMS', 400)
      }
      data.rounding_mode = payload.rounding_mode
    }

    if (payload.priority !== undefined) data.priority = parseInt(payload.priority, 10) || 0

    if (isCreate || payload.extra_cost_limit !== undefined) {
      if (payload.extra_cost_limit === undefined || payload.extra_cost_limit === null) {
        if (isCreate) {
          throw new BusinessError(
            'extra_cost_limit 必填（成本封顶强制必填）',
            'INVALID_PARAMS',
            400
          )
        }
      } else {
        const limit = Number(payload.extra_cost_limit)
        if (!(limit >= 0)) {
          throw new BusinessError('extra_cost_limit 必须 >= 0', 'INVALID_PARAMS', 400)
        }
        data.extra_cost_limit = limit
      }
    }

    // per-user 三重护栏（NULL=不限）
    for (const key of ['per_user_daily_limit', 'eligibility_days', 'per_user_extra_cap']) {
      if (payload[key] !== undefined) {
        data[key] = payload[key] === null ? null : parseInt(payload[key], 10)
      }
    }

    if (payload.start_at !== undefined) data.start_at = payload.start_at || null
    if (payload.end_at !== undefined) data.end_at = payload.end_at || null

    if (payload.status !== undefined) {
      if (!['active', 'inactive'].includes(payload.status)) {
        throw new BusinessError('status 非法', 'INVALID_PARAMS', 400)
      }
      data.status = payload.status
    }

    if (payload.remark !== undefined) data.remark = payload.remark || null

    return data
  }

  /**
   * 校验 targets 数组（与 target_type 语义一致；segment 必须是活动 resolver_version 内存在的 segment_key）
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} target_type - 主表作用人群类型
   * @param {Array} targets - 作用对象数组
   * @param {Object} transaction - 事务
   * @returns {Promise<Array>} 规范化后的 targets 行数据
   * @throws {BusinessError} 校验失败
   * @private
   */
  static async _validateTargets(lottery_campaign_id, target_type, targets, transaction) {
    if (target_type === 'all') {
      return [] // 全体生效，本表无记录
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new BusinessError(
        `target_type=${target_type} 时 targets 必须为非空数组`,
        'INVALID_PARAMS',
        400
      )
    }

    // 预取该活动的 segment 选项（若含 segment 目标）
    let segmentKeys = null
    if (targets.some(t => t.target_type === 'segment')) {
      segmentKeys = await RewardMultiplierService.getSegmentOptions(
        lottery_campaign_id,
        transaction
      )
      segmentKeys = new Set(segmentKeys.map(s => s.segment_key))
    }
    // 预取启用成长等级（若含 growth_level 目标）
    let levelKeys = null
    if (targets.some(t => t.target_type === 'growth_level')) {
      const levels = await UserGrowthLevel.getActiveLevels({ transaction })
      levelKeys = new Set(levels.map(l => l.level_key))
    }

    const rows = []
    for (const t of targets) {
      if (!TARGET_ROW_TYPES.includes(t.target_type)) {
        throw new BusinessError(
          `target 行 target_type 非法: ${t.target_type}`,
          'INVALID_PARAMS',
          400
        )
      }
      const ref =
        t.target_ref !== undefined && t.target_ref !== null ? String(t.target_ref).trim() : ''
      if (!ref) {
        throw new BusinessError('target_ref 不能为空', 'INVALID_PARAMS', 400)
      }
      if (t.target_type === 'segment' && !segmentKeys.has(ref)) {
        throw new BusinessError(
          `segment 目标 "${ref}" 不在活动 resolver_version 的可选 segment_key 内`,
          'INVALID_SEGMENT_KEY',
          400
        )
      }
      if (t.target_type === 'growth_level' && !levelKeys.has(ref)) {
        throw new BusinessError(
          `growth_level 目标 "${ref}" 不是有效的成长等级码`,
          'INVALID_LEVEL_KEY',
          400
        )
      }
      rows.push({
        target_type: t.target_type,
        target_ref: ref,
        target_value:
          t.target_value !== undefined && t.target_value !== null ? String(t.target_value) : null
      })
    }
    return rows
  }

  /**
   * 创建倍率规则（含 targets），写操作收口 + 强制事务
   * @param {Object} payload - 请求体（含 targets 数组）
   * @param {number} admin_id - 操作人（预留审计）
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 创建的规则（含 targets）
   */
  static async createRule(payload, admin_id, options = {}) {
    const transaction = RewardMultiplierService._assertTransaction(options)

    const data = RewardMultiplierService._validateAndNormalize(payload, true)

    // 必填项兜底校验
    if (!data.campaign_name) throw new BusinessError('campaign_name 必填', 'INVALID_PARAMS', 400)
    if (!data.display_name) throw new BusinessError('display_name 必填', 'INVALID_PARAMS', 400)
    if (data.multiplier === undefined) {
      throw new BusinessError('multiplier 必填', 'INVALID_PARAMS', 400)
    }

    // 活动必须存在
    const campaign = await LotteryCampaign.findByPk(data.lottery_campaign_id, { transaction })
    if (!campaign) {
      throw new BusinessError('绑定的抽奖活动不存在', 'CAMPAIGN_NOT_FOUND', 404)
    }

    const target_type = data.target_type || 'all'
    const targetRows = await RewardMultiplierService._validateTargets(
      data.lottery_campaign_id,
      target_type,
      payload.targets,
      transaction
    )

    const rule = await RewardMultiplierCampaign.create({ ...data, target_type }, { transaction })

    if (targetRows.length) {
      await RewardMultiplierTarget.bulkCreate(
        targetRows.map(r => ({ ...r, multiplier_campaign_id: rule.multiplier_campaign_id })),
        { transaction }
      )
    }

    return RewardMultiplierCampaign.findByPk(rule.multiplier_campaign_id, {
      include: [{ model: RewardMultiplierTarget, as: 'targets' }],
      transaction
    })
  }

  /**
   * 更新倍率规则（含 targets 全量替换），写操作收口 + 强制事务
   * @param {number} multiplier_campaign_id - 规则ID
   * @param {Object} payload - 请求体
   * @param {number} admin_id - 操作人
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的规则（含 targets）
   */
  static async updateRule(multiplier_campaign_id, payload, admin_id, options = {}) {
    const transaction = RewardMultiplierService._assertTransaction(options)

    const rule = await RewardMultiplierCampaign.findByPk(multiplier_campaign_id, { transaction })
    if (!rule) {
      throw new BusinessError('倍率规则不存在', 'MULTIPLIER_RULE_NOT_FOUND', 404)
    }

    const data = RewardMultiplierService._validateAndNormalize(payload, false)
    // 不允许改绑活动（活动隔离，避免历史成本/快照错位）
    delete data.lottery_campaign_id

    await rule.update(data, { transaction })

    // targets 全量替换（仅当请求体显式提供 targets）
    if (payload.targets !== undefined) {
      const target_type = data.target_type || rule.target_type
      const targetRows = await RewardMultiplierService._validateTargets(
        rule.lottery_campaign_id,
        target_type,
        payload.targets,
        transaction
      )
      await RewardMultiplierTarget.destroy({
        where: { multiplier_campaign_id },
        transaction
      })
      if (targetRows.length) {
        await RewardMultiplierTarget.bulkCreate(
          targetRows.map(r => ({ ...r, multiplier_campaign_id })),
          { transaction }
        )
      }
    }

    return RewardMultiplierCampaign.findByPk(multiplier_campaign_id, {
      include: [{ model: RewardMultiplierTarget, as: 'targets' }],
      transaction
    })
  }

  /**
   * 开关规则状态（active/inactive）
   * @param {number} multiplier_campaign_id - 规则ID
   * @param {string} status - active/inactive
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} 更新后的规则
   */
  static async setStatus(multiplier_campaign_id, status, options = {}) {
    const transaction = RewardMultiplierService._assertTransaction(options)
    if (!['active', 'inactive'].includes(status)) {
      throw new BusinessError('status 非法（仅 active/inactive）', 'INVALID_PARAMS', 400)
    }
    const rule = await RewardMultiplierCampaign.findByPk(multiplier_campaign_id, { transaction })
    if (!rule) {
      throw new BusinessError('倍率规则不存在', 'MULTIPLIER_RULE_NOT_FOUND', 404)
    }
    await rule.update({ status }, { transaction })
    return rule
  }

  /**
   * 删除倍率规则（级联删除 targets，FK ON DELETE CASCADE）
   * @param {number} multiplier_campaign_id - 规则ID
   * @param {Object} options - { transaction }
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteRule(multiplier_campaign_id, options = {}) {
    const transaction = RewardMultiplierService._assertTransaction(options)
    const rule = await RewardMultiplierCampaign.findByPk(multiplier_campaign_id, { transaction })
    if (!rule) {
      throw new BusinessError('倍率规则不存在', 'MULTIPLIER_RULE_NOT_FOUND', 404)
    }
    await rule.destroy({ transaction }) // targets 随 FK CASCADE 删除
    return true
  }

  /**
   * 成本水位查询（extra_cost_used/limit + 受益人数 + 多发水晶总量，读 lottery_draws 快照）
   * @param {number} multiplier_campaign_id - 规则ID
   * @returns {Promise<Object>} 成本水位统计
   */
  static async getCostWaterLevel(multiplier_campaign_id) {
    const rule = await RewardMultiplierCampaign.findByPk(multiplier_campaign_id)
    if (!rule) {
      throw new BusinessError('倍率规则不存在', 'MULTIPLIER_RULE_NOT_FOUND', 404)
    }

    // 从 lottery_draws 快照聚合本规则的翻倍触发次数/受益人数/多发水晶总量
    const [stats] = await sequelize.query(
      `SELECT
          COUNT(*) AS trigger_count,
          COUNT(DISTINCT user_id) AS beneficiary_count,
          COALESCE(SUM(
            CAST(JSON_EXTRACT(result_metadata, '$.crystal_multiplier.final_quantity') AS SIGNED)
            - CAST(JSON_EXTRACT(result_metadata, '$.crystal_multiplier.base_quantity') AS SIGNED)
          ), 0) AS extra_units_total
        FROM lottery_draws
        WHERE lottery_campaign_id = :cid
          AND JSON_EXTRACT(result_metadata, '$.crystal_multiplier.multiplier_campaign_id') = :mcid`,
      {
        replacements: {
          cid: rule.lottery_campaign_id,
          mcid: Number(rule.multiplier_campaign_id)
        }
      }
    )

    const used = Number(rule.extra_cost_used) || 0
    const limit = Number(rule.extra_cost_limit) || 0
    return {
      multiplier_campaign_id: Number(rule.multiplier_campaign_id),
      lottery_campaign_id: rule.lottery_campaign_id,
      extra_cost_used: used,
      extra_cost_limit: limit,
      usage_ratio: limit > 0 ? Number((used / limit).toFixed(4)) : 0,
      exhausted: used >= limit,
      trigger_count: Number(stats[0].trigger_count) || 0,
      beneficiary_count: Number(stats[0].beneficiary_count) || 0,
      extra_units_total: Number(stats[0].extra_units_total) || 0
    }
  }

  /**
   * 获取某活动可选的 segment_key 列表（数据源：DB segment_rule_configs，D-12 防漂移）
   *
   * 语义（§16.2 权威）：活动通过 lottery_strategy_config.segment.resolver_version 绑定单一版本，
   * 该版本 segment_rule_configs.rules[].segment_key 即倍率规则 segment 目标可选项。
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} [transaction] - 可选事务
   * @returns {Promise<Array<Object>>} [{ segment_key, description }]
   */
  static async getSegmentOptions(lottery_campaign_id, transaction) {
    // 1. 取活动绑定的 resolver_version
    const cfg = await LotteryStrategyConfig.findOne({
      where: {
        lottery_campaign_id,
        config_group: 'segment',
        config_key: 'resolver_version'
      },
      transaction
    })
    let version = 'default'
    if (cfg && cfg.config_value) {
      version =
        typeof cfg.config_value === 'string'
          ? cfg.config_value.replace(/^"|"$/g, '')
          : cfg.config_value
    }

    // 2. 从 DB segment_rule_configs 取该版本 rules[].segment_key
    const ruleConfig = await SegmentRuleConfig.findOne({
      where: { version_key: version, status: 'active' },
      transaction
    })
    if (!ruleConfig || !Array.isArray(ruleConfig.rules)) {
      return []
    }
    // 去重 + 保留描述
    const seen = new Set()
    const options = []
    for (const r of ruleConfig.rules) {
      if (r && r.segment_key && !seen.has(r.segment_key)) {
        seen.add(r.segment_key)
        options.push({ segment_key: r.segment_key, description: r.description || null })
      }
    }
    return options
  }

  /**
   * 获取可选的用户标签 tag_key 列表（数据源：user_ad_tags 去重，§16.2）
   *
   * 说明：user_ad_tags 由凌晨定时任务产出，当前实测可能为空 → 返回空数组，
   * 前端据此提示"暂无标签数据"，tag 定向命中时无标签安全降级为不命中（×1）。
   *
   * @returns {Promise<Array<Object>>} [{ tag_key }]
   */
  static async getAdTagOptions() {
    const rows = await UserAdTag.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('tag_key')), 'tag_key']],
      raw: true
    })
    return rows.filter(r => r.tag_key).map(r => ({ tag_key: r.tag_key }))
  }

  /* ==================== 客服查询（§13.3，"为什么翻/没翻"解释） ==================== */

  /**
   * 查某用户近期抽奖的水晶倍率解释（§13.3 客服 user-data-query："为什么翻/没翻"）
   *
   * 直接读 lottery_draws.result_metadata.crystal_multiplier 快照，逐条给出：
   * - multiplied=true：翻倍了，附 base/applied/final/reason（"基础 10 × 新春翻倍 2 倍 = 20"）
   * - multiplied=false：未翻倍（非水晶奖 / 未命中规则 / 兜底奖 / 成本击穿回落），前端展示"×1 未翻倍"
   * 供客服解答用户"我为什么没翻倍"，数据即快照、可对账追溯。
   *
   * @param {Object} params - { user_id（必填）, lottery_campaign_id?, limit?（默认20，最大100） }
   * @returns {Promise<Object>} { user_id, total, records: [{ lottery_draw_id, lottery_campaign_id, prize_name, reward_tier, created_at, multiplied, crystal_multiplier }] }
   */
  static async getUserMultiplierExplain(params = {}) {
    const user_id = parseInt(params.user_id, 10)
    if (!user_id) {
      throw new BusinessError('user_id 必填', 'USER_ID_REQUIRED', 400)
    }
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 20))
    const where = ['user_id = :user_id']
    const replacements = { user_id, limit }
    if (params.lottery_campaign_id) {
      where.push('lottery_campaign_id = :cid')
      replacements.cid = parseInt(params.lottery_campaign_id, 10)
    }

    const rows = await sequelize.query(
      `SELECT lottery_draw_id, lottery_campaign_id, prize_name, reward_tier, created_at,
              JSON_EXTRACT(result_metadata, '$.crystal_multiplier') AS crystal_multiplier
         FROM lottery_draws
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT :limit`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    )

    const records = rows.map(r => {
      let cm = null
      if (r.crystal_multiplier) {
        cm =
          typeof r.crystal_multiplier === 'string'
            ? JSON.parse(r.crystal_multiplier)
            : r.crystal_multiplier
      }
      const multiplied = !!(cm && Number(cm.applied_multiplier) > 1)
      return {
        lottery_draw_id: r.lottery_draw_id,
        lottery_campaign_id: r.lottery_campaign_id,
        prize_name: r.prize_name,
        reward_tier: r.reward_tier,
        created_at: r.created_at,
        multiplied,
        // 未翻倍时 crystal_multiplier 为 null，前端展示"×1 未翻倍"
        crystal_multiplier: cm
      }
    })

    return { user_id, total: records.length, records }
  }

  /* ==================== 监控看板聚合（§13.2，ECharts 数据源） ==================== */

  /**
   * 活动积分 event_points 发放/消耗按日趋势（§13.2 活动代币看板）
   *
   * 数据源：asset_transactions（asset_code='event_points'），按 created_at 天聚合：
   * - issued：当日发放总量（delta_amount>0，来自消费归集 consumption_event_points_allocation）
   * - consumed：当日消耗总量（delta_amount<0 取绝对值，来自抽奖 lottery_consume / 到期清零 event_budget_expiry_clear）
   * 展示层转北京时间由前端统一组件处理（存储 UTC）。
   *
   * @param {Object} filters - { days?: number（默认30，最大180） }
   * @returns {Promise<Object>} { range_days, series: [{ date, issued, consumed }] }
   */
  static async getEventPointsTrend(filters = {}) {
    const days = Math.min(180, Math.max(1, parseInt(filters.days, 10) || 30))
    const rows = await sequelize.query(
      `SELECT
          DATE(created_at) AS stat_date,
          COALESCE(SUM(CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END), 0) AS issued,
          COALESCE(SUM(CASE WHEN delta_amount < 0 THEN -delta_amount ELSE 0 END), 0) AS consumed
        FROM asset_transactions
        WHERE asset_code = 'event_points'
          AND is_invalid = 0
          AND created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)
        GROUP BY DATE(created_at)
        ORDER BY stat_date ASC`,
      { replacements: { days }, type: sequelize.QueryTypes.SELECT }
    )
    return {
      range_days: days,
      series: rows.map(r => ({
        date: r.stat_date,
        issued: Number(r.issued) || 0,
        consumed: Number(r.consumed) || 0
      }))
    }
  }

  /**
   * 活动积分 event_points 在途余额概览（§13.2 活动代币看板：发放/消耗/在途/到期清零量）
   *
   * @returns {Promise<Object>} { total_issued, total_consumed, in_flight, expired_cleared, holder_count }
   */
  static async getEventPointsOverview() {
    const [flow] = await sequelize.query(
      `SELECT
          COALESCE(SUM(CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END), 0) AS total_issued,
          COALESCE(SUM(CASE WHEN delta_amount < 0 AND business_type = 'lottery_consume' THEN -delta_amount ELSE 0 END), 0) AS total_consumed,
          COALESCE(SUM(CASE WHEN delta_amount < 0 AND business_type = 'event_budget_expiry_clear' THEN -delta_amount ELSE 0 END), 0) AS expired_cleared
        FROM asset_transactions
        WHERE asset_code = 'event_points' AND is_invalid = 0`,
      { type: sequelize.QueryTypes.SELECT }
    )
    const [balance] = await sequelize.query(
      `SELECT
          COALESCE(SUM(available_amount), 0) AS in_flight,
          COUNT(DISTINCT account_id) AS holder_count
        FROM account_asset_balances
        WHERE asset_code = 'event_points' AND available_amount > 0`,
      { type: sequelize.QueryTypes.SELECT }
    )
    return {
      total_issued: Number(flow.total_issued) || 0,
      total_consumed: Number(flow.total_consumed) || 0,
      expired_cleared: Number(flow.expired_cleared) || 0,
      in_flight: Number(balance.in_flight) || 0,
      holder_count: Number(balance.holder_count) || 0
    }
  }

  /**
   * 个人活动预算账户余额分布（§13.2 防套利监控：识别异常高余额囤积）
   *
   * 按活动专属桶 EVENT_<code> 统计 budget_points/event_points 的持有人数与余额分档，
   * 供运营识别"平时囤、翻倍日套现"的异常高余额账户。
   *
   * @param {Object} filters - { asset_code?: 'event_points'|'budget_points'（默认 event_points） }
   * @returns {Promise<Object>} { asset_code, buckets: [{ bucket_label, holder_count, total_amount }] }
   */
  static async getPersonalBudgetDistribution(filters = {}) {
    const assetCode = filters.asset_code === 'budget_points' ? 'budget_points' : 'event_points'
    // 余额分档（识别异常囤积）：0-100 / 100-500 / 500-2000 / 2000+
    const rows = await sequelize.query(
      `SELECT
          CASE
            WHEN available_amount < 100 THEN '0-100'
            WHEN available_amount < 500 THEN '100-500'
            WHEN available_amount < 2000 THEN '500-2000'
            ELSE '2000+'
          END AS bucket_label,
          COUNT(*) AS holder_count,
          COALESCE(SUM(available_amount), 0) AS total_amount
        FROM account_asset_balances
        WHERE asset_code = :assetCode
          AND available_amount > 0
          AND lottery_campaign_id LIKE 'EVENT_%'
        GROUP BY bucket_label
        ORDER BY FIELD(bucket_label, '0-100', '100-500', '500-2000', '2000+')`,
      { replacements: { assetCode }, type: sequelize.QueryTypes.SELECT }
    )
    return {
      asset_code: assetCode,
      buckets: rows.map(r => ({
        bucket_label: r.bucket_label,
        holder_count: Number(r.holder_count) || 0,
        total_amount: Number(r.total_amount) || 0
      }))
    }
  }
}

module.exports = RewardMultiplierService
