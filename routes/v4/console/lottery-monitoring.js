/**
 * @file 抽奖监控数据查询路由 - P2表只读查询API
 * @description 提供抽奖系统监控相关数据的只读查询接口
 *
 * 覆盖P2优先级表：
 * - lottery_hourly_metrics: 抽奖小时统计指标
 * - lottery_user_experience_state: 用户体验状态（Pity/AntiEmpty/AntiHigh）
 * - lottery_user_global_state: 用户全局状态（运气债务）
 * - lottery_campaign_quota_grants: 配额赠送记录
 * - lottery_campaign_user_quota: 用户配额状态
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 所有接口均为 GET 方法（只读查询）
 * - 严格遵循项目 snake_case 命名规范
 * - 使用 res.apiSuccess/res.apiError 统一响应格式
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 LotteryAnalyticsService 的辅助函数
 * （服务合并后由 LotteryAnalyticsService 提供监控数据查询功能）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAnalyticsService 实例
 */
function getLotteryAnalyticsService(req) {
  return req.app.locals.services.getService('lottery_analytics')
}

/*
 * ==========================================
 * 1. lottery_hourly_metrics - 抽奖小时统计指标
 * ==========================================
 */

/**
 * GET /hourly-metrics - 查询抽奖小时统计指标列表
 *
 * Query参数：
 * - campaign_id: 活动ID（可选）
 * - start_time: 开始时间（ISO8601格式，可选）
 * - end_time: 结束时间（ISO8601格式，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认24）
 *
 * 返回：统计指标列表和分页信息
 */
router.get('/hourly-metrics', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { campaign_id, start_time, end_time, page = 1, page_size = 24 } = req.query

    const result = await getLotteryAnalyticsService(req).getHourlyMetrics({
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      start_time,
      end_time,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询抽奖小时统计指标', {
      admin_id: req.user.user_id,
      campaign_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询抽奖小时统计指标成功')
  } catch (error) {
    logger.error('查询抽奖小时统计指标失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_HOURLY_METRICS_FAILED', null, 500)
  }
})

/**
 * GET /hourly-metrics/:id - 获取单个统计指标详情
 *
 * 路径参数：
 * - id: 指标记录ID（数字）
 *
 * 返回：指标详情
 */
router.get('/hourly-metrics/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const metric_id = parseInt(req.params.id)

    const metric = await getLotteryAnalyticsService(req).getHourlyMetricById(metric_id)

    if (!metric) {
      return res.apiError('统计指标不存在', 'METRIC_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(metric, '获取统计指标详情成功')
  } catch (error) {
    logger.error('获取统计指标详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_METRIC_FAILED', null, 500)
  }
})

/**
 * GET /hourly-metrics/summary/:campaign_id - 获取活动统计汇总
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（可选）
 * - end_time: 结束时间（可选）
 *
 * 返回：统计汇总数据
 */
