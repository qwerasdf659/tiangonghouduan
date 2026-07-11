'use strict'

/**
 * @file CrystalMultiplierService - 水晶奖品倍率计算服务
 * @description 水晶奖品倍率活动设计方案 §4 / §18.3 的核心计算服务。
 *
 * 职责（只作用于"抽中水晶类材料的发放数量放大"这一层）：
 * 1. 判定当前奖品是否"水晶类"（material_asset_types.form ∈ shard/gem）。
 * 2. 查询"当前对该用户、本次抽奖活动生效"的倍率规则（活动隔离 + 时间窗 + 范围 + 人群命中）。
 * 3. 同活动内多规则命中取最高（max），并按各规则 max_multiplier_cap 二次夹紧。
 * 4. 成本刹车：extra_cost_used < extra_cost_limit 才参与；击穿则回退次高；行锁累加 extra_cost_used。
 * 5. per-user 三重护栏：per_user_daily_limit / eligibility_days / per_user_extra_cap（NULL=不限）。
 * 6. 返回发放最终数量 + 快照候选，供 SettleStage 入账与写 result_metadata / asset_transactions.meta。
 *
 * 架构约束：
 * - 本服务在 SettleStage 现有结算事务内被调用，所有读写必须传入 transaction（外部传入事务方案）。
 * - 人群命中零新增引擎：segment 复用活动 resolver_version + SegmentResolver（与 TierPickStage 同源）；
 *   growth_level 复用 UserGrowthLevel.resolveLevelKey；tag 查 user_ad_tags；user 比对 user_id。
 * - 成本折算按各资产真实 material_asset_types.budget_value_points 累加（red_gem 已订正为 10）。
 *
 * @module services/lottery/CrystalMultiplierService
 */

const {
  RewardMultiplierCampaign,
  RewardMultiplierTarget,
  MaterialAssetType,
  UserGrowthLevel,
  UserAdTag,
  User,
  LotteryStrategyConfig,
  sequelize
} = require('../../models')
const { SegmentResolver } = require('../../config/segment_rules')
const BeijingTimeHelper = require('../../utils/timeHelper')

/** 水晶类形态（碎片 / 宝石均参与翻倍，货币/配额天然排除） */
const CRYSTAL_FORMS = ['shard', 'gem']

/**
 * 水晶奖品倍率计算服务（静态类，无内部状态）
 * @class CrystalMultiplierService
 */
class CrystalMultiplierService {
  /**
   * 判定资产形态是否属于水晶类
   * @param {string} form - material_asset_types.form
   * @returns {boolean} 是否水晶（shard/gem）
   */
  static isCrystalForm(form) {
    return CRYSTAL_FORMS.includes(form)
  }

  /**
   * 按取整方式对 base×multiplier 取整
   * @param {number} base - 基础发放数量
   * @param {number} multiplier - 有效倍率
   * @param {string} mode - round/floor/ceil（默认 ceil）
   * @returns {number} 取整后的最终发放数量
   */
  static applyRounding(base, multiplier, mode = 'ceil') {
    const raw = Number(base) * Number(multiplier)
    if (mode === 'floor') return Math.floor(raw)
    if (mode === 'round') return Math.round(raw)
    return Math.ceil(raw)
  }

  /**
   * 判定某规则的 reward_scope 是否覆盖当前奖品
   * @param {Object} rule - 倍率规则实例
   * @param {Object} assetMeta - { asset_code, group_code }
   * @returns {boolean} 是否覆盖
   */
  static scopeCovers(rule, assetMeta) {
    if (rule.reward_scope === 'crystal_all') return true
    const values = Array.isArray(rule.scope_values) ? rule.scope_values : []
    if (rule.reward_scope === 'group') return values.includes(assetMeta.group_code)
    if (rule.reward_scope === 'asset_codes') return values.includes(assetMeta.asset_code)
    return false
  }

