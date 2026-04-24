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
 * @module routes/v4/console/lottery/lottery-strategy-stats
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * 获取 LotteryStatisticsService 的辅助函数
 * （趋势统计、档位分布、体验机制触发、预算消耗等）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryStatisticsService 实例
 */
function getLotteryAnalyticsService(req) {
  return req.app.locals.services.getService('lottery_analytics_statistics')
}

/**
 * 获取 LotteryRealtimeService 的辅助函数
 * （实时概览统计）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryRealtimeService 实例
 */
function getLotteryRealtimeService(req) {
  return req.app.locals.services.getService('lottery_analytics_realtime')
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
 * GET /realtime/:lottery_campaign_id - 获取实时概览统计
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
 * - lottery_campaign_id: 活动ID
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
router.get(
  '/realtime/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    // 🔴 调用 RealtimeService 的 getRealtimeOverview 方法
    const result = await getLotteryRealtimeService(req).getRealtimeOverview(lottery_campaign_id)

    logger.info('查询实时概览统计', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      today_total_draws: result.today?.total_draws || 0
    })

    return res.apiSuccess(result, '获取实时概览统计成功')
  }
))

/*
 * ==========================================
 * 2. 小时级趋势数据
 * ==========================================
 */

/**
 * GET /hourly/:lottery_campaign_id - 获取小时级趋势数据
 *
 * 提供指定时间范围内的小时级统计趋势，包括：
 * - 每小时抽奖次数
 * - 每小时独立用户数
 * - 每小时空奖率
 * - 每小时高价值率
 * - 每小时平均消耗
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（ISO8601格式，默认24小时前）
 * - end_time: 结束时间（ISO8601格式，默认当前时间）
 *
 * 返回：小时级统计数据列表
 */
router.get(
  '/hourly/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_time, end_time } = parseTimeRange(req.query)

    // 🔴 修正：调用正确的服务方法 getHourlyTrend 并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getHourlyTrend(lottery_campaign_id, {
      start_time,
      end_time
    })

    logger.info('查询小时级趋势数据', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_time,
      end_time,
      data_points: result.length
    })

    return res.apiSuccess(
      {
        lottery_campaign_id,
        start_time,
        end_time,
        data: result
      },
      '获取小时级趋势数据成功'
    )
  }
))

/*
 * ==========================================
 * 3. 日级趋势数据
 * ==========================================
 */

/**
 * GET /daily/:lottery_campaign_id - 获取日级趋势数据
 *
 * 提供指定日期范围内的日级统计趋势。
 * 数据来源：lottery_daily_metrics（永久保留）
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
 *
 * Query参数：
 * - start_date: 开始日期（YYYY-MM-DD，默认7天前）
 * - end_date: 结束日期（YYYY-MM-DD，默认今天）
 *
 * 返回：日级统计数据列表
 */
router.get(
  '/daily/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_date, end_date } = parseDateRange(req.query)

    // 🔴 修正：调用正确的服务方法 getDailyTrend 并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getDailyTrend(lottery_campaign_id, {
      start_date,
      end_date
    })

    logger.info('查询日级趋势数据', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_date,
      end_date,
      data_points: result.length
    })

    return res.apiSuccess(
      {
        lottery_campaign_id,
        start_date,
        end_date,
        data: result
      },
      '获取日级趋势数据成功'
    )
  }
))

/*
 * ==========================================
 * 4. 奖品档位分布统计
 * ==========================================
 */

/**
 * GET /tier-distribution/:lottery_campaign_id - 获取奖品档位分布
 *
 * 统计指定时间范围内各奖品档位的分布情况：
 * - high: 高价值奖品
 * - mid: 中价值奖品
 * - low: 低价值奖品
 * - fallback: 保底奖品
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
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
  '/tier-distribution/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_time, end_time } = parseTimeRange(req.query)

    // 🔴 修正：使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getTierDistribution(
      lottery_campaign_id,
      {
        start_time,
        end_time
      }
    )

    logger.info('查询奖品档位分布', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_time,
      end_time,
      total_draws: result.total_draws
    })

    return res.apiSuccess(result, '获取奖品档位分布成功')
  }
))

/*
 * ==========================================
 * 5. 体验机制触发统计
 * ==========================================
 */

