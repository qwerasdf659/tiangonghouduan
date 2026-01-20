'use strict'

/**
 * GlobalStateManager - 全局状态管理器
 *
 * 核心职责：
 * 1. 管理用户跨活动的全局抽奖统计（用于运气债务机制）
 * 2. 提供全局状态读取接口供 LuckDebtCalculator 使用
 * 3. 提供全局状态更新接口供 SettleStage 调用
 *
 * 业务背景（来自方案文档 5.6 + 决策6）：
 * - 跨活动统计用户历史空奖率
 * - 基于历史空奖率计算运气债务（Luck Debt）
 * - 对"欠运"用户提供概率补偿
 *
 * 数据流向：
 * - 读取：BuildPrizePoolStage / TierPickStage → GlobalStateManager.getState()
 * - 写入：SettleStage → GlobalStateManager.updateState()
 *
 * 关联模型：LotteryUserGlobalState
 *
 * @module services/UnifiedLotteryEngine/compute/state/GlobalStateManager
 * @author 抽奖模块策略重构 - Phase 15
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * 全局状态管理器
 */
class GlobalStateManager {
  /**
   * 创建状态管理器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.model - LotteryUserGlobalState 模型（可选，延迟加载）
   */
  constructor(options = {}) {
    this.model = options.model || null
    this.logger = logger
  }

  /**
   * 获取模型（延迟加载，避免循环依赖）
   *
   * @returns {Object} LotteryUserGlobalState 模型
   * @private
   */
  _getModel() {
    if (!this.model) {
      const { LotteryUserGlobalState } = require('../../../../models')
      this.model = LotteryUserGlobalState
    }
    return this.model
  }

