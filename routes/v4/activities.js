/**
 * 餐厅积分抽奖系统 V4.0 - 活动条件API路由
 *
 * 顶层路径：/api/v4/activities
 *
 * 功能：
 * - 获取可参与的活动列表（管理员查看）
 * - 检查用户活动参与资格（管理员测试）
 * - 参与活动验证（管理员模拟测试）
 * - 配置活动参与条件（管理员）
 *
 * 权限控制（2026-01-08已决策）：
 * - **所有端点仅管理员可调用**（文档0.2决策：activities上线范围 = 仅管理员）
 * - 普通用户不开放此域接口
 *
 * 业务规则：
 * - available 端点：返回所有活动列表（管理员查看）
 * - check-eligibility：管理员测试校验用户资格
 * - participate：管理员模拟测试参与资格
 * - configure-conditions：仅管理员可配置活动条件
 *
 * 创建时间：2026年01月08日
 * 更新时间：2026年01月09日（权限收紧：全部端点仅管理员）
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../utils/logger').logger
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const ActivityService = require('../../services/ActivityService')
 */

/**
 * @route GET /api/v4/activities
 * @desc 获取所有活动列表（管理员视角，不限制状态和时间）
 * @access Private（仅管理员）
 *
 * @query {string} [status] - 筛选活动状态（可选）
 * @query {number} [limit] - 限制返回数量（可选）
 *
 * @returns {Object} 活动列表
 * @returns {boolean} return.success - 请求是否成功
 * @returns {string} return.code - 业务状态码
 * @returns {string} return.message - 提示消息
 * @returns {Object} return.data - 业务数据
 * @returns {Array} return.data.activities - 活动列表
 * @returns {number} return.data.total - 活动总数
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit } = req.query

    logger.info('获取所有活动列表', {
      status,
      limit,
      admin_id: req.user.user_id,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    const activities = await ActivityService.getAllActivities({ status, limit })

    logger.info('获取所有活动列表成功', {
      total: activities.length,
      admin_id: req.user.user_id,
      request_id: req.id
    })

    return res.apiSuccess(
      { activities, total: activities.length },
      '获取所有活动列表成功',
      'ACTIVITIES_LIST_SUCCESS'
    )
  } catch (error) {
    logger.error('获取所有活动列表失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      request_id: req.id
    })

    return res.apiError(
      '获取所有活动列表失败',
      'ACTIVITIES_LIST_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @route GET /api/v4/activities/available
 * @desc 获取活动列表（管理员查看）
 * @access Private（仅管理员 - 文档0.2决策）
 *
 * @returns {Object} 活动列表
 * @returns {boolean} return.success - 请求是否成功
 * @returns {string} return.code - 业务状态码
 * @returns {string} return.message - 提示消息
 * @returns {Object} return.data - 业务数据
 * @returns {Array} return.data.activities - 活动列表
 * @returns {number} return.data.total - 活动总数
 */
