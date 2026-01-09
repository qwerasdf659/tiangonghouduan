const logger = require('../utils/logger').logger

/**
 * 餐厅积分抽奖系统 V4.0 - 活动管理服务（ActivityService）
 *
 * @description 活动管理服务，提供活动查询、条件验证、参与资格检查等功能
 *
 * 业务场景：
 * - 用户查询可参与的活动列表
 * - 检查用户是否满足活动参与条件
 * - 管理员配置活动参与条件
 * - 活动资格验证和用户数据验证
 *
 * 核心功能：
 * 1. 获取用户可参与活动列表 - getAvailableActivitiesForUser()
 * 2. 检查活动参与资格 - checkEligibility()
 * 3. 配置活动参与条件 - configureConditions()
 *
 * 设计原则：
 * - **Service层职责**：封装活动相关的业务逻辑和数据库操作
 * - **条件验证**：使用ActivityConditionValidator进行条件验证
 * - **错误处理**：抛出明确的业务错误，由路由层统一处理
 * - **时间处理**：统一使用北京时间
 *
 * 依赖服务：
 * - ActivityConditionValidator：活动条件验证器
 *
 * 数据模型关联：
 * - LotteryCampaign：抽奖活动表
 * - LotteryDraw：抽奖记录表
 * - User：用户表
 *
 * 创建时间：2025年12月10日
 * 使用模型：Claude Sonnet 4.5
 */

const models = require('../models')
const { Op } = require('sequelize')
const ActivityConditionValidator = require('./ActivityConditionValidator')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 活动管理服务类
 *
 * @class ActivityService
 */
class ActivityService {
  /**
   * 获取所有活动列表（管理员视角）
   *
   * @description 获取所有活动，不限制状态和时间，用于管理后台展示
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 筛选活动状态（可选）
   * @param {number} [options.limit] - 限制返回数量（可选，默认无限制）
   * @returns {Promise<Array>} 活动列表数组
   * @throws {Error} 数据库查询失败等
   */
  static async getAllActivities(options = {}) {
    const { status, limit } = options
    const whereCondition = {}

    if (status) {
      whereCondition.status = status
    }

    const queryOptions = {
      where: whereCondition,
      attributes: [
        'campaign_id',
        'campaign_name',
        'campaign_code',
        'description',
        'status',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'start_time',
        'end_time',
        'created_at',
        'updated_at'
      ],
      order: [['campaign_id', 'DESC']]
    }

    if (limit) {
      queryOptions.limit = parseInt(limit)
    }

    const campaigns = await models.LotteryCampaign.findAll(queryOptions)

    // 格式化返回数据，统一字段名称
    return campaigns.map(campaign => ({
      campaign_id: campaign.campaign_id,
      name: campaign.campaign_name, // 兼容前端期望的 name 字段
      campaign_name: campaign.campaign_name,
      campaign_code: campaign.campaign_code,
      description: campaign.description,
      status: campaign.status,
      budget_mode: campaign.budget_mode,
      pool_budget_total: Number(campaign.pool_budget_total) || 0,
      pool_budget_remaining: Number(campaign.pool_budget_remaining) || 0,
      start_time: campaign.start_time,
      end_time: campaign.end_time,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at
    }))
  }

