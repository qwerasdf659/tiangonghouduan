/**
 * 广告反作弊服务层（AdAntifraudService）
 *
 * 业务场景：
 * - 识别无效曝光和点击（自刷、频次超限、批量异常等）
 * - 记录反作弊判定日志，用于后续分析和风控
 * - 支持多种反作弊规则：自刷检测、频次限制、批量异常检测
 *
 * 服务对象：
 * - /api/v4/ads/impression（小程序端 - 记录曝光）
 * - /api/v4/ads/click（小程序端 - 记录点击）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { AdAntifraudLog, AdCampaign, AdImpressionLog, AdClickLog } = require('../models')
const { Op } = require('sequelize')
const { sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告反作弊服务类
 */
class AdAntifraudService {
  /**
   * 检查曝光有效性
   *
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 广告计划ID
   * @param {number} adSlotId - 广告位ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { is_valid, invalid_reason }
   */
  static async checkImpression(userId, campaignId, adSlotId, options = {}) {
    const { transaction } = options

    try {
      // 1. 获取广告计划信息（用于自刷检测）
      const campaign = await AdCampaign.findByPk(campaignId, {
        attributes: ['advertiser_user_id'],
        transaction
      })

      if (!campaign) {
        return { is_valid: false, invalid_reason: 'campaign_not_found' }
      }

      // 2. 规则1：自刷检测（广告主查看自己的广告）
      if (campaign.advertiser_user_id === userId) {
        await AdAntifraudLog.create(
          {
            user_id: userId,
            ad_campaign_id: campaignId,
            ad_slot_id: adSlotId,
            fraud_type: 'impression',
            fraud_rule: 'self_view',
            is_valid: false,
            detected_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        logger.warn('[AdAntifraudService] 检测到自刷曝光', {
          userId,
          campaignId,
          advertiserId: campaign.advertiser_user_id
        })

        return { is_valid: false, invalid_reason: 'self_view' }
      }

      // 3. 规则2：频次限制（同一用户+计划 > 3次/10分钟）
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      const recentImpressions = await AdImpressionLog.count({
        where: {
          user_id: userId,
          ad_campaign_id: campaignId,
          created_at: { [Op.gte]: tenMinutesAgo },
          is_valid: true
        },
        transaction
      })

      if (recentImpressions >= 3) {
        await AdAntifraudLog.create(
          {
            user_id: userId,
            ad_campaign_id: campaignId,
            ad_slot_id: adSlotId,
            fraud_type: 'impression',
            fraud_rule: 'frequency_limit',
            is_valid: false,
            detected_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        logger.warn('[AdAntifraudService] 检测到频次超限曝光', {
          userId,
          campaignId,
          recentCount: recentImpressions
        })

        return { is_valid: false, invalid_reason: 'frequency_limit' }
      }

      // 4. 规则3：批量异常检测（同一计划 > 20用户/1分钟）
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
      const uniqueUsersCount = await AdImpressionLog.count({
        where: {
          ad_campaign_id: campaignId,
          created_at: { [Op.gte]: oneMinuteAgo },
          is_valid: true
        },
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('user_id')), 'user_id']],
        distinct: true,
        transaction
      })

      if (uniqueUsersCount > 20) {
        await AdAntifraudLog.create(
          {
            user_id: userId,
            ad_campaign_id: campaignId,
            ad_slot_id: adSlotId,
            fraud_type: 'impression',
            fraud_rule: 'batch_suspect',
            is_valid: false,
            detected_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        logger.warn('[AdAntifraudService] 检测到批量异常曝光', {
          campaignId,
          uniqueUsersCount
        })

        /*
         * 注意：批量异常不直接判定单个用户无效，仅记录日志
         * 返回有效，但记录可疑行为
         */
      }

      // 5. 所有检查通过，返回有效
      return { is_valid: true, invalid_reason: null }
    } catch (error) {
      logger.error('[AdAntifraudService] 曝光检查失败', {
        userId,
        campaignId,
        adSlotId,
        error: error.message,
        stack: error.stack
      })
      // 错误时默认返回有效，避免影响正常流程
      return { is_valid: true, invalid_reason: null }
    }
  }

  /**
   * 检查点击有效性
   *
   * @param {number} userId - 用户ID
   * @param {number} campaignId - 广告计划ID
   * @param {number} adSlotId - 广告位ID
   * @param {string} clickTarget - 点击目标（如：link_url）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { is_valid, invalid_reason }
   */
  static async checkClick(userId, campaignId, adSlotId, clickTarget, options = {}) {
    const { transaction } = options

    try {
      // 1. 获取广告计划信息（用于自刷检测）
      const campaign = await AdCampaign.findByPk(campaignId, {
        attributes: ['advertiser_user_id'],
        transaction
      })

      if (!campaign) {
        return { is_valid: false, invalid_reason: 'campaign_not_found' }
      }

      // 2. 规则1：自刷检测（广告主点击自己的广告）
      if (campaign.advertiser_user_id === userId) {
        await AdAntifraudLog.create(
          {
            user_id: userId,
            ad_campaign_id: campaignId,
            ad_slot_id: adSlotId,
            fraud_type: 'click',
            fraud_rule: 'self_click',
            is_valid: false,
            detected_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        logger.warn('[AdAntifraudService] 检测到自刷点击', {
          userId,
          campaignId,
          advertiserId: campaign.advertiser_user_id
        })

        return { is_valid: false, invalid_reason: 'self_click' }
      }

      // 3. 规则2：虚假点击检测（同一用户+计划 > 5次/今天）
      const todayStart = BeijingTimeHelper.startOfDay(new Date())
      const todayClicks = await AdClickLog.count({
        where: {
          user_id: userId,
          ad_campaign_id: campaignId,
          created_at: { [Op.gte]: todayStart },
          is_valid: true
        },
        transaction
      })

      if (todayClicks >= 5) {
        await AdAntifraudLog.create(
          {
            user_id: userId,
            ad_campaign_id: campaignId,
            ad_slot_id: adSlotId,
            fraud_type: 'click',
            fraud_rule: 'fake_click',
            is_valid: false,
            detected_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        logger.warn('[AdAntifraudService] 检测到虚假点击', {
          userId,
          campaignId,
          todayClicks
        })

        return { is_valid: false, invalid_reason: 'fake_click' }
      }

      // 4. 所有检查通过，返回有效
      return { is_valid: true, invalid_reason: null }
    } catch (error) {
      logger.error('[AdAntifraudService] 点击检查失败', {
        userId,
        campaignId,
        adSlotId,
        clickTarget,
        error: error.message,
        stack: error.stack
      })
      // 错误时默认返回有效，避免影响正常流程
      return { is_valid: true, invalid_reason: null }
    }
  }
}

module.exports = AdAntifraudService