/**
 * GET /experience-triggers/:lottery_campaign_id - 获取体验机制触发统计
 *
 * 统计指定时间范围内各体验机制的触发情况：
 * - pity_triggered: Pity 保底触发次数
 * - anti_empty_triggered: 反连空触发次数
 * - anti_high_triggered: 反连高触发次数
 * - luck_debt_triggered: 运气债务触发次数
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
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
  '/experience-triggers/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_time, end_time } = parseTimeRange(req.query)

    // 🔴 修正：调用正确的服务方法 getExperienceTriggers（不是 getExperienceTriggerStats）并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getExperienceTriggers(
      lottery_campaign_id,
      {
        start_time,
        end_time
      }
    )

    logger.info('查询体验机制触发统计', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_time,
      end_time,
      total_draws: result.total_draws
    })

    return res.apiSuccess(result, '获取体验机制触发统计成功')
  }
))

/*
 * ==========================================
 * 6. 预算消耗统计
 * ==========================================
 */

/**
 * GET /budget-consumption/:lottery_campaign_id - 获取预算消耗统计
 *
 * 统计指定时间范围内的预算消耗情况：
 * - 总抽奖次数
 * - 总预算消耗
 * - 平均单次消耗
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
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
  '/budget-consumption/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

    if (isNaN(lottery_campaign_id)) {
      return res.apiError('lottery_campaign_id 必须为有效数字', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { start_time, end_time } = parseTimeRange(req.query)

    // 🔴 修正：调用正确的服务方法 getBudgetConsumption（不是 getBudgetConsumptionStats）并使用 options 对象参数格式
    const result = await getLotteryAnalyticsService(req).getBudgetConsumption(
      lottery_campaign_id,
      {
        start_time,
        end_time
      }
    )

    logger.info('查询预算消耗统计', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_time,
      end_time,
      total_budget_consumed: result.total_budget_consumed
    })

    return res.apiSuccess(result, '获取预算消耗统计成功')
  }
))

/*
 * ==========================================
 * 7. 策略配置概览摘要（辅助运营人员）
 * ==========================================
 */

/**
 * GET /config-summary - 获取策略配置概览摘要
 *
 * 为策略配置页面提供运营辅助信息，聚合以下维度：
 * - 策略配置总览（活跃策略数、分组统计、矩阵配置数）
 * - 关联活动信息（活跃活动数及列表）
 * - 最近24小时策略执行概况（抽奖总数、档位分布、保底触发率）
 * - BxPx矩阵命中分布（决策表中各组合的实际命中次数）
 *
 * 无需路径参数，自动汇总所有活跃活动的数据。
 *
 * 返回示例：
 * {
 *   "config_overview": {
 *     "total_strategies": 17,
 *     "active_strategies": 17,
 *     "config_groups": { "anti_empty": 2, "pity": 4, ... },
 *     "matrix_configs": 12,
 *     "active_matrix_configs": 12
 *   },
 *   "active_campaigns": [...],
 *   "recent_24h": {
 *     "total_draws": 150,
 *     "tier_distribution": { "high": 80, "mid": 20, "low": 30, "fallback": 20 },
 *     "guarantee_triggered": 12,
 *     "guarantee_rate": 0.08,
 *     "downgrade_count": 5
 *   },
 *   "bxpx_hit_distribution": [
 *     { "budget_tier": "B3", "pressure_tier": "P1", "count": 120 }, ...
 *   ]
 * }
 */
