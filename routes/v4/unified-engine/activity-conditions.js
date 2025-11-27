/**
 * 活动条件管理API路由
 *
 * @file routes/v4/unified-engine/activity-conditions.js
 * @description 管理活动参与条件配置、验证、查询
 * @group 活动条件管理
 * @route /api/v4/activities
 */

'use strict'

const express = require('express')
const router = express.Router()
const { LotteryCampaign, LotteryDraw } = require('../../../models')
const { Op } = require('sequelize')
const ActivityConditionValidator = require('../../../services/ActivityConditionValidator')
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * @route GET /api/v4/activities/available
 * @group 活动管理
 * @description 获取当前用户可参与的活动列表（自动过滤不满足条件的活动）
 * @security JWT
 * @returns {Object} 200 - 可参与的活动列表
 * @returns {Object} 401 - 未授权
 */
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 1. 获取所有进行中的活动
    const now = BeijingTimeHelper.createBeijingTime()
    const activities = await LotteryCampaign.findAll({
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

    for (const activity of activities) {
      // 验证条件
      const validation = await ActivityConditionValidator.validateUser(
        { user_id: userId },
        activity
      )

      if (validation.valid) {
        // 获取用户今日抽奖次数
        const todayStart = BeijingTimeHelper.getDayStart(now)
        const todayDrawCount = await LotteryDraw.count({
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

    return res.apiSuccess(
      `找到${availableActivities.length}个可参与的活动`,
      {
        activities: availableActivities,
        total: availableActivities.length
      }
    )
  } catch (error) {
    console.error('❌ 获取可参与活动失败:', error)
    res.apiError('获取活动列表失败', 'FETCH_ACTIVITIES_FAILED', null, error)
  }
})

/**
 * @route GET /api/v4/activities/:id/check-eligibility
 * @group 活动管理
 * @description 检查用户是否满足特定活动的参与条件
 * @security JWT
 * @param {string} id - 活动ID或活动代码
 * @returns {Object} 200 - 条件检查结果
 */
router.get('/:id/check-eligibility', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const activityId = req.params.id

    // 查找活动（支持ID或代码）
    const activity = await LotteryCampaign.findOne({
      where: {
        [Op.or]: [
          { campaign_id: activityId },
          { campaign_code: activityId }
        ]
      }
    })

    if (!activity) {
      return res.apiError('活动不存在', 'ACTIVITY_NOT_FOUND', null, null)
    }

    // 验证条件
    const validation = await ActivityConditionValidator.validateUser(
      { user_id: userId },
      activity
    )

    return res.apiSuccess(
      validation.valid ? '满足参与条件' : '不满足参与条件',
      {
        eligible: validation.valid,
        activity_id: activity.campaign_id,
        activity_name: activity.campaign_name,
        failed_conditions: validation.failedConditions,
        messages: validation.messages
      }
    )
  } catch (error) {
    console.error('❌ 检查参与条件失败:', error)
    res.apiError('检查条件失败', 'CHECK_ELIGIBILITY_FAILED', null, error)
  }
})

/**
 * @route POST /api/v4/activities/:id/participate
 * @group 活动管理
 * @description 参与活动（验证条件后执行）
 * @security JWT
 * @param {string} id - 活动ID或活动代码
 * @returns {Object} 200 - 参与结果
 */
router.post('/:id/participate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const activityId = req.params.id

    // 查找活动
    const activity = await LotteryCampaign.findOne({
      where: {
        [Op.or]: [
          { campaign_id: activityId },
          { campaign_code: activityId }
        ]
      }
    })

    if (!activity) {
      return res.apiError('活动不存在', 'ACTIVITY_NOT_FOUND', null, null)
    }

    // 验证条件
    const validation = await ActivityConditionValidator.validateUser(
      { user_id: userId },
      activity
    )

    if (!validation.valid) {
      return res.apiError(
        validation.messages.join('；'),
        'CONDITIONS_NOT_MET',
        { failed_conditions: validation.failedConditions },
        null
      )
    }

    // 条件满足，允许参与
    return res.apiSuccess(
      '条件验证通过，可以参与活动',
      {
        activity_id: activity.campaign_id,
        activity_name: activity.campaign_name,
        can_participate: true
      }
    )
  } catch (error) {
    console.error('❌ 参与活动失败:', error)
    res.apiError('参与活动失败', 'PARTICIPATE_FAILED', null, error)
  }
})

/**
 * @route POST /api/v4/activities/:campaign_code/configure-conditions
 * @group 活动管理（管理员）
 * @description 配置活动参与条件（管理员专用）
 * @security JWT + Admin
 * @param {string} campaign_code - 活动代码
 * @param {Object} participation_conditions - 参与条件配置
 * @param {Object} condition_error_messages - 错误提示语配置
 * @returns {Object} 200 - 配置成功
 */
router.post('/:campaign_code/configure-conditions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { campaign_code } = req.params
    const { participation_conditions, condition_error_messages } = req.body

    // 查找活动
    const activity = await LotteryCampaign.findOne({
      where: { campaign_code }
    })

    if (!activity) {
      return res.apiError('活动不存在', 'ACTIVITY_NOT_FOUND', null, null)
    }

    // 更新条件配置
    await activity.update({
      participation_conditions: participation_conditions || null,
      condition_error_messages: condition_error_messages || null
    })

    return res.apiSuccess(
      '活动条件配置成功',
      {
        campaign_id: activity.campaign_id,
        campaign_name: activity.campaign_name,
        participation_conditions: activity.participation_conditions,
        condition_error_messages: activity.condition_error_messages
      }
    )
  } catch (error) {
    console.error('❌ 配置活动条件失败:', error)
    res.apiError('配置条件失败', 'CONFIGURE_CONDITIONS_FAILED', null, error)
  }
})

module.exports = router