  /**
   * 获取用户可参与的活动列表
   *
   * @description 获取当前进行中的活动，并自动过滤不满足条件的活动
   *
   * 业务规则：
   * - 只返回status='active'且在时间范围内的活动
   * - 自动验证用户是否满足参与条件
   * - 计算用户今日剩余抽奖次数
   * - 返回活动完整信息和用户数据
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 包含可参与活动列表和总数的对象
   * @throws {Error} 数据库查询失败等
   */
  static async getAvailableActivitiesForUser(userId) {
    try {
      // 1. 获取所有进行中的活动
      const now = BeijingTimeHelper.createBeijingTime()
      const activities = await models.LotteryCampaign.findAll({
        where: {
          status: 'active',
          start_time: { [Op.lte]: now },
          end_time: { [Op.gte]: now }
        },
        attributes: [
          'campaign_id',
          'campaign_name',
          'campaign_code',
          'campaign_type',
          'description',
          'banner_image_url',
          'start_time',
          'end_time',
          'cost_per_draw',
          'max_draws_per_user_daily',
          'participation_conditions',
          'condition_error_messages'
        ]
      })

      // 2. 逐个验证条件
      const availableActivities = []

      // eslint-disable-next-line no-await-in-loop
      for (const activity of activities) {
        // 验证条件
        // eslint-disable-next-line no-await-in-loop
        const validation = await ActivityConditionValidator.validateUser(
          { user_id: userId },
          activity
        )

        if (validation.valid) {
          // 获取用户今日抽奖次数（使用北京时间的今日开始时间）
          const todayStartTime = BeijingTimeHelper.todayStart()
          // eslint-disable-next-line no-await-in-loop
          const todayDrawCount = await models.LotteryDraw.count({
            where: {
              user_id: userId,
              campaign_id: activity.campaign_id,
              created_at: {
                [Op.gte]: todayStartTime
              }
            }
          })

          // 计算剩余次数
          const remainingDrawsToday = Math.max(
            0,
            activity.max_draws_per_user_daily - todayDrawCount
          )

          availableActivities.push({
            ...activity.toJSON(),
            conditions_met: true,
            remaining_draws_today: remainingDrawsToday,
            cost_per_draw: parseFloat(activity.cost_per_draw),
            user_data: validation.userData
          })
        }
      }

      return {
        activities: availableActivities,
        total: availableActivities.length
      }
    } catch (error) {
      logger.error('❌ 获取可参与活动失败:', error)
      throw error
    }
  }

  /**
   * 检查用户是否满足特定活动的参与条件
   *
   * @description 验证用户是否满足指定活动的参与资格
   *
   * @param {number} userId - 用户ID
   * @param {string|number} activityIdOrCode - 活动ID或活动代码
   * @returns {Promise<Object>} 包含资格检查结果的对象
   * @throws {Error} 活动不存在等
   */
  static async checkEligibility(userId, activityIdOrCode) {
    try {
      // 查找活动（支持ID或代码）
      const activity = await models.LotteryCampaign.findOne({
        where: {
          [Op.or]: [{ campaign_id: activityIdOrCode }, { campaign_code: activityIdOrCode }]
        }
      })

      if (!activity) {
        const error = new Error('活动不存在')
        error.code = 'ACTIVITY_NOT_FOUND'
        throw error
      }

      // 验证条件
      const validation = await ActivityConditionValidator.validateUser(
        { user_id: userId },
        activity
      )

      return {
        eligible: validation.valid,
        activity_id: activity.campaign_id,
        activity_name: activity.campaign_name,
        failed_conditions: validation.failedConditions,
        messages: validation.messages
      }
    } catch (error) {
      logger.error('❌ 检查参与条件失败:', error)
      throw error
    }
  }

  /**
   * 获取活动条件配置（管理员专用）
   *
   * @description 管理员获取指定活动的参与条件和错误提示语配置
   *
   * @param {string|number} idOrCode - 活动ID或活动代码
   * @returns {Promise<Object>} 活动条件配置
   * @throws {Error} 活动不存在
   */
  static async getConditionConfig(idOrCode) {
    const { Op } = require('sequelize')

    // 查找活动（支持ID或代码）
    const activity = await models.LotteryCampaign.findOne({
      where: {
        [Op.or]: [{ campaign_id: idOrCode }, { campaign_code: idOrCode }]
      },
      attributes: [
        'campaign_id',
        'campaign_name',
        'campaign_code',
        'participation_conditions',
        'condition_error_messages'
      ]
    })

    if (!activity) {
      const error = new Error('活动不存在')
      error.code = 'ACTIVITY_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    return {
      campaign_id: activity.campaign_id,
      campaign_name: activity.campaign_name,
      campaign_code: activity.campaign_code,
      participation_conditions: activity.participation_conditions,
      condition_error_messages: activity.condition_error_messages
    }
  }