  /**
   * 计算某规则的有效倍率（按自身 max_multiplier_cap 夹紧，且 >= 1）
   * @param {Object} rule - 倍率规则实例
   * @returns {number} 有效倍率
   */
  static effectiveMultiplier(rule) {
    const m = Number(rule.multiplier)
    const cap = Number(rule.max_multiplier_cap)
    return Math.max(1, Math.min(m, cap))
  }

  /**
   * 解析并应用水晶倍率（SettleStage material 分支发放前调用）
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {Object} params.prize - 结算奖品（含 prize_type/material_asset_code/material_amount）
   * @param {number} params.lottery_campaign_id - 本次抽奖活动ID
   * @param {boolean} [params.is_fallback=false] - 是否兜底/降级奖（兜底不翻倍）
   * @param {Date} [params.now] - 当前时间（默认 new Date()）
   * @param {Object} params.transaction - 结算事务（必传）
   * @returns {Promise<Object>} 计算结果：
   *   { crystal, applied_multiplier, base_quantity, final_quantity,
   *     multiplier_campaign_id, reason, candidates, extra_cost }
   */
  static async resolveMultiplier(params) {
    const {
      user_id,
      prize,
      lottery_campaign_id,
      is_fallback = false,
      now = new Date(),
      transaction
    } = params

    const base_quantity = Number(prize?.material_amount) || 0

    // 默认结果：不翻倍（×1）
    const noop = {
      crystal: false,
      applied_multiplier: 1,
      base_quantity,
      final_quantity: base_quantity,
      multiplier_campaign_id: null,
      reason: null,
      candidates: [],
      extra_cost: 0
    }

    // 仅 material 且有资产码/数量的奖品才可能翻倍
    if (prize?.prize_type !== 'material' || !prize.material_asset_code || base_quantity <= 0) {
      return noop
    }

    // 水晶判定：查资产形态
    const assetType = await MaterialAssetType.findOne({
      where: { asset_code: prize.material_asset_code },
      attributes: ['asset_code', 'group_code', 'form', 'budget_value_points'],
      transaction
    })
    if (!assetType || !CrystalMultiplierService.isCrystalForm(assetType.form)) {
      return noop
    }
    const assetMeta = { asset_code: assetType.asset_code, group_code: assetType.group_code }
    const budgetValuePoints = Number(assetType.budget_value_points) || 0

    // 是水晶但兜底/降级奖 → 不翻倍（拍板 §11-7）
    const result = { ...noop, crystal: true }
    if (is_fallback) {
      return result
    }

    // 查询本活动生效的倍率规则（活动隔离 + 状态 + 时间窗）
    const rules = await RewardMultiplierCampaign.findAll({
      where: {
        lottery_campaign_id,
        status: 'active',
        [sequelize.Sequelize.Op.and]: [
          {
            [sequelize.Sequelize.Op.or]: [
              { start_at: null },
              { start_at: { [sequelize.Sequelize.Op.lte]: now } }
            ]
          },
          {
            [sequelize.Sequelize.Op.or]: [
              { end_at: null },
              { end_at: { [sequelize.Sequelize.Op.gte]: now } }
            ]
          }
        ]
      },
      include: [{ model: RewardMultiplierTarget, as: 'targets' }],
      transaction
    })

    if (!rules.length) {
      return result
    }

    // 逐规则：范围覆盖 + 人群命中 + per-user 护栏，收集候选
    const candidates = []
    for (const rule of rules) {
      if (!CrystalMultiplierService.scopeCovers(rule, assetMeta)) continue

      // eslint-disable-next-line no-await-in-loop
      const hit = await CrystalMultiplierService._matchAudience(rule, {
        user_id,
        lottery_campaign_id,
        now,
        transaction
      })
      if (!hit) continue

      // eslint-disable-next-line no-await-in-loop
      const gatePass = await CrystalMultiplierService._perUserGate(rule, {
        user_id,
        lottery_campaign_id,
        now,
        transaction
      })
      if (!gatePass) continue

      candidates.push(rule)
    }

    if (!candidates.length) {
      return result
    }

    // 候选快照（对外展示 base multiplier，非夹紧后）
    result.candidates = candidates
      .slice()
      .sort(
        (a, b) =>
          CrystalMultiplierService.effectiveMultiplier(b) -
          CrystalMultiplierService.effectiveMultiplier(a)
      )
      .map(r => ({
        multiplier_campaign_id: Number(r.multiplier_campaign_id),
        multiplier: Number(r.multiplier)
      }))

    // 按有效倍率降序 + priority 降序，逐个尝试（成本击穿则回退次高）
    const ordered = candidates.slice().sort((a, b) => {
      const em =
        CrystalMultiplierService.effectiveMultiplier(b) -
        CrystalMultiplierService.effectiveMultiplier(a)
      if (em !== 0) return em
      return (b.priority || 0) - (a.priority || 0)
    })

    for (const rule of ordered) {
      const effective = CrystalMultiplierService.effectiveMultiplier(rule)
      if (effective <= 1) continue

      const final_quantity = CrystalMultiplierService.applyRounding(
        base_quantity,
        effective,
        rule.rounding_mode
      )
      const extra_units = final_quantity - base_quantity
      if (extra_units <= 0) continue
      const extra_cost = extra_units * budgetValuePoints

      // 行锁重读 extra_cost_used，成本刹车（达上限则本规则不参与，回退次高）
      // eslint-disable-next-line no-await-in-loop
      const locked = await RewardMultiplierCampaign.findByPk(rule.multiplier_campaign_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      })
      if (!locked) continue
      const used = Number(locked.extra_cost_used) || 0
      const limit = Number(locked.extra_cost_limit) || 0
      if (used >= limit) {
        // 已击穿，回退到次高倍率规则
        continue
      }

      // 累加额外成本（extra_cost 计入预算口径；budget_value_points=0 的资产 extra_cost=0，仍视为可翻）
      // eslint-disable-next-line no-await-in-loop
      await locked.update({ extra_cost_used: used + extra_cost }, { transaction })

      result.applied_multiplier = effective
      result.final_quantity = final_quantity
      result.multiplier_campaign_id = Number(rule.multiplier_campaign_id)
      result.reason = `${rule.display_name} ×${effective}`
      result.extra_cost = extra_cost
      return result
    }

