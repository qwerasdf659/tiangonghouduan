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

/**
 * 获取 LotteryAlertService 的辅助函数
 * （B1 实时告警列表API，从 lottery_alerts 表读取持久化告警数据）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAlertService 实例
 */
function getLotteryAlertService(req) {
  return req.app.locals.services.getService('lottery_alert')
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

/*
 * ==========================================
 * 7. 用户抽奖档案聚合 - P0 优先级
 * ==========================================
 */

/**
 * GET /user-profile/:user_id - 获取用户抽奖档案聚合数据
 *
 * P0 优先级 API：为运营后台提供用户完整的抽奖档案视图
 *
 * 路径参数：
 * - user_id: 用户ID（数字）
 *
 * Query参数：
 * - campaign_id: 活动ID（可选，不传则查询所有活动）
 *
 * 返回聚合数据：
 * - stats: 抽奖统计（总次数、中奖率、档位分布、首次/最近抽奖时间）
 * - experience: 用户体验状态（empty_streak、pity_trigger_count等）
 * - global_state: 用户全局状态（luck_debt_level等）
 * - quotas: 用户配额列表
 * - recent_draws: 最近20条抽奖记录
 *
 * V4.0 中奖判定规则：
 * - reward_tier IN ('high', 'mid', 'low') 视为中奖
 * - reward_tier = 'fallback' 为保底奖品，通常不视为中奖
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P0 用户抽奖档案聚合 API
 */
router.get('/user-profile/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    const { campaign_id } = req.query

    // 参数校验
    if (!user_id || isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    const analyticsService = getLotteryAnalyticsService(req)

    // 获取用户抽奖档案聚合数据
    const profile = await analyticsService.getUserProfile(user_id, {
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      recent_limit: 20
    })

    logger.info('获取用户抽奖档案成功', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      campaign_id: campaign_id || 'all',
      total_draws: profile.stats.total_draws,
      total_wins: profile.stats.total_wins
    })

    return res.apiSuccess(profile, '获取用户抽奖档案成功')
  } catch (error) {
    logger.error('获取用户抽奖档案失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_USER_PROFILE_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 8. 活动 ROI 聚合 - P1 优先级
 * ==========================================
 */

/**
 * GET /campaign-roi/:campaign_id - 获取活动 ROI 聚合数据
 *
 * P1 优先级 API：为运营后台提供活动投入产出分析
 *
 * ROI 计算公式：(总收入 - 总成本) / 总收入 * 100
 * - 总收入：用户消耗的积分总额（lottery_draws.cost_points）
 * - 总成本：发放的奖品成本总额（lottery_prizes.cost_points）
 *
 * 路径参数：
 * - campaign_id: 活动ID（数字）
 *
 * Query参数：
 * - start_time: 统计开始时间（ISO8601，可选）
 * - end_time: 统计结束时间（ISO8601，可选）
 *
 * 返回聚合数据：
 * - roi: 投资回报率（%）
 * - total_cost: 奖品总成本
 * - total_revenue: 用户消耗积分总额
 * - profit: 利润
 * - unique_users: 独立用户数
 * - repeat_users: 复购用户数
 * - repeat_rate: 复购率（%）
 * - tier_cost_breakdown: 各档位成本明细
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P1 活动 ROI 聚合 API
 */
router.get(
  '/campaign-roi/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)
      const { start_time, end_time } = req.query

      // 参数校验
      if (!campaign_id || isNaN(campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const analyticsService = getLotteryAnalyticsService(req)

      // 获取活动 ROI 聚合数据
      const roiData = await analyticsService.getCampaignROI(campaign_id, {
        start_time,
        end_time
      })

      logger.info('获取活动ROI成功', {
        admin_id: req.user.user_id,
        campaign_id,
        roi: roiData.roi,
        unique_users: roiData.unique_users,
        total_draws: roiData.total_draws
      })

      return res.apiSuccess(roiData, '获取活动ROI成功')
    } catch (error) {
      logger.error('获取活动ROI失败:', error)

      // 区分活动不存在和其他错误
      if (error.message === '活动不存在') {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_ROI_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 9. 告警管理操作 - P0 优先级（告警确认/解决）
 * ==========================================
 */

/**
 * POST /realtime-alerts/:id/acknowledge - 确认告警
 *
 * 业务场景：运营人员确认已知晓该告警，但暂未解决
 *
 * 路径参数：
 * - id: 告警ID（alert_id）
 *
 * 返回：更新后的告警详情
 */
router.post(
  '/realtime-alerts/:id/acknowledge',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const alert_id = parseInt(req.params.id)

      if (!alert_id || isNaN(alert_id)) {
        return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
      }

      const LotteryAlertService = getLotteryAlertService(req)
      const alert = await LotteryAlertService.acknowledgeAlert(alert_id, req.user.user_id)

      logger.info('告警已确认', {
        admin_id: req.user.user_id,
        alert_id
      })

      return res.apiSuccess(alert, '告警已确认')
    } catch (error) {
      logger.error('确认告警失败:', error)
      if (error.message === '告警不存在') {
        return res.apiError('告警不存在', 'ALERT_NOT_FOUND', null, 404)
      }
      return res.apiError(`操作失败：${error.message}`, 'ACKNOWLEDGE_ALERT_FAILED', null, 500)
    }
  }
)

/**
 * POST /realtime-alerts/:id/resolve - 解决告警
 *
 * 业务场景：运营人员标记告警为已解决，并记录处理备注
 *
 * 路径参数：
 * - id: 告警ID（alert_id）
 *
 * Body参数：
 * - resolve_notes: 处理备注（可选）
 *
 * 返回：更新后的告警详情
 */
router.post(
  '/realtime-alerts/:id/resolve',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const alert_id = parseInt(req.params.id)
      const { resolve_notes } = req.body

      if (!alert_id || isNaN(alert_id)) {
        return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
      }

      const LotteryAlertService = getLotteryAlertService(req)
      const alert = await LotteryAlertService.resolveAlert(
        alert_id,
        req.user.user_id,
        resolve_notes
      )

      logger.info('告警已解决', {
        admin_id: req.user.user_id,
        alert_id,
        resolve_notes: resolve_notes || '无备注'
      })

      return res.apiSuccess(alert, '告警已解决')
    } catch (error) {
      logger.error('解决告警失败:', error)
      if (error.message === '告警不存在') {
        return res.apiError('告警不存在', 'ALERT_NOT_FOUND', null, 404)
      }
      return res.apiError(`操作失败：${error.message}`, 'RESOLVE_ALERT_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 10. 实时计算告警 - P0 优先级（原有功能保留）
 * ==========================================
 */

/**
 * GET /realtime-alerts - 获取实时计算告警列表（实时检测，不持久化）
 *
 * P0 优先级 API：为运营后台提供实时风险预警
 *
 * 告警类型：
 * - budget_exhaust: 预算告急（消耗 ≥ 90%）
 * - budget_warning: 预算预警（消耗 ≥ 80%）
 * - stock_low: 库存告急（high层级库存 < 100）
 * - stock_warning: 库存预警（任意奖品库存 < 初始库存10%）
 * - win_rate_high: 中奖率异常高（> 配置值 × 1.5）
 * - win_rate_low: 中奖率异常低（< 配置值 × 0.5）
 * - high_frequency_user: 高频用户（1小时内抽奖 > 100次）
 * - empty_streak_high: 连空用户过多（连空≥10次用户占比 > 5%）
 *
 * Query参数：
 * - campaign_id: 活动ID（可选，不传则查询所有活动）
 * - level: 告警级别过滤（danger/warning/info，可选）
 * - acknowledged: 是否已确认（true/false，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回数据：
 * - alerts: 告警列表
 * - summary: 告警汇总（total/danger/warning/info）
 *
 * @see docs/抽奖运营后台-待规划功能清单.md 1.2.1 实时告警列表 API
 */
router.get('/realtime-alerts', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { campaign_id, level, acknowledged, page = 1, page_size = 20 } = req.query

    const analyticsService = getLotteryAnalyticsService(req)

    const result = await analyticsService.getRealtimeAlerts({
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      level,
      acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('获取实时告警列表', {
      admin_id: req.user.user_id,
      campaign_id: campaign_id || 'all',
      total_alerts: result.summary.total,
      danger_count: result.summary.danger
    })

    return res.apiSuccess(result, '获取实时告警列表成功')
  } catch (error) {
    logger.error('获取实时告警列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_REALTIME_ALERTS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 11. 单次抽奖Pipeline详情 - P1 优先级
 * ==========================================
 */

/**
 * GET /draw-details/:draw_id - 获取单次抽奖Pipeline详情
 *
 * P1 优先级 API：为运营后台提供抽奖决策过程可视化
 *
 * 运营场景：
 * - 用户投诉"为什么这次没中"时，展示完整决策过程
 * - 审计和合规需求，解释系统决策逻辑
 *
 * 路径参数：
 * - draw_id: 抽奖记录ID（字符串）
 *
 * 返回数据：
 * - basic_info: 基础信息（user_id, campaign_id, created_at, cost_points, is_winner等）
 * - pipeline_execution: Pipeline各阶段执行详情（stage, name, status, duration_ms, output）
 * - decision_snapshot: 决策快照（random_number, selected_tier, downgrade_count等）
 * - user_state_before: 用户抽奖前状态（empty_streak, pity_progress, luck_debt）
 *
 * @see docs/抽奖运营后台-待规划功能清单.md 1.2.2 单次抽奖Pipeline详情 API
 */
router.get('/draw-details/:draw_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { draw_id } = req.params

    // 参数校验
    if (!draw_id) {
      return res.apiError('缺少抽奖记录ID', 'MISSING_DRAW_ID', null, 400)
    }

    const analyticsService = getLotteryAnalyticsService(req)

    const details = await analyticsService.getDrawDetails(draw_id)

    if (!details) {
      return res.apiError('抽奖记录不存在', 'DRAW_NOT_FOUND', null, 404)
    }

    logger.info('获取单次抽奖详情成功', {
      admin_id: req.user.user_id,
      draw_id,
      user_id: details.basic_info.user_id,
      campaign_id: details.basic_info.campaign_id
    })

    return res.apiSuccess(details, '获取单次抽奖详情成功')
  } catch (error) {
    logger.error('获取单次抽奖详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_DRAW_DETAILS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 12. 异常用户列表 - P1 优先级
 * ==========================================
 */

/**
 * GET /abnormal-users - 获取异常用户列表
 *
 * P1 优先级 API：为运营后台提供风控预警，检测刷单/脚本用户
 *
 * 异常检测规则：
 * - high_frequency: 1小时内抽奖 > 100次
 * - high_win_rate: 中奖率 > 平均值 × 2
 * - high_tier_abnormal: high层级中奖率 > 平均值 × 3
 * - rapid_wins: 10分钟内中奖 > 10次
 *
 * Query参数：
 * - type: 异常类型（high_frequency/high_win_rate/high_tier_abnormal/all，默认all）
 * - time_range: 时间范围（1h/24h/7d，默认24h）
 * - campaign_id: 活动ID（可选）
 * - min_risk_score: 最小风险分数（0-100，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回数据：
 * - users: 异常用户列表（含风险评分、异常指标、建议措施）
 * - pagination: 分页信息
 * - summary: 风险等级汇总（high_risk_count/medium_risk_count/low_risk_count）
 *
 * @see docs/抽奖运营后台-待规划功能清单.md 1.2.3 异常用户列表 API
 */
router.get('/abnormal-users', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      type = 'all',
      time_range = '24h',
      campaign_id,
      min_risk_score,
      page = 1,
      page_size = 20
    } = req.query

    const analyticsService = getLotteryAnalyticsService(req)

    const result = await analyticsService.getAbnormalUsers({
      type,
      time_range,
      campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
      min_risk_score: min_risk_score !== undefined ? parseInt(min_risk_score) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('获取异常用户列表', {
      admin_id: req.user.user_id,
      type,
      time_range,
      campaign_id: campaign_id || 'all',
      total_abnormal: result.pagination.total
    })

    return res.apiSuccess(result, '获取异常用户列表成功')
  } catch (error) {
    logger.error('获取异常用户列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ABNORMAL_USERS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 13. 活动复盘报告 - P2 优先级
 * ==========================================
 */

/**
 * GET /campaign-report/:campaign_id - 获取活动复盘报告
 *
 * P2 优先级 API：为运营后台提供活动结束后的完整复盘报告
 *
 * 运营场景：
 * - 活动结束后生成完整复盘报告
 * - 支持导出给领导汇报
 *
 * 路径参数：
 * - campaign_id: 活动ID（数字）
 *
 * 返回数据：
 * - campaign_info: 活动基础信息（名称、时间范围、持续天数）
 * - overview: 总体数据（抽奖次数、独立用户、成本、收入、ROI、复购率）
 * - participation_funnel: 参与漏斗（页面浏览→点击抽奖→实际抽奖→中奖）
 * - time_distribution: 时间分布（小时分布、日分布、峰值时段）
 * - prize_analysis: 奖品分析（档位分布、热门奖品）
 * - user_analysis: 用户分析（新老用户、预算分层分布、人均抽奖次数）
 * - experience_metrics: 体验指标（平均连空、Pity触发、AntiEmpty触发）
 * - comparison_with_history: 历史对比（与上次活动对比）
 *
 * @see docs/抽奖运营后台-待规划功能清单.md 1.2.4 活动复盘报告 API
 */
router.get(
  '/campaign-report/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)

      // 参数校验
      if (!campaign_id || isNaN(campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const analyticsService = getLotteryAnalyticsService(req)

      const report = await analyticsService.generateCampaignReport(campaign_id)

      logger.info('生成活动复盘报告成功', {
        admin_id: req.user.user_id,
        campaign_id,
        campaign_name: report.campaign_info.campaign_name,
        total_draws: report.overview.total_draws,
        unique_users: report.overview.unique_users
      })

      return res.apiSuccess(report, '生成活动复盘报告成功')
    } catch (error) {
      logger.error('生成活动复盘报告失败:', error)

      if (error.message === '活动不存在') {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
      }

      return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_REPORT_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 14. 策略效果分析 - P2 优先级
 * ==========================================
 */

/**
 * GET /strategy-effectiveness - 获取策略效果分析
 *
 * P2 优先级 API：为运营后台提供策略配置效果评估
 *
 * 运营场景：
 * - 评估 BxPx 矩阵配置是否合理
 * - 分析体验平滑机制的触发效果
 * - 优化策略配置提供数据支撑
 *
 * Query参数：
 * - campaign_id: 活动ID（可选，不传则分析所有活动）
 * - time_range: 时间范围（7d/30d/90d，默认7d）
 * - strategy_type: 策略类型过滤（bxpx/pity/anti_empty/luck_debt/all，默认all）
 *
 * 返回数据：
 * - analysis_period: 分析时间段
 * - bxpx_matrix_analysis: BxPx矩阵分析（命中分布、中奖率、效果评分）
 * - experience_mechanism_analysis: 体验机制分析（Pity/AntiEmpty/LuckDebt触发统计）
 * - tier_downgrade_analysis: 档位降级分析（降级率、降级路径、主要原因）
 * - overall_strategy_score: 整体策略评分
 * - optimization_recommendations: 优化建议
 *
 * @see docs/抽奖运营后台-待规划功能清单.md 1.2.5 策略效果分析 API
 */
router.get(
  '/strategy-effectiveness',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { campaign_id, time_range = '7d', strategy_type = 'all' } = req.query

      const analyticsService = getLotteryAnalyticsService(req)

      const analysis = await analyticsService.getStrategyEffectiveness({
        campaign_id: campaign_id ? parseInt(campaign_id) : undefined,
        time_range,
        strategy_type
      })

      logger.info('获取策略效果分析成功', {
        admin_id: req.user.user_id,
        campaign_id: campaign_id || 'all',
        time_range,
        strategy_type,
        overall_score: analysis.overall_strategy_score
      })

      return res.apiSuccess(analysis, '获取策略效果分析成功')
    } catch (error) {
      logger.error('获取策略效果分析失败:', error)
      return res.apiError(
        `查询失败：${error.message}`,
        'GET_STRATEGY_EFFECTIVENESS_FAILED',
        null,
        500
      )
    }
  }
)

module.exports = router
