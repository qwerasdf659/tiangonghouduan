/**
 * 系统监控模块
 *
 * @description 系统状态监控、仪表板、公告管理、反馈管理相关路由
 * @version 4.0.0
 * @date 2025-09-29（扩展公告和反馈管理）
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  getSimpleSystemStats,
  adminAuthMiddleware,
  asyncHandler,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

/**
 * GET /status - 获取系统状态
 *
 * @description 获取系统运行状态、数据库连接状态、Redis状态等
 * @route GET /api/v4/admin/status
 * @access Private (需要管理员权限)
 */
router.get('/status', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    // 获取系统统计信息
    const systemStats = await getSimpleSystemStats()

    // 获取数据库连接状态
    let dbStatus = 'connected'
    try {
      await models.sequelize.authenticate()
    } catch (error) {
      dbStatus = 'disconnected'
      sharedComponents.logger.error('数据库连接检查失败', { error: error.message })
    }

    // 获取抽奖引擎状态
    const engineStatus = {
      initialized: !!sharedComponents.lotteryEngine,
      strategies: {
        management: !!sharedComponents.managementStrategy
      },
      performance: sharedComponents.performanceMonitor.getStats ? sharedComponents.performanceMonitor.getStats() : {}
    }

    const statusInfo = {
      system: systemStats.system,
      database: {
        status: dbStatus,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME
      },
      lottery_engine: engineStatus,
      api: {
        version: '4.0.0',
        last_check: BeijingTimeHelper.apiTimestamp()
      }
    }

    return res.apiSuccess(statusInfo, '系统状态获取成功')
  } catch (error) {
    sharedComponents.logger.error('系统状态获取失败', { error: error.message })
    return res.apiInternalError('系统状态获取失败', error.message, 'SYSTEM_STATUS_ERROR')
  }
}))

/**
 * GET /dashboard - 获取管理员仪表板数据
 *
 * @description 获取管理员仪表板展示数据，包括用户统计、抽奖统计、系统概览
 * @route GET /api/v4/admin/dashboard
 * @access Private (需要管理员权限)
 */
router.get('/dashboard', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    // 获取基础统计
    const systemStats = await getSimpleSystemStats()

    // 获取今日详细统计
    const today = BeijingTimeHelper.createBeijingTime()
    const todayStart = new Date(today.setHours(0, 0, 0, 0))

    const [todayLotteries, todayWins, todayNewUsers] = await Promise.all([
      models.LotteryDraw.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          }
        }
      }),
      models.LotteryDraw.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          },
          is_winner: true
        }
      }),
      models.User.count({
        where: {
          created_at: {
            [require('sequelize').Op.gte]: todayStart
          }
        }
      })
    ])

    // 获取抽奖引擎性能统计
    let engineStats = {}
    try {
      if (sharedComponents.performanceMonitor.getDetailedStats) {
        engineStats = sharedComponents.performanceMonitor.getDetailedStats()
      }
    } catch (error) {
      sharedComponents.logger.warn('获取引擎统计失败', { error: error.message })
    }

    const dashboardData = {
      overview: {
        total_users: systemStats.users.total,
        active_users: systemStats.users.active,
        total_lotteries: systemStats.lottery.total,
        win_rate: systemStats.lottery.win_rate
      },
      today: {
        new_users: todayNewUsers,
        lottery_draws: todayLotteries,
        wins: todayWins,
        win_rate: todayLotteries > 0 ? ((todayWins / todayLotteries) * 100).toFixed(2) : 0
      },
      system: {
        uptime: systemStats.system.uptime,
        memory_usage: systemStats.system.memory,
        cpu_usage: systemStats.system.cpu_usage,
        timestamp: systemStats.system.timestamp
      },
      engine: engineStats,
      last_updated: BeijingTimeHelper.apiTimestamp()
    }

    return res.apiSuccess(dashboardData, '仪表板数据获取成功')
  } catch (error) {
    sharedComponents.logger.error('仪表板数据获取失败', { error: error.message })
    return res.apiInternalError('仪表板数据获取失败', error.message, 'DASHBOARD_ERROR')
  }
}))

