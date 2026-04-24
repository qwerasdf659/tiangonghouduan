const logger = require('../utils/logger').logger

/**
 * 活动生命周期管理服务（ActivityLifecycleService）
 *
 * @description 从 ActivityService 拆分，负责活动状态管理和上线校验
 *
 * 核心功能：
 * 1. 验证奖品配置 - validatePrizeConfig()
 * 2. 活动上线前完整校验 - validateForLaunch()
 * 3. 更新活动状态 - updateCampaignStatus()
 * 4. 启动/暂停/结束活动 - startCampaign()/pauseCampaign()/endCampaign()
 */

const models = require('../models')
const NotificationService = require('./NotificationService')

/**
 * 活动生命周期管理服务
 * @class ActivityLifecycleService
 */
class ActivityLifecycleService {
  /**
   * 验证活动的奖品配置（保底奖品约束 + 预算配置）
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 奖品配置校验结果
   */
  static async validatePrizeConfig(campaignId) {
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: ['lottery_campaign_id', 'campaign_name', 'campaign_code', 'budget_mode']
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const emptyPrizeResult = await models.LotteryPrize.validateFallbackPrizeConstraint(
      parseInt(campaignId)
    )

    const budgetConfigResult = await models.LotteryPrize.validateCampaignBudgetConfig(
      parseInt(campaignId)
    )

    return {
      lottery_campaign_id: parseInt(campaignId),
      campaign_name: campaign.campaign_name,
      budget_mode: campaign.budget_mode,
      fallback_prize_constraint: {
        valid: emptyPrizeResult.valid,
        error: emptyPrizeResult.error || null,
        fallback_prizes: emptyPrizeResult.emptyPrizes || []
      },
      prize_config: budgetConfigResult,
      overall_valid: emptyPrizeResult.valid && budgetConfigResult.valid
    }
  }

