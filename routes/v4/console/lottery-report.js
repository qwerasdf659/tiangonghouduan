/**
 * @file 抽奖报表生成路由 - ReportService
 * @description 提供抽奖系统报表生成相关的API接口
 *
 * URL重命名方案（2026-01-31 大文件拆分方案 Phase 2）：
 * - /console/lottery-analytics/daily-report → /console/lottery-report/daily
 * - /console/lottery-monitoring/campaign-report/:lottery_campaign_id → /console/lottery-report/campaign/:lottery_campaign_id
 *
 * 对应服务：lottery_analytics_report (ReportService)
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
 * 获取 ReportService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} ReportService 实例
 */
function getReportService(req) {
  return req.app.locals.services.getService('lottery_analytics_report')
}

/*
 * ==========================================
 * 1. 每日报表 - /daily
 * ==========================================
 */

/**
 * GET /daily - 获取每日抽奖报表
 *
 * Query参数：
 * - date: 报表日期（YYYY-MM-DD格式，默认昨天）
 * - lottery_campaign_id: 活动ID（可选，不传则汇总所有活动）
 *
 * 返回数据：
 * - report_date: 报表日期
 * - summary: 核心指标汇总
 * - hourly_trend: 小时趋势
 * - prize_distribution: 奖品分布
 * - user_metrics: 用户指标
 */
router.get('/daily', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { date, lottery_campaign_id } = req.query

    const reportService = getReportService(req)

    const report = await reportService.getDailyReport({
      date,
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined
    })

    logger.info('获取每日报表成功', {
      admin_id: req.user.user_id,
      report_date: report.report_date,
      lottery_campaign_id: lottery_campaign_id || 'all'
    })

    return res.apiSuccess(report, '获取每日报表成功')
  } catch (error) {
    logger.error('获取每日报表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_DAILY_REPORT_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 2. 活动报表 - /campaign/:lottery_campaign_id
 * ==========================================
 */

/**
 * GET /campaign/:lottery_campaign_id - 获取活动专属报表
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
 *
 * Query参数：
 * - start_date: 开始日期（YYYY-MM-DD，可选）
 * - end_date: 结束日期（YYYY-MM-DD，可选）
 *
 * 返回数据：
 * - campaign_info: 活动基本信息
 * - summary: 活动汇总指标
 * - daily_trend: 日趋势数据
 * - prize_stats: 奖品发放统计
 * - tier_distribution: 档位分布
 * - user_participation: 用户参与度
 */
router.get(
  '/campaign/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)
      const { start_date, end_date } = req.query

      if (!lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const reportService = getReportService(req)

      const report = await reportService.getCampaignReport(lottery_campaign_id, {
        start_date,
        end_date
      })

      logger.info('获取活动报表成功', {
        admin_id: req.user.user_id,
        lottery_campaign_id,
        start_date,
        end_date
      })

      return res.apiSuccess(report, '获取活动报表成功')
    } catch (error) {
      logger.error('获取活动报表失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_REPORT_FAILED', null, 500)
    }
  }
)

module.exports = router
