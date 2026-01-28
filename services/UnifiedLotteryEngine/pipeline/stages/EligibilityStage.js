'use strict'

/**
 * EligibilityStage - 抽奖资格检查 Stage
 *
 * 职责：
 * 1. 检查用户是否有足够的抽奖配额（次数限制）
 * 2. 检查用户今日抽奖次数是否已达上限
 * 3. 检查用户是否被禁止抽奖
 * 4. 检查活动级别的用户配额限制
 *
 * 输出到上下文：
 * - user_quota: 用户配额信息
 * - daily_draws_count: 今日已抽奖次数
 * - remaining_draws: 剩余抽奖次数
 * - is_eligible: 是否有资格抽奖
 *
 * 设计原则：
 * - 读操作Stage，不执行任何写操作
 * - 快速失败，资格不满足时立即返回
 * - 提供详细的不满足原因
 *
 * 🔄 2026-01-19 架构迁移说明：
 * - 配额检查已迁移到 LotteryQuotaService（单一真相源）
 * - 不再直接查询 LotteryDraw.count，而是使用 LotteryQuotaService.checkQuotaSufficient
 * - 支持四维度配额控制：全局/活动/角色/用户
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/EligibilityStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 - 集成 LotteryQuotaService 作为配额真相源
 */

const BaseStage = require('./BaseStage')
const { LotteryCampaignUserQuota } = require('../../../../models')
const LotteryQuotaService = require('../../../lottery/LotteryQuotaService')

/**
 * 抽奖资格检查 Stage
 */
class EligibilityStage extends BaseStage {
  /**
   * 创建 Stage 实例
   */
  constructor() {
    super('EligibilityStage', {
      is_writer: false,
      required: true
    })
  }

