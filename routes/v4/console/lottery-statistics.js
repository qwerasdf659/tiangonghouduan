/**
 * @file 抽奖统计趋势路由 - StatisticsService
 * @description 提供抽奖系统统计趋势相关的API接口
 *
 * URL重命名方案（2026-01-31 大文件拆分方案 Phase 2）：
 * - /console/lottery-monitoring/hourly-metrics → /console/lottery-statistics/hourly
 * - /console/lottery-monitoring/hourly-metrics/:id → /console/lottery-statistics/hourly/:id
 * - /console/lottery-monitoring/hourly-metrics/summary/:lottery_campaign_id → /console/lottery-statistics/hourly/summary/:lottery_campaign_id
 *
 * 对应服务：lottery_analytics_statistics (StatisticsService)
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 StatisticsService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} StatisticsService 实例
 */
function getStatisticsService(req) {
  return req.app.locals.services.getService('lottery_analytics_statistics')
}

/*
 * ==========================================
 * 1. 小时统计指标 - /hourly
 * ==========================================
 */

/**
 * GET /hourly - 查询抽奖小时统计指标列表
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - start_time: 开始时间（ISO8601格式，可选）
 * - end_time: 结束时间（ISO8601格式，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认24）
 *
 * 返回：统计指标列表和分页信息
 */
router.get('/hourly', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, start_time, end_time, page = 1, page_size = 24 } = req.query

    const result = await getStatisticsService(req).getHourlyMetrics({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      start_time,
      end_time,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询小时统计指标', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      start_time,
      end_time,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询小时统计成功')
  } catch (error) {
    logger.error('查询小时统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_HOURLY_METRICS_FAILED', null, 500)
  }
})

/**
 * GET /hourly/:id - 获取单条小时统计指标详情
 *
 * 路径参数：
 * - id: 统计记录ID
 *
 * 返回：统计指标详情
 */
router.get('/hourly/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const id = parseInt(req.params.id)

    if (!id || isNaN(id)) {
      return res.apiError('无效的记录ID', 'INVALID_METRIC_ID', null, 400)
    }

    const result = await getStatisticsService(req).getHourlyMetricById(id)

    if (!result) {
      return res.apiError('统计记录不存在', 'METRIC_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(result, '获取统计详情成功')
  } catch (error) {
    logger.error('获取统计详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_HOURLY_METRIC_FAILED', null, 500)
  }
})

/**
 * GET /hourly/summary/:lottery_campaign_id - 获取活动统计汇总
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
 *
 * Query参数：
 * - start_time: 开始时间（可选）
 * - end_time: 结束时间（可选）
 *
 * 返回：统计汇总数据
 */
router.get(
  '/hourly/summary/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)
      const { start_time, end_time } = req.query

      if (!lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const summary = await getStatisticsService(req).getHourlyMetricsSummary(
        lottery_campaign_id,
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

module.exports = router
