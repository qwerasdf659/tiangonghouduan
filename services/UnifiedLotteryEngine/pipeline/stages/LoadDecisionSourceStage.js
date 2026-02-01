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
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryPreset, LotteryManagementSetting, LotteryDraw, User } = require('../../../../models')
const { Op } = require('sequelize')

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
   * 检查是否有待使用的预设
   *
   * @param {number} user_id - 用户ID
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Object|null>} 预设记录或 null
   * @private
   */
  async _checkPreset(user_id, lottery_campaign_id) {
    try {
      const preset = await LotteryPreset.findOne({
        where: {
          user_id,
          lottery_campaign_id,
          status: 'pending',
          approval_status: 'approved'
        },
        order: [['queue_order', 'ASC']],
        include: [
          {
            model: User,
            as: 'admin', // 关联到创建该预设的管理员（LotteryPreset.associate 中定义）
            attributes: ['user_id', 'nickname'] // users 表没有 username 字段
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
   * @param {number} user_id - 用户ID
   * @param {number} _lottery_campaign_id - 活动ID（当前未使用，表中没有此字段）
   * @returns {Promise<Object|null>} 干预设置或 null
   * @private
   */
  async _checkOverride(user_id, _lottery_campaign_id) {
    try {
      /*
       * 注意：LotteryManagementSetting 表当前没有 lottery_campaign_id 字段
       * 管理干预设置是针对用户的，不区分活动
       */
      const override = await LotteryManagementSetting.findOne({
        where: {
          user_id,
          setting_type: { [Op.in]: ['force_win', 'force_lose'] },
          status: 'active'
        }
      })

      return override
    } catch (error) {
      this.log('warn', '检查管理干预失败', {
        user_id,
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
   * @param {Object} campaign - 活动配置
   * @returns {Promise<Object>} 保底检查结果
   * @private
   */
  async _checkGuarantee(user_id, lottery_campaign_id, campaign) {
    try {
      // 获取活动保底配置
      const prize_distribution_config = campaign.prize_distribution_config || {}
      const guarantee_config = prize_distribution_config.guarantee || {}
      const threshold = guarantee_config.threshold || 10

      // 如果禁用保底，直接返回
      if (guarantee_config.enabled === false) {
        return { triggered: false, reason: 'guarantee_disabled' }
      }

      // 查询用户本周期内的抽奖次数
      const draw_count = await LotteryDraw.count({
        where: {
          user_id,
          lottery_campaign_id,
          created_at: {
            [Op.gte]: this._getGuaranteePeriodStart(guarantee_config)
          }
        }
      })

      /*
       * 检查是否达到保底阈值
       * 使用模运算判断：每 N 次触发一次保底
       */
      const next_count = draw_count + 1
      const triggered = next_count > 0 && next_count % threshold === 0

      return {
        triggered,
        current_count: draw_count,
        next_count,
        threshold,
        period_type: guarantee_config.period_type || 'rolling'
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

  /**
   * 获取保底周期的起始时间
   *
   * @param {Object} guarantee_config - 保底配置
   * @returns {Date} 周期起始时间
   * @private
   */
  _getGuaranteePeriodStart(guarantee_config) {
    const period_type = guarantee_config.period_type || 'rolling'
    const now = new Date()

    switch (period_type) {
      case 'daily':
        // 今日零点
        return new Date(now.getFullYear(), now.getMonth(), now.getDate())

      case 'weekly': {
        // 本周一零点
        const day_of_week = now.getDay()
        const days_since_monday = day_of_week === 0 ? 6 : day_of_week - 1
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days_since_monday)
      }

      case 'monthly':
        // 本月一号零点
        return new Date(now.getFullYear(), now.getMonth(), 1)

      case 'rolling':
      default:
        // 滚动计数，不重置（返回很早的时间）
        return new Date(0)
    }
  }
}

// 导出决策来源常量
LoadDecisionSourceStage.DECISION_SOURCES = DECISION_SOURCES

module.exports = LoadDecisionSourceStage
