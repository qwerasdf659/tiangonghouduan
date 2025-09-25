/**
 * 用户管理模块
 *
 * @description 用户管理相关路由，包括用户查询、积分调整等
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
  BeijingTimeHelper,
  Op
} = require('./shared/middleware')

/**
 * GET /users - 获取用户列表
 *
 * @description 获取用户列表，支持分页和搜索
 * @route GET /api/v4/unified-engine/admin/users
 * @access Private (需要管理员权限)
 */
router.get('/users', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 20, search, is_admin } = req.query

    const offset = (parseInt(page) - 1) * parseInt(limit)
    const whereClause = {}

    // 搜索条件
    if (search) {
      whereClause[Op.or] = [
        { mobile: { [Op.like]: `%${search}%` } },
        { nickname: { [Op.like]: `%${search}%` } }
      ]
    }

    // 管理员筛选
    if (is_admin !== undefined) {
      whereClause.is_admin = is_admin === 'true'
    }

    // 获取用户列表
    const { count, rows: users } = await models.User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'mobile', 'nickname', 'points', 'is_admin', 'status', 'last_login_at', 'created_at']
    })

    return res.apiSuccess({
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / parseInt(limit))
      }
    }, '用户列表获取成功')
  } catch (error) {
    sharedComponents.logger.error('用户列表获取失败', { error: error.message })
    return res.apiInternalError('用户列表获取失败', error.message, 'USER_LIST_ERROR')
  }
}))

/**
 * POST /points/adjust - 调整用户积分
 *
 * @description 调整指定用户的积分余额
 * @route POST /api/v4/unified-engine/admin/points/adjust
 * @access Private (需要管理员权限)
 */
router.post('/points/adjust', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { user_id, points, reason } = req.body

    // 参数验证
    const validatedUserId = validators.validateUserId(user_id)
    const validatedData = validators.validatePointsAdjustment(points, reason)

    // 查找用户
    const user = await models.User.findByPk(validatedUserId)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND')
    }

    const oldPoints = user.points
    const pointsChange = validatedData.points
    const newPoints = oldPoints + pointsChange

    // 防止积分为负
    if (newPoints < 0) {
      return res.apiError('调整后积分不能为负数', 'INVALID_POINTS_RESULT')
    }

    // 更新用户积分
    await user.update({
      points: newPoints,
      updated_at: BeijingTimeHelper.getCurrentTime()
    })

    // 记录积分调整历史
    await models.PointsHistory.create({
      user_id: validatedUserId,
      points_change: pointsChange,
      points_before: oldPoints,
      points_after: newPoints,
      reason: validatedData.reason,
      type: pointsChange > 0 ? 'admin_add' : 'admin_deduct',
      admin_id: req.user?.id,
      created_at: BeijingTimeHelper.getCurrentTime()
    })

    sharedComponents.logger.info('用户积分调整成功', {
      user_id: validatedUserId,
      points_change: pointsChange,
      old_points: oldPoints,
      new_points: newPoints,
      reason: validatedData.reason,
      admin_id: req.user?.id
    })

    return res.apiSuccess({
      user_id: validatedUserId,
      points_change: pointsChange,
      old_points: oldPoints,
      new_points: newPoints,
      reason: validatedData.reason,
      timestamp: BeijingTimeHelper.getCurrentTime()
    }, '积分调整成功')
  } catch (error) {
    if (error.message.includes('无效的') || error.message.includes('必须提供')) {
      return res.apiError(error.message, 'VALIDATION_ERROR')
    }
    sharedComponents.logger.error('积分调整失败', { error: error.message })
    return res.apiInternalError('积分调整失败', error.message, 'POINTS_ADJUST_ERROR')
  }
}))

module.exports = router
