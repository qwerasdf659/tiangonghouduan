const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const logger = new Logger('activity-conditions')

/**
 * 活动条件管理API路由
 *
 * @file routes/v4/unified-engine/activity-conditions.js
 * @description 管理活动参与条件配置、验证、查询
 * @group 活动条件管理
 * @route /api/v4/activities
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 ActivityService 封装所有活动管理逻辑
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')

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

    // 🎯 通过 ServiceManager 获取 ActivityService
    const ActivityService = req.app.locals.services.getService('activity')

    // 🎯 调用服务层方法
    const result = await ActivityService.getAvailableActivitiesForUser(userId)

    return res.apiSuccess(result, `找到${result.total}个可参与的活动`)
  } catch (error) {
    logger.error('❌ 获取可参与活动失败:', error)
    return res.apiError('获取活动列表失败', 'FETCH_ACTIVITIES_FAILED', null, error)
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

    // 🎯 通过 ServiceManager 获取 ActivityService
    const ActivityService = req.app.locals.services.getService('activity')

    // 🎯 调用服务层方法
    const result = await ActivityService.checkEligibility(userId, activityId)

    return res.apiSuccess(result, result.eligible ? '满足参与条件' : '不满足参与条件')
  } catch (error) {
    logger.error('❌ 检查参与条件失败:', error)

    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }

    return res.apiError('检查条件失败', 'CHECK_ELIGIBILITY_FAILED', null, error)
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

    // 🎯 通过 ServiceManager 获取 ActivityService
    const ActivityService = req.app.locals.services.getService('activity')

    // 🎯 调用服务层方法检查资格
    const validation = await ActivityService.checkEligibility(userId, activityId)

    if (!validation.eligible) {
      return res.apiError(
        validation.messages.join('；'),
        'CONDITIONS_NOT_MET',
        { failed_conditions: validation.failed_conditions },
        400
      )
    }

    // 条件满足，允许参与
    return res.apiSuccess(
      {
        activity_id: validation.activity_id,
        activity_name: validation.activity_name,
        can_participate: true
      },
      '条件验证通过，可以参与活动'
    )
  } catch (error) {
    logger.error('❌ 参与活动失败:', error)

    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(error.message, error.code, null, 404)
    }

    return res.apiError('参与活动失败', 'PARTICIPATE_FAILED', null, error)
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
router.post(
  '/:campaign_code/configure-conditions',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { campaign_code } = req.params
      const { participation_conditions, condition_error_messages } = req.body

      // 🎯 通过 ServiceManager 获取 ActivityService
      const ActivityService = req.app.locals.services.getService('activity')

      // 🎯 调用服务层方法
      const result = await ActivityService.configureConditions(
        campaign_code,
        participation_conditions,
        condition_error_messages
      )

      return res.apiSuccess(result, '活动条件配置成功')
    } catch (error) {
      logger.error('❌ 配置活动条件失败:', error)

      if (error.code === 'ACTIVITY_NOT_FOUND') {
        return res.apiError(error.message, error.code, null, 404)
      }

      return res.apiError('配置条件失败', 'CONFIGURE_CONDITIONS_FAILED', null, error)
    }
  }
)

module.exports = router