/**
 * GET /management-status - 获取管理策略状态
 *
 * @description 获取抽奖管理策略的当前状态和配置
 * @route GET /api/v4/admin/management-status
 * @access Private (需要管理员权限)
 */
router.get('/management-status', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const result = await sharedComponents.managementStrategy.getStatus()

    if (result.success) {
      return res.apiSuccess(result.data, '管理状态获取成功')
    } else {
      return res.apiError(result.error || '管理状态获取失败', 'MANAGEMENT_STATUS_FAILED')
    }
  } catch (error) {
    sharedComponents.logger.error('管理状态获取失败', { error: error.message })
    return res.apiInternalError('管理状态获取失败', error.message, 'MANAGEMENT_STATUS_ERROR')
  }
}))

// ===================== 公告管理功能 =====================

/**
 * POST /announcements - 创建系统公告
 * @route POST /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.post('/announcements', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const {
      title,
      content,
      type = 'notice',
      priority = 'medium',
      target_groups = null,
      expires_at = null,
      internal_notes = null
    } = req.body

    // 验证必需参数
    if (!title || !content) {
      return res.apiError('标题和内容不能为空', 'INVALID_PARAMETERS')
    }

    // 创建公告
    const announcement = await models.SystemAnnouncement.create({
      title: title.trim(),
      content: content.trim(),
      type,
      priority,
      target_groups,
      expires_at: expires_at ? new Date(expires_at) : null,
      admin_id: req.user.user_id,
      internal_notes,
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    sharedComponents.logger.info('管理员创建系统公告', {
      admin_id: req.user.user_id,
      announcement_id: announcement.id,
      title: announcement.title,
      type: announcement.type
    })

    return res.apiSuccess({
      announcement: announcement.toJSON()
    }, '公告创建成功')
  } catch (error) {
    sharedComponents.logger.error('创建公告失败', { error: error.message })
    return res.apiInternalError('创建公告失败', error.message, 'ANNOUNCEMENT_CREATE_ERROR')
  }
}))

/**
 * GET /announcements - 获取所有公告
 * @route GET /api/v4/admin/announcements
 * @access Private (需要管理员权限)
 */
router.get('/announcements', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const {
      type = null,
      priority = null,
      is_active = null,
      limit = 20,
      offset = 0
    } = req.query

    const whereClause = {}
    if (type && type !== 'all') whereClause.type = type
    if (priority && priority !== 'all') whereClause.priority = priority
    if (is_active !== null) whereClause.is_active = is_active === 'true'

    const announcements = await models.SystemAnnouncement.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      include: [{
        model: models.User,
        as: 'creator',
        attributes: ['user_id', 'nickname']
      }]
    })

    return res.apiSuccess({
      announcements: announcements.map(a => a.toJSON()),
      total: announcements.length
    }, '获取公告列表成功')
  } catch (error) {
    sharedComponents.logger.error('获取公告列表失败', { error: error.message })
    return res.apiInternalError('获取公告列表失败', error.message, 'ANNOUNCEMENT_LIST_ERROR')
  }
}))

/**
 * PUT /announcements/:id - 更新公告
 * @route PUT /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.put('/announcements/:id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body

    const announcement = await models.SystemAnnouncement.findByPk(id)
    if (!announcement) {
      return res.apiError('公告不存在', 'ANNOUNCEMENT_NOT_FOUND')
    }

    // 更新公告
    await announcement.update({
      ...updateData,
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    sharedComponents.logger.info('管理员更新系统公告', {
      admin_id: req.user.user_id,
      announcement_id: id,
      changes: Object.keys(updateData)
    })

    return res.apiSuccess({
      announcement: announcement.toJSON()
    }, '公告更新成功')
  } catch (error) {
    sharedComponents.logger.error('更新公告失败', { error: error.message })
    return res.apiInternalError('更新公告失败', error.message, 'ANNOUNCEMENT_UPDATE_ERROR')
  }
}))

/**
 * DELETE /announcements/:id - 删除公告
 * @route DELETE /api/v4/admin/announcements/:id
 * @access Private (需要管理员权限)
 */
