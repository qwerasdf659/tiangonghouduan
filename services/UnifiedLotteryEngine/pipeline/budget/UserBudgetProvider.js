'use strict'

/**
 * UserBudgetProvider - 用户预算提供者
 *
 * 职责：
 * 1. 从用户 BUDGET_POINTS 资产中扣减预算
 * 2. 支持 allowed_campaign_ids 桶限制
 * 3. 与 AssetService 集成进行资产操作
 *
 * 适用场景：
 * - budget_mode = 'user' 的活动
 * - 用户使用自己的预算积分参与抽奖
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget/UserBudgetProvider
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BudgetProvider = require('./BudgetProvider')
const AssetService = require('../../../AssetService')

/**
 * 用户预算提供者
 */
class UserBudgetProvider extends BudgetProvider {
  /**
   * 创建用户预算提供者实例
   *
   * @param {Object} options - 配置选项
   * @param {Array} options.allowed_campaign_ids - 允许使用的活动ID列表（桶限制）
   */
  constructor(options = {}) {
    super(BudgetProvider.MODES.USER, options)
    this.allowed_campaign_ids = options.allowed_campaign_ids || null
  }

  /**
   * 获取用户可用预算
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 预算信息
   */
  async getAvailableBudget(params, options = {}) {
    const { user_id, campaign_id } = params

    try {
      // 检查活动是否在允许列表中
      if (this.allowed_campaign_ids && !this.allowed_campaign_ids.includes(campaign_id)) {
        this._log('warn', '活动不在允许列表中', {
          user_id,
          campaign_id,
          allowed_campaign_ids: this.allowed_campaign_ids
        })
        return {
          available: 0,
          details: {
            reason: 'campaign_not_allowed',
            allowed_campaign_ids: this.allowed_campaign_ids
          }
        }
      }

      // 获取用户 BUDGET_POINTS 余额
      const balance = await AssetService.getBalance(user_id, 'BUDGET_POINTS', options)

      this._log('debug', '获取用户预算余额', {
        user_id,
        campaign_id,
        balance: balance
      })

      return {
        available: balance || 0,
        details: {
          asset_code: 'BUDGET_POINTS',
          user_id: user_id,
          campaign_id: campaign_id
        }
      }
    } catch (error) {
      this._log('error', '获取用户预算失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减用户预算
   *
   * @param {Object} params - 扣减参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.amount - 扣减金额
   * @param {string} params.reason - 扣减原因
   * @param {string} params.reference_id - 关联ID（如 draw_id）
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 扣减结果
   */
  async deductBudget(params, options = {}) {
    const { user_id, campaign_id, amount, reason, reference_id } = params
    const { transaction } = options

    try {
      // 检查预算是否足够
      const budget_check = await this.checkBudget(params, options)

      if (!budget_check.sufficient) {
        this._log('warn', '用户预算不足', {
          user_id,
          campaign_id,
          required: amount,
          available: budget_check.available
        })

        return {
          success: false,
          deducted: 0,
          remaining: budget_check.available,
          error: 'INSUFFICIENT_BUDGET',
          shortage: budget_check.shortage
        }
      }

      // 执行扣减
      const deduct_result = await AssetService.deductAsset(user_id, 'BUDGET_POINTS', amount, {
        reason: reason || '抽奖预算扣减',
        reference_type: 'lottery_draw',
        reference_id: reference_id,
        campaign_id: campaign_id,
        transaction: transaction
      })

      // 获取扣减后余额
      const new_balance = await AssetService.getBalance(user_id, 'BUDGET_POINTS', { transaction })

      this._log('info', '用户预算扣减成功', {
        user_id,
        campaign_id,
        deducted: amount,
        remaining: new_balance,
        reference_id: reference_id
      })

      return {
        success: true,
        deducted: amount,
        remaining: new_balance,
        transaction_id: deduct_result.transaction_id
      }
    } catch (error) {
      this._log('error', '用户预算扣减失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 回滚用户预算
   *
   * @param {Object} params - 回滚参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.amount - 回滚金额
   * @param {string} params.original_reference_id - 原扣减的关联ID
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackBudget(params, options = {}) {
    const { user_id, campaign_id, amount, original_reference_id } = params
    const { transaction } = options

    try {
      // 执行回滚（增加资产）
      const refund_result = await AssetService.addAsset(user_id, 'BUDGET_POINTS', amount, {
        reason: '抽奖预算回滚',
        reference_type: 'lottery_draw_rollback',
        reference_id: original_reference_id,
        campaign_id: campaign_id,
        transaction: transaction
      })

      // 获取回滚后余额
      const new_balance = await AssetService.getBalance(user_id, 'BUDGET_POINTS', { transaction })

      this._log('info', '用户预算回滚成功', {
        user_id,
        campaign_id,
        refunded: amount,
        new_balance: new_balance,
        original_reference_id: original_reference_id
      })

      return {
        success: true,
        refunded: amount,
        new_balance: new_balance,
        transaction_id: refund_result.transaction_id
      }
    } catch (error) {
      this._log('error', '用户预算回滚失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = UserBudgetProvider

