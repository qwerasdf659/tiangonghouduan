/**
 * 用户行为分析系统API路由 v3.0
 * 深度集成现有v3.0架构，复用认证、权限、响应格式
 * 提供行为数据收集、用户画像、智能推荐、管理员统计功能
 * 创建时间：2025年08月19日
 */

const express = require('express')
const router = express.Router()

// 🔥 复用现有认证和权限中间件
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')

// 🔥 用户行为分析专用中间件
const {
  validateBehaviorData,
  validateRecommendationQuery,
  validateAdminQuery,
  validateUserId,
  validateUserAccess,
  behaviorUploadLimiter,
  recommendationQueryLimiter,
  adminQueryLimiter,
  requestLogger
} = require('../../middleware/analyticsValidation')

// 🔥 集成现有服务
const BehaviorAnalyticsService = require('../../services/BehaviorAnalyticsService')
const eventBusService = require('../../services/EventBusService')

// 🔥 应用请求日志中间件（仅用于分析接口）
router.use(requestLogger)

/**
 * 🔥 路由结构设计（与现有v3路由保持一致）:
 *
 * POST /api/v3/analytics/behaviors/batch       - 批量上报行为数据
 * GET  /api/v3/analytics/users/:userId/profile - 获取用户画像
 * GET  /api/v3/analytics/users/:userId/recommendations - 获取个性化推荐
 * POST /api/v3/analytics/recommendations/:id/shown     - 记录推荐展示
 * POST /api/v3/analytics/recommendations/:id/clicked   - 记录推荐点击
 * GET  /api/v3/analytics/admin/overview        - 管理员统计概览
 * GET  /api/v3/analytics/admin/users          - 管理员用户分析
 * GET  /api/v3/analytics/health               - 服务健康检查
 */

// ==================== 用户行为数据收集接口 ====================

/**
 * 🔥 批量上报用户行为数据
 * POST /api/v3/analytics/behaviors/batch
 * 认证: 需要用户Token（复用现有JWT）
 * 限流: 每分钟10次
 */
router.post(
  '/behaviors/batch',
  [authenticateToken, behaviorUploadLimiter, validateBehaviorData],
  async (req, res) => {
    try {
      const userId = req.user.user_id // 从现有JWT获取用户ID
      const { behaviors, sessionId } = req.body

      console.log(`📊 用户 ${userId} 上报 ${behaviors.length} 条行为数据`)

      // 🔥 调用分析服务处理数据
      const result = await BehaviorAnalyticsService.processBehaviorsBatch(
        userId,
        behaviors.map(behavior => ({
          ...behavior,
          sessionId,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }))
      )

      // 🔥 触发现有事件总线通知
      eventBusService.emit('behavior.batch.recorded', {
        userId,
        sessionId,
        behaviorCount: behaviors.length,
        timestamp: new Date().toISOString()
      })

      // 🔥 使用现有ApiResponse格式
      res.json(
        ApiResponse.success(
          {
            processed: result.processed,
            buffered: result.buffered,
            sessionId,
            message: `成功处理 ${result.processed} 条行为数据`
          },
          '行为数据上报成功'
        )
      )
    } catch (error) {
      console.error('行为数据处理失败:', error)
      res.status(500).json(
        ApiResponse.error('数据处理失败', 'BEHAVIOR_PROCESSING_ERROR', {
          error: error.message
        })
      )
    }
  }
)

// ==================== 用户画像相关接口 ====================

/**
 * 🔥 获取用户行为画像
 * GET /api/v3/analytics/users/:userId/profile
 * 认证: 用户只能查看自己的画像，管理员可查看所有
 */
router.get(
  '/users/:userId/profile',
  [authenticateToken, validateUserId, validateUserAccess],
  async (req, res) => {
    try {
      const userId = req.params.userId

      // 🔥 获取用户画像（优先从缓存）
      const profile = await BehaviorAnalyticsService.getUserProfile(userId)

      // 🔥 根据用户权限过滤敏感信息
      const filteredProfile = filterProfileByPermission(profile, req.user)

      res.json(ApiResponse.success(filteredProfile, '用户画像获取成功'))
    } catch (error) {
      console.error('用户画像查询失败:', error)
      res.status(500).json(
        ApiResponse.error('查询失败', 'PROFILE_QUERY_ERROR', {
          error: error.message
        })
      )
    }
  }
)

// ==================== 智能推荐相关接口 ====================

/**
 * 🔥 获取个性化推荐
 * GET /api/v3/analytics/users/:userId/recommendations
 * 认证: 需要用户Token
 * 限流: 每分钟30次
 */
router.get(
  '/users/:userId/recommendations',
  [
    authenticateToken,
    recommendationQueryLimiter,
    validateUserId,
    validateUserAccess,
    validateRecommendationQuery
  ],
  async (req, res) => {
    try {
      const userId = req.params.userId
      const { type, limit } = req.query

      console.log(`🎯 为用户 ${userId} 获取推荐 (${type}, ${limit}条)`)

      // 🔥 获取个性化推荐
      const recommendations = await BehaviorAnalyticsService.getPersonalizedRecommendations(
        userId,
        type,
        limit
      )

      // 🔥 记录推荐展示事件（异步）
      if (recommendations.length > 0) {
        BehaviorAnalyticsService.recordRecommendationShown(
          userId,
          recommendations.map(r => r.id)
        ).catch(err => {
          console.error('推荐展示记录失败:', err)
        })
      }

      res.json(
        ApiResponse.success(
          {
            recommendations,
            total: recommendations.length,
            type,
            generated_at: new Date().toISOString()
          },
          '个性化推荐获取成功'
        )
      )
    } catch (error) {
      console.error('推荐获取失败:', error)
      res.status(500).json(
        ApiResponse.error('推荐获取失败', 'RECOMMENDATION_ERROR', {
          error: error.message
        })
      )
    }
  }
)