router.delete('/announcements/:id', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params

    const announcement = await models.SystemAnnouncement.findByPk(id)
    if (!announcement) {
      return res.apiError('公告不存在', 'ANNOUNCEMENT_NOT_FOUND')
    }

    await announcement.destroy()

    sharedComponents.logger.info('管理员删除系统公告', {
      admin_id: req.user.user_id,
      announcement_id: id,
      title: announcement.title
    })

    return res.apiSuccess({}, '公告删除成功')
  } catch (error) {
    sharedComponents.logger.error('删除公告失败', { error: error.message })
    return res.apiInternalError('删除公告失败', error.message, 'ANNOUNCEMENT_DELETE_ERROR')
  }
}))

// ===================== 反馈管理功能 =====================

/**
 * GET /feedbacks - 获取所有用户反馈
 * @route GET /api/v4/admin/feedbacks
 * @access Private (需要管理员权限)
 */
router.get('/feedbacks', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const {
      status = null,
      category = null,
      priority = null,
      limit = 20,
      offset = 0
    } = req.query

    const whereClause = {}
    if (status && status !== 'all') whereClause.status = status
    if (category && category !== 'all') whereClause.category = category
    if (priority && priority !== 'all') whereClause.priority = priority

    const feedbacks = await models.Feedback.findAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'], // 高优先级优先
        ['created_at', 'ASC'] // 早提交的优先处理
      ],
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: models.User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ]
    })

    return res.apiSuccess({
      feedbacks: feedbacks.map(f => f.toJSON()),
      total: feedbacks.length
    }, '获取反馈列表成功')
  } catch (error) {
    sharedComponents.logger.error('获取反馈列表失败', { error: error.message })
    return res.apiInternalError('获取反馈列表失败', error.message, 'FEEDBACK_LIST_ERROR')
  }
}))

/**
 * POST /feedbacks/:id/reply - 回复用户反馈
 * @route POST /api/v4/admin/feedbacks/:id/reply
 * @access Private (需要管理员权限)
 */
router.post('/feedbacks/:id/reply', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const { reply_content, internal_notes = null } = req.body

    if (!reply_content || reply_content.trim().length === 0) {
      return res.apiError('回复内容不能为空', 'INVALID_PARAMETERS')
    }

    const feedback = await models.Feedback.findByPk(id)
    if (!feedback) {
      return res.apiError('反馈不存在', 'FEEDBACK_NOT_FOUND')
    }

    // 更新反馈状态和回复
    await feedback.update({
      reply_content: reply_content.trim(),
      admin_id: req.user.user_id,
      replied_at: BeijingTimeHelper.createBeijingTime(),
      status: 'replied',
      internal_notes,
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    sharedComponents.logger.info('管理员回复用户反馈', {
      admin_id: req.user.user_id,
      feedback_id: id,
      user_id: feedback.user_id
    })

    return res.apiSuccess({
      feedback: feedback.toJSON()
    }, '反馈回复成功')
  } catch (error) {
    sharedComponents.logger.error('回复反馈失败', { error: error.message })
    return res.apiInternalError('回复反馈失败', error.message, 'FEEDBACK_REPLY_ERROR')
  }
}))

/**
 * PUT /feedbacks/:id/status - 更新反馈状态
 * @route PUT /api/v4/admin/feedbacks/:id/status
 * @access Private (需要管理员权限)
 */
router.put('/feedbacks/:id/status', adminAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const { status, internal_notes = null } = req.body

    const feedback = await models.Feedback.findByPk(id)
    if (!feedback) {
      return res.apiError('反馈不存在', 'FEEDBACK_NOT_FOUND')
    }

    await feedback.update({
      status,
      internal_notes,
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    sharedComponents.logger.info('管理员更新反馈状态', {
      admin_id: req.user.user_id,
      feedback_id: id,
      new_status: status
    })

    return res.apiSuccess({
      feedback: feedback.toJSON()
    }, '反馈状态更新成功')
  } catch (error) {
    sharedComponents.logger.error('更新反馈状态失败', { error: error.message })
    return res.apiInternalError('更新反馈状态失败', error.message, 'FEEDBACK_STATUS_ERROR')
  }
}))

module.exports = router
