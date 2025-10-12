/**
 * 抽奖管理模块
 *
 * @description 抽奖管理相关路由，包括强制中奖、强制不中奖、概率调整、用户特定队列等
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  validators,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

/**
 * POST /force-win - 强制用户中奖
 *
 * @description 管理员强制指定用户在下次抽奖中获胜
 * @route POST /api/v4/unified-engine/admin/lottery-management/force-win
 * @access Private (需要管理员权限)
 */
router.post('/force-win', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id, reason = '管理员强制中奖' } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 调用管理策略设置强制中奖
    const result = await sharedComponents.managementStrategy.forceWin({
      user_id: validatedUserId,
      admin_id: req.user?.id,
      reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    })

    if (result.success) {
      sharedComponents.logger.info('强制中奖设置成功', {
        user_id: validatedUserId,
        admin_id: req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.getCurrentTime()
      })

      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'force_win_set',
        reason,
        admin_id: req.user?.id,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, '强制中奖设置成功')
    } else {
      return res.apiError(result.error || '强制中奖设置失败', 'FORCE_WIN_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('强制中奖设置失败', { error: error.message })
    return res.apiInternalError('强制中奖设置失败', error.message, 'FORCE_WIN_ERROR')
  }
}))

/**
 * POST /force-lose - 强制用户不中奖
 *
 * @description 管理员强制指定用户在指定次数内不中奖
 * @route POST /api/v4/unified-engine/admin/lottery-management/force-lose
 * @access Private (需要管理员权限)
 */
router.post('/force-lose', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id, count = 1, reason = '管理员强制不中奖' } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    if (!count || isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 100) {
      return res.apiError('不中奖次数必须在1-100之间', 'INVALID_COUNT')
    }

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 调用管理策略设置强制不中奖
    const result = await sharedComponents.managementStrategy.forceLose({
      user_id: validatedUserId,
      count: parseInt(count),
      admin_id: req.user?.id,
      reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    })

    if (result.success) {
      sharedComponents.logger.info('强制不中奖设置成功', {
        user_id: validatedUserId,
        count: parseInt(count),
        admin_id: req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.getCurrentTime()
      })

      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'force_lose_set',
        count: parseInt(count),
        reason,
        admin_id: req.user?.id,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, `强制不中奖设置成功，将在接下来${count}次抽奖中不中奖`)
    } else {
      return res.apiError(result.error || '强制不中奖设置失败', 'FORCE_LOSE_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('强制不中奖设置失败', { error: error.message })
    return res.apiInternalError('强制不中奖设置失败', error.message, 'FORCE_LOSE_ERROR')
  }
}))

/**
 * POST /probability-adjust - 调整用户中奖概率
 *
 * @description 管理员调整指定用户的中奖概率
 * @route POST /api/v4/unified-engine/admin/lottery-management/probability-adjust
 * @access Private (需要管理员权限)
 */
router.post('/probability-adjust', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id, probability_multiplier, duration_minutes = 60, reason = '管理员概率调整' } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    if (!probability_multiplier || isNaN(parseFloat(probability_multiplier))) {
      return res.apiError('概率倍数无效', 'INVALID_PROBABILITY_MULTIPLIER')
    }

    const multiplier = parseFloat(probability_multiplier)
    if (multiplier < 0.1 || multiplier > 10) {
      return res.apiError('概率倍数必须在0.1-10之间', 'PROBABILITY_MULTIPLIER_OUT_OF_RANGE')
    }

    if (!duration_minutes || isNaN(parseInt(duration_minutes)) || parseInt(duration_minutes) < 1 || parseInt(duration_minutes) > 1440) {
      return res.apiError('持续时间必须在1-1440分钟之间', 'INVALID_DURATION')
    }

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 计算过期时间
    const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

    // 调用管理策略设置概率调整
    const result = await sharedComponents.managementStrategy.adjustProbability({
      user_id: validatedUserId,
      probability_multiplier: multiplier,
      expires_at: expiresAt,
      admin_id: req.user?.id,
      reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    })

    if (result.success) {
      sharedComponents.logger.info('用户概率调整成功', {
        user_id: validatedUserId,
        probability_multiplier: multiplier,
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        admin_id: req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.getCurrentTime()
      })

      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'probability_adjusted',
        probability_multiplier: multiplier,
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        reason,
        admin_id: req.user?.id,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, `用户概率调整成功，倍数${multiplier}，持续${duration_minutes}分钟`)
    } else {
      return res.apiError(result.error || '概率调整失败', 'PROBABILITY_ADJUST_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('概率调整失败', { error: error.message })
    return res.apiInternalError('概率调整失败', error.message, 'PROBABILITY_ADJUST_ERROR')
  }
}))

