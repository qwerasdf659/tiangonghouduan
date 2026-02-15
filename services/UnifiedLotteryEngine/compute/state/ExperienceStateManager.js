'use strict'

/**
 * ExperienceStateManager - 活动级体验状态管理器
 *
 * 核心职责：
 * 1. 管理用户在特定活动中的抽奖体验状态（empty_streak, recent_high_count 等）
 * 2. 提供状态读取接口供 TierPickStage 使用
 * 3. 提供状态更新接口供 SettleStage 调用
 *
 * 业务背景（来自方案文档 5.8 - 决策5）：
 * - 每个用户在每个活动有独立的体验状态记录
 * - 状态用于 Pity 系统、AntiEmpty、AntiHigh 机制
 * - 高频读写场景，需要优化查询性能
 *
 * 数据流向：
 * - 读取：TierPickStage → ExperienceStateManager.getState()
 * - 写入：SettleStage → ExperienceStateManager.updateState()
 *
 * 关联模型：LotteryUserExperienceState
 *
 * @module services/UnifiedLotteryEngine/compute/state/ExperienceStateManager
 * @author 抽奖模块策略重构 - Phase 15
 * @since 2026-01-20
 */

const { logger } = require('../../../../utils/logger')

/**
 * 活动级体验状态管理器
 */
class ExperienceStateManager {
  /**
   * 创建状态管理器实例
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.model - LotteryUserExperienceState 模型（可选，延迟加载）
   */
  constructor(options = {}) {
    this.model = options.model || null
    this.logger = logger
  }

  /**
   * 获取模型（延迟加载，避免循环依赖）
   *
   * @returns {Object} LotteryUserExperienceState 模型
   * @private
   */
  _getModel() {
    if (!this.model) {
      const { LotteryUserExperienceState } = require('../../../../models')
      this.model = LotteryUserExperienceState
    }
    return this.model
  }