router.get('/config-summary', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const { LotteryStrategyConfig, LotteryTierMatrixConfig, LotteryCampaign, sequelize } =
    req.app.locals.models
  const { Op } = require('sequelize')

  // ── 1. 策略配置总览 ──
  const allStrategies = await LotteryStrategyConfig.findAll({
    attributes: ['config_group', 'config_key', 'is_active'],
    order: [
      ['config_group', 'ASC'],
      ['priority', 'ASC']
    ]
  })

  const activeStrategies = allStrategies.filter(s => s.is_active)
  const configGroups = {}
  for (const s of allStrategies) {
    configGroups[s.config_group] = (configGroups[s.config_group] || 0) + 1
  }

  const matrixConfigs = await LotteryTierMatrixConfig.findAll({
    attributes: ['budget_tier', 'pressure_tier', 'is_active']
  })
  const activeMatrixConfigs = matrixConfigs.filter(m => m.is_active)

  // ── 2. 活跃活动列表 ──
  const activeCampaigns = await LotteryCampaign.findAll({
    where: { status: 'active' },
    attributes: ['lottery_campaign_id', 'campaign_name', 'pick_method', 'budget_mode'],
    order: [['lottery_campaign_id', 'ASC']]
  })

  // 批量查询 guarantee 配置（从 lottery_strategy_config 聚合，避免 N+1）
  const campaignIds = activeCampaigns.map(c => c.lottery_campaign_id)
  const guaranteeMap = new Map()
  if (campaignIds.length > 0) {
    const guaranteeConfigs = await LotteryStrategyConfig.findAll({
      where: {
        lottery_campaign_id: { [Op.in]: campaignIds },
        config_group: 'guarantee',
        config_key: { [Op.in]: ['enabled', 'threshold'] },
        is_active: 1
      },
      attributes: ['lottery_campaign_id', 'config_key', 'config_value']
    })
    guaranteeConfigs.forEach(gc => {
      if (!guaranteeMap.has(gc.lottery_campaign_id)) {
        guaranteeMap.set(gc.lottery_campaign_id, {})
      }
      const parsed_value = (() => {
        try {
          return JSON.parse(gc.config_value)
        } catch {
          return gc.config_value
        }
      })()
      guaranteeMap.get(gc.lottery_campaign_id)[gc.config_key] = parsed_value
    })
  }

  // ── 3. 最近24小时策略执行概况（直接查 lottery_draws） ──
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [recentStats] = await sequelize.query(
    `
      SELECT
        COUNT(*)                                        AS total_draws,
        SUM(reward_tier = 'high')                       AS high_count,
        SUM(reward_tier = 'mid')                        AS mid_count,
        SUM(reward_tier = 'low')                        AS low_count,
        SUM(reward_tier = 'fallback')                   AS fallback_count,
        SUM(guarantee_triggered = 1)                    AS guarantee_triggered,
        SUM(downgrade_count > 0)                        AS downgrade_records,
        SUM(fallback_triggered = 1)                     AS fallback_records,
        ROUND(AVG(cost_points), 1)                      AS avg_cost
      FROM lottery_draws
      WHERE created_at >= :since
    `,
    {
      replacements: { since: twentyFourHoursAgo },
      type: sequelize.QueryTypes.SELECT
    }
  )

  const totalDraws = parseInt(recentStats.total_draws) || 0
  const guaranteeTriggered = parseInt(recentStats.guarantee_triggered) || 0

  // ── 4. BxPx 矩阵命中分布（最近24小时决策表） ──
  const bxpxHits = await sequelize.query(
    `
      SELECT
        budget_tier,
        pressure_tier,
        COUNT(*) AS count
      FROM lottery_draw_decisions
      WHERE decision_at >= :since
        AND budget_tier IS NOT NULL
        AND pressure_tier IS NOT NULL
      GROUP BY budget_tier, pressure_tier
      ORDER BY budget_tier, pressure_tier
    `,
    {
      replacements: { since: twentyFourHoursAgo },
      type: sequelize.QueryTypes.SELECT
    }
  )

  const result = {
    config_overview: {
      total_strategies: allStrategies.length,
      active_strategies: activeStrategies.length,
      config_groups: configGroups,
      matrix_configs: matrixConfigs.length,
      active_matrix_configs: activeMatrixConfigs.length
    },
    active_campaigns: activeCampaigns.map(c => {
      const gConfig = guaranteeMap.get(c.lottery_campaign_id) || {}
      return {
        ...c.toJSON(),
        guarantee_enabled: gConfig.enabled || false,
        guarantee_threshold: gConfig.threshold || 10
      }
    }),
    recent_24h: {
      total_draws: totalDraws,
      tier_distribution: {
        high: parseInt(recentStats.high_count) || 0,
        mid: parseInt(recentStats.mid_count) || 0,
        low: parseInt(recentStats.low_count) || 0,
        fallback: parseInt(recentStats.fallback_count) || 0
      },
      guarantee_triggered: guaranteeTriggered,
      guarantee_rate:
        totalDraws > 0 ? parseFloat((guaranteeTriggered / totalDraws).toFixed(4)) : 0,
      downgrade_records: parseInt(recentStats.downgrade_records) || 0,
      fallback_records: parseInt(recentStats.fallback_records) || 0,
      avg_cost: parseFloat(recentStats.avg_cost) || 0
    },
    bxpx_hit_distribution: bxpxHits || []
  }

  logger.info('查询策略配置概览摘要', {
    admin_id: req.user.user_id,
    total_strategies: result.config_overview.total_strategies,
    active_campaigns: result.active_campaigns.length,
    recent_draws: result.recent_24h.total_draws
  })

  return res.apiSuccess(result, '获取策略配置概览摘要成功')
}))

module.exports = router