  /**
   * 配置活动参与条件（管理员专用）
   *
   * @description 管理员配置指定活动的参与条件和错误提示语
   *
   * @param {string} campaignCode - 活动代码
   * @param {Object} participationConditions - 参与条件配置
   * @param {Object} conditionErrorMessages - 错误提示语配置
   * @returns {Promise<Object>} 包含更新后活动信息的对象
   * @throws {Error} 活动不存在等
   */
  static async configureConditions(campaignCode, participationConditions, conditionErrorMessages) {
    try {
      // 查找活动
      const activity = await models.LotteryCampaign.findOne({
        where: { campaign_code: campaignCode }
      })

      if (!activity) {
        const error = new Error('活动不存在')
        error.code = 'ACTIVITY_NOT_FOUND'
        throw error
      }

      // 更新条件配置
      await activity.update({
        participation_conditions: participationConditions || null,
        condition_error_messages: conditionErrorMessages || null
      })

      return {
        campaign_id: activity.campaign_id,
        campaign_name: activity.campaign_name,
        participation_conditions: activity.participation_conditions,
        condition_error_messages: activity.condition_error_messages
      }
    } catch (error) {
      logger.error('❌ 配置活动条件失败:', error)
      throw error
    }
  }

  /**
   * 批量获取活动预算状态
   *
   * @description 批量查询多个活动的预算状态，避免前端逐个请求
   *
   * @param {Object} options - 查询选项
   * @param {Array<number>} options.campaign_ids - 活动ID列表（可选）
   * @param {number} options.limit - 限制返回数量（默认20，最大50）
   * @returns {Promise<Object>} 活动预算状态列表和汇总
   */
  static async getBatchBudgetStatus(options = {}) {
    const { campaign_ids = [], limit = 20 } = options
    const maxLimit = Math.min(parseInt(limit) || 20, 50)

    // 构建查询条件
    const whereCondition =
      campaign_ids.length > 0 ? { campaign_id: { [Op.in]: campaign_ids } } : { status: 'active' }

    // 批量获取活动预算信息
    const campaigns = await models.LotteryCampaign.findAll({
      where: whereCondition,
      attributes: [
        'campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'status'
      ],
      limit: maxLimit,
      order: [['campaign_id', 'ASC']]
    })

    if (campaigns.length === 0) {
      return { campaigns: [], total_count: 0, summary: {} }
    }

    // 批量获取使用统计（所有活动一次查询）
    const campaignIdList = campaigns.map(c => c.campaign_id)
    const budgetStats = await models.LotteryDraw.findAll({
      where: {
        campaign_id: { [Op.in]: campaignIdList },
        prize_value_points: { [Op.gt]: 0 }
      },
      attributes: [
        'campaign_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('draw_id')), 'draw_count'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'total_consumed']
      ],
      group: ['campaign_id'],
      raw: true
    })

    // 将统计数据映射为快速查找表
    const statsMap = {}
    budgetStats.forEach(stat => {
      statsMap[stat.campaign_id] = {
        winning_draws: parseInt(stat.draw_count) || 0,
        total_consumed: parseInt(stat.total_consumed) || 0
      }
    })

    // 组装结果
    const results = campaigns.map(campaign => {
      const stats = statsMap[campaign.campaign_id] || { winning_draws: 0, total_consumed: 0 }
      const total = Number(campaign.pool_budget_total) || 0
      const remaining = Number(campaign.pool_budget_remaining) || 0
      const used = total - remaining

      return {
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        budget_mode: campaign.budget_mode,
        status: campaign.status,
        pool_budget: {
          total,
          remaining,
          used,
          usage_rate: total > 0 ? ((used / total) * 100).toFixed(2) + '%' : 'N/A'
        },
        statistics: stats
      }
    })

    // 汇总统计
    const summary = {
      total_campaigns: results.length,
      total_budget: results.reduce((sum, r) => sum + r.pool_budget.total, 0),
      total_remaining: results.reduce((sum, r) => sum + r.pool_budget.remaining, 0),
      total_used: results.reduce((sum, r) => sum + r.pool_budget.used, 0)
    }

    return { campaigns: results, total_count: results.length, summary }
  }

