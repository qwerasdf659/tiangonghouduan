'use strict'

/**
 * PoolQuotaBudgetProvider - 池+配额预算提供者
 *
 * 职责：
 * 1. 管理用户在活动中的配额（lottery_campaign_user_quota）
 * 2. 双层扣减：先扣用户配额，配额用完再扣活动池
 * 3. 支持配额按需初始化和预分配两种模式
 *
 * 适用场景：
 * - budget_mode = 'pool_quota' 的活动
 * - 活动方给用户分配固定配额，超出配额部分从活动池扣减
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget/PoolQuotaBudgetProvider
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BudgetProvider = require('./BudgetProvider')
const { LotteryCampaign, LotteryCampaignUserQuota, LotteryCampaignQuotaGrant } = require('../../../../models')

/**
 * 配额初始化模式
 */
const QUOTA_INIT_MODES = {
  ON_DEMAND: 'on_demand',       // 按需初始化：用户首次参与时创建配额
  PRE_ALLOCATED: 'pre_allocated' // 预分配：提前为用户分配配额
}

/**
 * 池+配额预算提供者
 */
class PoolQuotaBudgetProvider extends BudgetProvider {
  /**
   * 创建池+配额预算提供者实例
   *
   * @param {Object} options - 配置选项
   * @param {string} options.quota_init_mode - 配额初始化模式（on_demand/pre_allocated）
   * @param {number} options.default_quota - 默认配额金额
   */
  constructor(options = {}) {
    super(BudgetProvider.MODES.POOL_QUOTA, options)
    this.quota_init_mode = options.quota_init_mode || QUOTA_INIT_MODES.ON_DEMAND
    this.default_quota = options.default_quota || 0
  }

