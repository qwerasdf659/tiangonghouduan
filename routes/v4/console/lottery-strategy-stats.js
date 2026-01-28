'use strict'

/**
 * @file 抽奖策略统计路由 - 策略引擎监控方案 API
 * @description 提供抽奖策略引擎监控方案所需的统计数据查询接口。
 *
 * 覆盖功能：
 * - 实时概览统计（今日抽奖数、空奖率、高价值率等）
 * - 小时级趋势数据（最近24小时 → lottery_draws，历史 → lottery_hourly_metrics）
 * - 日级趋势数据（lottery_daily_metrics）
 * - 奖品档位分布统计（high/mid/low/fallback）
 * - 体验机制触发统计（Pity/AntiEmpty/AntiHigh/LuckDebt）
 * - 预算消耗统计
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 所有接口均为 GET 方法（只读查询）
 * - 严格遵循项目 snake_case 命名规范
 * - 使用 res.apiSuccess/res.apiError 统一响应格式
 *
 * 双轨查询策略：
 * - 实时数据（今日）：Redis 优先，降级到 lottery_draws
 * - 近期数据（24小时内）：lottery_draws 实时聚合
 * - 历史数据（7-90天）：lottery_hourly_metrics
 * - 长期数据（>90天）：lottery_daily_metrics
 *
 * @version 1.0.0
 * @date 2026-01-22
 * @module routes/v4/console/lottery-strategy-stats
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 获取 LotteryAnalyticsService 的辅助函数
 * （服务合并后由 LotteryAnalyticsService 提供策略统计分析功能）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAnalyticsService 实例
 */
function getLotteryAnalyticsService(req) {
  return req.app.locals.services.getService('lottery_analytics')
}

/**
 * 解析时间范围参数
 * 默认返回最近24小时
 *
 * @param {Object} query - 请求查询参数
 * @returns {Object} { start_time, end_time }
 */
function parseTimeRange(query) {
  const { start_time, end_time } = query
  const now = new Date()

  // 默认最近24小时（北京时间）
  const default_start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const default_end = now.toISOString()

  return {
    start_time: start_time || default_start,
    end_time: end_time || default_end
  }
}

/**
 * 解析日期范围参数
 * 默认返回最近7天
 *
 * @param {Object} query - 请求查询参数
 * @returns {Object} { start_date, end_date }
 */
function parseDateRange(query) {
  const { start_date, end_date } = query
  const now = new Date()

  // 默认最近7天（北京时间）
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const default_start = BeijingTimeHelper.formatDate(sevenDaysAgo, 'YYYY-MM-DD')
  const default_end = BeijingTimeHelper.formatDate(now, 'YYYY-MM-DD')

  return {
    start_date: start_date || default_start,
    end_date: end_date || default_end
  }
}

/*
 * ==========================================
 * 1. 实时概览统计
 * ==========================================
 */

/**
 * GET /realtime/:campaign_id - 获取实时概览统计
 *
 * 提供今日的核心统计指标，包括：
 * - 总抽奖次数
 * - 独立用户数
 * - 空奖率
 * - 高价值率
 * - 总预算消耗
 * - 平均单次消耗
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * 返回示例：
 * {
 *   "today": {
 *     "total_draws": 1234,
 *     "unique_users": 567,
 *     "empty_rate": 0.0523,
 *     "high_value_rate": 0.0312,
 *     "total_budget_consumed": 12345.67,
 *     "avg_budget_per_draw": 10.00
 *   },
 *   "current_hour": {
 *     "total_draws": 45,
 *     "empty_rate": 0.0444
 *   }
 * }
 */
