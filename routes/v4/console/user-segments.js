/**
 * @file 用户分层接口路由
 * @description P1 需求 B-20~B-24：用户分层统计和分析接口
 *
 * @version 1.0.0
 * @date 2026-01-31
 *
 * 接口说明：
 * - GET /segments - 获取分层统计（B-20）
 * - GET /segments/:type - 获取分层用户列表（B-21）
 * - GET /activity-heatmap - 获取活跃时段热力图（B-22）
 * - GET /exchange-preferences - 获取兑换偏好（B-23）
 * - GET /funnel - 获取行为漏斗（B-24）
 *
 * 实现规范（V1.3.0）：
 * - 路由层禁止直接 require models
 * - 通过 ServiceManager 获取服务
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @see docs/后端数据库开发任务清单-2026年1月.md P1 阶段任务
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 UserSegmentService 服务实例
 *
 * 遵循项目规范：通过 req.app.locals.services.getService 获取服务
 * 禁止直接 require 服务文件
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} UserSegmentService 静态类
 */
function getUserSegmentService(req) {
  const service = req.app.locals.services?.getService('user_segment')
  if (!service) {
    throw new Error('UserSegmentService 未在 ServiceManager 中注册')
  }
  return service
}

/**
 * 获取 models
 * @private
 * @param {Object} req - Express 请求对象
 * @returns {Object} Sequelize 模型集合
 */
function getModels(req) {
  // Phase 3 收口：通过 ServiceManager 获取 models，避免直连
  return req.models || req.app.locals.models
}