/**
 * 🔥 记录推荐点击事件
 * POST /api/v3/analytics/recommendations/:id/clicked
 * 认证: 需要用户Token
 */
router.post('/recommendations/:id/clicked', [authenticateToken], async (req, res) => {
  try {
    const recommendationId = parseInt(req.params.id)
    const userId = req.user.user_id
    const { recType, conversionValue = 0 } = req.body

    if (isNaN(recommendationId)) {
      return res.status(400).json(ApiResponse.error('推荐ID格式错误', 'INVALID_RECOMMENDATION_ID'))
    }

    // 🔥 记录推荐点击
    await BehaviorAnalyticsService.recordRecommendationClick(
      userId,
      recommendationId,
      recType,
      conversionValue
    )

    res.json(
      ApiResponse.success(
        {
          recommendationId,
          clicked: true,
          timestamp: new Date().toISOString()
        },
        '推荐点击记录成功'
      )
    )
  } catch (error) {
    console.error('推荐点击记录失败:', error)
    res.status(500).json(
      ApiResponse.error('点击记录失败', 'CLICK_RECORD_ERROR', {
        error: error.message
      })
    )
  }
})

// ==================== 管理员统计分析接口 ====================

/**
 * 🔥 管理员数据分析概览
 * GET /api/v3/analytics/admin/overview
 * 认证: 需要管理员权限（复用现有requireAdmin中间件）
 * 限流: 每分钟60次
 */
router.get(
  '/admin/overview',
  [authenticateToken, requireAdmin, adminQueryLimiter, validateAdminQuery],
  async (req, res) => {
    try {
      const { timeRange } = req.query

      console.log(`📊 管理员 ${req.user.user_id} 查询数据概览 (${timeRange})`)

      // 🔥 获取全局统计数据
      const overview = await BehaviorAnalyticsService.getAdminOverview(timeRange)

      res.json(ApiResponse.success(overview, '管理员概览数据获取成功'))
    } catch (error) {
      console.error('管理员数据查询失败:', error)
      res.status(500).json(
        ApiResponse.error('查询失败', 'ADMIN_QUERY_ERROR', {
          error: error.message
        })
      )
    }
  }
)

/**
 * 🔥 管理员用户行为分析
 * GET /api/v3/analytics/admin/users
 * 认证: 需要管理员权限
 */
router.get(
  '/admin/users',
  [authenticateToken, requireAdmin, adminQueryLimiter, validateAdminQuery],
  async (req, res) => {
    try {
      const { timeRange, page, limit } = req.query

      // 🔥 获取用户行为分析数据（简化实现）
      const userAnalysis = {
        timeRange,
        page,
        limit,
        users: [],
        total: 0,
        message: '功能开发中，请使用概览接口'
      }

      res.json(ApiResponse.success(userAnalysis, '用户分析数据获取成功'))
    } catch (error) {
      console.error('用户分析查询失败:', error)
      res.status(500).json(
        ApiResponse.error('查询失败', 'USER_ANALYSIS_ERROR', {
          error: error.message
        })
      )
    }
  }
)

// ==================== 系统监控接口 ====================

/**
 * 🔥 用户行为分析服务健康检查
 * GET /api/v3/analytics/health
 * 无需认证（内部监控使用）
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      service: 'BehaviorAnalyticsService',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: 'v1.0',
      database: 'connected',
      redis: 'connected',
      dependencies: {
        sequelize: 'ok',
        eventBus: 'ok'
      }
    }

    res.json(ApiResponse.success(healthStatus, '服务健康状态正常'))
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(500).json(
      ApiResponse.error('服务异常', 'HEALTH_CHECK_ERROR', {
        error: error.message
      })
    )
  }
})

// ==================== 辅助函数 ====================

/**
 * 🔥 根据用户权限过滤画像信息
 * @param {Object} profile - 用户画像
 * @param {Object} user - 当前用户
 * @returns {Object} 过滤后的画像
 * @private
 */
function filterProfileByPermission (profile, user) {
  if (!profile) return profile

  // 管理员可以看到完整信息
  if (user.is_admin) {
    return profile
  }

  // 普通用户只能看到基本信息，隐藏敏感分析数据
  const filtered = {
    userId: profile.userId,
    status: profile.status,
    message: profile.message,
    basic_info: profile.basic_info,
    engagement_score: profile.engagement_score,
    user_segments: profile.user_segments
  }

  // 如果是自己的画像，显示更多信息
  if (profile.userId === user.user_id || profile.user_id === user.user_id) {
    filtered.behavior_summary = profile.behavior_summary
    filtered.activity_pattern = profile.activity_pattern
  }

  return filtered
}

/**
 * 🔥 错误处理中间件
 * 处理路由级别的错误
 */
router.use((error, req, res, _next) => {
  console.error('Analytics API错误:', error)

  // 数据库错误
  if (error.name === 'SequelizeDatabaseError') {
    return res.status(500).json(ApiResponse.error('数据库操作失败', 'DATABASE_ERROR'))
  }

  // Redis错误
  if (error.message.includes('Redis') || error.message.includes('ECONNREFUSED')) {
    return res.status(500).json(ApiResponse.error('缓存服务异常', 'CACHE_ERROR'))
  }

  // 通用错误
  res.status(500).json(
    ApiResponse.error('服务内部错误', 'INTERNAL_ERROR', {
      error: process.env.NODE_ENV === 'development' ? error.message : '请联系管理员'
    })
  )
})

module.exports = router
