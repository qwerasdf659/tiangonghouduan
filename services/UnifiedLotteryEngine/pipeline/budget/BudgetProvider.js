'use strict'

/**
 * BudgetProvider - 预算提供者抽象基类
 *
 * 职责：
 * 1. 定义统一的预算操作接口
 * 2. 支持三种预算模式：user（用户预算）、pool（活动池）、pool_quota（池+配额）
 * 3. 提供预算查询、扣减、回滚等操作
 *
 * 设计原则：
 * - 统一接口：所有预算模式使用相同的方法签名
 * - 事务支持：所有写操作支持外部事务
 * - 可审计：所有操作记录详细的审计信息
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget/BudgetProvider
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const { logger } = require('../../../../utils/logger')

/**
 * 预算模式常量
 */
const BUDGET_MODES = {
  USER: 'user', // 用户预算模式：从用户 BUDGET_POINTS 扣减
  POOL: 'pool', // 活动池模式：从活动 pool_budget_remaining 扣减
  POOL_QUOTA: 'pool_quota', // 池+配额模式：先扣配额，配额用完扣池
  NONE: 'none' // 无预算限制
}

/**
 * 预算提供者抽象基类
 */
class BudgetProvider {
  /**
   * 创建预算提供者实例
   *
   * @param {string} mode - 预算模式
   * @param {Object} options - 配置选项
   */
  constructor(mode, options = {}) {
    this.mode = mode
    this.options = options
  }

  /**
   * 获取可用预算
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {Object} _options - 额外选项（子类实现时使用）
   * @returns {Promise<Object>} 预算信息 { available: number, details: Object }
   * @abstract
   */
  async getAvailableBudget(params, _options = {}) {
    throw new Error('BudgetProvider.getAvailableBudget() must be implemented')
  }

  /**
   * 检查预算是否足够
   *
   * @param {Object} params - 检查参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {number} params.amount - 需要的预算金额
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 检查结果 { sufficient: boolean, available: number, shortage: number }
   */
  async checkBudget(params, options = {}) {
    const { amount } = params
    const budget_info = await this.getAvailableBudget(params, options)

    return {
      sufficient: budget_info.available >= amount,
      available: budget_info.available,
      required: amount,
      shortage: Math.max(0, amount - budget_info.available),
      details: budget_info.details
    }
  }

  /**
   * 扣减预算
   *
   * @param {Object} params - 扣减参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {number} params.amount - 扣减金额
   * @param {string} params.reason - 扣减原因
   * @param {string} params.reference_id - 关联ID（如 lottery_draw_id）
   * @param {Object} _options - 额外选项（子类实现时使用）
   * @param {Object} _options.transaction - 数据库事务
   * @returns {Promise<Object>} 扣减结果 { success: boolean, deducted: number, remaining: number }
   * @abstract
   */
  async deductBudget(params, _options = {}) {
    throw new Error('BudgetProvider.deductBudget() must be implemented')
  }

  /**
   * 回滚预算（用于事务失败时）
   *
   * @param {Object} params - 回滚参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {number} params.amount - 回滚金额
   * @param {string} params.original_reference_id - 原扣减的关联ID
   * @param {Object} _options - 额外选项（子类实现时使用）
   * @param {Object} _options.transaction - 数据库事务
   * @returns {Promise<Object>} 回滚结果 { success: boolean, refunded: number }
   * @abstract
   */
  async rollbackBudget(params, _options = {}) {
    throw new Error('BudgetProvider.rollbackBudget() must be implemented')
  }

  /**
   * 获取预算过滤后的可用奖品
   *
   * 根据用户预算过滤奖品列表，只返回用户预算足够支付的奖品
   *
   * @param {Object} params - 过滤参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID
   * @param {Array} params.prizes - 原始奖品列表
   * @param {Object} options - 额外选项
   * @returns {Promise<Array>} 过滤后的奖品列表
   */
  async filterPrizesByBudget(params, options = {}) {
    const { prizes } = params

    // 无预算限制模式，返回所有奖品
    if (this.mode === BUDGET_MODES.NONE) {
      return prizes
    }

    // 获取可用预算
    const budget_info = await this.getAvailableBudget(params, options)
    const available = budget_info.available

    // 过滤奖品：只保留预算足够的奖品
    const filtered = prizes.filter(prize => {
      const prize_cost = prize.prize_value_points || 0
      return prize_cost <= available
    })

    this._log('debug', '预算过滤奖品', {
      user_id: params.user_id,
      lottery_campaign_id: params.lottery_campaign_id,
      available_budget: available,
      original_count: prizes.length,
      filtered_count: filtered.length
    })

    return filtered
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别（error/warn/info/debug）
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @returns {void}
   * @protected
   */
  _log(level, message, data = {}) {
    const log_data = {
      budget_mode: this.mode,
      ...data
    }

    logger[level](`[BudgetProvider:${this.mode}] ${message}`, log_data)
  }

  /**
   * 获取提供者信息
   *
   * @returns {Object} 提供者信息
   */
  getInfo() {
    return {
      mode: this.mode,
      options: this.options
    }
  }
}

// 导出预算模式常量
BudgetProvider.MODES = BUDGET_MODES

module.exports = BudgetProvider