  /**
   * 获取可用预算（配额 + 活动池）
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
      // 1. 获取用户配额
      const quota = await this._getOrCreateQuota(user_id, campaign_id, { transaction })

      // 2. 获取活动池预算
      const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })

      if (!campaign) {
        this._log('warn', '活动不存在', { campaign_id })
        return {
          available: 0,
          details: { reason: 'campaign_not_found' }
        }
      }

      // 3. 计算总可用预算
      const quota_remaining = quota ? parseFloat(quota.quota_remaining || 0) : 0
      const pool_remaining = parseFloat(campaign.pool_budget_remaining || 0)
      const total_available = quota_remaining + pool_remaining

      this._log('debug', '获取池+配额预算', {
        user_id,
        campaign_id,
        quota_remaining,
        pool_remaining,
        total_available
      })

      return {
        available: total_available,
        details: {
          quota_remaining: quota_remaining,
          pool_remaining: pool_remaining,
          quota_total: quota ? parseFloat(quota.quota_total || 0) : 0,
          quota_used: quota ? parseFloat(quota.quota_used || 0) : 0,
          quota_status: quota ? quota.status : 'not_initialized'
        }
      }
    } catch (error) {
      this._log('error', '获取池+配额预算失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 扣减预算（先配额后池）
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
        this._log('warn', '池+配额预算不足', {
          user_id,
          campaign_id,
          required: amount,
          available: budget_check.available
        })

        return {
          success: false,
          deducted: 0,
          remaining: budget_check.available,
          error: 'INSUFFICIENT_POOL_QUOTA_BUDGET',
          shortage: budget_check.shortage
        }
      }

      // 获取用户配额（带锁）
      const quota = await this._getOrCreateQuota(user_id, campaign_id, {
        transaction,
        lock: true
      })

      // 获取活动（带锁）
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_id}`)
      }

      // 执行双层扣减
      let remaining_amount = amount
      const deduct_details = {
        from_quota: 0,
        from_pool: 0
      }

      // 1. 先从配额扣减
      if (quota) {
        const quota_remaining = parseFloat(quota.quota_remaining || 0)

        if (quota_remaining >= remaining_amount) {
          // 配额足够
          quota.quota_used = parseFloat(quota.quota_used || 0) + remaining_amount
          quota.quota_remaining = quota_remaining - remaining_amount
          quota.last_used_at = new Date()

          // 检查是否耗尽
          if (quota.quota_remaining <= 0) {
            quota.status = 'exhausted'
          }

          deduct_details.from_quota = remaining_amount
          remaining_amount = 0

          await quota.save({ transaction })
        } else if (quota_remaining > 0) {
          // 配额不够，先扣完配额
          quota.quota_used = parseFloat(quota.quota_used || 0) + quota_remaining
          quota.quota_remaining = 0
          quota.status = 'exhausted'
          quota.last_used_at = new Date()

          deduct_details.from_quota = quota_remaining
          remaining_amount -= quota_remaining

          await quota.save({ transaction })
        }
      }

      // 2. 从活动池扣减剩余金额
      if (remaining_amount > 0) {
        const pool_remaining = parseFloat(campaign.pool_budget_remaining || 0)

        if (pool_remaining >= remaining_amount) {
          campaign.pool_budget_remaining = pool_remaining - remaining_amount
          deduct_details.from_pool = remaining_amount
          remaining_amount = 0

          await campaign.save({ transaction })
        } else {
          // 活动池不够（理论上不应该发生）
          throw new Error('活动池预算不足（并发扣减冲突）')
        }
      }

      // 计算剩余预算
      const new_quota_remaining = quota ? parseFloat(quota.quota_remaining || 0) : 0
      const new_pool_remaining = parseFloat(campaign.pool_budget_remaining || 0)
      const new_total_remaining = new_quota_remaining + new_pool_remaining

      this._log('info', '池+配额预算扣减成功', {
        user_id,
        campaign_id,
        deducted: amount,
        remaining: new_total_remaining,
        reference_id,
        deduct_details
      })

      return {
        success: true,
        deducted: amount,
        remaining: new_total_remaining,
        details: {
          ...deduct_details,
          quota_remaining: new_quota_remaining,
          pool_remaining: new_pool_remaining
        }
      }
    } catch (error) {
      this._log('error', '池+配额预算扣减失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 回滚预算
   *
   * @param {Object} params - 回滚参数
   * @param {number} params.user_id - 用户ID
   * @param {number} params.campaign_id - 活动ID
   * @param {number} params.amount - 回滚金额
   * @param {Object} params.original_details - 原扣减详情（包含 from_quota 和 from_pool）
   * @param {string} params.original_reference_id - 原扣减的关联ID
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 回滚结果
   */
  async rollbackBudget(params, options = {}) {
    const { user_id, campaign_id, amount, original_details, original_reference_id } = params
    const { transaction } = options

    try {
      // 获取用户配额（带锁）
      const quota = await LotteryCampaignUserQuota.findOne({
        where: { user_id, campaign_id },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      // 获取活动（带锁）
      const campaign = await LotteryCampaign.findByPk(campaign_id, {
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      if (!campaign) {
        throw new Error(`活动不存在: ${campaign_id}`)
      }

      const refund_details = {
        to_quota: 0,
        to_pool: 0
      }

      // 如果有原扣减详情，按原路径回滚
      if (original_details) {
        // 1. 回滚到配额
        if (original_details.from_quota > 0 && quota) {
          quota.quota_used = Math.max(0, parseFloat(quota.quota_used || 0) - original_details.from_quota)
          quota.quota_remaining = parseFloat(quota.quota_remaining || 0) + original_details.from_quota

          // 恢复状态
          if (quota.status === 'exhausted' && quota.quota_remaining > 0) {
            quota.status = 'active'
          }

          refund_details.to_quota = original_details.from_quota
          await quota.save({ transaction })
        }

        // 2. 回滚到活动池
        if (original_details.from_pool > 0) {
          campaign.pool_budget_remaining = parseFloat(campaign.pool_budget_remaining || 0) + original_details.from_pool
          refund_details.to_pool = original_details.from_pool
          await campaign.save({ transaction })
        }
      } else {
        // 没有原详情，全部回滚到活动池（简化处理）
        campaign.pool_budget_remaining = parseFloat(campaign.pool_budget_remaining || 0) + amount
        refund_details.to_pool = amount
        await campaign.save({ transaction })
      }

      // 计算新余额
      const new_quota_remaining = quota ? parseFloat(quota.quota_remaining || 0) : 0
      const new_pool_remaining = parseFloat(campaign.pool_budget_remaining || 0)
      const new_total = new_quota_remaining + new_pool_remaining

      this._log('info', '池+配额预算回滚成功', {
        user_id,
        campaign_id,
        refunded: amount,
        new_total,
        original_reference_id,
        refund_details
      })

      return {
        success: true,
        refunded: amount,
        new_balance: new_total,
        details: refund_details
      }
    } catch (error) {
      this._log('error', '池+配额预算回滚失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取或创建用户配额
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @param {Object} options - 额外选项
   * @param {Object} options.transaction - 数据库事务
   * @param {boolean} options.lock - 是否加锁
   * @returns {Promise<Object>} 配额记录
   * @private
   */
  async _getOrCreateQuota(user_id, campaign_id, options = {}) {
    const { transaction, lock } = options

    // 查找现有配额
    let quota = await LotteryCampaignUserQuota.findOne({
      where: { user_id, campaign_id },
      transaction,
      lock: lock && transaction ? transaction.LOCK.UPDATE : false
    })

    // 如果不存在且是按需初始化模式，创建新配额
    if (!quota && this.quota_init_mode === QUOTA_INIT_MODES.ON_DEMAND) {
      // 获取活动的默认配额
      const campaign = await LotteryCampaign.findByPk(campaign_id, { transaction })
      const default_quota = campaign ? parseFloat(campaign.default_quota || this.default_quota) : this.default_quota

      if (default_quota > 0) {
        quota = await LotteryCampaignUserQuota.create({
          user_id: user_id,
          campaign_id: campaign_id,
          quota_total: default_quota,
          quota_used: 0,
          quota_remaining: default_quota,
          status: 'active'
        }, { transaction })

        // 记录配额发放
        await LotteryCampaignQuotaGrant.create({
          quota_id: quota.quota_id,
          user_id: user_id,
          campaign_id: campaign_id,
          grant_amount: default_quota,
          grant_source: 'initial',
          grant_reason: '首次参与自动初始化配额',
          balance_after: default_quota
        }, { transaction })

        this._log('info', '创建用户配额', {
          user_id,
          campaign_id,
          quota_total: default_quota
        })
      }
    }

    return quota
  }

  /**
   * 手动为用户分配配额
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @param {number} amount - 配额金额
   * @param {Object} options - 额外选项
   * @param {string} options.source - 配额来源（initial/topup/refund/compensation/admin）
   * @param {string} options.reason - 分配原因
   * @param {number} options.granted_by - 操作人ID
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 分配结果
   */
  async grantQuota(user_id, campaign_id, amount, options = {}) {
    const { source = 'admin', reason, granted_by, transaction } = options

    try {
      // 获取或创建配额记录
      let quota = await LotteryCampaignUserQuota.findOne({
        where: { user_id, campaign_id },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : false
      })

      if (!quota) {
        quota = await LotteryCampaignUserQuota.create({
          user_id: user_id,
          campaign_id: campaign_id,
          quota_total: amount,
          quota_used: 0,
          quota_remaining: amount,
          status: 'active'
        }, { transaction })
      } else {
        // 增加配额
        quota.quota_total = parseFloat(quota.quota_total || 0) + amount
        quota.quota_remaining = parseFloat(quota.quota_remaining || 0) + amount

        // 恢复状态
        if (quota.status === 'exhausted' || quota.status === 'expired') {
          quota.status = 'active'
        }

        await quota.save({ transaction })
      }

      // 记录配额发放
      await LotteryCampaignQuotaGrant.create({
        quota_id: quota.quota_id,
        user_id: user_id,
        campaign_id: campaign_id,
        grant_amount: amount,
        grant_source: source,
        grant_reason: reason,
        granted_by: granted_by,
        balance_after: quota.quota_remaining
      }, { transaction })

      this._log('info', '分配用户配额', {
        user_id,
        campaign_id,
        amount,
        source,
        new_total: quota.quota_total,
        new_remaining: quota.quota_remaining
      })

      return {
        success: true,
        quota_id: quota.quota_id,
        quota_total: quota.quota_total,
        quota_remaining: quota.quota_remaining
      }
    } catch (error) {
      this._log('error', '分配用户配额失败', {
        user_id,
        campaign_id,
        amount,
        error: error.message
      })
      throw error
    }
  }
}

// 导出配额初始化模式常量
PoolQuotaBudgetProvider.QUOTA_INIT_MODES = QUOTA_INIT_MODES

module.exports = PoolQuotaBudgetProvider

