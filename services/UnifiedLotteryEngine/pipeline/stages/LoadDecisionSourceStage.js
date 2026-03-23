'use strict'

/**
 * LoadDecisionSourceStage - 加载决策来源 Stage
 *
 * 职责：
 * 1. 统一判断抽奖决策来源类型（preset/override/guarantee/normal）
 * 2. 加载对应的决策配置
 * 3. 设置 context.decision_source 供后续 Stage 使用
 *
 * 决策优先级（已拍板 2026-01-18）：
 * 1. 预设（preset）- 最高优先级：有待使用预设时
 * 2. 管理干预（override）- 次高优先级：有 force_win/force_lose 时
 * 3. 保底（guarantee）- 第三优先级：达到保底阈值时
 * 4. 正常抽奖（normal）- 最低优先级：无上述情况时
 *
 * 输出到上下文：
 * - decision_source: 决策来源类型（preset/override/guarantee/normal）
 * - preset: 预设记录（如果是 preset）
 * - override: 干预配置（如果是 override）
 * - guarantee_triggered: 保底触发信息（如果是 guarantee）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage
 * @author 统一抽奖架构重构 - Pipeline 统一化
 * @since 2026
 */

const BaseStage = require('./BaseStage')
const {
  LotteryPreset,
  LotteryManagementSetting,
  LotteryDraw,
  LotteryPrize,
  LotteryUserExperienceState,
  User
} = require('../../../../models')
const { Op, literal } = require('sequelize')

/**
 * 决策来源类型常量
 */
const DECISION_SOURCES = {
  PRESET: 'preset',
  OVERRIDE: 'override',
  GUARANTEE: 'guarantee',
  NORMAL: 'normal'
}

/**
 * 加载决策来源 Stage
 */
class LoadDecisionSourceStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('LoadDecisionSourceStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行决策来源加载
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.lottery_campaign_id - 活动ID
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, lottery_campaign_id } = context

    this.log('info', '开始判断决策来源', { user_id, lottery_campaign_id })

    try {
      // 获取活动配置
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      const campaign = campaign_data?.campaign || {}

      /*
       * 决策优先级判断（按优先级顺序检查）
       * 优先级：preset > override > guarantee > normal
       */

      // 0. 首抽必中检查（在 Preset 之前，通过 Preset 机制注入）
      const firstWinPreset = await this._checkFirstWin(user_id, lottery_campaign_id, context)
      if (firstWinPreset) {
        this.log('info', '命中首抽必中', {
          user_id,
          prize_name: firstWinPreset.prize_name,
          material_asset_code: firstWinPreset.material_asset_code,
          material_amount: firstWinPreset.material_amount
        })
        return this.success({
          decision_source: DECISION_SOURCES.PRESET,
          preset: firstWinPreset,
          override: null,
          guarantee_triggered: null,
          first_win: true,
          first_win_debt_coefficient: firstWinPreset.first_win_debt_coefficient || 0.15
        })
      }

      // 1. 检查预设（最高优先级）
      const preset = await this._checkPreset(user_id, lottery_campaign_id)
      if (preset) {
        this.log('info', '命中预设决策', {
          user_id,
          lottery_preset_id: preset.lottery_preset_id,
          lottery_prize_id: preset.lottery_prize_id
        })
        return this.success({
          decision_source: DECISION_SOURCES.PRESET,
          preset: preset.toJSON ? preset.toJSON() : preset,
          override: null,
          guarantee_triggered: null
        })
      }

      // 2. 检查管理干预（次高优先级）
      const override = await this._checkOverride(user_id, lottery_campaign_id)
      if (override) {
        this.log('info', '命中管理干预', {
          user_id,
          setting_id: override.setting_id,
          setting_type: override.setting_type
        })
        return this.success({
          decision_source: DECISION_SOURCES.OVERRIDE,
          preset: null,
          override: override.toJSON ? override.toJSON() : override,
          guarantee_triggered: null
        })
      }

      // 3. 检查保底触发（第三优先级）
      const guarantee = await this._checkGuarantee(user_id, lottery_campaign_id, campaign)
      if (guarantee.triggered) {
        this.log('info', '触发保底机制', {
          user_id,
          draw_count: guarantee.current_count,
          threshold: guarantee.threshold
        })
        return this.success({
          decision_source: DECISION_SOURCES.GUARANTEE,
          preset: null,
          override: null,
          guarantee_triggered: guarantee
        })
      }

      // 4. 正常抽奖（最低优先级）
      this.log('info', '使用正常抽奖决策', { user_id, lottery_campaign_id })
      return this.success({
        decision_source: DECISION_SOURCES.NORMAL,
        preset: null,
        override: null,
        guarantee_triggered: null
      })
    } catch (error) {
      this.log('error', '判断决策来源失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 检查是否触发首抽必中（新用户首次抽奖保证中奖）
   *
   * 触发条件：
   * 1. first_win.enabled = true（策略配置开关）
   * 2. 用户在该活动的历史抽奖次数为 0（本批次之前无抽奖记录）
   * 3. 当前 draw_number 匹配 inject_position（D20：多抽→第2抽，单抽→第1抽）
   *
   * 实现方式：
   * - 根据消费段匹配五档动态奖品池（first_win.pools）
   * - 从候选奖品中加权随机选择一个
   * - 构造虚拟 Preset 对象注入决策链
   * - 附带 first_win_debt_coefficient（D22：0.15）供 SettleStage 应用运气债务
   * - 后续 Settle 阶段走正常流程（扣配额、发资产）
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} context - 执行上下文（含 draw_number, total_draws）
   * @returns {Promise<Object|null>} 虚拟 Preset 或 null
   * @private
   */
  async _checkFirstWin(user_id, lottery_campaign_id, context) {
    try {
      const { DynamicConfigLoader } = require('../../compute/config/ComputeConfig')

      const enabled = await DynamicConfigLoader.getValue('first_win', 'enabled', false, {
        lottery_campaign_id
      })
      if (enabled !== true && enabled !== 'true') return null

      const draw_number = context?.draw_number || 1
      const total_draws = context?.total_draws || 1

      /* D20 注入时机：多抽→第 inject_position 抽，单抽→第 1 抽 */
      const inject_position = await DynamicConfigLoader.getValue(
        'first_win',
        'inject_position',
        2,
        { lottery_campaign_id }
      )
      const target_position = total_draws > 1 ? Number(inject_position) : 1
      if (draw_number !== target_position) return null

      const expState = await LotteryUserExperienceState.findOne({
        where: { user_id, lottery_campaign_id }
      })

      /*
       * 多抽场景下 total_draw_count 会随批次内每次抽奖递增，
       * 实际判断条件：本批次开始前用户的历史抽奖次数为 0
       * draw_number - 1 = 本批次中在当前抽之前已完成的次数
       */
      const draws_before_this = draw_number - 1
      const historical_draw_count = expState ? expState.total_draw_count - draws_before_this : 0
      if (historical_draw_count > 0) return null

      const poolsConfig = await DynamicConfigLoader.getValue('first_win', 'pools', null, {
        lottery_campaign_id
      })
      if (!poolsConfig) return null

      const pools = typeof poolsConfig === 'string' ? JSON.parse(poolsConfig) : poolsConfig

      const user = await User.findByPk(user_id, { attributes: ['user_id'] })
      if (!user) return null

      /* 从用户配额账户推算消费段（积分 1:1 消费额） */
      const BalanceService = require('../../../asset/BalanceService')
      let spendEstimate = 0
      try {
        const pointsBalance = await BalanceService.getBalance(user_id, 'POINTS')
        const quotaBalance = await BalanceService.getBalance(user_id, 'DIAMOND_QUOTA')
        spendEstimate = Math.max(pointsBalance || 0, quotaBalance || 0)
      } catch {
        spendEstimate = 0
      }

      let selectedTier = null
      const tierKeys = Object.keys(pools).sort()
      for (const key of tierKeys) {
        const tier = pools[key]
        if (tier.max_spend && spendEstimate <= tier.max_spend) {
          selectedTier = tier
          break
        }
        if (tier.min_spend && spendEstimate >= tier.min_spend) {
          selectedTier = tier
          break
        }
      }
      if (!selectedTier) selectedTier = pools[tierKeys[0]]

      if (!selectedTier?.candidates?.length) return null

      /* 加权随机从候选池中选一个奖品 */
      const totalWeight = selectedTier.candidates.reduce((s, c) => s + (c.weight || 1), 0)
      let roll = Math.random() * totalWeight
      let chosen = selectedTier.candidates[0]
      for (const candidate of selectedTier.candidates) {
        roll -= candidate.weight || 1
        if (roll <= 0) {
          chosen = candidate
          break
        }
      }

      /* 从真实奖品表中匹配对应奖品 */
      const matchedPrize = await LotteryPrize.findOne({
        where: {
          lottery_campaign_id,
          material_asset_code: chosen.asset,
          material_amount: chosen.amount,
          status: 'active'
        }
      })

      if (!matchedPrize) {
        this.log('warn', '首抽必中奖品未在奖品表中找到匹配', {
          user_id,
          asset: chosen.asset,
          amount: chosen.amount
        })
        return null
      }

      /* D22 运气债务系数：首抽必中产生轻微债务（0.15），弱于普通 HIGH（0.5） */
      const debt_coefficient = await DynamicConfigLoader.getValue(
        'first_win',
        'debt_coefficient',
        0.15,
        { lottery_campaign_id }
      )

      /* 返回完整奖品对象 + Preset 元数据，PrizePickStage 直接使用 */
      const prizeJSON = matchedPrize.toJSON ? matchedPrize.toJSON() : matchedPrize
      return {
        ...prizeJSON,
        lottery_preset_id: null,
        status: 'pending',
        approval_status: 'approved',
        source: 'first_win',
        first_win_debt_coefficient: Number(debt_coefficient)
      }
    } catch (error) {
      this.log('warn', '首抽必中检查失败（不影响正常抽奖）', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否有待使用的预设
   *
   * 查询规则：
   * 1. 匹配用户 user_id
   * 2. 状态为 pending（等待使用）且审批已通过（approved）
   * 3. 活动匹配：精确匹配 lottery_campaign_id，或预设未绑定活动（NULL 表示全局预设）
   * 4. 按 queue_order 升序取第一个（队列顺序消耗）
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object|null>} 预设记录或 null
   * @private
   */
  async _checkPreset(user_id, lottery_campaign_id) {
    try {
      /*
       * 2026-02-15 修复：支持全局预设（lottery_campaign_id 为 NULL）
       *
       * 修复根因：
       * - 原代码要求 lottery_campaign_id 精确匹配
       * - 但管理后台创建预设时未传入 lottery_campaign_id（字段值为 NULL）
       * - 导致所有预设队列永远无法命中
       *
       * 修复方案：
       * - lottery_campaign_id 精确匹配当前活动（活动级预设）
       * - 或 lottery_campaign_id 为 NULL（全局预设，对所有活动生效）
       */
      const preset = await LotteryPreset.findOne({
        where: {
          user_id,
          [Op.or]: [{ lottery_campaign_id }, { lottery_campaign_id: null }],
          status: 'pending',
          approval_status: 'approved'
        },
        order: [['queue_order', 'ASC']],
        include: [
          {
            model: User,
            as: 'admin',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      return preset
    } catch (error) {
      this.log('warn', '检查预设失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否有管理干预设置
   *
   * 查询规则：
   * 1. 匹配用户 user_id
   * 2. 设置类型为 force_win 或 force_lose
   * 3. 状态为 active（生效中）
   * 4. 未过期：expires_at 为 NULL（永不过期）或 expires_at > 当前时间
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID（按活动过滤 + 总开关前置检查）
   * @returns {Promise<Object|null>} 干预设置或 null
   * @private
   */
  async _checkOverride(user_id, lottery_campaign_id) {
    try {
      // 活动级总开关：management.enabled=false 时跳过全部干预检查
      const { DynamicConfigLoader } = require('../../compute/config/ComputeConfig')
      const management_enabled = await DynamicConfigLoader.getValue('management', 'enabled', true, {
        lottery_campaign_id
      })

      if (!management_enabled) {
        this.log('info', '管理干预总开关已关闭', { user_id, lottery_campaign_id })
        return null
      }

      /**
       * 2026-02-23 改造：按活动ID过滤管理干预
       * - lottery_campaign_id 匹配当前活动 OR NULL（全局干预）
       * - 同时检查 expires_at 实时过滤已过期的干预
       */
      const override = await LotteryManagementSetting.findOne({
        where: {
          user_id,
          setting_type: { [Op.in]: ['force_win', 'force_lose'] },
          status: 'active',
          [Op.and]: [
            {
              [Op.or]: [{ lottery_campaign_id }, { lottery_campaign_id: null }]
            },
            {
              [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
            }
          ]
        },
        order: [
          [literal('lottery_campaign_id IS NULL'), 'ASC'],
          ['lottery_campaign_id', 'DESC']
        ]
      })

      return override
    } catch (error) {
      this.log('warn', '检查管理干预失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查是否触发保底机制
   *
   * 保底规则（已拍板 2026-01-18）：
   * - 连续抽奖次数达到阈值时触发
   * - 阈值来源于活动配置的 guarantee_threshold
   * - 默认阈值为 10 次
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} _campaign - 活动对象（当前未使用，预留扩展）
   * @returns {Promise<Object>} 保底检查结果
   * @private
   */
  async _checkGuarantee(user_id, lottery_campaign_id, _campaign) {
    try {
      // 从 lottery_strategy_config 读取保底配置（三层优先级：DB活动级 > env > 代码默认值）
      const { DynamicConfigLoader } = require('../../compute/config/ComputeConfig')
      const guarantee_enabled =
        (await DynamicConfigLoader.getValue('guarantee', 'enabled', false, {
          lottery_campaign_id
        })) === true
      const threshold = await DynamicConfigLoader.getValue('guarantee', 'threshold', 10, {
        lottery_campaign_id
      })

      if (!guarantee_enabled) {
        return { triggered: false, reason: 'guarantee_disabled' }
      }

      // 查询用户累计抽奖次数
      const draw_count = await LotteryDraw.count({
        where: { user_id, lottery_campaign_id }
      })

      // 检查是否达到保底阈值（每 N 次触发一次）
      const next_count = draw_count + 1
      const triggered = next_count > 0 && next_count % threshold === 0

      return {
        triggered,
        current_count: draw_count,
        next_count,
        threshold
      }
    } catch (error) {
      this.log('warn', '检查保底失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      return { triggered: false, reason: 'check_failed' }
    }
  }
}

// 导出决策来源常量
LoadDecisionSourceStage.DECISION_SOURCES = DECISION_SOURCES

module.exports = LoadDecisionSourceStage
