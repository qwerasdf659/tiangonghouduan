/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖历史和活动API路由
 *
 * 功能：
 * - 获取当前登录用户的抽奖历史（从JWT Token取身份）
 * - 获取活动列表
 * - 获取策略引擎运行指标（管理员）
 *
 * 路由前缀：/api/v4/lottery
 *
 * 安全设计（路由分离方案 V4.8.0）：
 * - 用户端路由不含 :user_id 参数，身份纯从 JWT Token 获取
 * - 管理员查看他人数据走 /api/v4/console/lottery-user-analysis/
 *
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * @route GET /api/v4/lottery/history
 * @desc 获取当前登录用户的抽奖历史
 * @access Private（JWT Token 认证，用户只能查看自己的数据）
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 *
 * @returns {Object} 抽奖历史记录 { records: Array, pagination: Object }
 *
 * 安全设计（路由分离方案 V4.8.0）：
 * - 用户端路由不含 :user_id 参数，身份纯从 JWT Token 获取
 * - 管理员查看他人数据走 /api/v4/console/lottery-user-analysis/history/:user_id
 */
router.get('/history', authenticateToken, asyncHandler(async (req, res) => {
  const user_id = req.user.user_id
  const { page = 1, page_size = 20 } = req.query

  const finalPage = Math.max(parseInt(page) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)

  // 获取抽奖历史（通过 ServiceManager 获取 LotteryQueryService）
  const LotteryQueryService = req.app.locals.services.getService('lottery_query')
  const history = await LotteryQueryService.getUserHistory(user_id, {
    page: finalPage,
    limit: pageSize
  })

  return res.apiSuccess(history, '抽奖历史获取成功', 'HISTORY_SUCCESS')
}))

/**
 * @route GET /api/v4/lottery/campaigns
 * @desc 获取活动列表
 * @access Private
 *
 * @query {string} status - 活动状态筛选（默认active）
 *
 * @returns {Object} 活动列表
 */
router.get('/campaigns', authenticateToken, asyncHandler(async (req, res) => {
  const { status = 'active' } = req.query

  // 获取活动列表（读写分离架构）
  const LotteryQueryService = req.app.locals.services.getService('lottery_query')
  const campaigns = await LotteryQueryService.getActiveCampaigns({
    status,
    user_id: req.user.user_id
  })

  return res.apiSuccess(campaigns, '活动列表获取成功', 'CAMPAIGNS_SUCCESS')
}))

/**
 * @route GET /api/v4/lottery/metrics
 * @desc 获取抽奖策略引擎运行指标（监控面板使用）
 * @access Private（需要管理员权限）
 *
 * @query {number} lottery_campaign_id - 活动ID（必填）
 * @query {number} hours - 查询最近N小时数据（默认24，最大168=7天）
 *
 * @returns {Object} 策略指标数据
 *
 * 指标内容：
 * - 基础统计：总抽奖次数、唯一用户数、平均奖品价值
 * - 档位分布：high/mid/low/fallback 占比
 * - BxPx 分层分布：B0/B1/B2/B3 占比
 * - 体验机制触发率：Pity/AntiEmpty/AntiHigh/LuckDebt
 * - 健康指标：空奖率、高价值率
 *
 * 权限验证：
 * - 仅管理员（role_level >= 100）可访问
 *
 * 业务场景：
 * - 运营监控面板实时查看策略效果
 * - 异常检测和预警（过高空奖率等）
 * - 策略调优数据支撑
 */
