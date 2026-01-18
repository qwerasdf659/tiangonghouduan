'use strict'

/**
 * PoolBudgetProvider - 活动池预算提供者
 *
 * 职责：
 * 1. 从活动 pool_budget_remaining 中扣减预算
 * 2. 支持预留池（reserved_pool_remaining）和公共池（public_pool_remaining）
 * 3. 支持白名单用户访问预留池
 *
 * 适用场景：
 * - budget_mode = 'pool' 的活动
 * - 活动方提供预算池，用户免费参与
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget/PoolBudgetProvider
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BudgetProvider = require('./BudgetProvider')
const { LotteryCampaign } = require('../../../../models')

/**
 * 活动池预算提供者
 */
class PoolBudgetProvider extends BudgetProvider {
  /**
   * 创建活动池预算提供者实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.use_reserved_pool - 是否使用预留池（需要白名单）
   * @param {Array} options.whitelist_user_ids - 预留池白名单用户ID列表
   */
  constructor(options = {}) {
    super(BudgetProvider.MODES.POOL, options)
    this.use_reserved_pool = options.use_reserved_pool || false
    this.whitelist_user_ids = options.whitelist_user_ids || []
  }

  /**
   * 获取活动池可用预算
   *
   * @param {Object} params - 查询参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 预算信息
   */
  async getAvailableBudget(params, options = {}) {
    const { user_id, campaign_id } = params
    const { transaction } = options

    try {
      // 加载活动配置
      const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })

      if (!campaign) {
        this._log('warn', '活动不存在', { campaign_id })
        return {
          available: 0,
          details: { reason: 'campaign_not_found' }
        }
      }

      // 检查用户是否在白名单中（可访问预留池）
      const is_whitelist = this.whitelist_user_ids.includes(user_id)

      // 计算可用预算
      let available = 0
      const details = {
        campaign_id,
        user_id,
        is_whitelist
      }

      if (is_whitelist && this.use_reserved_pool) {
        // 白名单用户：可使用预留池 + 公共池
        const reserved = parseFloat(campaign.reserved_pool_remaining || 0)
        const public_pool = parseFloat(campaign.public_pool_remaining || 0)
        available = reserved + public_pool

        details.reserved_pool = reserved
        details.public_pool = public_pool
        details.pool_type = 'reserved+public'
      } else {
        /*
         * 普通用户：只能使用公共池
         * 如果没有分离公共池/预留池，使用 pool_budget_remaining
         */
        const public_pool = parseFloat(
          campaign.public_pool_remaining || campaign.pool_budget_remaining || 0
        )
        available = public_pool

        details.public_pool = public_pool
        details.pool_type = 'public'
      }

      this._log('debug', '获取活动池预算', {
        user_id,
        campaign_id,
        available,
        is_whitelist
      })

      return {
        available,
        details
      }
    } catch (error) {
      this._log('error', '获取活动池预算失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减活动池预算
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
    const { user_id, campaign_id, amount, reference_id } = params
    const { transaction } = options

    try {
      // 检查预算是否足够
      const budget_check = await this.checkBudget(params, options)

      if (!budget_check.sufficient) {
        this._log('warn', '活动池预算不足', {
          user_id,
          campaign_id,
          required: amount,
          available: budget_check.available
        })

        return {
          success: false,
          deducted: 0,
          remaining: budget_check.available,
          error: 'INSUFFICIENT_POOL_BUDGET',
          shortage: budget_check.shortage
        }
      }

      // 加载活动（带锁，防止并发）
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_id}`)
      }

      // 检查用户是否在白名单中
      const is_whitelist = this.whitelist_user_ids.includes(user_id)

      // 执行扣减
      let remaining_amount = amount
      const deduct_details = {
        from_reserved: 0,
        from_public: 0
      }

      if (is_whitelist && this.use_reserved_pool) {
        // 白名单用户：优先从预留池扣减
        const reserved = parseFloat(campaign.reserved_pool_remaining || 0)

        if (reserved >= remaining_amount) {
          // 预留池足够
          campaign.reserved_pool_remaining = reserved - remaining_amount
          deduct_details.from_reserved = remaining_amount
          remaining_amount = 0
        } else if (reserved > 0) {
          // 预留池不够，先扣完预留池
          campaign.reserved_pool_remaining = 0
          deduct_details.from_reserved = reserved
          remaining_amount -= reserved
        }
      }

      // 从公共池扣减剩余金额
      if (remaining_amount > 0) {
        const public_pool = parseFloat(
          campaign.public_pool_remaining || campaign.pool_budget_remaining || 0
        )

        if (public_pool >= remaining_amount) {
          if (campaign.public_pool_remaining !== undefined) {
            campaign.public_pool_remaining = public_pool - remaining_amount
          } else {
            campaign.pool_budget_remaining = public_pool - remaining_amount
          }
          deduct_details.from_public = remaining_amount
          remaining_amount = 0
        } else {
          // 公共池不够（理论上不应该发生，因为前面检查过）
          throw new Error('活动池预算不足（并发扣减冲突）')
        }
      }

      // 保存更新
      await campaign.save({ transaction })

      // 计算剩余预算
      const new_remaining =
        parseFloat(campaign.public_pool_remaining || campaign.pool_budget_remaining || 0) +
        parseFloat(campaign.reserved_pool_remaining || 0)

      this._log('info', '活动池预算扣减成功', {
        user_id,
        campaign_id,
        deducted: amount,
        remaining: new_remaining,
        reference_id,
        deduct_details
      })

      return {
        success: true,
        deducted: amount,
        remaining: new_remaining,
        details: deduct_details
      }
    } catch (error) {
      this._log('error', '活动池预算扣减失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 回滚活动池预算
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
    const { campaign_id, amount, original_reference_id } = params
    const { transaction } = options

    try {
      // 加载活动（带锁）
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_id}`)
      }

      // 回滚到公共池（简化处理，不区分预留池）
      if (campaign.public_pool_remaining !== undefined) {
        campaign.public_pool_remaining = parseFloat(campaign.public_pool_remaining || 0) + amount
      } else {
        campaign.pool_budget_remaining = parseFloat(campaign.pool_budget_remaining || 0) + amount
      }

      // 保存更新
      await campaign.save({ transaction })

      // 计算新余额
      const new_remaining =
        parseFloat(campaign.public_pool_remaining || campaign.pool_budget_remaining || 0) +
        parseFloat(campaign.reserved_pool_remaining || 0)

      this._log('info', '活动池预算回滚成功', {
        campaign_id,
        refunded: amount,
        new_remaining,
        original_reference_id
      })

      return {
        success: true,
        refunded: amount,
        new_balance: new_remaining
      }
    } catch (error) {
      this._log('error', '活动池预算回滚失败', {
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = PoolBudgetProvider