router.get('/available', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user_id = req.user.user_id

    logger.info('获取用户可参与的活动列表', {
      user_id,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    // 调用 ActivityService 获取可参与的活动
    const result = await ActivityService.getAvailableActivitiesForUser(user_id)

    logger.info('获取可参与活动成功', {
      user_id,
      total: result.total,
      request_id: req.id
    })

    return res.apiSuccess(result, '获取可参与活动列表成功', 'ACTIVITIES_AVAILABLE_SUCCESS')
  } catch (error) {
    logger.error('获取可参与活动失败', {
      error: error.message,
      user_id: req.user?.user_id,
      request_id: req.id
    })

    return res.apiError(
      '获取可参与活动列表失败',
      'ACTIVITIES_AVAILABLE_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @route GET /api/v4/activities/:idOrCode/check-eligibility
 * @desc 检查用户是否满足特定活动的参与条件（管理员测试校验用）
 * @access Private（仅管理员 - 文档0.2决策）
 *
 * @param {string|number} idOrCode - 活动ID或活动代码
 *
 * @returns {Object} 资格检查结果
 * @returns {boolean} return.data.eligible - 是否满足条件
 * @returns {number} return.data.activity_id - 活动ID
 * @returns {string} return.data.activity_name - 活动名称
 * @returns {Array} return.data.failed_conditions - 未满足的条件列表
 * @returns {Array} return.data.messages - 提示消息列表
 */
router.get('/:idOrCode/check-eligibility', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { idOrCode } = req.params
    const user_id = req.user.user_id

    logger.info('检查活动参与资格', {
      user_id,
      activity_id_or_code: idOrCode,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    // 调用 ActivityService 检查资格
    const result = await ActivityService.checkEligibility(user_id, idOrCode)

    logger.info('活动资格检查完成', {
      user_id,
      activity_id: result.activity_id,
      eligible: result.eligible,
      request_id: req.id
    })

    return res.apiSuccess(result, '活动资格检查成功', 'ELIGIBILITY_CHECK_SUCCESS')
  } catch (error) {
    logger.error('活动资格检查失败', {
      error: error.message,
      error_code: error.code,
      user_id: req.user?.user_id,
      activity_id_or_code: req.params.idOrCode,
      request_id: req.id
    })

    // 处理业务错误
    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(
        '活动不存在',
        'ACTIVITY_NOT_FOUND',
        { activity_id_or_code: req.params.idOrCode },
        404
      )
    }

    return res.apiError(
      '活动资格检查失败',
      'ELIGIBILITY_CHECK_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @route POST /api/v4/activities/:idOrCode/participate
 * @desc 尝试参与活动（管理员模拟测试用）
 * @access Private（仅管理员 - 文档0.2决策）
 *
 * @param {string|number} idOrCode - 活动ID或活动代码
 *
 * @returns {Object} 参与结果
 * @returns {boolean} return.data.can_participate - 是否可以参与
 * @returns {number} return.data.activity_id - 活动ID
 * @returns {string} return.data.activity_name - 活动名称
 * @returns {Array} return.data.reasons - 不能参与的原因（如果不能参与）
 *
 * 注意：此接口仅验证参与资格，实际抽奖需要调用 /api/v4/lottery/draw
 */
router.post('/:idOrCode/participate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { idOrCode } = req.params
    const user_id = req.user.user_id

    logger.info('用户尝试参与活动', {
      user_id,
      activity_id_or_code: idOrCode,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    // 调用 ActivityService 检查资格
    const eligibility = await ActivityService.checkEligibility(user_id, idOrCode)

    const result = {
      can_participate: eligibility.eligible,
      activity_id: eligibility.activity_id,
      activity_name: eligibility.activity_name,
      reasons: eligibility.eligible ? [] : eligibility.messages
    }

    logger.info('参与活动验证完成', {
      user_id,
      activity_id: result.activity_id,
      can_participate: result.can_participate,
      request_id: req.id
    })

    if (result.can_participate) {
      return res.apiSuccess(result, '您可以参与此活动', 'PARTICIPATION_ALLOWED')
    } else {
      return res.apiSuccess(result, '您暂时无法参与此活动', 'PARTICIPATION_NOT_ALLOWED')
    }
  } catch (error) {
    logger.error('参与活动验证失败', {
      error: error.message,
      error_code: error.code,
      user_id: req.user?.user_id,
      activity_id_or_code: req.params.idOrCode,
      request_id: req.id
    })

    // 处理业务错误
    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(
        '活动不存在',
        'ACTIVITY_NOT_FOUND',
        { activity_id_or_code: req.params.idOrCode },
        404
      )
    }

    return res.apiError('参与活动验证失败', 'PARTICIPATION_ERROR', { error: error.message }, 500)
  }
})

/**
 * @route GET /api/v4/activities/:idOrCode/conditions
 * @desc 获取活动的参与条件配置（管理员查看）
 * @access Private（需要管理员权限）
 *
 * @param {string|number} idOrCode - 活动ID或活动代码
 *
 * @returns {Object} 条件配置
 * @returns {Object} return.data.participation_conditions - 参与条件
 * @returns {Object} return.data.condition_error_messages - 条件错误提示
 */
router.get('/:idOrCode/conditions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { idOrCode } = req.params

    logger.info('管理员获取活动条件配置', {
      admin_id: req.user.user_id,
      activity_id_or_code: idOrCode,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    // 通过 Service 层查询活动条件（符合路由层规范）
    const conditionConfig = await ActivityService.getConditionConfig(idOrCode)

    return res.apiSuccess(conditionConfig, '获取活动条件配置成功', 'CONDITIONS_GET_SUCCESS')
  } catch (error) {
    // 处理 Service 层抛出的业务错误
    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(
        '活动不存在',
        'ACTIVITY_NOT_FOUND',
        { activity_id_or_code: req.params.idOrCode },
        404
      )
    }

    logger.error('获取活动条件配置失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      activity_id_or_code: req.params.idOrCode,
      request_id: req.id
    })

    return res.apiError(
      '获取活动条件配置失败',
      'CONDITIONS_GET_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @route POST /api/v4/activities/:code/configure-conditions
 * @desc 配置活动参与条件（管理员专用）
 * @access Private（需要管理员权限）
 *
 * @param {string} code - 活动代码
 * @body {Object} participation_conditions - 参与条件配置
 * @body {Object} condition_error_messages - 条件错误提示配置
 *
 * @returns {Object} 更新后的活动配置
 *
 * 条件配置示例：
 * {
 *   "participation_conditions": {
 *     "user_points": { "operator": ">=", "value": 100 },
 *     "user_level": { "operator": ">=", "value": 2 }
 *   },
 *   "condition_error_messages": {
 *     "user_points": "您的积分不足100分，快去消费获取积分吧！",
 *     "user_level": "您的等级不足，需要达到2级才能参与"
 *   }
 * }
 */
router.post('/:code/configure-conditions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { code } = req.params
    const { participation_conditions, condition_error_messages } = req.body

    logger.info('管理员配置活动条件', {
      admin_id: req.user.user_id,
      campaign_code: code,
      has_conditions: !!participation_conditions,
      has_messages: !!condition_error_messages,
      request_id: req.id
    })

    // P1-9：通过 ServiceManager 获取 ActivityService（snake_case key）
    const ActivityService = req.app.locals.services.getService('activity')
    // 调用 ActivityService 配置条件
    const result = await ActivityService.configureConditions(
      code,
      participation_conditions,
      condition_error_messages
    )

    logger.info('活动条件配置成功', {
      admin_id: req.user.user_id,
      campaign_id: result.campaign_id,
      campaign_name: result.campaign_name,
      request_id: req.id
    })

    return res.apiSuccess(result, '活动条件配置成功', 'CONDITIONS_CONFIGURE_SUCCESS')
  } catch (error) {
    logger.error('活动条件配置失败', {
      error: error.message,
      error_code: error.code,
      admin_id: req.user?.user_id,
      campaign_code: req.params.code,
      request_id: req.id
    })

    // 处理业务错误
    if (error.code === 'ACTIVITY_NOT_FOUND') {
      return res.apiError(
        '活动不存在',
        'ACTIVITY_NOT_FOUND',
        { campaign_code: req.params.code },
        404
      )
    }

    return res.apiError(
      '活动条件配置失败',
      'CONDITIONS_CONFIGURE_ERROR',
      { error: error.message },
      500
    )
  }
})

module.exports = router
