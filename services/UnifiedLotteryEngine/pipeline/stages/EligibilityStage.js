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
 * @module services/UnifiedLotteryEngine/pipeline/stages/EligibilityStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BaseStage = require('./BaseStage')
const { LotteryCampaignUserQuota, LotteryDraw } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

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
    const { user_id, campaign_id } = context

    this.log('info', '开始检查抽奖资格', { user_id, campaign_id })

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

      // 2. 获取用户的活动配额
      const user_quota = await this._getUserQuota(user_id, campaign_id)

      // 3. 检查今日已抽奖次数
      const daily_draws = await this._getDailyDrawsCount(user_id, campaign_id)

      // 4. 计算剩余抽奖次数
      const max_daily_draws = campaign.max_daily_draws || 10 // 默认每日最多10次
      const remaining_draws = Math.max(0, max_daily_draws - daily_draws)

      // 5. 检查配额限制
      const quota_check = this._checkQuotaLimit(user_quota, campaign)

      // 6. 综合判断资格
      const is_eligible = remaining_draws > 0 && quota_check.is_eligible

      if (!is_eligible) {
        const reason =
          remaining_draws <= 0 ? `今日抽奖次数已达上限（${max_daily_draws}次）` : quota_check.reason

        this.log('info', '用户不满足抽奖资格', {
          user_id,
          campaign_id,
          reason,
          daily_draws,
          max_daily_draws,
          remaining_draws
        })

        return this.failure(reason, 'ELIGIBILITY_CHECK_FAILED', {
          user_id,
          campaign_id,
          daily_draws,
          max_daily_draws,
          remaining_draws,
          quota_info: user_quota
            ? {
                granted_quota: user_quota.granted_quota,
                used_quota: user_quota.used_quota,
                remaining_quota: user_quota.granted_quota - user_quota.used_quota
              }
            : null
        })
      }

      // 构建返回数据
      const result = {
        is_eligible: true,
        user_quota: user_quota ? user_quota.toJSON() : null,
        daily_draws_count: daily_draws,
        remaining_draws,
        max_daily_draws,
        quota_remaining: user_quota ? user_quota.granted_quota - user_quota.used_quota : null
      }

      this.log('info', '抽奖资格检查通过', {
        user_id,
        campaign_id,
        daily_draws,
        remaining_draws
      })

      return this.success(result)
    } catch (error) {
      this.log('error', '抽奖资格检查失败', {
        user_id,
        campaign_id,
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
   * 获取用户今日抽奖次数
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<number>} 今日已抽奖次数
   * @private
   */
  async _getDailyDrawsCount(user_id, campaign_id) {
    try {
      // 获取今日北京时间的开始和结束
      const today_start = BeijingTimeHelper.getTodayStart()
      const today_end = BeijingTimeHelper.getTodayEnd()

      const count = await LotteryDraw.count({
        where: {
          user_id,
          campaign_id,
          created_at: {
            [Op.gte]: today_start,
            [Op.lt]: today_end
          }
        }
      })

      return count
    } catch (error) {
      this.log('warn', '获取今日抽奖次数失败', {
        user_id,
        campaign_id,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 检查配额限制
   *
   * @param {Object|null} user_quota - 用户配额记录
   * @param {Object} campaign - 活动配置
   * @returns {Object} 检查结果 { is_eligible, reason }
   * @private
   */
  _checkQuotaLimit(user_quota, campaign) {
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

    // 检查配额是否用完
    const remaining_quota = user_quota.granted_quota - user_quota.used_quota
    if (remaining_quota <= 0) {
      return {
        is_eligible: false,
        reason: `抽奖配额已用完（已使用 ${user_quota.used_quota}/${user_quota.granted_quota}）`
      }
    }

    return { is_eligible: true, reason: null }
  }
}

module.exports = EligibilityStage