  /**
   * 执行资格检查
   *
   * @param {Object} context - 执行上下文
   * @param {number} context.user_id - 用户ID
   * @param {number} context.campaign_id - 活动ID
   * @param {Object} context.stage_results - 前置Stage的执行结果
   * @returns {Promise<Object>} Stage 执行结果
   */
  async execute(context) {
    const { user_id, campaign_id, draw_count = 1 } = context

    this.log('info', '开始检查抽奖资格', { user_id, campaign_id, draw_count })

    try {
      // 获取活动配置（从 LoadCampaignStage 的结果中）
      const campaign_data = this.getContextData(context, 'LoadCampaignStage.data')
      if (!campaign_data || !campaign_data.campaign) {
        throw this.createError(
          '缺少活动配置数据，请确保 LoadCampaignStage 已执行',
          'MISSING_CAMPAIGN_DATA',
          true
        )
      }

      const campaign = campaign_data.campaign

      // 1. 检查用户是否被禁止抽奖（黑名单检查）
      const ban_check = await this._checkUserBan(user_id, campaign_id)
      if (!ban_check.is_eligible) {
        return this.failure(ban_check.reason, 'USER_BANNED', { user_id, campaign_id })
      }

      // 2. 获取用户的活动配额（可选，用于特殊配额控制）
      const user_quota = await this._getUserQuota(user_id, campaign_id)

      /*
       * 3. 使用 LotteryQuotaService 检查配额（单一真相源）
       *
       * 🔄 2026-01-19 架构迁移：
       * - 不再直接查询 LotteryDraw.count
       * - 使用 LotteryQuotaService.checkQuotaSufficient 作为配额真相源
       * - 支持四维度配额控制：全局/活动/角色/用户
       * - 支持连抽场景的配额检查
       */
      const quota_check = await LotteryQuotaService.checkQuotaSufficient({
        user_id,
        campaign_id,
        draw_count
      })

      // 4. 检查活动级别的配额限制（特殊配额，与 LotteryQuotaService 配额并行）
      const campaign_quota_check = this._checkCampaignQuotaLimit(user_quota, campaign)

      // 5. 综合判断资格：配额充足 + 活动配额限制通过
      const is_eligible = quota_check.sufficient && campaign_quota_check.is_eligible

      if (!is_eligible) {
        const reason = !quota_check.sufficient ? quota_check.message : campaign_quota_check.reason

        this.log('info', '用户不满足抽奖资格', {
          user_id,
          campaign_id,
          draw_count,
          reason,
          quota_sufficient: quota_check.sufficient,
          quota_remaining: quota_check.remaining,
          quota_limit: quota_check.limit
        })

        return this.failure(reason, 'ELIGIBILITY_CHECK_FAILED', {
          user_id,
          campaign_id,
          draw_count,
          daily_draws: quota_check.used,
          max_daily_draws: quota_check.limit,
          remaining_draws: quota_check.remaining,
          quota_info: {
            sufficient: quota_check.sufficient,
            remaining: quota_check.remaining,
            limit: quota_check.limit,
            used: quota_check.used,
            bonus: quota_check.bonus,
            requested: quota_check.requested
          },
          campaign_quota: user_quota
            ? {
                quota_total: user_quota.quota_total,
                quota_used: user_quota.quota_used,
                quota_remaining: user_quota.quota_remaining
              }
            : null
        })
      }

      // 构建返回数据
      const result = {
        is_eligible: true,
        user_quota: user_quota ? user_quota.toJSON() : null,
        daily_draws_count: quota_check.used,
        remaining_draws: quota_check.remaining,
        max_daily_draws: quota_check.limit,
        quota_remaining: quota_check.remaining,
        quota_info: {
          sufficient: quota_check.sufficient,
          remaining: quota_check.remaining,
          limit: quota_check.limit,
          used: quota_check.used,
          bonus: quota_check.bonus,
          matched_rule_id: quota_check.matched_rule_id
        }
      }

      this.log('info', '抽奖资格检查通过', {
        user_id,
        campaign_id,
        draw_count,
        daily_draws: quota_check.used,
        remaining_draws: quota_check.remaining
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '抽奖资格检查失败', {
        user_id,
        campaign_id,
        draw_count,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 检查用户是否被禁止抽奖
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 检查结果 { is_eligible, reason }
   * @private
   */
  async _checkUserBan(user_id, campaign_id) {
    try {
      // 检查活动级别的用户黑名单（通过 user_quota 表的 status 字段）
      const banned_quota = await LotteryCampaignUserQuota.findOne({
        where: {
          user_id,
          campaign_id,
          status: 'suspended'
        }
      })

      if (banned_quota) {
        return {
          is_eligible: false,
          reason: `用户已被禁止参与此活动: ${banned_quota.note || '管理员操作'}`
        }
      }

      return { is_eligible: true, reason: null }
    } catch (error) {
      this.log('warn', '检查用户黑名单失败，默认允许抽奖', {
        user_id,
        campaign_id,
        error: error.message
      })
      return { is_eligible: true, reason: null }
    }
  }

  /**
   * 获取用户的活动配额
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 用户配额记录
   * @private
   */
  async _getUserQuota(user_id, campaign_id) {
    try {
      return await LotteryCampaignUserQuota.findOne({
        where: {
          user_id,
          campaign_id,
          status: 'active'
        }
      })
    } catch (error) {
      this.log('warn', '获取用户配额失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      return null
    }
  }

  /**
   * 检查活动级别的配额限制（特殊配额，与 LotteryQuotaService 配额并行）
   *
   * 🔄 2026-01-19 说明：
   * - 此方法检查 lottery_campaign_user_quota 表中的特殊配额
   * - 与 LotteryQuotaService 的每日配额是两套独立的配额系统
   * - LotteryQuotaService：每日限制，自动初始化，按规则优先级
   * - lottery_campaign_user_quota：活动专属配额，需手动分配
   *
   * @param {Object|null} user_quota - 用户配额记录（lottery_campaign_user_quota）
   * @param {Object} campaign - 活动配置
   * @returns {Object} 检查结果 { is_eligible, reason }
   * @private
   */
  _checkCampaignQuotaLimit(user_quota, campaign) {
    // 如果活动没有配额限制，直接通过
    if (!campaign.quota_enabled) {
      return { is_eligible: true, reason: null }
    }

    // 如果没有用户配额记录，检查是否允许无配额用户抽奖
    if (!user_quota) {
      // 根据活动配置决定是否允许无配额用户抽奖
      if (campaign.require_quota) {
        return {
          is_eligible: false,
          reason: '用户没有抽奖配额，请先获取配额'
        }
      }
      return { is_eligible: true, reason: null }
    }

    // 检查配额是否用完（字段名: quota_total, quota_used, quota_remaining）
    const remaining_quota = user_quota.quota_remaining
    if (remaining_quota <= 0) {
      return {
        is_eligible: false,
        reason: `抽奖配额已用完（已使用 ${user_quota.quota_used}/${user_quota.quota_total}）`
      }
    }

    return { is_eligible: true, reason: null }
  }
}

module.exports = EligibilityStage
