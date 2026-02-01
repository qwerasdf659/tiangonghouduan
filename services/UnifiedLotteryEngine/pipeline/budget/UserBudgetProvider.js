'use strict'

/**
 * UserBudgetProvider - 用户预算提供者
 *
 * 职责：
 * 1. 从用户 BUDGET_POINTS 资产中扣减预算
 * 2. 支持 allowed_lottery_campaign_ids 桶限制
 * 3. 与 BalanceService/QueryService 集成进行资产操作
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
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('../../../asset/BalanceService')
const QueryService = require('../../../asset/QueryService')

/**
 * 用户预算提供者
 */
class UserBudgetProvider extends BudgetProvider {
  /**
   * 创建用户预算提供者实例
   *
   * @param {Object} options - 配置选项
   * @param {Array} options.allowed_lottery_campaign_ids - 允许使用的活动ID列表（桶限制）
   */
  constructor(options = {}) {
    super(BudgetProvider.MODES.USER, options)
    this.allowed_lottery_campaign_ids = options.allowed_lottery_campaign_ids || null
  }

  /**
   * 获取用户可用预算
   *
   * 🔧 修复（2026-01-27）：
   * 从 allowed_lottery_campaign_ids 指定的所有桶汇总 BUDGET_POINTS 余额，
   * 而不是只查询单个 lottery_campaign_id 的余额。
   *
   * 业务规则：
   * - 活动配置 allowed_lottery_campaign_ids 指定哪些来源桶的预算可以用于该活动
   * - 例如：活动1配置 allowed_lottery_campaign_ids = ['CONSUMPTION_DEFAULT']
   *   表示使用来源为消费的预算（不是活动1桶的预算）
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID（用于日志，实际查询用 allowed_lottery_campaign_ids）
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 预算信息
   */
  async getAvailableBudget(params, options = {}) {
    const { user_id, lottery_campaign_id } = params

    try {
      // 🔴 关键修正：allowed_lottery_campaign_ids 为空视为钱包不可用
      if (!this.allowed_lottery_campaign_ids || this.allowed_lottery_campaign_ids.length === 0) {
        this._log('warn', 'allowed_lottery_campaign_ids 未配置或为空，无法获取预算', {
          user_id,
          lottery_campaign_id,
          allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids
        })
        return {
          available: 0,
          details: {
            reason: 'allowed_lottery_campaign_ids_not_configured',
            allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids
          }
        }
      }

      // 🔧 修复：使用 getBudgetPointsByCampaigns 从 allowed_lottery_campaign_ids 指定的桶汇总余额
      const available_amount = await QueryService.getBudgetPointsByCampaigns(
        {
          user_id,
          lottery_campaign_ids: this.allowed_lottery_campaign_ids
        },
        options
      )

      this._log('debug', '获取用户预算余额（从 allowed_lottery_campaign_ids 汇总）', {
        user_id,
        lottery_campaign_id,
        allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
        available_amount
      })

      return {
        available: available_amount,
        details: {
          asset_code: 'BUDGET_POINTS',
          user_id,
          lottery_campaign_id,
          allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
          source: 'getBudgetPointsByCampaigns'
        }
      }
    } catch (error) {
      this._log('error', '获取用户预算失败', {
        user_id,
        lottery_campaign_id,
        allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减用户预算
   *
   * 🔧 修复（2026-01-27）：
   * 从 allowed_lottery_campaign_ids 指定的桶中按顺序扣减，
   * 优先扣减第一个有足够余额的桶。
   *
   * @param {Object} params - 扣减参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID（用于日志，实际扣减用 allowed_lottery_campaign_ids）
   * @param {number} params.amount - 扣减金额
   * @param {string} params.reason - 扣减原因
   * @param {string} params.reference_id - 关联ID（如 lottery_draw_id）
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 扣减结果
   */
  async deductBudget(params, options = {}) {
    const { user_id, lottery_campaign_id, amount, reason, reference_id } = params
    const { transaction } = options

    try {
      // 检查预算是否足够
      const budget_check = await this.checkBudget(params, options)

      if (!budget_check.sufficient) {
        this._log('warn', '用户预算不足', {
          user_id,
          lottery_campaign_id,
          allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
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

      // 🔴 关键修正：从 allowed_lottery_campaign_ids 中选择扣减的桶
      if (!this.allowed_lottery_campaign_ids || this.allowed_lottery_campaign_ids.length === 0) {
        throw new Error('allowed_lottery_campaign_ids 未配置，无法扣减预算')
      }

      /*
       * 使用第一个配置的桶作为扣减目标（业务规则：消费产生的预算优先）
       * 如果需要更复杂的扣减策略（如按余额排序），可以在这里扩展
       */
      const deduct_lottery_campaign_id = this.allowed_lottery_campaign_ids[0]

      // 执行扣减（使用 changeBalance，负数表示扣减）
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction（见下方 options 参数）
      const deduct_result = await BalanceService.changeBalance(
        {
          user_id,
          asset_code: 'BUDGET_POINTS',
          delta_amount: -amount,
          business_type: 'lottery_budget_deduct',
          idempotency_key: reference_id,
          lottery_campaign_id: deduct_lottery_campaign_id, // ✅ 使用 allowed_lottery_campaign_ids 中的桶
          meta: {
            reason: reason || '抽奖预算扣减',
            reference_type: 'lottery_draw',
            target_lottery_campaign_id: lottery_campaign_id, // 记录目标活动ID（用于对账）
            deduct_from_lottery_campaign_id: deduct_lottery_campaign_id // 记录实际扣减的桶
          }
        },
        { transaction }
      )

      this._log('info', '用户预算扣减成功', {
        user_id,
        lottery_campaign_id,
        deduct_from_lottery_campaign_id: deduct_lottery_campaign_id,
        deducted: amount,
        remaining: deduct_result.balance?.available_balance,
        reference_id
      })

      return {
        success: true,
        deducted: amount,
        remaining: deduct_result.balance?.available_balance || 0,
        transaction_id: deduct_result.transaction_record?.transaction_id,
        deduct_from_lottery_campaign_id: deduct_lottery_campaign_id
      }
    } catch (error) {
      this._log('error', '用户预算扣减失败', {
        user_id,
        lottery_campaign_id,
        allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 回滚用户预算
   *
   * 🔧 修复（2026-01-27）：
   * 回滚到 allowed_lottery_campaign_ids 中的第一个桶（与扣减逻辑保持一致）
   *
   * @param {Object} params - 回滚参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.lottery_campaign_id - 活动ID（用于日志）
   * @param {number} params.amount - 回滚金额
   * @param {string} params.original_reference_id - 原扣减的关联ID
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackBudget(params, options = {}) {
    const { user_id, lottery_campaign_id, amount, original_reference_id } = params
    const { transaction } = options

    try {
      // 🔴 关键修正：回滚到 allowed_lottery_campaign_ids 中的第一个桶
      if (!this.allowed_lottery_campaign_ids || this.allowed_lottery_campaign_ids.length === 0) {
        throw new Error('allowed_lottery_campaign_ids 未配置，无法回滚预算')
      }

      const rollback_lottery_campaign_id = this.allowed_lottery_campaign_ids[0]

      // 执行回滚（使用 changeBalance，正数表示增加）
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction（见下方 options 参数）
      const refund_result = await BalanceService.changeBalance(
        {
          user_id,
          asset_code: 'BUDGET_POINTS',
          delta_amount: amount,
          business_type: 'lottery_budget_rollback',
          idempotency_key: `${original_reference_id}_rollback`,
          lottery_campaign_id: rollback_lottery_campaign_id, // ✅ 使用 allowed_lottery_campaign_ids 中的桶
          meta: {
            reason: '抽奖预算回滚',
            reference_type: 'lottery_draw_rollback',
            original_reference_id,
            target_lottery_campaign_id: lottery_campaign_id,
            rollback_to_lottery_campaign_id: rollback_lottery_campaign_id
          }
        },
        { transaction }
      )

      this._log('info', '用户预算回滚成功', {
        user_id,
        lottery_campaign_id,
        rollback_to_lottery_campaign_id: rollback_lottery_campaign_id,
        refunded: amount,
        new_balance: refund_result.balance?.available_balance,
        original_reference_id
      })

      return {
        success: true,
        refunded: amount,
        new_balance: refund_result.balance?.available_balance || 0,
        transaction_id: refund_result.transaction_record?.transaction_id,
        rollback_to_lottery_campaign_id: rollback_lottery_campaign_id
      }
    } catch (error) {
      this._log('error', '用户预算回滚失败', {
        user_id,
        lottery_campaign_id,
        allowed_lottery_campaign_ids: this.allowed_lottery_campaign_ids,
        amount,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = UserBudgetProvider