/**
 * POST /user-specific-queue - 设置用户特定抽奖队列
 *
 * @description 为特定用户设置专门的抽奖队列和策略
 * @route POST /api/v4/unified-engine/admin/lottery-management/user-specific-queue
 * @access Private (需要管理员权限)
 */
router.post('/user-specific-queue', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const {
      user_id,
      queue_type = 'priority',
      priority_level = 1,
      custom_strategy,
      duration_minutes = 60,
      reason = '管理员设置特定队列'
    } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    const validQueueTypes = ['priority', 'guaranteed', 'custom', 'blocked']
    if (!validQueueTypes.includes(queue_type)) {
      return res.apiError('无效的队列类型', 'INVALID_QUEUE_TYPE')
    }

    if (priority_level < 1 || priority_level > 10) {
      return res.apiError('优先级必须在1-10之间', 'INVALID_PRIORITY_LEVEL')
    }

    if (!duration_minutes || isNaN(parseInt(duration_minutes)) || parseInt(duration_minutes) < 1 || parseInt(duration_minutes) > 1440) {
      return res.apiError('持续时间必须在1-1440分钟之间', 'INVALID_DURATION')
    }

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 计算过期时间
    const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

    // 调用管理策略设置用户特定队列
    const result = await sharedComponents.managementStrategy.setUserQueue({
      user_id: validatedUserId,
      queue_type,
      priority_level: parseInt(priority_level),
      custom_strategy: custom_strategy || null,
      expires_at: expiresAt,
      admin_id: req.user?.id,
      reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    })

    if (result.success) {
      sharedComponents.logger.info('用户特定队列设置成功', {
        user_id: validatedUserId,
        queue_type,
        priority_level: parseInt(priority_level),
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        admin_id: req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.getCurrentTime()
      })

      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'user_queue_set',
        queue_type,
        priority_level: parseInt(priority_level),
        custom_strategy: custom_strategy || null,
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        reason,
        admin_id: req.user?.id,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, `用户特定队列设置成功，类型：${queue_type}，优先级：${priority_level}，持续${duration_minutes}分钟`)
    } else {
      return res.apiError(result.error || '用户队列设置失败', 'USER_QUEUE_SET_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('用户队列设置失败', { error: error.message })
    return res.apiInternalError('用户队列设置失败', error.message, 'USER_QUEUE_SET_ERROR')
  }
}))

/**
 * GET /user-status/:user_id - 获取用户抽奖管理状态
 *
 * @description 获取指定用户的所有抽奖管理状态，包括强制设置、概率调整、队列状态等
 * @route GET /api/v4/unified-engine/admin/lottery-management/user-status/:user_id
 * @access Private (需要管理员权限)
 */
router.get('/user-status/:user_id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id } = req.params

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 获取用户管理状态
    const result = await sharedComponents.managementStrategy.getUserManagementStatus(validatedUserId)

    if (result.success) {
      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        user_nickname: user.nickname,
        management_status: result.data,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, '用户管理状态获取成功')
    } else {
      return res.apiError(result.error || '获取用户管理状态失败', 'GET_USER_STATUS_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('获取用户管理状态失败', { error: error.message })
    return res.apiInternalError('获取用户管理状态失败', error.message, 'GET_USER_STATUS_ERROR')
  }
}))

/**
 * DELETE /clear-user-settings/:user_id - 清除用户的所有管理设置
 *
 * @description 清除指定用户的所有抽奖管理设置，恢复默认状态
 * @route DELETE /api/v4/unified-engine/admin/lottery-management/clear-user-settings/:user_id
 * @access Private (需要管理员权限)
 */
router.delete('/clear-user-settings/:user_id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id } = req.params
    const { reason = '管理员清除设置' } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    // 清除用户管理设置
    const result = await sharedComponents.managementStrategy.clearUserSettings({
      user_id: validatedUserId,
      admin_id: req.user?.id,
      reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    })

    if (result.success) {
      sharedComponents.logger.info('用户管理设置清除成功', {
        user_id: validatedUserId,
        admin_id: req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.getCurrentTime()
      })

      return res.apiSuccess({
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'settings_cleared',
        cleared_items: result.clearedItems || [],
        reason,
        admin_id: req.user?.id,
        timestamp: BeijingTimeHelper.getCurrentTime()
      }, '用户管理设置清除成功')
    } else {
      return res.apiError(result.error || '清除用户设置失败', 'CLEAR_USER_SETTINGS_FAILED')
    }
  } catch (error) {
    if (error.message.includes('无效的')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('清除用户设置失败', { error: error.message })
    return res.apiInternalError('清除用户设置失败', error.message, 'CLEAR_USER_SETTINGS_ERROR')
  }
}))

module.exports = router
