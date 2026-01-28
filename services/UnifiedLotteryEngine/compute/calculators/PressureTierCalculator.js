'use strict'

/**
 * PressureTierCalculator - 活动压力分层计算器
 *
 * 核心职责：
 * 1. 计算活动压力指数（Pressure Index）
 * 2. 根据压力指数确定压力分层（P0/P1/P2）
 * 3. 适用于所有 budget_mode（user/pool/hybrid/none）
 *
 * 业务背景（来自方案文档）：
 * - 活动压力反映"已发放奖品价值"相对于"时间进度"的偏离程度
 * - 压力过高 → 需要降低高价值奖品概率
 * - 压力过低 → 可以适当提高高价值奖品概率
 *
 * 压力指数计算公式（Virtual Consumption 方法）：
 * - 虚拟消耗 = 已发放奖品价值总和 / 活动预算总额
 * - 时间进度 = (当前时间 - 开始时间) / (结束时间 - 开始时间)
 * - 压力指数 = 虚拟消耗 / 时间进度
 *
 * 压力分层定义：
 * - P0: pressure_index <= 0.8（宽松，可适当提高高档位概率）
 * - P1: 0.8 < pressure_index <= 1.2（正常，使用标准档位权重）
 * - P2: pressure_index > 1.2（紧张，需降低高档位概率）
 *
 * @module services/UnifiedLotteryEngine/compute/calculators/PressureTierCalculator
 * @author 抽奖模块策略重构 - Phase 4
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * 压力分层（Pressure Tier）等级常量
 * @enum {string}
 */
const PRESSURE_TIER = {
  /** P0：宽松状态，可适当提高高档位概率 */
  P0: 'P0',
  /** P1：正常状态，使用标准档位权重 */
  P1: 'P1',
  /** P2：紧张状态，需降低高档位概率 */
  P2: 'P2'
}

/**
 * 压力分层阈值默认配置
 */
const DEFAULT_PRESSURE_THRESHOLDS = {
  /** P0 上限（<= 此值为 P0） */
  p0_upper: 0.8,
  /** P1 上限（<= 此值为 P1，> 此值为 P2） */
  p1_upper: 1.2
}

/**
 * 活动压力分层计算器
 */
class PressureTierCalculator {
  /**
   * 创建计算器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.thresholds - 压力阈值配置（可选）
   */
  constructor(options = {}) {
    /**
     * 压力阈值配置
     */
    this.thresholds = {
      ...DEFAULT_PRESSURE_THRESHOLDS,
      ...options.thresholds
    }

    this.logger = logger
  }