router.get('/metrics', authenticateToken, asyncHandler(async (req, res) => {
  const { lottery_campaign_id, hours = 24 } = req.query

  // 1. 权限验证：仅管理员可访问
  const currentUserRoles = await getUserRoles(req.user.user_id)
  if (currentUserRoles.role_level < 100) {
    return res.apiError('仅管理员可访问策略指标', 'ACCESS_DENIED', {}, 403)
  }

  // 2. 参数验证
  if (!lottery_campaign_id) {
    return res.apiError('lottery_campaign_id 参数必填', 'MISSING_CAMPAIGN_ID', {}, 400)
  }

  const campaignIdInt = parseInt(lottery_campaign_id)
  if (isNaN(campaignIdInt) || campaignIdInt <= 0) {
    return res.apiError('lottery_campaign_id 必须为正整数', 'INVALID_CAMPAIGN_ID', {}, 400)
  }

  const hoursInt = Math.min(Math.max(parseInt(hours) || 24, 1), 168) // 限制 1-168 小时

  // 3. 查询 LotteryHourlyMetrics 数据（Phase 3 收口：通过 ServiceManager 获取 models）
  const { LotteryHourlyMetrics } = req.app.locals.models

  const recentMetrics = await LotteryHourlyMetrics.getRecentMetrics(campaignIdInt, hoursInt)

  // 4. 聚合计算总体指标
  const aggregated = _aggregateMetrics(recentMetrics)

  // 5. 返回指标数据
  return res.apiSuccess(
    {
      lottery_campaign_id: campaignIdInt,
      time_range: {
        hours: hoursInt,
        start_time: _getStartTime(hoursInt),
        end_time: BeijingTimeHelper.now()
      },
      summary: aggregated.summary,
      tier_distribution: aggregated.tier_distribution,
      budget_tier_distribution: aggregated.budget_tier_distribution,
      mechanism_triggers: aggregated.mechanism_triggers,
      health_indicators: aggregated.health_indicators,
      hourly_data: recentMetrics.map(_formatHourlyMetrics)
    },
    '策略指标获取成功',
    'METRICS_SUCCESS'
  )
}))

/**
 * 聚合多小时指标数据
 *
 * @param {Array<LotteryHourlyMetrics>} metrics - 小时指标记录列表
 * @returns {Object} 聚合后的指标
 * @private
 */
function _aggregateMetrics(metrics) {
  if (!metrics || metrics.length === 0) {
    return _getEmptyAggregation()
  }

  // 累计基础指标
  const totals = metrics.reduce(
    (acc, m) => ({
      total_draws: acc.total_draws + (m.total_draws || 0),
      unique_users: acc.unique_users + (m.unique_users || 0),
      total_prize_value: acc.total_prize_value + parseFloat(m.total_prize_value || 0),
      high_tier_count: acc.high_tier_count + (m.high_tier_count || 0),
      mid_tier_count: acc.mid_tier_count + (m.mid_tier_count || 0),
      low_tier_count: acc.low_tier_count + (m.low_tier_count || 0),
      fallback_tier_count: acc.fallback_tier_count + (m.fallback_tier_count || 0),
      b0_tier_count: acc.b0_tier_count + (m.b0_tier_count || 0),
      b1_tier_count: acc.b1_tier_count + (m.b1_tier_count || 0),
      b2_tier_count: acc.b2_tier_count + (m.b2_tier_count || 0),
      b3_tier_count: acc.b3_tier_count + (m.b3_tier_count || 0),
      pity_triggered_count: acc.pity_triggered_count + (m.pity_triggered_count || 0),
      anti_empty_triggered_count:
        acc.anti_empty_triggered_count + (m.anti_empty_triggered_count || 0),
      anti_high_triggered_count: acc.anti_high_triggered_count + (m.anti_high_triggered_count || 0),
      luck_debt_triggered_count: acc.luck_debt_triggered_count + (m.luck_debt_triggered_count || 0),
      guarantee_triggered_count: acc.guarantee_triggered_count + (m.guarantee_triggered_count || 0)
    }),
    _getEmptyTotals()
  )

  const total = totals.total_draws || 1 // 避免除零

  return {
    summary: {
      total_draws: totals.total_draws,
      unique_users: totals.unique_users,
      total_prize_value: totals.total_prize_value,
      avg_prize_value: totals.total_prize_value / total,
      hours_with_data: metrics.length
    },
    tier_distribution: {
      high: { count: totals.high_tier_count, rate: totals.high_tier_count / total },
      mid: { count: totals.mid_tier_count, rate: totals.mid_tier_count / total },
      low: { count: totals.low_tier_count, rate: totals.low_tier_count / total },
      fallback: { count: totals.fallback_tier_count, rate: totals.fallback_tier_count / total }
    },
    budget_tier_distribution: {
      B0: { count: totals.b0_tier_count, rate: totals.b0_tier_count / total },
      B1: { count: totals.b1_tier_count, rate: totals.b1_tier_count / total },
      B2: { count: totals.b2_tier_count, rate: totals.b2_tier_count / total },
      B3: { count: totals.b3_tier_count, rate: totals.b3_tier_count / total }
    },
    mechanism_triggers: {
      pity: { count: totals.pity_triggered_count, rate: totals.pity_triggered_count / total },
      anti_empty: {
        count: totals.anti_empty_triggered_count,
        rate: totals.anti_empty_triggered_count / total
      },
      anti_high: {
        count: totals.anti_high_triggered_count,
        rate: totals.anti_high_triggered_count / total
      },
      luck_debt: {
        count: totals.luck_debt_triggered_count,
        rate: totals.luck_debt_triggered_count / total
      },
      guarantee: {
        count: totals.guarantee_triggered_count,
        rate: totals.guarantee_triggered_count / total
      }
    },
    health_indicators: {
      /** 100% 出奖系统：保底奖品占比（fallback 是真实保底奖品，不是空奖） */
      fallback_rate: totals.fallback_tier_count / total,
      high_value_rate: totals.high_tier_count / total,
      status: _getHealthStatus(totals.fallback_tier_count / total, totals.total_draws)
    }
  }
}