  /**
   * 获取单个活动预算配置
   *
   * @description 获取活动的预算模式、预算总额、剩余预算等配置信息
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 活动预算配置
   * @throws {Error} 活动不存在
   */
  static async getCampaignBudgetConfig(campaignId) {
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: [
        'campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining',
        'allowed_campaign_ids',
        'status'
      ]
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    return {
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      campaign_code: campaign.campaign_code,
      budget_mode: campaign.budget_mode,
      pool_budget: {
        total: Number(campaign.pool_budget_total) || 0,
        remaining: Number(campaign.pool_budget_remaining) || 0,
        used:
          (Number(campaign.pool_budget_total) || 0) - (Number(campaign.pool_budget_remaining) || 0)
      },
      allowed_campaign_ids: campaign.allowed_campaign_ids || [],
      status: campaign.status
    }
  }

  /**
   * 获取活动奖品配置
   *
   * @description 获取活动的所有奖品配置，包括积分奖品和空奖
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 奖品配置信息
   * @throws {Error} 活动不存在
   */
  static async getPrizeConfig(campaignId) {
    // 验证活动存在
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: ['campaign_id', 'campaign_name', 'campaign_code', 'budget_mode']
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 获取奖品配置
    const prizes = await models.LotteryPrize.findAll({
      where: { campaign_id: parseInt(campaignId) },
      attributes: [
        'prize_id',
        'prize_name',
        'prize_type',
        'prize_value_points',
        'win_probability',
        'stock_quantity',
        'status',
        'sort_order'
      ],
      order: [
        ['sort_order', 'ASC'],
        ['prize_id', 'ASC']
      ]
    })

    // 分析奖品结构
    const analysis = {
      total_prizes: prizes.length,
      has_empty_prize: prizes.some(p => p.prize_type === 'empty' || p.prize_value_points === 0),
      points_prizes_count: prizes.filter(p => p.prize_value_points > 0).length,
      total_probability: prizes.reduce((sum, p) => sum + Number(p.win_probability || 0), 0)
    }

    return {
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      budget_mode: campaign.budget_mode,
      prizes: prizes.map(p => ({
        prize_id: p.prize_id,
        prize_name: p.prize_name,
        prize_type: p.prize_type,
        prize_value_points: p.prize_value_points,
        win_probability: p.win_probability,
        stock_quantity: p.stock_quantity,
        status: p.status,
        sort_order: p.sort_order
      })),
      analysis
    }
  }

