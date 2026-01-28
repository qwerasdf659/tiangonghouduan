/**
 * @file 抽奖分析路由
 * @description P2 需求：运营日报聚合 API
 *
 * @version 1.1.0
 * @date 2026-01-28
 *
 * 接口说明：
 * - GET /daily-report - 获取运营日报聚合数据
 *
 * 实现规范（V1.3.0）：
 * - 路由层禁止直接 require models
 * - 通过 ServiceManager 获取 LotteryAnalyticsService
 * - 调用 Service 层的 generateDailyReport 方法
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P2 运营日报聚合 API
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 LotteryAnalyticsService 服务实例
 *
 * 遵循项目规范：通过 req.app.locals.services.getService 获取服务
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAnalyticsService 实例
 */
function getLotteryAnalyticsService(req) {
  /*
   * 服务获取优先级：
   * 1. req.services（测试注入）
   * 2. app.locals.services（项目标准模式）
   * 3. 直接实例化（兜底）
   */
  if (req.services?.lotteryAnalyticsService) {
    return req.services.lotteryAnalyticsService
  }

  // 通过 app.locals.services 获取（项目标准模式）
  const service = req.app.locals.services?.getService('lottery_analytics')
  if (service) {
    return service
  }

  // 兜底：直接实例化（带模型注入）
  logger.warn('通过 app.locals.services 获取 LotteryAnalyticsService 失败，使用直接实例化')
  const LotteryAnalyticsService = require('../../../services/LotteryAnalyticsService')
  const models = req.models || require('../../../models')
  return new LotteryAnalyticsService(models)
}

/*
 * ==========================================
 * 运营日报聚合 API（P2 优先级）
 * ==========================================
 */

/**
 * GET /daily-report - 获取运营日报聚合数据
 *
 * 完整路径：GET /api/v4/console/lottery-analytics/daily-report
 *
 * P2 优先级 API：为运营后台提供每日运营报告
 *
 * Query 参数：
 * - report_date: 报告日期（YYYY-MM-DD，默认昨天）
 * - campaign_id: 活动 ID（可选，不传则汇总所有活动）
 *
 * 返回数据：
 * - report_date: 报告日期
 * - generated_at: 报告生成时间
 * - summary: 当日汇总（抽奖次数、中奖率、成本、收入、ROI、活跃用户）
 * - vs_yesterday: 昨日对比（各指标变化百分比）
 * - vs_last_week: 上周同日对比（各指标变化百分比）
 * - alerts: 告警列表
 * - hourly_breakdown: 24小时分布
 * - tier_breakdown: 档位分布
 * - top_prizes: 热门奖品
 * - campaigns_breakdown: 活动分布
 *
 * 实现规范：
 * - 路由层仅负责参数校验、权限验证、日志记录和响应格式化
 * - 所有数据查询和业务计算逻辑在 Service 层 generateDailyReport() 方法中封装
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P2 运营日报聚合 API
 */
router.get('/daily-report', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { report_date, campaign_id } = req.query

    // 1. 参数校验
    if (report_date && !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) {
      return res.apiError('无效的日期格式，请使用 YYYY-MM-DD', 'INVALID_DATE_FORMAT', null, 400)
    }

    const campaignId = campaign_id ? parseInt(campaign_id) : null
    if (campaign_id && isNaN(campaignId)) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    // 2. 获取 Service 实例
    const analyticsService = getLotteryAnalyticsService(req)

    // 3. 调用 Service 方法生成日报
    const reportData = await analyticsService.generateDailyReport(report_date, campaignId)

    // 4. 记录日志
    logger.info('生成运营日报成功', {
      admin_id: req.user.user_id,
      report_date: reportData.report_date,
      campaign_id: campaignId || 'all',
      total_draws: reportData.summary.total_draws,
      alerts_count: reportData.alerts.length
    })

    // 5. 返回成功响应
    return res.apiSuccess(reportData, '生成运营日报成功')
  } catch (error) {
    logger.error('生成运营日报失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_DAILY_REPORT_FAILED', null, 500)
  }
})

module.exports = router