/**
 * 获取空的聚合结果
 * @returns {Object} 空聚合结果
 * @private
 */
function _getEmptyAggregation() {
  return {
    summary: {
      total_draws: 0,
      unique_users: 0,
      total_prize_value: 0,
      avg_prize_value: 0,
      hours_with_data: 0
    },
    tier_distribution: {
      high: { count: 0, rate: 0 },
      mid: { count: 0, rate: 0 },
      low: { count: 0, rate: 0 },
      fallback: { count: 0, rate: 0 }
    },
    budget_tier_distribution: {
      B0: { count: 0, rate: 0 },
      B1: { count: 0, rate: 0 },
      B2: { count: 0, rate: 0 },
      B3: { count: 0, rate: 0 }
    },
    mechanism_triggers: {
      pity: { count: 0, rate: 0 },
      anti_empty: { count: 0, rate: 0 },
      anti_high: { count: 0, rate: 0 },
      luck_debt: { count: 0, rate: 0 },
      guarantee: { count: 0, rate: 0 }
    },
    health_indicators: { fallback_rate: 0, high_value_rate: 0, status: 'no_data' }
  }
}

/**
 * 获取空的累计对象
 * @returns {Object} 空累计对象
 * @private
 */
function _getEmptyTotals() {
  return {
    total_draws: 0,
    unique_users: 0,
    total_prize_value: 0,
    high_tier_count: 0,
    mid_tier_count: 0,
    low_tier_count: 0,
    fallback_tier_count: 0,
    b0_tier_count: 0,
    b1_tier_count: 0,
    b2_tier_count: 0,
    b3_tier_count: 0,
    pity_triggered_count: 0,
    anti_empty_triggered_count: 0,
    anti_high_triggered_count: 0,
    luck_debt_triggered_count: 0,
    guarantee_triggered_count: 0
  }
}

/**
 * 获取健康状态（100% 出奖系统）
 *
 * 判断依据是保底奖品占比，而非"空奖率"：
 * - 保底占比 > 60% 说明高价值奖品发放异常，可能库存或预算不足
 * - 保底占比 > 50% 需要关注活动平衡
 *
 * @param {number} fallback_rate - 保底奖品占比
 * @param {number} total_draws - 总抽奖次数
 * @returns {string} 健康状态
 * @private
 */
function _getHealthStatus(fallback_rate, total_draws) {
  if (total_draws < 100) return 'insufficient_data'
  if (fallback_rate > 0.6) return 'critical'
  if (fallback_rate > 0.5) return 'warning'
  return 'healthy'
}

/**
 * 获取查询开始时间
 *
 * @param {number} hours - 小时数
 * @returns {string} 开始时间（ISO格式）
 * @private
 */
function _getStartTime(hours) {
  const start = new Date()
  start.setHours(start.getHours() - hours)
  return start.toISOString()
}

/**
 * 格式化单小时指标
 *
 * @param {LotteryHourlyMetrics} metric - 小时指标
 * @returns {Object} 格式化后的指标
 * @private
 */
function _formatHourlyMetrics(metric) {
  return {
    hour_bucket: metric.hour_bucket,
    total_draws: metric.total_draws,
    empty_rate: parseFloat(metric.empty_rate) || 0,
    high_value_rate: parseFloat(metric.high_value_rate) || 0,
    pity_triggered: metric.pity_triggered_count,
    luck_debt_triggered: metric.luck_debt_triggered_count
  }
}

module.exports = router