  /**
   * 活动上线前完整校验（档位权重/奖品权重/保底奖品/预算配置）
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 可选参数（transaction）
   * @returns {Promise<Object>} 校验结果，包含 valid/can_launch/errors 等字段
   */
  static async validateForLaunch(campaignId, options = {}) {
    const { transaction } = options
    const parsedCampaignId = parseInt(campaignId)

    const campaign = await models.LotteryCampaign.findByPk(parsedCampaignId, {
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'status',
        'pick_method'
      ],
      transaction
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const errors = []
    const validationDetails = {}

    if (campaign.pick_method === 'tier_first') {
      const segmentKeys = await models.LotteryTierRule.findAll({
        where: { lottery_campaign_id: parsedCampaignId, status: 'active' },
        attributes: [
          [models.sequelize.fn('DISTINCT', models.sequelize.col('segment_key')), 'segment_key']
        ],
        raw: true,
        transaction
      })

      const tierWeightResults = {}
      for (const { segment_key } of segmentKeys) {
        // eslint-disable-next-line no-await-in-loop
        const tierResult = await models.LotteryTierRule.validateTierWeights(
          parsedCampaignId,
          segment_key,
          { transaction }
        )
        tierWeightResults[segment_key] = tierResult

        if (!tierResult.valid) {
          errors.push(`档位权重[${segment_key}]：${tierResult.error}`)
        }
      }

      if (segmentKeys.length === 0) {
        errors.push('档位权重：活动未配置任何档位规则（tier_first 选奖法必须配置）')
      }

      validationDetails.tier_weights = {
        valid: errors.filter(e => e.startsWith('档位权重')).length === 0,
        segment_results: tierWeightResults
      }
    } else {
      validationDetails.tier_weights = {
        valid: true,
        skipped: true,
        reason: `活动使用 ${campaign.pick_method || 'tier_first'} 选奖法，不需要档位权重校验`
      }
    }

    const prizeWeightResult = await models.LotteryPrize.validatePrizeWeights(parsedCampaignId, {
      transaction
    })
    validationDetails.prize_weights = prizeWeightResult

    if (!prizeWeightResult.valid && prizeWeightResult.error) {
      errors.push(`奖品权重：${prizeWeightResult.error}`)
    }

    const emptyPrizeResult = await models.LotteryPrize.validateFallbackPrizeConstraint(
      parsedCampaignId,
      { transaction }
    )
    validationDetails.fallback_prize = emptyPrizeResult

    if (!emptyPrizeResult.valid && emptyPrizeResult.error) {
      errors.push(`保底奖品配置：${emptyPrizeResult.error}`)
    }

    const budgetConfigResult = await models.LotteryPrize.validateCampaignBudgetConfig(
      parsedCampaignId,
      { transaction }
    )
    validationDetails.budget_config = budgetConfigResult

    if (!budgetConfigResult.valid && budgetConfigResult.error) {
      errors.push(`预算配置：${budgetConfigResult.error}`)
    }

    const allValid = errors.length === 0

    return {
      valid: allValid,
      can_launch: allValid,
      lottery_campaign_id: parsedCampaignId,
      campaign_name: campaign.campaign_name,
      campaign_code: campaign.campaign_code,
      pick_method: campaign.pick_method,
      current_status: campaign.status,
      error: errors.length > 0 ? errors.join('；') : null,
      errors,
      validation_details: validationDetails,
      message: allValid
        ? `活动 ${campaign.campaign_name} 配置校验通过，可以上线`
        : `活动 ${campaign.campaign_name} 配置校验失败，禁止上线`
    }
  }

  /**
   * 更新活动状态（含状态机校验和上线前校验）
   * @param {number} campaignId - 活动ID
   * @param {string} newStatus - 目标状态（draft/active/paused/ended）
   * @param {Object} options - 可选参数（operated_by/reason/transaction）
   * @returns {Promise<Object>} 状态变更结果及通知信息
   */
  static async updateCampaignStatus(campaignId, newStatus, options = {}) {
    const { operated_by, reason, transaction } = options

    const validStatuses = ['draft', 'active', 'paused', 'ended']
    if (!validStatuses.includes(newStatus)) {
      const error = new Error(`无效的活动状态: ${newStatus}，有效值：${validStatuses.join('/')}`)
      error.code = 'INVALID_STATUS'
      error.statusCode = 400
      throw error
    }

    const campaign = await models.LotteryCampaign.findByPk(campaignId, { transaction })
    if (!campaign) {
      const error = new Error(`活动不存在: lottery_campaign_id=${campaignId}`)
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const oldStatus = campaign.status

    const statusTransitions = {
      draft: ['active'],
      active: ['paused', 'ended'],
      paused: ['active', 'ended'],
      ended: []
    }

    const allowedTransitions = statusTransitions[oldStatus] || []
    if (!allowedTransitions.includes(newStatus)) {
      const error = new Error(
        `状态变更不允许: ${oldStatus} → ${newStatus}，允许的变更: ${allowedTransitions.join('/')}`
      )
      error.code = 'INVALID_STATUS_TRANSITION'
      error.statusCode = 400
      throw error
    }

    if (newStatus === 'active') {
      const validation = await this.validateForLaunch(campaignId, { transaction })
      if (!validation.valid) {
        const error = new Error(`活动配置校验失败，无法启动: ${validation.error}`)
        error.code = 'VALIDATION_FAILED'
        error.statusCode = 400
        error.validation = validation
        throw error
      }
    }

    await campaign.update({ status: newStatus }, { transaction })

    logger.info('[ActivityLifecycleService] 活动状态已更新', {
      lottery_campaign_id: campaignId,
      campaign_code: campaign.campaign_code,
      old_status: oldStatus,
      new_status: newStatus,
      operated_by,
      reason
    })

    let notificationResult = null
    try {
      notificationResult = await NotificationService.notifyActivityStatusChange({
        campaign_code: campaign.campaign_code,
        campaign_name: campaign.campaign_name,
        old_status: oldStatus,
        new_status: newStatus,
        operator_id: operated_by,
        reason
      })

      logger.info('[ActivityLifecycleService] WebSocket状态变更通知已发送', {
        campaign_code: campaign.campaign_code,
        broadcasted_count: notificationResult?.admin_notification?.broadcasted_count
      })
    } catch (notifyError) {
      logger.warn('[ActivityLifecycleService] WebSocket通知发送失败（非关键）', {
        lottery_campaign_id: campaignId,
        error: notifyError.message
      })
    }

    return {
      success: true,
      campaign: {
        lottery_campaign_id: campaign.lottery_campaign_id,
        campaign_code: campaign.campaign_code,
        campaign_name: campaign.campaign_name,
        old_status: oldStatus,
        new_status: newStatus
      },
      notification: notificationResult,
      message: `活动状态已从 ${oldStatus} 变更为 ${newStatus}`
    }
  }

  /**
   * 启动活动（将状态变更为 active）
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 可选参数（operated_by/reason/transaction）
   * @returns {Promise<Object>} 状态变更结果
   */
  static async startCampaign(campaignId, options = {}) {
    return await this.updateCampaignStatus(campaignId, 'active', options)
  }

  /**
   * 暂停活动（将状态变更为 paused）
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 可选参数（operated_by/reason/transaction）
   * @returns {Promise<Object>} 状态变更结果
   */
  static async pauseCampaign(campaignId, options = {}) {
    return await this.updateCampaignStatus(campaignId, 'paused', options)
  }

  /**
   * 结束活动（将状态变更为 ended）
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 可选参数（operated_by/reason/transaction）
   * @returns {Promise<Object>} 状态变更结果
   */
  static async endCampaign(campaignId, options = {}) {
    return await this.updateCampaignStatus(campaignId, 'ended', options)
  }
}

module.exports = ActivityLifecycleService