  /**
   * 获取用户的全局状态
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务（可选）
   * @param {boolean} options.create_if_not_exists - 不存在时是否创建（默认 true）
   * @returns {Promise<Object>} 全局状态对象
   *
   * @example
   * 返回结果格式：
   * {
   *   user_id: 123,
   *   global_draw_count: 100,       // 全局抽奖次数
   *   global_empty_count: 35,       // 全局空奖次数
   *   historical_empty_rate: 0.35,  // 历史空奖率
   *   luck_debt_level: 'low',       // 运气债务等级
   *   luck_debt_multiplier: 1.05,   // 运气债务乘数
   *   global_high_count: 5,         // 全局高价值次数
   *   global_mid_count: 20,         // 全局中价值次数
   *   global_low_count: 40,         // 全局低价值次数
   *   participated_campaigns: 3,    // 参与活动数量
   *   last_draw_at: Date,           // 最后抽奖时间
   *   last_campaign_id: 456         // 最后参与活动ID
   * }
   */
  async getState(params, options = {}) {
    const { user_id } = params
    const { transaction, create_if_not_exists = true } = options

    this._log('debug', '获取用户全局状态', { user_id })

    try {
      const Model = this._getModel()

      if (create_if_not_exists) {
        const state = await Model.findOrCreateState(user_id, { transaction })
        return this._formatState(state)
      } else {
        const state = await Model.findOne({
          where: { user_id },
          transaction
        })

        if (!state) {
          this._log('debug', '用户全局状态不存在', { user_id })
          return null
        }

        return this._formatState(state)
      }
    } catch (error) {
      this._log('error', '获取用户全局状态失败', {
        user_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 更新用户全局状态（抽奖结算后调用）
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {string} params.draw_tier - 本次抽奖档位
   * @param {boolean} params.is_first_draw_in_campaign - 是否是该活动的首次抽奖
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务（必需）
   * @returns {Promise<Object>} 更新后的状态
   */
  async updateState(params, options = {}) {
    const { user_id, campaign_id, draw_tier, is_first_draw_in_campaign = false } = params
    const { transaction } = options

    this._log('debug', '更新用户全局状态', {
      user_id,
      campaign_id,
      draw_tier,
      is_first_draw_in_campaign
    })

    try {
      const Model = this._getModel()

      // 获取或创建状态记录
      const state = await Model.findOrCreateState(user_id, { transaction })

      // 记录本次抽奖结果
      await state.recordDraw(draw_tier, campaign_id, { transaction })

      // 如果是该活动的首次抽奖，增加参与活动数量
      if (is_first_draw_in_campaign) {
        await state.incrementParticipatedCampaigns({ transaction })
      }

      // 重新加载获取最新状态
      await state.reload({ transaction })

      this._log('info', '用户全局状态更新完成', {
        user_id,
        global_draw_count: state.global_draw_count,
        historical_empty_rate: state.historical_empty_rate,
        luck_debt_level: state.luck_debt_level
      })

      return this._formatState(state)
    } catch (error) {
      this._log('error', '更新用户全局状态失败', {
        user_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取用户的运气债务信息
   *
   * 便捷方法，仅返回运气债务相关字段
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 运气债务信息
   */
  async getLuckDebtInfo(params, options = {}) {
    const state = await this.getState(params, options)

    if (!state) {
      return {
        user_id: params.user_id,
        has_debt: false,
        debt_level: 'none',
        multiplier: 1.0,
        historical_empty_rate: 0,
        sample_sufficient: false
      }
    }

    return {
      user_id: state.user_id,
      has_debt: state.luck_debt_level !== 'none',
      debt_level: state.luck_debt_level,
      multiplier: state.luck_debt_multiplier,
      historical_empty_rate: state.historical_empty_rate,
      global_draw_count: state.global_draw_count,
      global_empty_count: state.global_empty_count,
      sample_sufficient: state.global_draw_count >= 10
    }
  }

  /**
   * 批量获取用户全局状态
   *
   * @param {Object} params - 参数
   * @param {Array<number>} params.user_ids - 用户ID列表
   * @param {Object} options - 选项
   * @returns {Promise<Map<number, Object>>} 用户ID -> 状态 的映射
   */
  async getStatesForUsers(params, options = {}) {
    const { user_ids } = params
    const { transaction } = options

    if (!user_ids || user_ids.length === 0) {
      return new Map()
    }

    this._log('debug', '批量获取用户全局状态', { user_count: user_ids.length })

    try {
      const Model = this._getModel()

      const states = await Model.findAll({
        where: { user_id: user_ids },
        transaction
      })

      const state_map = new Map()
      for (const state of states) {
        state_map.set(state.user_id, this._formatState(state))
      }

      return state_map
    } catch (error) {
      this._log('error', '批量获取用户全局状态失败', {
        error: error.message
      })
      throw error
    }
  }

  /**
   * 检查用户是否是某活动的首次参与
   *
   * 用于判断是否需要增加 participated_campaigns 计数
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<boolean>} 是否是首次参与
   */
  async isFirstParticipation(params, options = {}) {
    const { user_id, campaign_id } = params
    const { transaction } = options

    try {
      // 延迟加载 LotteryUserExperienceState 模型
      const { LotteryUserExperienceState } = require('../../../../models')

      const experience_state = await LotteryUserExperienceState.findOne({
        where: { user_id, campaign_id },
        transaction
      })

      // 不存在记录或抽奖次数为 0 表示首次参与
      return !experience_state || experience_state.total_draw_count === 0
    } catch (error) {
      this._log('warn', '检查首次参与失败，默认返回 false', {
        user_id,
        campaign_id,
        error: error.message
      })
      return false
    }
  }

  /**
   * 格式化状态对象
   *
   * @param {Object} state - 模型实例
   * @returns {Object} 格式化后的状态对象
   * @private
   */
  _formatState(state) {
    if (!state) return null

    return {
      global_state_id: state.global_state_id,
      user_id: state.user_id,
      global_draw_count: state.global_draw_count || 0,
      global_empty_count: state.global_empty_count || 0,
      historical_empty_rate: parseFloat(state.historical_empty_rate) || 0,
      luck_debt_level: state.luck_debt_level || 'none',
      luck_debt_multiplier: parseFloat(state.luck_debt_multiplier) || 1.0,
      global_high_count: state.global_high_count || 0,
      global_mid_count: state.global_mid_count || 0,
      global_low_count: state.global_low_count || 0,
      participated_campaigns: state.participated_campaigns || 0,
      last_draw_at: state.last_draw_at,
      last_campaign_id: state.last_campaign_id
    }
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
      manager: 'GlobalStateManager',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[GlobalStateManager] ${message}`, log_data)
    }
  }
}

module.exports = GlobalStateManager