/**
 * @api {get} /api/v4/admin/users/segments 获取分层统计
 * @apiName GetSegmentStats
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-20：获取用户分层统计数据
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 分层统计数据
 * @apiSuccess {Array} data.segments 分层列表
 * @apiSuccess {Number} data.total_users 总用户数
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/segments', authenticateToken, requireRoleLevel(100), async (req, res) => {
  logger.info('获取用户分层统计', { user_id: req.user?.user_id })

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const stats = await UserSegmentService.getSegmentStats(models)

    return res.apiSuccess(stats, '获取分层统计成功')
  } catch (error) {
    logger.error('获取分层统计失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取分层统计失败', 'SEGMENT_STATS_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/users/segments/:type 获取分层用户列表
 * @apiName GetSegmentUsers
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-21：获取指定分层的用户列表
 *
 * @apiParam {String} type 分层类型（high_value/active/silent/churned）
 *
 * @apiQuery {Number} [page=1] 页码
 * @apiQuery {Number} [page_size=20] 每页数量
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data.segment 分层信息
 * @apiSuccess {Array} data.users 用户列表
 * @apiSuccess {Object} data.pagination 分页信息
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/segments/:type', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { type } = req.params
  const { page = '1', page_size = '20' } = req.query

  logger.info('获取分层用户列表', {
    segment_type: type,
    page,
    user_id: req.user?.user_id
  })

  // 验证分层类型
  const validTypes = ['high_value', 'active', 'silent', 'churned']
  if (!validTypes.includes(type)) {
    return res.apiError(
      `无效的分层类型: ${type}，有效类型: ${validTypes.join(', ')}`,
      'INVALID_SEGMENT_TYPE',
      null,
      400
    )
  }

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const result = await UserSegmentService.getSegmentUsers(models, type, {
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取分层用户列表成功')
  } catch (error) {
    logger.error('获取分层用户列表失败', {
      segment_type: type,
      error: error.message,
      stack: error.stack
    })

    return res.apiError(
      '获取分层用户列表失败',
      'SEGMENT_USERS_ERROR',
      { error: error.message },
      500
    )
  }
})

/**
 * @api {get} /api/v4/admin/users/activity-heatmap 获取活跃时段热力图
 * @apiName GetActivityHeatmap
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-22：获取用户活跃时段热力图
 *
 * @apiQuery {Number} [days=7] 统计天数
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 热力图数据
 * @apiSuccess {Array} data.heatmap 热力图矩阵（7天x24小时）
 * @apiSuccess {Object} data.peak 峰值时段
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/activity-heatmap', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { days = '7' } = req.query

  logger.info('获取活跃时段热力图', {
    days,
    user_id: req.user?.user_id
  })

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const heatmap = await UserSegmentService.getActivityHeatmap(models, {
      days: parseInt(days, 10) || 7
    })

    return res.apiSuccess(heatmap, '获取活跃时段热力图成功')
  } catch (error) {
    logger.error('获取活跃时段热力图失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取活跃时段热力图失败', 'HEATMAP_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/users/exchange-preferences 获取兑换偏好
 * @apiName GetExchangePreferences
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-23：获取用户兑换偏好统计
 *
 * @apiQuery {Number} [days=30] 统计天数
 * @apiQuery {Number} [limit=10] 返回数量
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 兑换偏好数据
 * @apiSuccess {Array} data.preferences 偏好列表
 * @apiSuccess {Object} data.statistics 统计信息
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/exchange-preferences', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { days = '30', limit = '10' } = req.query

  logger.info('获取兑换偏好', {
    days,
    limit,
    user_id: req.user?.user_id
  })

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const preferences = await UserSegmentService.getExchangePreferences(models, {
      days: parseInt(days, 10) || 30,
      limit: parseInt(limit, 10) || 10
    })

    return res.apiSuccess(preferences, '获取兑换偏好成功')
  } catch (error) {
    logger.error('获取兑换偏好失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取兑换偏好失败', 'PREFERENCES_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/console/users/funnel/trend 获取行为漏斗趋势
 * @apiName GetFunnelTrend
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription 获取用户行为漏斗的历史趋势数据，用于转化率趋势图表展示
 *
 * @apiQuery {Number} [days=7] 统计天数（默认7天，最大14天）
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 漏斗趋势数据
 * @apiSuccess {Array} data.trend 每日趋势数据
 * @apiSuccess {String} data.trend.date 日期（MM/DD格式）
 * @apiSuccess {Number} data.trend.active_count 当日活跃用户数
 * @apiSuccess {Number} data.trend.lottery_rate 抽奖转化率（%）
 * @apiSuccess {Number} data.trend.consumption_rate 消费转化率（%）
 * @apiSuccess {Number} data.trend.exchange_rate 兑换转化率（%）
 * @apiSuccess {Object} data.summary 汇总统计
 * @apiSuccess {Number} data.period_days 统计天数
 * @apiSuccess {String} data.generated_at 生成时间
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 *
 * @apiExample {curl} 请求示例:
 *   curl -X GET "http://localhost:3000/api/v4/console/users/funnel/trend?days=7" \
 *     -H "Authorization: Bearer <token>"
 *
 * @apiSuccessExample {json} 成功响应:
 *   {
 *     "success": true,
 *     "data": {
 *       "trend": [
 *         { "date": "02/01", "active_count": 100, "lottery_rate": 65.5, "consumption_rate": 40.2, "exchange_rate": 20.1 },
 *         { "date": "02/02", "active_count": 105, "lottery_rate": 68.3, "consumption_rate": 42.5, "exchange_rate": 22.0 }
 *       ],
 *       "summary": {
 *         "avg_lottery_rate": 66.9,
 *         "avg_consumption_rate": 41.35,
 *         "avg_exchange_rate": 21.05,
 *         "total_active_days": 2
 *       },
 *       "period_days": 7,
 *       "generated_at": "2026-02-05T10:00:00+08:00"
 *     },
 *     "message": "获取漏斗趋势成功"
 *   }
 */