router.get(
  '/hourly-metrics/summary/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)
      const { start_time, end_time } = req.query

      const summary = await getLotteryAnalyticsService(req).getHourlyMetricsSummary(
        campaign_id,
        start_time,
        end_time
      )

      return res.apiSuccess(summary, '获取活动统计汇总成功')
    } catch (error) {
      logger.error('获取活动统计汇总失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_SUMMARY_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 2. lottery_user_experience_state - 用户体验状态
 * ==========================================
 */

/**
 * GET /user-experience-states - 查询用户体验状态列表
 *
 * Query参数：
 * - campaign_id: 活动ID（可选）
 * - user_id: 用户ID（可选）
 * - min_empty_streak: 最小连续空奖次数（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户体验状态列表和分页信息
 */
router.get(
  '/user-experience-states',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { campaign_id, user_id, min_empty_streak, page = 1, page_size = 20 } = req.query

      const result = await getLotteryAnalyticsService(req).getUserExperienceStates({
        campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
        user_id: user_id ? parseInt(user_id) : undefined,
        min_empty_streak: min_empty_streak !== undefined ? parseInt(min_empty_streak) : undefined,
        page: parseInt(page),
        page_size: parseInt(page_size)
      })

      logger.info('查询用户体验状态列表', {
        admin_id: req.user.user_id,
        campaign_id,
        user_id,
        total: result.pagination.total_count
      })

      return res.apiSuccess(result, '查询用户体验状态成功')
    } catch (error) {
      logger.error('查询用户体验状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'QUERY_EXPERIENCE_STATES_FAILED', null, 500)
    }
  }
)

/**
 * GET /user-experience-states/:user_id/:campaign_id - 获取用户在特定活动的体验状态
 *
 * 路径参数：
 * - user_id: 用户ID
 * - campaign_id: 活动ID
 *
 * 返回：用户体验状态详情
 */
router.get(
  '/user-experience-states/:user_id/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)
      const campaign_id = parseInt(req.params.campaign_id)

      const state = await getLotteryAnalyticsService(req).getUserExperienceState(
        user_id,
        campaign_id
      )

      if (!state) {
        return res.apiError('用户体验状态不存在', 'STATE_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(state, '获取用户体验状态成功')
    } catch (error) {
      logger.error('获取用户体验状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_EXPERIENCE_STATE_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 3. lottery_user_global_state - 用户全局状态
 * ==========================================
 */

/**
 * GET /user-global-states - 查询用户全局状态列表
 *
 * Query参数：
 * - user_id: 用户ID（可选）
 * - luck_debt_level: 运气债务等级（none/low/medium/high，可选）
 * - min_draw_count: 最小抽奖次数（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户全局状态列表和分页信息
 */
router.get('/user-global-states', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id, luck_debt_level, min_draw_count, page = 1, page_size = 20 } = req.query

    const result = await getLotteryAnalyticsService(req).getUserGlobalStates({
      user_id: user_id ? parseInt(user_id) : undefined,
      luck_debt_level,
      min_draw_count: min_draw_count !== undefined ? parseInt(min_draw_count) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户全局状态列表', {
      admin_id: req.user.user_id,
      luck_debt_level,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户全局状态成功')
  } catch (error) {
    logger.error('查询用户全局状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_GLOBAL_STATES_FAILED', null, 500)
  }
})

/**
 * GET /user-global-states/:user_id - 获取用户的全局状态
 *
 * 路径参数：
 * - user_id: 用户ID
 *
 * 返回：用户全局状态详情（无记录时返回默认状态，不返回404）
 */
router.get(
  '/user-global-states/:user_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)

      const state = await getLotteryAnalyticsService(req).getUserGlobalState(user_id)

      // 用户没有全局状态记录是正常的（新用户/未参与抽奖），返回默认值而不是404
      if (!state) {
        return res.apiSuccess(
          {
            user_id,
            total_draws: 0,
            total_wins: 0,
            luck_debt: 0,
            historical_empty_rate: null,
            message: '用户尚无抽奖记录'
          },
          '获取用户全局状态成功'
        )
      }

      return res.apiSuccess(state, '获取用户全局状态成功')
    } catch (error) {
      logger.error('获取用户全局状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_GLOBAL_STATE_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 4. lottery_campaign_quota_grants - 配额赠送记录
 * ==========================================
 */

/**
 * GET /quota-grants - 查询配额赠送记录列表
 *
 * Query参数：
 * - campaign_id: 活动ID（可选）
 * - user_id: 被赠送用户ID（可选）
 * - granted_by: 赠送操作者ID（可选）
 * - grant_source: 赠送来源（可选）：admin_grant/spending/activity/refund/system
 * - start_time: 开始时间（可选）
 * - end_time: 结束时间（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：配额赠送记录列表和分页信息
 */
router.get('/quota-grants', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      campaign_id,
      user_id,
      granted_by,
      grant_source,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = req.query

    const result = await getLotteryAnalyticsService(req).getQuotaGrants({
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      granted_by: granted_by ? parseInt(granted_by) : undefined,
      grant_source,
      start_time,
      end_time,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询配额赠送记录', {
      admin_id: req.user.user_id,
      campaign_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询配额赠送记录成功')
  } catch (error) {
    logger.error('查询配额赠送记录失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_QUOTA_GRANTS_FAILED', null, 500)
  }
})

/**
 * GET /quota-grants/:id - 获取单个配额赠送记录详情
 *
 * 路径参数：
 * - id: 赠送记录ID
 *
 * 返回：赠送记录详情
 */
router.get('/quota-grants/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const grant_id = parseInt(req.params.id)

    const grant = await getLotteryAnalyticsService(req).getQuotaGrantById(grant_id)

    if (!grant) {
      return res.apiError('赠送记录不存在', 'GRANT_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(grant, '获取赠送记录详情成功')
  } catch (error) {
    logger.error('获取赠送记录详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_GRANT_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 5. lottery_campaign_user_quota - 用户配额状态
 * ==========================================
 */

/**
 * GET /user-quotas - 查询用户配额状态列表
 *
 * Query参数：
 * - campaign_id: 活动ID（可选）
 * - user_id: 用户ID（可选）
 * - has_remaining: 是否有剩余配额（true/false，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户配额列表和分页信息
 */
router.get('/user-quotas', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { campaign_id, user_id, has_remaining, page = 1, page_size = 20 } = req.query

    const result = await getLotteryAnalyticsService(req).getUserQuotas({
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      has_remaining: has_remaining !== undefined ? has_remaining === 'true' : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户配额状态列表', {
      admin_id: req.user.user_id,
      campaign_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户配额状态成功')
  } catch (error) {
    logger.error('查询用户配额状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_USER_QUOTAS_FAILED', null, 500)
  }
})

/**
 * GET /user-quotas/:user_id/:campaign_id - 获取用户在特定活动的配额状态
 *
 * 路径参数：
 * - user_id: 用户ID
 * - campaign_id: 活动ID
 *
 * 返回：用户配额状态详情
 */
router.get(
  '/user-quotas/:user_id/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)
      const campaign_id = parseInt(req.params.campaign_id)

      const quota = await getLotteryAnalyticsService(req).getUserQuota(user_id, campaign_id)

      if (!quota) {
        return res.apiError('用户配额状态不存在', 'QUOTA_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(quota, '获取用户配额状态成功')
    } catch (error) {
      logger.error('获取用户配额状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_USER_QUOTA_FAILED', null, 500)
    }
  }
)

/**
 * GET /user-quotas/stats/:campaign_id - 获取活动配额统计汇总
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * 返回：配额统计汇总数据
 */
router.get(
  '/user-quotas/stats/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)

      const stats = await getLotteryAnalyticsService(req).getCampaignQuotaStats(campaign_id)

      return res.apiSuccess(stats, '获取活动配额统计成功')
    } catch (error) {
      logger.error('获取活动配额统计失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_QUOTA_STATS_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 6. 综合监控统计 - 用于抽奖监控仪表盘
 * ==========================================
 */

/**
 * GET /stats - 获取抽奖监控综合统计数据
 *
 * 用于前端抽奖监控仪表盘展示（lottery-metrics.html）
 *
 * Query参数：
 * - campaign_id: 活动ID（可选，不传则统计所有活动）
 * - time_range: 时间范围（today/yesterday/week/month/custom，默认today）
 * - start_date: 自定义开始日期（YYYY-MM-DD，当time_range=custom时使用）
 * - end_date: 自定义结束日期（YYYY-MM-DD，当time_range=custom时使用）
 *
 * 返回：综合监控统计数据，包含：
 * - summary: 核心指标汇总（抽奖次数、中奖次数、中奖率、奖品价值及趋势）
 * - trend: 小时趋势数据
 * - prize_distribution: 奖品分布
 * - recent_draws: 最近抽奖记录
 * - prize_stats: 奖品发放统计
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { campaign_id, time_range = 'today', start_date, end_date } = req.query

    const stats = await getLotteryAnalyticsService(req).getMonitoringStats({
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      time_range,
      start_date,
      end_date
    })

    logger.info('获取抽奖监控统计', {
      admin_id: req.user.user_id,
      campaign_id,
      time_range,
      total_draws: stats.summary.total_draws
    })

    return res.apiSuccess(stats, '获取抽奖监控统计成功')
  } catch (error) {
    logger.error('获取抽奖监控统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_MONITORING_STATS_FAILED', null, 500)
  }
})

module.exports = router
