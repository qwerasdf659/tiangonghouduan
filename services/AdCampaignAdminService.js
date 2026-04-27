/**
 * 广告计划管理端服务层（AdCampaignAdminService）
 *
 * 从 AdCampaignService 拆分而来，负责管理端 CRUD 和运营操作：
 * - 管理端计划列表、审核、统计、仪表板
 * - 运营/系统类型计划创建、发布、暂停
 *
 * 服务对象：
 * - /api/v4/console/ad-campaigns（管理端 - 计划管理和审核）
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const { Op } = require('sequelize')
const { AdCampaign, AdSlot, AdCreative, User } = require('../models')

const BeijingTimeHelper = require('../utils/timeHelper')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')
const { v4: uuidv4 } = require('uuid')
const AdBillingService = require('./AdBillingService')
const AdCampaignService = require('./AdCampaignService')

/**
 * 广告计划管理端服务类，负责管理端 CRUD 和运营操作
 */
class AdCampaignAdminService {
  /**
   * 获取管理端广告计划列表（分页、筛选）
   * @param {Object} options - 查询选项（分页、筛选条件、事务）
   * @returns {Object} 包含 list、total、page、pageSize 的分页结果
   */
  static async getAdminCampaignList(options = {}) {
    try {
      const {
        page = 1,
        pageSize = 20,
        status,
        billing_mode,
        advertiser_user_id,
        ad_slot_id,
        campaign_category
      } = options

      const where = {}
      if (campaign_category) where.campaign_category = campaign_category
      if (status) where.status = status
      if (billing_mode) where.billing_mode = billing_mode
      if (advertiser_user_id) where.advertiser_user_id = advertiser_user_id
      if (ad_slot_id) where.ad_slot_id = ad_slot_id

      // query
      const total = await AdCampaign.count({ where, transaction: options.transaction })

      const campaigns = await AdCampaign.findAll({
        where,
        include: [
          {
            model: AdSlot,
            as: 'adSlot',
            attributes: ['ad_slot_id', 'slot_key', 'slot_name', 'slot_type']
          },
          {
            model: User,
            as: 'advertiser',
            attributes: ['user_id', 'nickname', 'avatar_url'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        transaction: options.transaction
      })

      await attachDisplayNames(campaigns, [
        { field: 'status', dictType: DICT_TYPES.AD_CAMPAIGN_STATUS },
        { field: 'billing_mode', dictType: DICT_TYPES.AD_BILLING_MODE }
      ])

      logger.info('获取管理端广告计划列表', {
        page,
        pageSize,
        total,
        filters: { status, billing_mode, advertiser_user_id, ad_slot_id }
      })

      return { list: campaigns, total, page, pageSize }
    } catch (error) {
      logger.error('获取管理端广告计划列表失败', { error: error.message, options })
      throw error
    }
  }

  // PLACEHOLDER_REMAINING_METHODS

  /**
   * 审核广告计划（管理员操作）
   * @param {string} campaignId - 广告计划 ID
   * @param {string} adminId - 管理员用户 ID
   * @param {string} action - 审核操作（approve 或 reject）
   * @param {string} note - 审核备注
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 更新后的广告计划实例
   */
  static async reviewCampaign(campaignId, adminId, action, note, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new BusinessError(`广告计划不存在: ${campaignId}`, 'AD_NOT_FOUND', 404)
      }

      if (campaign.status !== 'pending_review') {
        throw new BusinessError(
          `只能审核待审核状态的计划，当前状态: ${campaign.status}`,
          'AD_ERROR',
          400
        )
      }

      if (action === 'approve') {
        if (campaign.billing_mode === 'fixed_daily' && campaign.start_date && campaign.end_date) {
          const conflicting = await AdCampaign.findOne({
            where: {
              ad_slot_id: campaign.ad_slot_id,
              billing_mode: 'fixed_daily',
              ad_campaign_id: { [Op.ne]: campaignId },
              status: { [Op.in]: ['active', 'approved'] },
              start_date: { [Op.lte]: campaign.end_date },
              end_date: { [Op.gte]: campaign.start_date }
            },
            transaction: options.transaction
          })
          if (conflicting) {
            throw new BusinessError(
              `包天坑位冲突：该广告位在 ${campaign.start_date} ~ ${campaign.end_date} 期间已有包天计划（ID: ${conflicting.ad_campaign_id}），无法审核通过`,
              'AD_CONFLICT',
              409
            )
          }
        }

        await campaign.update(
          {
            status: 'approved',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )

        const now = BeijingTimeHelper.createBeijingTime()
        const startDate = campaign.start_date ? new Date(campaign.start_date) : null
        const endDate = campaign.end_date ? new Date(campaign.end_date) : null

        if (endDate && endDate < now) {
          await campaign.update({ status: 'completed' }, { transaction: options.transaction })
          logger.warn('审核通过但计划已过期，标记为已完成', {
            campaign_id: campaignId,
            end_date: campaign.end_date
          })
        } else if (!startDate || startDate <= now) {
          await campaign.update({ status: 'active' }, { transaction: options.transaction })
        }
      } else if (action === 'reject') {
        await campaign.update(
          {
            status: 'rejected',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )
      } else {
        throw new BusinessError(`无效的审核操作: ${action}`, 'AD_INVALID', 400)
      }

      logger.info('审核广告计划成功', {
        campaign_id: campaignId,
        adminId,
        action,
        new_status: campaign.status
      })

      return campaign
    } catch (error) {
      logger.error('审核广告计划失败', { campaignId, adminId, action, error: error.message })
      throw error
    }
  }

  // PLACEHOLDER_AFTER_REVIEW

  /**
   * 获取广告计划详情（管理端，包含关联数据）
   * @param {string} campaignId - 广告计划 ID
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 广告计划详情及关联数据
   */
  static async getCampaignDetailWithRelations(campaignId, options = {}) {
    return AdCampaignService.getCampaignById(campaignId, options)
  }

  /**
   * 获取广告计划统计信息（兼容路由层命名）
   * @param {Object} _options - 可选参数（保留用于兼容）
   * @returns {Object} 广告计划统计数据
   */
  static async getCampaignStatistics(_options = {}) {
    return AdCampaignAdminService.getStatistics()
  }

  /**
   * 获取广告概览仪表板
   * @param {Object} _options - 可选参数（保留用于兼容）
   * @returns {Object} 包含 campaign_stats 和 billing_stats 的仪表板数据
   */
  static async getAdDashboard(_options = {}) {
    try {
      const stats = await AdCampaignAdminService.getStatistics()
      const billingStats = await AdBillingService.getStatistics()
      return { campaign_stats: stats, billing_stats: billingStats }
    } catch (error) {
      logger.error('获取广告仪表板失败', { error: error.message })
      throw error
    }
  }

  // PLACEHOLDER_OPERATIONAL

  /**
   * 创建运营内容计划（operational 类型）
   * @param {Object} data - 运营计划数据
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 创建的广告计划实例
   */
  static async createOperationalCampaign(data, options = {}) {
    try {
      const priority = data.priority || 500
      if (priority < 100 || priority > 899) {
        throw new BusinessError(
          '运营内容优先级必须在 100-899 范围内，当前值: ' + priority,
          'AD_INVALID',
          400
        )
      }

      const adSlot = await AdSlot.findByPk(data.ad_slot_id, { transaction: options.transaction })
      if (!adSlot) throw new BusinessError('广告位不存在: ' + data.ad_slot_id, 'AD_NOT_FOUND', 404)
      if (!adSlot.is_active) {
        throw new BusinessError('广告位未启用: ' + data.ad_slot_id, 'AD_DISABLED', 400)
      }

      const business_id = uuidv4()

      const campaign = await AdCampaign.create(
        {
          business_id,
          campaign_category: 'operational',
          advertiser_user_id: data.operator_user_id,
          ad_slot_id: data.ad_slot_id,
          campaign_name: data.campaign_name,
          billing_mode: 'free',
          status: 'draft',
          priority,
          frequency_rule: data.frequency_rule || 'once_per_day',
          frequency_value: data.frequency_value || 1,
          force_show: data.force_show || false,
          slide_interval_ms: data.slide_interval_ms || 3000,
          internal_notes: data.internal_notes || null,
          targeting_rules: data.targeting_rules || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null
        },
        { transaction: options.transaction }
      )

      logger.info('创建运营内容计划成功', {
        campaign_id: campaign.ad_campaign_id,
        operator_user_id: data.operator_user_id,
        slot_id: data.ad_slot_id
      })

      if (data.primary_media_id || data.text_content) {
        await AdCreative.create(
          {
            ad_campaign_id: campaign.ad_campaign_id,
            title: data.campaign_name,
            content_type: data.content_type || 'image',
            primary_media_id: data.primary_media_id || null,
            text_content: data.text_content || null,
            display_mode: data.display_mode || null,
            review_status: 'approved'
          },
          { transaction: options.transaction }
        )
      }

      return campaign
    } catch (error) {
      logger.error('创建运营内容计划失败', { error: error.message, data })
      throw error
    }
  }

  // PLACEHOLDER_SYSTEM_CAMPAIGN

  /**
   * 创建系统通知计划（system 类型）
   * @param {Object} data - 系统通知计划数据
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 创建的广告计划实例
   */
  static async createSystemCampaign(data, options = {}) {
    try {
      const priority = data.priority || 950
      if (priority < 900 || priority > 999) {
        throw new BusinessError(
          '系统通知优先级必须在 900-999 范围内，当前值: ' + priority,
          'AD_INVALID',
          400
        )
      }

      const adSlot = await AdSlot.findByPk(data.ad_slot_id, { transaction: options.transaction })
      if (!adSlot) throw new BusinessError('广告位不存在: ' + data.ad_slot_id, 'AD_NOT_FOUND', 404)

      const business_id = uuidv4()

      const campaign = await AdCampaign.create(
        {
          business_id,
          campaign_category: 'system',
          advertiser_user_id: data.operator_user_id,
          ad_slot_id: data.ad_slot_id,
          campaign_name: data.campaign_name,
          billing_mode: 'free',
          status: 'draft',
          priority,
          force_show: data.force_show !== undefined ? data.force_show : true,
          internal_notes: data.internal_notes || null,
          targeting_rules: data.targeting_rules || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null
        },
        { transaction: options.transaction }
      )

      if (data.primary_media_id || data.text_content) {
        await AdCreative.create(
          {
            ad_campaign_id: campaign.ad_campaign_id,
            title: data.campaign_name,
            content_type: data.content_type || 'image',
            primary_media_id: data.primary_media_id || null,
            text_content: data.text_content || null,
            display_mode: data.display_mode || null,
            review_status: 'approved'
          },
          { transaction: options.transaction }
        )
      }

      logger.info('创建系统通知计划成功', {
        campaign_id: campaign.ad_campaign_id,
        operator_user_id: data.operator_user_id
      })

      return campaign
    } catch (error) {
      logger.error('创建系统通知计划失败', { error: error.message, data })
      throw error
    }
  }

  // PLACEHOLDER_PUBLISH

  /**
   * 发布计划（draft → active）
   * @param {string} campaignId - 广告计划 ID
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 更新后的广告计划实例
   */
  static async publishCampaign(campaignId, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, { transaction: options.transaction })
      if (!campaign) throw new BusinessError('计划不存在: ' + campaignId, 'AD_NOT_FOUND', 404)
      if (campaign.status !== 'draft') {
        throw new BusinessError(
          '只能发布草稿状态的计划，当前状态: ' + campaign.status,
          'AD_NOT_ALLOWED',
          400
        )
      }
      if (!['operational', 'system'].includes(campaign.campaign_category)) {
        throw new BusinessError(
          '只有运营/系统类型计划可以直接发布，当前类型: ' + campaign.campaign_category,
          'AD_ERROR',
          400
        )
      }

      await campaign.update({ status: 'active' }, { transaction: options.transaction })
      logger.info('发布计划成功', { campaign_id: campaignId, category: campaign.campaign_category })
      return campaign
    } catch (error) {
      logger.error('发布计划失败', { campaignId, error: error.message })
      throw error
    }
  }

  // PLACEHOLDER_PAUSE

  /**
   * 暂停计划（active → paused）
   * @param {string} campaignId - 广告计划 ID
   * @param {Object} options - 可选参数（含事务对象）
   * @returns {Object} 更新后的广告计划实例
   */
  static async pauseCampaign(campaignId, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, { transaction: options.transaction })
      if (!campaign) throw new BusinessError('计划不存在: ' + campaignId, 'AD_NOT_FOUND', 404)
      if (campaign.status !== 'active') {
        throw new BusinessError(
          '只能暂停投放中的计划，当前状态: ' + campaign.status,
          'AD_NOT_ALLOWED',
          400
        )
      }

      await campaign.update({ status: 'paused' }, { transaction: options.transaction })
      logger.info('暂停计划成功', { campaign_id: campaignId, category: campaign.campaign_category })
      return campaign
    } catch (error) {
      logger.error('暂停计划失败', { campaignId, error: error.message })
      throw error
    }
  }

  // PLACEHOLDER_STATISTICS

  /**
   * 获取广告计划统计信息
   * @returns {Object} 包含 total、by_status、by_billing_mode、total_spend 的统计数据
   */
  static async getStatistics() {
    try {
      const statusCounts = await AdCampaign.findAll({
        attributes: [
          'status',
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'count']
        ],
        group: ['status'],
        raw: true
      })

      const billingModeCounts = await AdCampaign.findAll({
        attributes: [
          'billing_mode',
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'count']
        ],
        group: ['billing_mode'],
        raw: true
      })

      const spendResult = await AdCampaign.findOne({
        attributes: [
          [
            AdCampaign.sequelize.fn('SUM', AdCampaign.sequelize.col('budget_spent_star_stone')),
            'total_spend'
          ],
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'total']
        ],
        raw: true
      })

      const allStatuses = [
        'draft',
        'pending_review',
        'approved',
        'active',
        'paused',
        'completed',
        'rejected',
        'cancelled'
      ]
      const byStatus = {}
      allStatuses.forEach(s => {
        byStatus[s] = 0
      })
      statusCounts.forEach(row => {
        byStatus[row.status] = parseInt(row.count) || 0
      })

      const byBillingMode = { fixed_daily: 0, bidding: 0, free: 0 }
      billingModeCounts.forEach(row => {
        byBillingMode[row.billing_mode] = parseInt(row.count) || 0
      })

      return {
        total: parseInt(spendResult?.total) || 0,
        by_status: byStatus,
        by_billing_mode: byBillingMode,
        total_spend: parseInt(spendResult?.total_spend) || 0
      }
    } catch (error) {
      logger.error('获取广告计划统计信息失败', { error: error.message })
      throw error
    }
  }
}

module.exports = AdCampaignAdminService