router.get('/funnel/trend', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { days = '7' } = req.query
  const parsedDays = Math.min(parseInt(days, 10) || 7, 14) // 最大14天

  logger.info('获取行为漏斗趋势', {
    days: parsedDays,
    user_id: req.user?.user_id
  })

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const trend = await UserSegmentService.getFunnelTrend(models, {
      days: parsedDays
    })

    return res.apiSuccess(trend, '获取漏斗趋势成功')
  } catch (error) {
    logger.error('获取行为漏斗趋势失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取漏斗趋势失败', 'FUNNEL_TREND_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/users/funnel 获取行为漏斗
 * @apiName GetBehaviorFunnel
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription P1 需求 B-24：获取用户行为漏斗数据
 *
 * @apiQuery {Number} [days=7] 统计天数
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 漏斗数据
 * @apiSuccess {Array} data.funnel 漏斗阶段数据
 * @apiSuccess {Object} data.conversion_rates 转化率
 * @apiSuccess {Array} data.insights 洞察建议
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/funnel', authenticateToken, requireRoleLevel(100), async (req, res) => {
  const { days = '7' } = req.query

  logger.info('获取行为漏斗', {
    days,
    user_id: req.user?.user_id
  })

  try {
    const models = getModels(req)
    const UserSegmentService = getUserSegmentService(req)
    const funnel = await UserSegmentService.getBehaviorFunnel(models, {
      days: parseInt(days, 10) || 7
    })

    return res.apiSuccess(funnel, '获取行为漏斗成功')
  } catch (error) {
    logger.error('获取行为漏斗失败', {
      error: error.message,
      stack: error.stack
    })

    return res.apiError('获取行为漏斗失败', 'FUNNEL_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/admin/users/segment-rules 获取分层规则配置
 * @apiName GetSegmentRules
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription 获取当前配置的用户分层规则定义
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 分层规则配置
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 */
router.get('/segment-rules', authenticateToken, requireRoleLevel(100), async (req, res) => {
  logger.info('获取分层规则配置', { user_id: req.user?.user_id })

  try {
    const UserSegmentService = getUserSegmentService(req)
    const rules = UserSegmentService.getSegmentRules()
    return res.apiSuccess(rules, '获取分层规则配置成功')
  } catch (error) {
    logger.error('获取分层规则配置失败', { error: error.message })
    return res.apiError('获取分层规则配置失败', 'RULES_ERROR', { error: error.message }, 500)
  }
})

/**
 * @api {get} /api/v4/console/users/:user_id/approval-rate 获取用户历史审核率
 * @apiName GetUserApprovalRate
 * @apiGroup UserSegments
 * @apiVersion 1.0.0
 *
 * @apiDescription 获取指定用户的消费记录历史审核通过率
 * 用于管理员在审核消费记录时参考用户历史信用状况
 *
 * @apiParam {Number} user_id 用户ID
 *
 * @apiQuery {Number} [days=90] 统计天数（默认90天）
 *
 * @apiSuccess {Boolean} success 请求是否成功
 * @apiSuccess {Object} data 审核率数据
 * @apiSuccess {Number} data.approval_rate 审核通过率（0-1）
 * @apiSuccess {Number} data.total_count 总提交数
 * @apiSuccess {Number} data.approved_count 通过数
 * @apiSuccess {Number} data.rejected_count 拒绝数
 * @apiSuccess {Number} data.pending_count 待审核数
 * @apiSuccess {String} data.credit_level 信用等级（excellent/good/normal/warning/poor）
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiPermission admin
 *
 * @example
 * GET /api/v4/console/users/1001/approval-rate?days=90
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "user_id": 1001,
 *     "approval_rate": 0.92,
 *     "total_count": 25,
 *     "approved_count": 23,
 *     "rejected_count": 2,
 *     "pending_count": 0,
 *     "credit_level": "excellent",
 *     "credit_level_text": "信用优秀",
 *     "period_days": 90,
 *     "updated_at": "2026-02-03T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 关联需求：§4.11.1 用户审核率接口
 */
router.get(
  '/:user_id/approval-rate',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    const { user_id } = req.params
    const { days = 90 } = req.query

    logger.info('获取用户历史审核率', {
      admin_id: req.user?.user_id,
      target_user_id: user_id,
      days: parseInt(days)
    })

    try {
      const models = getModels(req)
      const UserSegmentService = getUserSegmentService(req)

      // 调用 UserSegmentService 获取用户审核率
      const result = await UserSegmentService.getUserApprovalRate(models, {
        user_id: parseInt(user_id, 10),
        days: parseInt(days, 10) || 90
      })

      return res.apiSuccess(result, '获取成功')
    } catch (error) {
      logger.error('获取用户历史审核率失败', {
        error: error.message,
        user_id,
        stack: error.stack
      })

      return res.apiError(
        '获取用户历史审核率失败',
        'APPROVAL_RATE_ERROR',
        { error: error.message },
        500
      )
    }
  }
)

module.exports = router
