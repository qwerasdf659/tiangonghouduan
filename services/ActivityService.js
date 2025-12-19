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
          // 获取用户今日抽奖次数
          const todayStart = BeijingTimeHelper.getDayStart(now)
          // eslint-disable-next-line no-await-in-loop
          const todayDrawCount = await models.LotteryDraw.count({
            where: {
              user_id: userId,
              campaign_id: activity.campaign_id,
              created_at: {
                [Op.gte]: todayStart
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
}

module.exports = ActivityService