router.get('/realtime/:campaign_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id)

    if (isNaN(campaign_id)) {
      return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    // 🔴 修正：调用正确的服务方法 getRealtimeOverview（不是 getRealtimeStats）
    const result = await getLotteryAnalyticsService(req).getRealtimeOverview(campaign_id)

    logger.info('查询实时概览统计', {
      admin_id: req.user.user_id,
      campaign_id,
      today_total_draws: result.today?.total_draws || 0
    })

    return res.apiSuccess(result, '获取实时概览统计成功')
  } catch (error) {
    logger.error('获取实时概览统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_REALTIME_STATS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 2. 小时级趋势数据
 * ==========================================
 */

/**
 * GET /hourly/:campaign_id - 获取小时级趋势数据
 *
 * 提供指定时间范围内的小时级统计趋势，包括：
 * - 每小时抽奖次数
 * - 每小时独立用户数
 * - 每小时空奖率
 * - 每小时高价值率
 * - 每小时平均消耗
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（ISO8601格式，默认24小时前）
 * - end_time: 结束时间（ISO8601格式，默认当前时间）
 *
 * 返回：小时级统计数据列表
 */
router.get('/hourly/:campaign_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id)

    if (isNaN(campaign_id)) {
      return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_time, end_time } = parseTimeRange(req.query)

    // 🔴 修正：调用正确的服务方法 getHourlyTrend 并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getHourlyTrend(campaign_id, {
      start_time,
      end_time
    })

    logger.info('查询小时级趋势数据', {
      admin_id: req.user.user_id,
      campaign_id,
      start_time,
      end_time,
      data_points: result.length
    })

    return res.apiSuccess(
      {
        campaign_id,
        start_time,
        end_time,
        data: result
      },
      '获取小时级趋势数据成功'
    )
  } catch (error) {
    logger.error('获取小时级趋势数据失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_HOURLY_STATS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 3. 日级趋势数据
 * ==========================================
 */

/**
 * GET /daily/:campaign_id - 获取日级趋势数据
 *
 * 提供指定日期范围内的日级统计趋势。
 * 数据来源：lottery_daily_metrics（永久保留）
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_date: 开始日期（YYYY-MM-DD，默认7天前）
 * - end_date: 结束日期（YYYY-MM-DD，默认今天）
 *
 * 返回：日级统计数据列表
 */
router.get('/daily/:campaign_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaign_id)

    if (isNaN(campaign_id)) {
      return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_date, end_date } = parseDateRange(req.query)

    // 🔴 修正：调用正确的服务方法 getDailyTrend 并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getDailyTrend(campaign_id, {
      start_date,
      end_date
    })

    logger.info('查询日级趋势数据', {
      admin_id: req.user.user_id,
      campaign_id,
      start_date,
      end_date,
      data_points: result.length
    })

    return res.apiSuccess(
      {
        campaign_id,
        start_date,
        end_date,
        data: result
      },
      '获取日级趋势数据成功'
    )
  } catch (error) {
    logger.error('获取日级趋势数据失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_DAILY_STATS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 4. 奖品档位分布统计
 * ==========================================
 */

/**
 * GET /tier-distribution/:campaign_id - 获取奖品档位分布
 *
 * 统计指定时间范围内各奖品档位的分布情况：
 * - high: 高价值奖品
 * - mid: 中价值奖品
 * - low: 低价值奖品
 * - fallback: 空奖/保底奖
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（ISO8601格式，默认24小时前）
 * - end_time: 结束时间（ISO8601格式，默认当前时间）
 *
 * 返回示例：
 * {
 *   "total_draws": 1000,
 *   "distribution": [
 *     { "tier": "high", "count": 50, "percentage": 0.05 },
 *     { "tier": "mid", "count": 200, "percentage": 0.20 },
 *     { "tier": "low", "count": 500, "percentage": 0.50 },
 *     { "tier": "fallback", "count": 250, "percentage": 0.25 }
 *   ]
 * }
 */
router.get(
  '/tier-distribution/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)

      if (isNaN(campaign_id)) {
        return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const { start_time, end_time } = parseTimeRange(req.query)

      // 🔴 修正：使用 options 对象参数格式
      const result = await getLotteryAnalyticsService(req).getTierDistribution(campaign_id, {
        start_time,
        end_time
      })

      logger.info('查询奖品档位分布', {
        admin_id: req.user.user_id,
        campaign_id,
        start_time,
        end_time,
        total_draws: result.total_draws
      })

      return res.apiSuccess(result, '获取奖品档位分布成功')
    } catch (error) {
      logger.error('获取奖品档位分布失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_TIER_DISTRIBUTION_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 5. 体验机制触发统计
 * ==========================================
 */

/**
 * GET /experience-triggers/:campaign_id - 获取体验机制触发统计
 *
 * 统计指定时间范围内各体验机制的触发情况：
 * - pity_triggered: Pity 保底触发次数
 * - anti_empty_triggered: 反连空触发次数
 * - anti_high_triggered: 反连高触发次数
 * - luck_debt_triggered: 运气债务触发次数
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（ISO8601格式，默认24小时前）
 * - end_time: 结束时间（ISO8601格式，默认当前时间）
 *
 * 返回示例：
 * {
 *   "total_draws": 1000,
 *   "trigger_rates": [
 *     { "mechanism": "pity_triggered", "count": 100, "rate": 0.10 },
 *     { "mechanism": "anti_empty_triggered", "count": 50, "rate": 0.05 },
 *     { "mechanism": "anti_high_triggered", "count": 30, "rate": 0.03 },
 *     { "mechanism": "luck_debt_triggered", "count": 20, "rate": 0.02 }
 *   ]
 * }
 */
router.get(
  '/experience-triggers/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)

      if (isNaN(campaign_id)) {
        return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const { start_time, end_time } = parseTimeRange(req.query)

      // 🔴 修正：调用正确的服务方法 getExperienceTriggers（不是 getExperienceTriggerStats）并使用 options 对象参数格式
      const result = await getLotteryAnalyticsService(req).getExperienceTriggers(campaign_id, {
        start_time,
        end_time
      })

      logger.info('查询体验机制触发统计', {
        admin_id: req.user.user_id,
        campaign_id,
        start_time,
        end_time,
        total_draws: result.total_draws
      })

      return res.apiSuccess(result, '获取体验机制触发统计成功')
    } catch (error) {
      logger.error('获取体验机制触发统计失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_EXPERIENCE_TRIGGERS_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 6. 预算消耗统计
 * ==========================================
 */

/**
 * GET /budget-consumption/:campaign_id - 获取预算消耗统计
 *
 * 统计指定时间范围内的预算消耗情况：
 * - 总抽奖次数
 * - 总预算消耗
 * - 平均单次消耗
 *
 * 路径参数：
 * - campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（ISO8601格式，默认24小时前）
 * - end_time: 结束时间（ISO8601格式，默认当前时间）
 *
 * 返回示例：
 * {
 *   "total_draws": 1000,
 *   "total_budget_consumed": 10000.00,
 *   "avg_budget_per_draw": 10.00
 * }
 */
router.get(
  '/budget-consumption/:campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const campaign_id = parseInt(req.params.campaign_id)

      if (isNaN(campaign_id)) {
        return res.apiError('campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const { start_time, end_time } = parseTimeRange(req.query)

      // 🔴 修正：调用正确的服务方法 getBudgetConsumption（不是 getBudgetConsumptionStats）并使用 options 对象参数格式
      const result = await getLotteryAnalyticsService(req).getBudgetConsumption(campaign_id, {
        start_time,
        end_time
      })

      logger.info('查询预算消耗统计', {
        admin_id: req.user.user_id,
        campaign_id,
        start_time,
        end_time,
        total_budget_consumed: result.total_budget_consumed
      })

      return res.apiSuccess(result, '获取预算消耗统计成功')
    } catch (error) {
      logger.error('获取预算消耗统计失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_BUDGET_CONSUMPTION_FAILED', null, 500)
    }
  }
)

module.exports = router
