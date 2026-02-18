/**
 * 广告计划服务层（AdCampaignService）
 *
 * 业务场景：
 * - 管理广告主的广告投放计划
 * - 支持固定包天和竞价两种计费模式
 * - 管理计划的审核、启用、暂停等生命周期状态
 * - 记录计划的预算、消耗、定向规则等信息
 *
 * 服务对象：
 * - /api/v4/ad/campaigns（小程序端 - 用户自己的计划）
 * - /api/v4/console/ad-campaigns（管理端 - 计划管理和审核）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { AdCampaign, AdSlot, AdCreative, AdBillingRecord, User } = require('../models')

const BeijingTimeHelper = require('../utils/timeHelper')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')
const { v4: uuidv4 } = require('uuid')

/**
 * 广告计划服务类
 */
class AdCampaignService {
  /**
   * 获取用户自己的广告计划列表
   *
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.pageSize - 每页数量（默认20）
   * @param {string} options.status - 状态筛选
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { list, total, page, pageSize }
   */
  static async getMyAdCampaigns(userId, options = {}) {
    try {
      const { page = 1, pageSize = 20, status } = options

      // 构建查询条件
      const where = { advertiser_user_id: userId }
      if (status) {
        where.status = status
      }

      // 查询总数
      const total = await AdCampaign.count({
        where,
        transaction: options.transaction
      })

      // 查询列表（包含关联数据）
      const campaigns = await AdCampaign.findAll({
        where,
        include: [
          {
            model: AdSlot,
            as: 'adSlot',
            attributes: ['ad_slot_id', 'slot_key', 'slot_name', 'slot_type', 'position']
          },
          {
            model: AdCreative,
            as: 'creatives',
            attributes: ['ad_creative_id', 'title', 'image_url', 'review_status'],
            required: false
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        transaction: options.transaction
      })

      // 为每个计划查询计费记录摘要
      for (const campaign of campaigns) {
        const billingSummary = await AdBillingRecord.findAll({
          where: { ad_campaign_id: campaign.ad_campaign_id },
          attributes: [
            [
              AdBillingRecord.sequelize.fn('SUM', AdBillingRecord.sequelize.col('amount_diamond')),
              'total_amount'
            ],
            [
              AdBillingRecord.sequelize.fn(
                'COUNT',
                AdBillingRecord.sequelize.col('ad_billing_record_id')
              ),
              'record_count'
            ]
          ],
          group: ['billing_type'],
          raw: true,
          transaction: options.transaction
        })

        campaign.setDataValue('billing_summary', billingSummary)
      }

      // 附加显示名称
      await attachDisplayNames(campaigns, [
        { field: 'status', dictType: DICT_TYPES.AD_CAMPAIGN_STATUS },
        { field: 'billing_mode', dictType: DICT_TYPES.AD_BILLING_MODE }
      ])

      logger.info('获取用户广告计划列表', { userId, page, pageSize, total, status })

      return {
        list: campaigns,
        total,
        page,
        pageSize
      }
    } catch (error) {
      logger.error('获取用户广告计划列表失败', { userId, error: error.message, options })
      throw error
    }
  }

  /**
   * 根据ID获取广告计划（包含详细信息）
   *
   * @param {number} campaignId - 计划ID
   * @param {Object} options - 查询选项
   * @param {number} options.userId - 用户ID（用于验证所有权，用户只能查看自己的计划）
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object|null>} 广告计划对象或null
   */
  static async getCampaignById(campaignId, options = {}) {
    try {
      const where = { ad_campaign_id: campaignId }

      // 如果提供了userId，限制只能查看自己的计划
      if (options.userId) {
        where.advertiser_user_id = options.userId
      }

      const campaign = await AdCampaign.findOne({
        where,
        include: [
          {
            model: AdSlot,
            as: 'adSlot',
            attributes: [
              'ad_slot_id',
              'slot_key',
              'slot_name',
              'slot_type',
              'position',
              'daily_price_diamond',
              'min_bid_diamond',
              'min_budget_diamond'
            ]
          },
          {
            model: AdCreative,
            as: 'creatives',
            attributes: [
              'ad_creative_id',
              'title',
              'image_url',
              'image_width',
              'image_height',
              'link_url',
              'link_type',
              'review_status',
              'review_note'
            ],
            required: false
          },
          {
            model: User,
            as: 'advertiser',
            attributes: ['user_id', 'nickname', 'avatar_url'],
            required: false
          }
        ],
        transaction: options.transaction
      })

      if (campaign) {
        // 附加显示名称
        await attachDisplayNames(campaign, [
          { field: 'status', dictType: DICT_TYPES.AD_CAMPAIGN_STATUS },
          { field: 'billing_mode', dictType: DICT_TYPES.AD_BILLING_MODE }
        ])

        // 为创意附加显示名称
        if (campaign.creatives && campaign.creatives.length > 0) {
          await attachDisplayNames(campaign.creatives, [
            { field: 'review_status', dictType: DICT_TYPES.AD_REVIEW_STATUS }
          ])
        }
      }

      return campaign
    } catch (error) {
      logger.error('获取广告计划详情失败', { campaignId, error: error.message, options })
      throw error
    }
  }

  /**
   * 创建广告计划（草稿状态）
   *
   * @param {Object} data - 计划数据
   * @param {number} data.advertiser_user_id - 广告主用户ID
   * @param {number} data.ad_slot_id - 广告位ID
   * @param {string} data.campaign_name - 计划名称
   * @param {string} data.billing_mode - 计费模式（fixed_daily/bidding）
   * @param {number} data.daily_bid_diamond - 竞价模式下的每日出价（竞价模式必填）
   * @param {number} data.budget_total_diamond - 总预算（竞价模式必填）
   * @param {number} data.fixed_days - 固定包天天数（固定包天模式必填）
   * @param {Object} data.targeting_rules - 定向规则（JSON）
   * @param {string} data.start_date - 开始日期（YYYY-MM-DD）
   * @param {string} data.end_date - 结束日期（YYYY-MM-DD）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的广告计划对象
   */
  static async createCampaign(data, options = {}) {
    try {
      // 验证广告位是否存在
      const adSlot = await AdSlot.findByPk(data.ad_slot_id, {
        transaction: options.transaction
      })

      if (!adSlot) {
        throw new Error(`广告位不存在: ${data.ad_slot_id}`)
      }

      if (!adSlot.is_active) {
        throw new Error(`广告位未启用: ${data.ad_slot_id}`)
      }

      // 根据计费模式验证必填字段
      if (data.billing_mode === 'fixed_daily') {
        if (!data.fixed_days || data.fixed_days < 1) {
          throw new Error('固定包天模式必须提供包天天数（fixed_days >= 1）')
        }

        // 计算固定包天总价
        const fixed_total_diamond = adSlot.daily_price_diamond * data.fixed_days
        data.fixed_total_diamond = fixed_total_diamond
      } else if (data.billing_mode === 'bidding') {
        if (!data.daily_bid_diamond || data.daily_bid_diamond < adSlot.min_bid_diamond) {
          throw new Error(`竞价模式每日出价不能低于最低竞价: ${adSlot.min_bid_diamond}钻石`)
        }

        if (!data.budget_total_diamond || data.budget_total_diamond < adSlot.min_budget_diamond) {
          throw new Error(`竞价模式总预算不能低于最低预算: ${adSlot.min_budget_diamond}钻石`)
        }
      } else {
        throw new Error(`无效的计费模式: ${data.billing_mode}`)
      }

      // 生成business_id
      const business_id = uuidv4()

      // 创建计划（草稿状态）
      const campaign = await AdCampaign.create(
        {
          business_id,
          advertiser_user_id: data.advertiser_user_id,
          ad_slot_id: data.ad_slot_id,
          campaign_name: data.campaign_name,
          billing_mode: data.billing_mode,
          status: 'draft',
          daily_bid_diamond: data.daily_bid_diamond || null,
          budget_total_diamond: data.budget_total_diamond || null,
          budget_spent_diamond: 0,
          fixed_days: data.fixed_days || null,
          fixed_total_diamond: data.fixed_total_diamond || null,
          targeting_rules: data.targeting_rules || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          priority: data.priority || 50
        },
        { transaction: options.transaction }
      )

      logger.info('创建广告计划成功', {
        campaign_id: campaign.ad_campaign_id,
        business_id: campaign.business_id,
        advertiser_user_id: data.advertiser_user_id,
        billing_mode: data.billing_mode
      })

      return campaign
    } catch (error) {
      logger.error('创建广告计划失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 更新广告计划（仅限草稿状态）
   *
   * @param {number} campaignId - 计划ID
   * @param {number} userId - 用户ID（验证所有权）
   * @param {Object} data - 要更新的数据
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告计划对象
   */
  static async updateCampaign(campaignId, userId, data, options = {}) {
    try {
      const campaign = await AdCampaign.findOne({
        where: {
          ad_campaign_id: campaignId,
          advertiser_user_id: userId
        },
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在或无权限: ${campaignId}`)
      }

      // 只能更新草稿状态的计划
      if (campaign.status !== 'draft') {
        throw new Error(`只能更新草稿状态的计划，当前状态: ${campaign.status}`)
      }

      // 如果更新了计费相关字段，需要重新验证
      if (
        data.billing_mode ||
        data.fixed_days ||
        data.daily_bid_diamond ||
        data.budget_total_diamond
      ) {
        const adSlot = await AdSlot.findByPk(campaign.ad_slot_id, {
          transaction: options.transaction
        })

        const billingMode = data.billing_mode || campaign.billing_mode

        if (billingMode === 'fixed_daily') {
          const fixedDays = data.fixed_days || campaign.fixed_days
          if (!fixedDays || fixedDays < 1) {
            throw new Error('固定包天模式必须提供包天天数（fixed_days >= 1）')
          }
          data.fixed_total_diamond = adSlot.daily_price_diamond * fixedDays
        } else if (billingMode === 'bidding') {
          const dailyBid = data.daily_bid_diamond || campaign.daily_bid_diamond
          const budgetTotal = data.budget_total_diamond || campaign.budget_total_diamond

          if (!dailyBid || dailyBid < adSlot.min_bid_diamond) {
            throw new Error(`竞价模式每日出价不能低于最低竞价: ${adSlot.min_bid_diamond}钻石`)
          }

          if (!budgetTotal || budgetTotal < adSlot.min_budget_diamond) {
            throw new Error(`竞价模式总预算不能低于最低预算: ${adSlot.min_budget_diamond}钻石`)
          }
        }
      }

      // 更新计划
      await campaign.update(data, { transaction: options.transaction })

      logger.info('更新广告计划成功', {
        campaign_id: campaignId,
        userId,
        updated_fields: Object.keys(data)
      })

      return campaign
    } catch (error) {
      logger.error('更新广告计划失败', { campaignId, userId, error: error.message, data })
      throw error
    }
  }

  /**
   * 提交计划审核（草稿 → 待审核）
   *
   * @param {number} campaignId - 计划ID
   * @param {number} userId - 用户ID（验证所有权）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告计划对象
   */
  static async submitForReview(campaignId, userId, options = {}) {
    try {
      const campaign = await AdCampaign.findOne({
        where: {
          ad_campaign_id: campaignId,
          advertiser_user_id: userId
        },
        include: [
          {
            model: AdSlot,
            as: 'adSlot',
            attributes: ['daily_price_diamond']
          }
        ],
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在或无权限: ${campaignId}`)
      }

      if (campaign.status !== 'draft') {
        throw new Error(`只能提交草稿状态的计划，当前状态: ${campaign.status}`)
      }

      // 更新状态为待审核
      await campaign.update({ status: 'pending_review' }, { transaction: options.transaction })

      /*
       * 如果是固定包天模式，冻结钻石（由路由层调用AdBillingService处理）
       * 这里只更新状态，实际的冻结操作在路由层完成
       */

      logger.info('提交计划审核成功', {
        campaign_id: campaignId,
        userId,
        billing_mode: campaign.billing_mode
      })

      return campaign
    } catch (error) {
      logger.error('提交计划审核失败', { campaignId, userId, error: error.message })
      throw error
    }
  }

  /**
   * 取消广告计划（退款处理）
   *
   * @param {number} campaignId - 计划ID
   * @param {number} userId - 用户ID（验证所有权）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告计划对象
   */
  static async cancelCampaign(campaignId, userId, options = {}) {
    try {
      const campaign = await AdCampaign.findOne({
        where: {
          ad_campaign_id: campaignId,
          advertiser_user_id: userId
        },
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在或无权限: ${campaignId}`)
      }

      // 只能取消草稿或待审核状态的计划
      if (!['draft', 'pending_review'].includes(campaign.status)) {
        throw new Error(`只能取消草稿或待审核状态的计划，当前状态: ${campaign.status}`)
      }

      // 更新状态为已取消
      await campaign.update({ status: 'cancelled' }, { transaction: options.transaction })

      // 退款处理由路由层调用AdBillingService处理

      logger.info('取消广告计划成功', { campaign_id: campaignId, userId })

      return campaign
    } catch (error) {
      logger.error('取消广告计划失败', { campaignId, userId, error: error.message })
      throw error
    }
  }

  /**
   * 获取管理端广告计划列表（分页、筛选）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.pageSize - 每页数量（默认20）
   * @param {string} options.status - 状态筛选
   * @param {string} options.billing_mode - 计费模式筛选
   * @param {number} options.advertiser_user_id - 广告主ID筛选
   * @param {number} options.ad_slot_id - 广告位ID筛选
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { list, total, page, pageSize }
   */
  static async getAdminCampaignList(options = {}) {
    try {
      const {
        page = 1,
        pageSize = 20,
        status,
        billing_mode,
        advertiser_user_id,
        ad_slot_id
      } = options

      // 构建查询条件
      const where = {}
      if (status) {
        where.status = status
      }
      if (billing_mode) {
        where.billing_mode = billing_mode
      }
      if (advertiser_user_id) {
        where.advertiser_user_id = advertiser_user_id
      }
      if (ad_slot_id) {
        where.ad_slot_id = ad_slot_id
      }

      // 查询总数
      const total = await AdCampaign.count({
        where,
        transaction: options.transaction
      })

      // 查询列表
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

      // 附加显示名称
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

      return {
        list: campaigns,
        total,
        page,
        pageSize
      }
    } catch (error) {
      logger.error('获取管理端广告计划列表失败', { error: error.message, options })
      throw error
    }
  }

  /**
   * 审核广告计划（管理员操作）
   *
   * @param {number} campaignId - 计划ID
   * @param {number} adminId - 管理员ID
   * @param {string} action - 审核操作（approve/reject）
   * @param {string} note - 审核备注
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告计划对象
   */
  static async reviewCampaign(campaignId, adminId, action, note, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error(`广告计划不存在: ${campaignId}`)
      }

      if (campaign.status !== 'pending_review') {
        throw new Error(`只能审核待审核状态的计划，当前状态: ${campaign.status}`)
      }

      if (action === 'approve') {
        // 审核通过：状态变为已审核，然后自动激活
        await campaign.update(
          {
            status: 'approved',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )

        // 自动激活（开始日期已到且结束日期未过期）
        const now = BeijingTimeHelper.createBeijingTime()
        const startDate = campaign.start_date ? new Date(campaign.start_date) : null
        const endDate = campaign.end_date ? new Date(campaign.end_date) : null

        if (endDate && endDate < now) {
          // 结束日期已过期，直接标记为已完成而非激活
          await campaign.update({ status: 'completed' }, { transaction: options.transaction })
          logger.warn('审核通过但计划已过期，标记为已完成', {
            campaign_id: campaignId,
            end_date: campaign.end_date
          })
        } else if (!startDate || startDate <= now) {
          await campaign.update({ status: 'active' }, { transaction: options.transaction })
        }

        // 扣款处理（固定包天模式）由路由层调用AdBillingService处理
      } else if (action === 'reject') {
        // 审核拒绝：状态变为已拒绝，退款
        await campaign.update(
          {
            status: 'rejected',
            reviewed_by: adminId,
            reviewed_at: BeijingTimeHelper.createBeijingTime(),
            review_note: note || null
          },
          { transaction: options.transaction }
        )

        // 退款处理由路由层调用AdBillingService处理
      } else {
        throw new Error(`无效的审核操作: ${action}`)
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

  /**
   * 获取广告计划详情（管理端，包含关联数据）
   * 管理端无需 userId 所有权校验
   *
   * @param {number} campaignId - 计划ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Object|null>} 广告计划对象或null
   */
  static async getCampaignDetailWithRelations(campaignId, options = {}) {
    return AdCampaignService.getCampaignById(campaignId, options)
  }

  /**
   * 获取广告计划统计信息（兼容路由层命名）
   *
   * @param {Object} _options - 查询选项（预留 start_date, end_date 筛选）
   * @returns {Promise<Object>} 统计信息
   */
  static async getCampaignStatistics(_options = {}) {
    return AdCampaignService.getStatistics()
  }

  /**
   * 获取广告概览仪表板
   *
   * @param {Object} _options - 查询选项
   * @returns {Promise<Object>} 包含活动统计和计费统计的仪表板数据
   */
  static async getAdDashboard(_options = {}) {
    try {
      const stats = await AdCampaignService.getStatistics()

      const AdBillingService = require('./AdBillingService')
      const billingStats = await AdBillingService.getStatistics()

      return {
        campaign_stats: stats,
        billing_stats: billingStats
      }
    } catch (error) {
      logger.error('获取广告仪表板失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取广告计划统计信息
   *
   * @returns {Promise<Object>} 统计信息
   */
  static async getStatistics() {
    try {
      // 单次查询：按状态 GROUP BY 获取所有状态计数（替代 N+1 循环查询）
      const statusCounts = await AdCampaign.findAll({
        attributes: [
          'status',
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'count']
        ],
        group: ['status'],
        raw: true
      })

      // 单次查询：按计费模式 GROUP BY
      const billingModeCounts = await AdCampaign.findAll({
        attributes: [
          'billing_mode',
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'count']
        ],
        group: ['billing_mode'],
        raw: true
      })

      // 单次查询：总消耗
      const spendResult = await AdCampaign.findOne({
        attributes: [
          [
            AdCampaign.sequelize.fn('SUM', AdCampaign.sequelize.col('budget_spent_diamond')),
            'total_spend'
          ],
          [AdCampaign.sequelize.fn('COUNT', AdCampaign.sequelize.col('ad_campaign_id')), 'total']
        ],
        raw: true
      })

      // 组装状态统计（确保所有状态都有值，未查到的默认 0）
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

      // 组装计费模式统计
      const byBillingMode = { fixed_daily: 0, bidding: 0 }
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

module.exports = AdCampaignService
