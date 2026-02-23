/**
 * 广告计划服务层（AdCampaignService）
 *
 * 业务场景：
 * - 统一管理所有内容投放计划（商业广告 / 运营推广 / 系统通知）
 * - 支持三种计费模式：固定包天、竞价、免费（运营/系统类型）
 * - 商业广告走完整审核流程，运营/系统类型走简化发布流程（D1 定论：draft→active）
 * - 通过 campaign_category 区分不同类型，priority 按类型分段校验（D6 定论）
 *
 * 服务对象：
 * - /api/v4/ad/campaigns（小程序端 - 用户自己的计划）
 * - /api/v4/console/ad-campaigns（管理端 - 计划管理和审核）
 *
 * 创建时间：2026-02-18
 * 更新时间：2026-02-22（内容投放合并 — 新增运营/系统类型创建方法）
 *
 * @see docs/内容投放系统-重复功能合并方案.md
 */

const logger = require('../utils/logger').logger
const {
  AdCampaign,
  AdSlot,
  AdCreative,
  AdBillingRecord,
  AdInteractionLog,
  User
} = require('../models')

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
        ad_slot_id,
        campaign_category
      } = options

      // 构建查询条件
      const where = {}
      if (campaign_category) {
        where.campaign_category = campaign_category
      }
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
      if (campaign_category) {
        where.campaign_category = campaign_category
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
   * 创建运营内容计划（operational 类型 — 原 PopupBanner / CarouselItem）
   *
   * 简化创建流程：
   * - billing_mode 固定为 'free'
   * - status 固定为 'draft'（D1 定论：手动点"发布"切 active）
   * - priority 范围 100-899（D6 定论：Service 层强制校验）
   * - 不需要预算、竞价等计费字段
   *
   * @param {Object} data - 计划数据
   * @param {number} data.operator_user_id - 运营人员用户ID
   * @param {number} data.ad_slot_id - 广告位ID
   * @param {string} data.campaign_name - 计划名称
   * @param {string} [data.frequency_rule='once_per_day'] - 频次规则
   * @param {number} [data.frequency_value=1] - 频次参数值
   * @param {boolean} [data.force_show=false] - 是否强制弹出
   * @param {number} [data.priority=500] - 优先级（100-899）
   * @param {number} [data.slide_interval_ms=3000] - 轮播间隔（carousel 类型）
   * @param {string} [data.start_date] - 开始日期
   * @param {string} [data.end_date] - 结束日期
   * @param {string} [data.internal_notes] - 内部备注
   * @param {Object} [data.targeting_rules] - 定向规则
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的广告计划对象
   */
  static async createOperationalCampaign(data, options = {}) {
    try {
      const priority = data.priority || 500
      if (priority < 100 || priority > 899) {
        throw new Error('运营内容优先级必须在 100-899 范围内，当前值: ' + priority)
      }

      const adSlot = await AdSlot.findByPk(data.ad_slot_id, {
        transaction: options.transaction
      })
      if (!adSlot) {
        throw new Error('广告位不存在: ' + data.ad_slot_id)
      }
      if (!adSlot.is_active) {
        throw new Error('广告位未启用: ' + data.ad_slot_id)
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

      return campaign
    } catch (error) {
      logger.error('创建运营内容计划失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 创建系统通知计划（system 类型 — 原 SystemAnnouncement）
   *
   * 简化创建流程：
   * - billing_mode 固定为 'free'
   * - status 固定为 'draft'（D1 定论：手动点"发布"切 active）
   * - priority 范围 900-999（D6 定论：Service 层强制校验）
   * - force_show 默认为 true（系统通知默认强制展示）
   *
   * @param {Object} data - 计划数据
   * @param {number} data.operator_user_id - 管理员用户ID
   * @param {number} data.ad_slot_id - 广告位ID（通常为 home_announcement）
   * @param {string} data.campaign_name - 通知标题
   * @param {number} [data.priority=950] - 优先级（900-999）
   * @param {boolean} [data.force_show=true] - 是否强制展示
   * @param {string} [data.end_date] - 过期日期
   * @param {string} [data.internal_notes] - 内部备注
   * @param {Object} [data.targeting_rules] - 目标用户组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的广告计划对象
   */
  static async createSystemCampaign(data, options = {}) {
    try {
      const priority = data.priority || 950
      if (priority < 900 || priority > 999) {
        throw new Error('系统通知优先级必须在 900-999 范围内，当前值: ' + priority)
      }

      const adSlot = await AdSlot.findByPk(data.ad_slot_id, {
        transaction: options.transaction
      })
      if (!adSlot) {
        throw new Error('广告位不存在: ' + data.ad_slot_id)
      }

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

  /**
   * 发布计划（draft → active）
   * 运营/系统类型使用此方法直接激活，跳过审核流程（D1 定论）
   *
   * @param {number} campaignId - 计划ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告计划
   */
  static async publishCampaign(campaignId, options = {}) {
    try {
      const campaign = await AdCampaign.findByPk(campaignId, {
        transaction: options.transaction
      })

      if (!campaign) {
        throw new Error('计划不存在: ' + campaignId)
      }

      if (campaign.status !== 'draft') {
        throw new Error('只能发布草稿状态的计划，当前状态: ' + campaign.status)
      }

      if (!['operational', 'system'].includes(campaign.campaign_category)) {
        throw new Error(
          '只有运营/系统类型计划可以直接发布，当前类型: ' + campaign.campaign_category
        )
      }

      await campaign.update({ status: 'active' }, { transaction: options.transaction })

      logger.info('发布计划成功', {
        campaign_id: campaignId,
        category: campaign.campaign_category
      })

      return campaign
    } catch (error) {
      logger.error('发布计划失败', { campaignId, error: error.message })
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

  /**
   * 创建统一交互日志（弹窗/轮播/公告展示事件统一入口）
   *
   * @param {Object} data - 交互日志数据
   * @param {number} data.ad_campaign_id - 广告计划ID
   * @param {number} data.user_id - 用户ID
   * @param {string} data.interaction_type - 交互类型：impression/click/close/swipe
   * @param {number} [data.ad_slot_id] - 广告位ID
   * @param {Object} [data.extra_data] - 扩展数据（JSON）
   * @param {Object} [options] - 可选参数
   * @param {Object} [options.transaction] - Sequelize 事务实例
   * @returns {Promise<Object>} 创建的日志记录
   */
  static async createInteractionLog(data, options = {}) {
    const { ad_campaign_id, user_id, interaction_type, ad_slot_id = null, extra_data = null } = data
    const { transaction } = options

    const log = await AdInteractionLog.create(
      {
        ad_campaign_id,
        user_id,
        ad_slot_id,
        interaction_type,
        extra_data
      },
      { transaction }
    )

    logger.info('[AdCampaignService] 统一交互日志已创建', {
      ad_interaction_log_id: log.ad_interaction_log_id,
      ad_campaign_id,
      interaction_type,
      user_id
    })

    return log
  }

  /**
   * 获取系统通知列表（campaign_category='system'）
   *
   * 业务场景：通知中心查看系统级通知，合并自原 SystemAnnouncement
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.limit=50] - 返回数量（最大100）
   * @returns {Promise<Object>} { notifications, statistics }
   */
  static async getSystemNotifications(options = {}) {
    const { Op } = require('sequelize')
    const pageSize = Math.min(parseInt(options.limit) || 50, 100)

    const campaigns = await AdCampaign.findAll({
      where: {
        campaign_category: 'system',
        status: { [Op.in]: ['active', 'draft', 'paused'] }
      },
      include: [
        {
          model: AdCreative,
          as: 'creatives',
          attributes: ['ad_creative_id', 'title', 'text_content', 'content_type'],
          required: false
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: pageSize
    })

    const notifications = campaigns.map(c => {
      const creative = c.creatives && c.creatives[0]
      return {
        notification_id: c.ad_campaign_id,
        id: c.ad_campaign_id,
        title: creative?.title || c.campaign_name,
        content: creative?.text_content || '',
        type: 'system',
        priority: c.priority,
        is_active: c.status === 'active',
        created_at: c.created_at,
        end_date: c.end_date
      }
    })

    const activeCount = notifications.filter(n => n.is_active).length

    return {
      notifications,
      statistics: {
        total: notifications.length,
        active: activeCount,
        unread: activeCount
      }
    }
  }

  /**
   * 获取单条系统通知详情
   *
   * @param {number} notificationId - 通知ID（即 ad_campaign_id）
   * @param {Object} options - 选项
   * @param {number} [options.userId] - 当前用户ID（用于记录浏览日志）
   * @returns {Promise<Object>} 通知详情
   */
  static async getSystemNotificationById(notificationId, options = {}) {
    const campaign = await AdCampaign.findByPk(parseInt(notificationId), {
      include: [
        {
          model: AdCreative,
          as: 'creatives',
          attributes: ['ad_creative_id', 'title', 'text_content', 'content_type'],
          required: false
        }
      ]
    })

    if (!campaign || campaign.campaign_category !== 'system') {
      return null
    }

    const creative = campaign.creatives && campaign.creatives[0]

    if (options.userId) {
      AdInteractionLog.create({
        ad_campaign_id: campaign.ad_campaign_id,
        user_id: options.userId,
        interaction_type: 'impression',
        extra_data: { source: 'notification_detail' }
      }).catch(err => {
        logger.warn('[AdCampaignService] 记录通知浏览日志失败', { error: err.message })
      })
    }

    return {
      notification_id: campaign.ad_campaign_id,
      id: campaign.ad_campaign_id,
      type: 'system',
      title: creative?.title || campaign.campaign_name,
      content: creative?.text_content || '',
      is_read: true,
      created_at: campaign.created_at,
      priority: campaign.priority,
      end_date: campaign.end_date
    }
  }

  /**
   * 发送系统通知（创建 system 类型 campaign + text creative）
   *
   * @param {Object} data - 通知数据
   * @param {string} data.title - 通知标题
   * @param {string} data.content - 通知内容
   * @param {string} [data.target='all'] - 目标用户
   * @param {number} data.sender_user_id - 发送者用户ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 数据库事务
   * @returns {Promise<Object>} 发送结果
   */
  static async sendSystemNotification(data, options = {}) {
    const { title, content, target = 'all', sender_user_id } = data

    const announcementSlot = await AdSlot.findOne({
      where: { slot_type: 'announcement', is_active: true },
      transaction: options.transaction
    })

    if (!announcementSlot) {
      throw new Error('系统公告广告位未配置')
    }

    const campaign = await this.createSystemCampaign(
      {
        ad_slot_id: announcementSlot.ad_slot_id,
        campaign_name: title,
        advertiser_user_id: sender_user_id,
        targeting_rules: target !== 'all' ? { target_groups: target } : null,
        internal_notes: `通过通知中心发送，管理员ID: ${sender_user_id}`
      },
      options
    )

    await AdCreative.create(
      {
        ad_campaign_id: campaign.ad_campaign_id,
        title,
        content_type: 'text',
        text_content: content,
        link_type: 'none',
        review_status: 'approved'
      },
      { transaction: options.transaction }
    )

    logger.info('[AdCampaignService] 发送系统通知成功', {
      ad_campaign_id: campaign.ad_campaign_id,
      title
    })

    return {
      notification_id: campaign.ad_campaign_id,
      title,
      content,
      type: 'system',
      created_at: campaign.created_at
    }
  }
}

module.exports = AdCampaignService