    // 全部击穿或无有效倍率 → ×1
    return result
  }

  /**
   * 判定用户是否命中某规则的作用人群
   *
   * 命中逻辑：
   * - target_type='all' → 命中全体。
   * - 否则命中任一 target 行即命中（支持一个规则绑定多个人群标识，甚至混合类型）。
   *
   * @param {Object} rule - 倍率规则实例（含 targets 关联）
   * @param {Object} ctx - { user_id, lottery_campaign_id, now, transaction }
   * @returns {Promise<boolean>} 是否命中
   * @private
   */
  static async _matchAudience(rule, ctx) {
    if (rule.target_type === 'all') return true

    const targets = rule.targets || []
    if (!targets.length) return false

    const { user_id, lottery_campaign_id, transaction } = ctx

    // 预取用户对象（segment 求值 / eligibility 需要）
    let userObj = null
    let userHistoryPoints = 0
    const needUser = targets.some(t => ['segment', 'growth_level'].includes(t.target_type))
    if (needUser) {
      userObj = await User.findByPk(user_id, {
        // 取全 segment_field_registry 白名单字段（含 D-2 扩充的 login_count/last_login），缺字段会导致条件恒 false
        attributes: [
          'user_id',
          'created_at',
          'updated_at', // 内置回退规则（SEGMENT_RULE_VERSIONS）引用 user.updated_at，须保留
          'last_active_at',
          'user_level',
          'consecutive_fail_count',
          'login_count',
          'last_login'
        ],
        transaction
      })
      /*
       * 累计积分账本派生（拍板 4：history_total_points 冗余列已删除，
       * 分群/成长等级求值输入的字段名不变，取值改为账本派生）
       */
      if (userObj) {
        const AssetQueryService = require('../asset/QueryService')
        userHistoryPoints = await AssetQueryService.getHistoryTotalPoints(user_id, { transaction })
      }
    }

    // segment 需要活动 resolver_version + SegmentResolver
    let userSegmentKey = null
    if (targets.some(t => t.target_type === 'segment') && userObj) {
      const resolverVersion = await CrystalMultiplierService._getResolverVersion(
        lottery_campaign_id,
        transaction
      )
      userSegmentKey = await SegmentResolver.resolveSegmentAsync(resolverVersion, {
        ...userObj.get({ plain: true }),
        history_total_points: userHistoryPoints
      })
    }

    // growth_level 复用 UserGrowthLevel.resolveLevelKey
    let userLevelKey = null
    if (targets.some(t => t.target_type === 'growth_level') && userObj) {
      userLevelKey = await UserGrowthLevel.resolveLevelKey(userHistoryPoints, {
        transaction
      })
    }

    for (const t of targets) {
      if (t.target_type === 'segment') {
        if (userSegmentKey && userSegmentKey === t.target_ref) return true
      } else if (t.target_type === 'growth_level') {
        if (userLevelKey && userLevelKey === t.target_ref) return true
      } else if (t.target_type === 'user') {
        if (String(user_id) === String(t.target_ref)) return true
      } else if (t.target_type === 'tag') {
        // eslint-disable-next-line no-await-in-loop
        const tagHit = await CrystalMultiplierService._matchTag(user_id, t, transaction)
        if (tagHit) return true
      }
    }
    return false
  }

  /**
   * 标签命中判定（user_ad_tags；当前表可能为空 → 安全降级为不命中）
   * @param {number} user_id - 用户ID
   * @param {Object} target - target 行（target_ref=tag_key，target_value=可选 tag_value）
   * @param {Object} transaction - 事务
   * @returns {Promise<boolean>} 是否命中
   * @private
   */
  static async _matchTag(user_id, target, transaction) {
    const where = { user_id, tag_key: target.target_ref }
    if (target.target_value !== null && target.target_value !== undefined) {
      where.tag_value = target.target_value
    }
    const tag = await UserAdTag.findOne({ where, transaction })
    return !!tag
  }

  /**
   * 取活动绑定的分群 resolver 版本（lottery_strategy_config.segment.resolver_version）
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Object} transaction - 事务
   * @returns {Promise<string>} resolver_version（缺省回退 'default'）
   * @private
   */
  static async _getResolverVersion(lottery_campaign_id, transaction) {
    const row = await LotteryStrategyConfig.findOne({
      where: {
        lottery_campaign_id,
        config_group: 'segment',
        config_key: 'resolver_version'
      },
      transaction
    })
    if (!row) return 'default'
    const value = row.config_value
    // config_value 可能是 JSON 包裹或裸串
    if (typeof value === 'string') return value.replace(/^"|"$/g, '')
    return value || 'default'
  }

  /**
   * per-user 三重护栏判定（NULL=不限，均基于本规则维度）
   *
   * - eligibility_days：注册后 N 天内才享翻倍（现网可实时判定的"进入人群时间"锚点=注册时间）。
   * - per_user_daily_limit：本规则今日已享翻倍次数 < 上限。
   * - per_user_extra_cap：本规则累计额外发放量 < 上限（达上限本规则不再参与）。
   *
   * @param {Object} rule - 倍率规则实例
   * @param {Object} ctx - { user_id, lottery_campaign_id, now, transaction }
   * @returns {Promise<boolean>} 是否通过护栏
   * @private
   */
  static async _perUserGate(rule, ctx) {
    const { user_id, lottery_campaign_id, now, transaction } = ctx
    const mcid = Number(rule.multiplier_campaign_id)

    // eligibility_days：注册后 N 天内
    if (rule.eligibility_days !== null && rule.eligibility_days !== undefined) {
      const user = await User.findByPk(user_id, {
        attributes: ['user_id', 'created_at'],
        transaction
      })
      if (!user || !user.created_at) return false
      const days = (new Date(now).getTime() - new Date(user.created_at).getTime()) / 86400000
      if (days > Number(rule.eligibility_days)) return false
    }

    // per_user_daily_limit：本规则今日已享翻倍次数
    if (rule.per_user_daily_limit !== null && rule.per_user_daily_limit !== undefined) {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM lottery_draws
          WHERE user_id = :uid AND lottery_campaign_id = :cid
            AND created_at >= :todayStart
            AND JSON_EXTRACT(result_metadata, '$.crystal_multiplier.multiplier_campaign_id') = :mcid`,
        {
          replacements: {
            uid: user_id,
            cid: lottery_campaign_id,
            todayStart: BeijingTimeHelper.todayStart(),
            mcid
          },
          transaction
        }
      )
      if (Number(rows[0].c) >= Number(rule.per_user_daily_limit)) return false
    }

    // per_user_extra_cap：本规则累计额外发放量
    if (rule.per_user_extra_cap !== null && rule.per_user_extra_cap !== undefined) {
      const [rows] = await sequelize.query(
        `SELECT COALESCE(SUM(
            CAST(JSON_EXTRACT(result_metadata, '$.crystal_multiplier.final_quantity') AS SIGNED)
            - CAST(JSON_EXTRACT(result_metadata, '$.crystal_multiplier.base_quantity') AS SIGNED)
          ), 0) AS s
          FROM lottery_draws
          WHERE user_id = :uid AND lottery_campaign_id = :cid
            AND JSON_EXTRACT(result_metadata, '$.crystal_multiplier.multiplier_campaign_id') = :mcid`,
        {
          replacements: { uid: user_id, cid: lottery_campaign_id, mcid },
          transaction
        }
      )
      if (Number(rows[0].s) >= Number(rule.per_user_extra_cap)) return false
    }

    return true
  }

  /**
   * 查询当前用户在某活动的"合并后单一倍率"（C 端抽奖前展示用，只读、不累加成本）
   *
   * 与 resolveMultiplier 的区别：不写 extra_cost_used、不落快照、不做取整（返回倍率本身），
   * 供小程序抽奖前展示"当前水晶奖品 ×N"（§16.3）。已击穿的规则不计入。
   *
   * @param {Object} params - { user_id, lottery_campaign_id, now }
   * @returns {Promise<Object>} { applied_multiplier, display_name, end_at, active }
   */
  static async getMergedMultiplierForUser(params) {
    const { user_id, lottery_campaign_id, now = new Date() } = params
    const inactive = { applied_multiplier: 1, display_name: null, end_at: null, active: false }

    const rules = await RewardMultiplierCampaign.findAll({
      where: {
        lottery_campaign_id,
        status: 'active',
        [sequelize.Sequelize.Op.and]: [
          {
            [sequelize.Sequelize.Op.or]: [
              { start_at: null },
              { start_at: { [sequelize.Sequelize.Op.lte]: now } }
            ]
          },
          {
            [sequelize.Sequelize.Op.or]: [
              { end_at: null },
              { end_at: { [sequelize.Sequelize.Op.gte]: now } }
            ]
          }
        ]
      },
      include: [{ model: RewardMultiplierTarget, as: 'targets' }]
    })
    if (!rules.length) return inactive

    let best = null
    for (const rule of rules) {
      // 成本已击穿的规则不展示
      if (Number(rule.extra_cost_used) >= Number(rule.extra_cost_limit)) continue
      // eslint-disable-next-line no-await-in-loop
      const hit = await CrystalMultiplierService._matchAudience(rule, {
        user_id,
        lottery_campaign_id,
        now,
        transaction: undefined
      })
      if (!hit) continue
      // eslint-disable-next-line no-await-in-loop
      const gatePass = await CrystalMultiplierService._perUserGate(rule, {
        user_id,
        lottery_campaign_id,
        now,
        transaction: undefined
      })
      if (!gatePass) continue

      const effective = CrystalMultiplierService.effectiveMultiplier(rule)
      if (!best || effective > best.effective) {
        best = { effective, rule }
      }
    }

    if (!best || best.effective <= 1) return inactive
    return {
      applied_multiplier: best.effective,
      display_name: best.rule.display_name,
      end_at: best.rule.end_at,
      active: true
    }
  }
}

module.exports = CrystalMultiplierService