  /**
   * 计算活动压力分层
   *
   * 主入口方法，根据活动进度和已发放奖品计算压力指数和分层
   *
   * @param {Object} context - 抽奖上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.campaign - 活动配置对象
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 计算结果
   */
  async calculate(context, options = {}) {
    const { user_id, campaign_id, campaign } = context

    this._log('info', '开始计算活动压力分层', {
      user_id,
      campaign_id
    })

    try {
      // 1. 计算时间进度
      const time_progress = this._calculateTimeProgress(campaign)

      // 2. 计算虚拟消耗率
      const virtual_consumption = await this._calculateVirtualConsumption(context, options)

      // 3. 计算压力指数
      const pressure_index = this._calculatePressureIndex(virtual_consumption, time_progress)

      // 4. 确定压力分层
      const pressure_tier = this._determinePressureTier(pressure_index)

      // 5. 计算权重调整建议
      const weight_adjustment = this._calculateWeightAdjustment(pressure_tier, pressure_index)

      const result = {
        pressure_index,
        pressure_tier,
        time_progress,
        virtual_consumption,
        weight_adjustment,
        thresholds_used: this.thresholds,
        timestamp: new Date().toISOString()
      }

      this._log('info', '活动压力分层计算完成', {
        user_id,
        campaign_id,
        pressure_index: pressure_index.toFixed(4),
        pressure_tier,
        time_progress: (time_progress * 100).toFixed(2) + '%',
        virtual_consumption: (virtual_consumption * 100).toFixed(2) + '%'
      })

      return result
    } catch (error) {
      this._log('error', '活动压力分层计算失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 计算时间进度
   *
   * 公式：(当前时间 - 开始时间) / (结束时间 - 开始时间)
   *
   * @param {Object} campaign - 活动配置
   * @returns {number} 时间进度（0-1，可能 > 1 表示已超期）
   * @private
   */
  _calculateTimeProgress(campaign) {
    if (!campaign) {
      this._log('warn', '活动配置为空，使用默认时间进度 0.5')
      return 0.5
    }

    const now = new Date()
    const start_time = campaign.start_time ? new Date(campaign.start_time) : null
    const end_time = campaign.end_time ? new Date(campaign.end_time) : null

    // 如果没有配置时间，返回默认进度
    if (!start_time || !end_time) {
      this._log('debug', '活动未配置时间范围，使用默认时间进度 0.5', {
        campaign_id: campaign.campaign_id,
        start_time: campaign.start_time,
        end_time: campaign.end_time
      })
      return 0.5
    }

    const total_duration = end_time.getTime() - start_time.getTime()
    const elapsed_duration = now.getTime() - start_time.getTime()

    // 防止除零
    if (total_duration <= 0) {
      this._log('warn', '活动时间范围无效，使用默认时间进度 0.5', {
        campaign_id: campaign.campaign_id,
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString()
      })
      return 0.5
    }

    // 活动未开始
    if (elapsed_duration < 0) {
      return 0
    }

    const progress = elapsed_duration / total_duration

    this._log('debug', '计算时间进度', {
      campaign_id: campaign.campaign_id,
      start_time: start_time.toISOString(),
      end_time: end_time.toISOString(),
      now: now.toISOString(),
      progress: progress.toFixed(4)
    })

    return progress
  }

  /**
   * 计算虚拟消耗率
   *
   * 公式：已发放奖品价值总和 / 活动预算总额
   *
   * 适用于所有 budget_mode：
   * - user: 已消耗预算 / 用户预算总额
   * - pool: 已消耗预算 / pool_budget_total
   * - hybrid: 综合计算
   * - none: 返回时间进度（无预算约束）
   *
   * @param {Object} context - 抽奖上下文
   * @param {Object} options - 额外选项
   * @returns {Promise<number>} 虚拟消耗率（0-1，可能 > 1 表示超支）
   * @private
   */
  async _calculateVirtualConsumption(context, options = {}) {
    const { campaign_id, campaign } = context
    const budget_mode = campaign?.budget_mode || 'none'
    const { transaction } = options

    // 无预算模式：返回时间进度作为虚拟消耗
    if (budget_mode === 'none') {
      const time_progress = this._calculateTimeProgress(campaign)
      this._log('debug', 'budget_mode=none，使用时间进度作为虚拟消耗', {
        campaign_id,
        virtual_consumption: time_progress
      })
      return time_progress
    }

    try {
      // 延迟加载模型避免循环依赖
      const { LotteryCampaign, LotteryDraw, LotteryPrize } = require('../../../../models')
      const { Op } = require('sequelize')

      // 获取活动配置
      const campaign_record = await LotteryCampaign.findByPk(campaign_id, {
        attributes: ['pool_budget_total', 'pool_budget_remaining', 'budget_mode'],
        transaction
      })

      if (!campaign_record) {
        this._log('warn', '活动不存在，使用默认虚拟消耗 0.5', { campaign_id })
        return 0.5
      }

      // 计算已发放奖品价值总和（使用 reward_tier 判断中奖状态）
      const prize_value_sum = await LotteryDraw.sum('prize_value_points', {
        where: {
          campaign_id,
          reward_tier: { [Op.in]: ['high', 'mid', 'low'] } // 有效中奖的档位
        },
        transaction
      })

      const total_consumed = Number(prize_value_sum) || 0

      // 根据 budget_mode 计算总预算
      let total_budget = 0

      if (budget_mode === 'pool' || budget_mode === 'hybrid') {
        // 使用活动池预算总额
        total_budget = Number(campaign_record.pool_budget_total) || 0
      }

      // 如果没有配置预算总额，尝试从奖品估算
      if (total_budget === 0) {
        // 估算：奖品价值总和 * 预期发放次数
        const prize_total = await LotteryPrize.sum('prize_value_points', {
          where: { campaign_id, status: 'active' },
          transaction
        })

        // 假设平均每个用户抽 10 次
        total_budget = (Number(prize_total) || 0) * 10
      }

      // 防止除零
      if (total_budget <= 0) {
        this._log('debug', '无法确定总预算，使用默认虚拟消耗 0.5', {
          campaign_id,
          total_consumed
        })
        return 0.5
      }

      const virtual_consumption = total_consumed / total_budget

      this._log('debug', '计算虚拟消耗率', {
        campaign_id,
        budget_mode,
        total_consumed,
        total_budget,
        virtual_consumption: virtual_consumption.toFixed(4)
      })

      return virtual_consumption
    } catch (error) {
      this._log('warn', '计算虚拟消耗失败，使用默认值 0.5', {
        campaign_id,
        error: error.message
      })
      return 0.5
    }
  }

  /**
   * 计算压力指数
   *
   * 公式：虚拟消耗 / 时间进度
   *
   * 解释：
   * - < 1：发放速度慢于时间进度，压力小
   * - = 1：发放速度与时间进度匹配，压力正常
   * - > 1：发放速度快于时间进度，压力大
   *
   * @param {number} virtual_consumption - 虚拟消耗率
   * @param {number} time_progress - 时间进度
   * @returns {number} 压力指数
   * @private
   */
  _calculatePressureIndex(virtual_consumption, time_progress) {
    // 防止除零
    if (time_progress <= 0) {
      // 活动未开始或刚开始，如果已有消耗则压力大
      return virtual_consumption > 0 ? 2.0 : 0.5
    }

    // 防止时间进度超过 1 时压力指数过小
    const adjusted_time_progress = Math.min(time_progress, 1.0)

    return virtual_consumption / adjusted_time_progress
  }

  /**
   * 确定压力分层
   *
   * @param {number} pressure_index - 压力指数
   * @returns {string} 压力分层（P0/P1/P2）
   * @private
   */
  _determinePressureTier(pressure_index) {
    if (pressure_index <= this.thresholds.p0_upper) {
      return PRESSURE_TIER.P0
    }
    if (pressure_index <= this.thresholds.p1_upper) {
      return PRESSURE_TIER.P1
    }
    return PRESSURE_TIER.P2
  }

  /**
   * 计算权重调整建议
   *
   * 根据压力分层给出档位权重调整建议：
   * - P0：可适当提高 high 档位权重（乘数 > 1）
   * - P1：保持标准权重（乘数 = 1）
   * - P2：降低 high 档位权重（乘数 < 1）
   *
   * @param {string} pressure_tier - 压力分层
   * @param {number} pressure_index - 压力指数
   * @returns {Object} 权重调整建议
   * @private
   */
  _calculateWeightAdjustment(pressure_tier, pressure_index) {
    // 基础乘数配置
    const adjustment = {
      high: 1.0,
      mid: 1.0,
      low: 1.0,
      fallback: 1.0
    }

    switch (pressure_tier) {
      case PRESSURE_TIER.P0:
        // 宽松状态：提高高档位权重
        adjustment.high = 1.2
        adjustment.mid = 1.1
        adjustment.low = 0.95
        adjustment.fallback = 0.9
        break

      case PRESSURE_TIER.P1:
        /*
         * 正常状态：保持标准权重
         * 默认值即可
         */
        break

      case PRESSURE_TIER.P2: {
        /*
         * 紧张状态：降低高档位权重
         * 压力越大，调整越激进
         */
        const severity = Math.min((pressure_index - 1.2) / 0.8, 1.0)
        adjustment.high = Math.max(0.5, 1.0 - severity * 0.5)
        adjustment.mid = Math.max(0.7, 1.0 - severity * 0.3)
        adjustment.low = Math.min(1.2, 1.0 + severity * 0.2)
        adjustment.fallback = Math.min(1.5, 1.0 + severity * 0.5)
        break
      }
    }

    return {
      multipliers: adjustment,
      pressure_tier,
      pressure_index,
      description: this._getAdjustmentDescription(pressure_tier)
    }
  }

  /**
   * 获取调整描述
   *
   * @param {string} pressure_tier - 压力分层
   * @returns {string} 描述
   * @private
   */
  _getAdjustmentDescription(pressure_tier) {
    const descriptions = {
      [PRESSURE_TIER.P0]: '活动进度宽松，可适当提高高价值奖品概率',
      [PRESSURE_TIER.P1]: '活动进度正常，使用标准档位权重',
      [PRESSURE_TIER.P2]: '活动进度紧张，需降低高价值奖品概率保护预算'
    }
    return descriptions[pressure_tier] || '未知状态'
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @private
   */
  _log(level, message, data = {}) {
    const log_data = {
      calculator: 'PressureTierCalculator',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[PressureTierCalculator] ${message}`, log_data)
    }
  }
}

// 导出常量
PressureTierCalculator.PRESSURE_TIER = PRESSURE_TIER
PressureTierCalculator.DEFAULT_THRESHOLDS = DEFAULT_PRESSURE_THRESHOLDS

module.exports = PressureTierCalculator