  /**
   * 获取活动预算消耗统计
   *
   * @description 获取活动的预算消耗详情（按时间段、按奖品等维度）
   *
   * @param {number} campaignId - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date} options.start_date - 开始日期（可选）
   * @param {Date} options.end_date - 结束日期（可选）
   * @returns {Promise<Object>} 预算消耗统计
   * @throws {Error} 活动不存在
   */
  static async getBudgetConsumptionStats(campaignId, options = {}) {
    const { start_date, end_date } = options

    // 验证活动存在
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: [
        'campaign_id',
        'campaign_name',
        'campaign_code',
        'budget_mode',
        'pool_budget_total',
        'pool_budget_remaining'
      ]
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 构建查询条件
    const drawWhere = {
      campaign_id: parseInt(campaignId),
      prize_value_points: { [Op.gt]: 0 }
    }

    if (start_date || end_date) {
      drawWhere.created_at = {}
      if (start_date) drawWhere.created_at[Op.gte] = new Date(start_date)
      if (end_date) drawWhere.created_at[Op.lte] = new Date(end_date)
    }

    // 获取消耗统计
    const consumptionStats = await models.LotteryDraw.findOne({
      where: drawWhere,
      attributes: [
        [models.sequelize.fn('COUNT', models.sequelize.col('draw_id')), 'total_draws'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'total_consumed'],
        [models.sequelize.fn('AVG', models.sequelize.col('prize_value_points')), 'avg_value'],
        [models.sequelize.fn('MAX', models.sequelize.col('prize_value_points')), 'max_value'],
        [models.sequelize.fn('MIN', models.sequelize.col('prize_value_points')), 'min_value']
      ],
      raw: true
    })

    // 按日期分组统计（最近7天）
    const dailyStats = await models.LotteryDraw.findAll({
      where: {
        campaign_id: parseInt(campaignId),
        prize_value_points: { [Op.gt]: 0 },
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      attributes: [
        [models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'date'],
        [models.sequelize.fn('COUNT', models.sequelize.col('draw_id')), 'draws'],
        [models.sequelize.fn('SUM', models.sequelize.col('prize_value_points')), 'consumed']
      ],
      group: [models.sequelize.fn('DATE', models.sequelize.col('created_at'))],
      order: [[models.sequelize.fn('DATE', models.sequelize.col('created_at')), 'DESC']],
      raw: true
    })

    const total = Number(campaign.pool_budget_total) || 0
    const remaining = Number(campaign.pool_budget_remaining) || 0

    return {
      campaign: {
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_code: campaign.campaign_code,
        budget_mode: campaign.budget_mode
      },
      budget: {
        total,
        remaining,
        used: total - remaining,
        usage_rate: total > 0 ? (((total - remaining) / total) * 100).toFixed(2) + '%' : 'N/A'
      },
      consumption: {
        total_draws: parseInt(consumptionStats?.total_draws) || 0,
        total_consumed: parseInt(consumptionStats?.total_consumed) || 0,
        avg_value: parseFloat(consumptionStats?.avg_value) || 0,
        max_value: parseInt(consumptionStats?.max_value) || 0,
        min_value: parseInt(consumptionStats?.min_value) || 0
      },
      daily_stats: dailyStats.map(d => ({
        date: d.date,
        draws: parseInt(d.draws) || 0,
        consumed: parseInt(d.consumed) || 0
      }))
    }
  }

  /**
   * 验证活动奖品配置
   *
   * @description 验证活动的奖品配置是否符合业务规则（空奖约束、概率总和等）
   *
   * @param {number} campaignId - 活动ID
   * @returns {Promise<Object>} 验证结果
   * @throws {Error} 活动不存在
   */
  static async validatePrizeConfig(campaignId) {
    // 验证活动存在
    const campaign = await models.LotteryCampaign.findByPk(parseInt(campaignId), {
      attributes: ['campaign_id', 'campaign_name', 'campaign_code', 'budget_mode']
    })

    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 使用模型静态方法验证空奖约束
    const emptyPrizeResult = await models.LotteryPrize.validateEmptyPrizeConstraint(
      parseInt(campaignId)
    )

    // 使用模型静态方法验证预算配置
    const budgetConfigResult = await models.LotteryPrize.validateCampaignBudgetConfig(
      parseInt(campaignId)
    )

    return {
      campaign_id: parseInt(campaignId),
      campaign_name: campaign.campaign_name,
      budget_mode: campaign.budget_mode,
      empty_prize_constraint: {
        valid: emptyPrizeResult.valid,
        error: emptyPrizeResult.error || null,
        empty_prizes: emptyPrizeResult.emptyPrizes || []
      },
      prize_config: budgetConfigResult,
      overall_valid: emptyPrizeResult.valid && budgetConfigResult.valid
    }
  }
}

module.exports = ActivityService