  /**
   * 获取用户在活动中的体验状态
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务（可选）
   * @param {boolean} options.create_if_not_exists - 不存在时是否创建（默认 true）
   * @returns {Promise<Object>} 体验状态对象
   *
   * @example
   * 返回结果格式：
   * {
   *   user_id: 123,
   *   lottery_campaign_id: 456,
   *   empty_streak: 5,          // 连续空奖次数
   *   recent_high_count: 1,     // 近期高价值次数
   *   anti_high_cooldown: 0,    // AntiHigh 冷却次数
   *   max_empty_streak: 8,      // 历史最大连续空奖
   *   total_draw_count: 20,     // 活动总抽奖次数
   *   total_empty_count: 12,    // 活动总空奖次数
   *   pity_trigger_count: 1,    // Pity 触发次数
   *   last_draw_at: Date,       // 最后抽奖时间
   *   last_draw_tier: 'mid'     // 最后抽奖档位
   * }
   */
  async getState(params, options = {}) {
    const { user_id, lottery_campaign_id } = params
    const { transaction, create_if_not_exists = true } = options

    this._log('debug', '获取用户体验状态', { user_id, lottery_campaign_id })

    try {
      const Model = this._getModel()

      if (create_if_not_exists) {
        // 使用 findOrCreate 确保记录存在
        const state = await Model.findOrCreateState(user_id, lottery_campaign_id, { transaction })
        return this._formatState(state)
      } else {
        // 仅查询，不创建
        const state = await Model.findOne({
          where: { user_id, lottery_campaign_id },
          transaction
        })

        if (!state) {
          this._log('debug', '用户体验状态不存在', { user_id, lottery_campaign_id })
          return null
        }

        return this._formatState(state)
      }
    } catch (error) {
      this._log('error', '获取用户体验状态失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 更新用户体验状态（抽奖结算后调用）
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {string} params.draw_tier - 本次抽奖档位（high/mid/low/fallback/empty）
   * @param {boolean} params.is_empty - 是否为空奖
   * @param {boolean} params.pity_triggered - 是否触发了 Pity 系统
   * @param {boolean} params.anti_high_triggered - 是否触发了 AntiHigh（需要设置冷却）
   * @param {number} params.cooldown_draws - AntiHigh 冷却次数（0 表示无冷却）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务（必需）
   * @returns {Promise<Object>} 更新后的状态
   */
  async updateState(params, options = {}) {
    const {
      user_id,
      lottery_campaign_id,
      draw_tier,
      is_empty = false,
      pity_triggered = false,
      anti_high_triggered = false,
      cooldown_draws = 0
    } = params
    const { transaction } = options

    this._log('debug', '更新用户体验状态', {
      user_id,
      lottery_campaign_id,
      draw_tier,
      is_empty,
      pity_triggered,
      anti_high_triggered
    })

    try {
      const Model = this._getModel()

      // 获取或创建状态记录
      const state = await Model.findOrCreateState(user_id, lottery_campaign_id, { transaction })

      /**
       * 🔴 2026-02-15 修复：空奖判定逻辑
       * 只有显式传入 is_empty=true 或档位为 'fallback'/'empty' 才算空奖
       * low 档位的零值奖品是"参与奖"，不增加 empty_streak
       */
      const is_actually_empty = is_empty || draw_tier === 'fallback' || draw_tier === 'empty'

      if (is_actually_empty) {
        // 空奖：增加空奖连击计数
        await state.incrementEmptyStreak({ transaction })
      } else {
        // 非空奖（包括 low 档位零值参与奖）：重置空奖连击，更新其他状态
        await state.resetEmptyStreak(draw_tier, pity_triggered, { transaction })
      }

      // 处理 AntiHigh 冷却设置
      if (anti_high_triggered && cooldown_draws > 0) {
        /**
         * 🔴 2026-02-15 修复：AntiHigh 触发时重置 recent_high_count 为 0
         *
         * 修复根因：
         * - 原代码只设置冷却，不重置 recent_high_count
         * - 冷却期结束后 recent_high_count 仍然 >= 阈值
         * - 下一次 high 抽奖立即再次触发 AntiHigh，形成"永久封锁"
         *
         * 修复方案：
         * - AntiHigh 触发时同时重置 recent_high_count = 0
         * - 冷却期结束后从零开始统计，给用户公平的重新机会
         */
        await state.update(
          { anti_high_cooldown: cooldown_draws, recent_high_count: 0 },
          { transaction }
        )
      } else if (state.anti_high_cooldown > 0) {
        // 递减冷却计数，冷却期最后一次归零时同时重置 recent_high_count
        const new_cooldown = Math.max(0, state.anti_high_cooldown - 1)
        const cooldown_updates = { anti_high_cooldown: new_cooldown }
        if (new_cooldown === 0) {
          cooldown_updates.recent_high_count = 0 // 冷却结束，重置计数
        }
        await state.update(cooldown_updates, { transaction })
      }

      // 重新加载获取最新状态
      await state.reload({ transaction })

      this._log('info', '用户体验状态更新完成', {
        user_id,
        lottery_campaign_id,
        new_empty_streak: state.empty_streak,
        new_recent_high_count: state.recent_high_count,
        total_draw_count: state.total_draw_count
      })

      return this._formatState(state)
    } catch (error) {
      this._log('error', '更新用户体验状态失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 批量获取用户体验状态（用于连抽场景）
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {Array<number>} params.lottery_campaign_ids - 活动ID列表
   * @param {Object} options - 选项
   * @returns {Promise<Map<number, Object>>} 活动ID -> 状态 的映射
   */
  async getStatesForUser(params, options = {}) {
    const { user_id, lottery_campaign_ids } = params
    const { transaction } = options

    if (!lottery_campaign_ids || lottery_campaign_ids.length === 0) {
      return new Map()
    }

    this._log('debug', '批量获取用户体验状态', {
      user_id,
      campaign_count: lottery_campaign_ids.length
    })

    try {
      const Model = this._getModel()

      const states = await Model.findAll({
        where: {
          user_id,
          lottery_campaign_id: lottery_campaign_ids
        },
        transaction
      })

      const state_map = new Map()
      for (const state of states) {
        state_map.set(state.lottery_campaign_id, this._formatState(state))
      }

      return state_map
    } catch (error) {
      this._log('error', '批量获取用户体验状态失败', {
        user_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 重置用户在活动中的体验状态
   *
   * 用于活动重置或测试场景
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {Object} options - 选项
   * @returns {Promise<boolean>} 是否重置成功
   */
  async resetState(params, options = {}) {
    const { user_id, lottery_campaign_id } = params
    const { transaction } = options

    this._log('info', '重置用户体验状态', { user_id, lottery_campaign_id })

    try {
      const Model = this._getModel()

      const [affected_rows] = await Model.update(
        {
          empty_streak: 0,
          recent_high_count: 0,
          anti_high_cooldown: 0,
          /*
           * 保留统计数据不重置
           * total_draw_count, total_empty_count, max_empty_streak 保持不变
           */
          last_draw_at: new Date(),
          last_draw_tier: null
        },
        {
          where: { user_id, lottery_campaign_id },
          transaction
        }
      )

      return affected_rows > 0
    } catch (error) {
      this._log('error', '重置用户体验状态失败', {
        user_id,
        lottery_campaign_id,
        error: error.message
      })
      throw error
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
      state_id: state.state_id,
      user_id: state.user_id,
      lottery_campaign_id: state.lottery_campaign_id,
      empty_streak: state.empty_streak || 0,
      recent_high_count: state.recent_high_count || 0,
      anti_high_cooldown: state.anti_high_cooldown || 0,
      max_empty_streak: state.max_empty_streak || 0,
      total_draw_count: state.total_draw_count || 0,
      total_empty_count: state.total_empty_count || 0,
      pity_trigger_count: state.pity_trigger_count || 0,
      last_draw_at: state.last_draw_at,
      last_draw_tier: state.last_draw_tier,
      // 计算衍生字段
      empty_rate: state.total_draw_count > 0 ? state.total_empty_count / state.total_draw_count : 0
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
      manager: 'ExperienceStateManager',
      ...data
    }

    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](`[ExperienceStateManager] ${message}`, log_data)
    }
  }
}

module.exports = ExperienceStateManager
