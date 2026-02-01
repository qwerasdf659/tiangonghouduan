/**
 * @file 抽奖活动分析路由 - CampaignAnalysisService
 * @description 提供抽奖系统活动维度分析相关的API接口
 *
 * URL重命名方案（2026-01-31 大文件拆分方案 Phase 2）：
 * - /console/lottery-monitoring/campaign-roi/:lottery_campaign_id → /console/lottery-campaign-analysis/roi/:lottery_campaign_id
 * - /console/lottery-monitoring/strategy-effectiveness → /console/lottery-campaign-analysis/strategy-effectiveness
 *
 * 对应服务：lottery_analytics_campaign (CampaignAnalysisService)
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
 * 获取 CampaignAnalysisService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} CampaignAnalysisService 实例
 */
function getCampaignAnalysisService(req) {
  return req.app.locals.services.getService('lottery_analytics_campaign')
}

/*
 * ==========================================
 * 1. 活动 ROI 聚合 - /roi/:lottery_campaign_id
 * ==========================================
 */

/**
 * GET /roi/:lottery_campaign_id - 获取活动 ROI 聚合数据
 *
 * P1 优先级 API：为运营后台提供活动投入产出分析
 *
 * ROI 计算公式：(总收入 - 总成本) / 总收入 * 100
 * - 总收入：用户消耗的积分总额（lottery_draws.cost_points）
 * - 总成本：发放的奖品成本总额（lottery_prizes.cost_points）
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID（数字）
 *
 * Query参数：
 * - start_time: 统计开始时间（ISO8601，可选）
 * - end_time: 统计结束时间（ISO8601，可选）
 *
 * 返回数据：
 * - campaign_info: 活动基础信息
 * - financial: 财务指标
 * - participation: 用户参与指标
 * - tier_analysis: 档位分析
 * - trend: 日趋势数据
 */
router.get(
  '/roi/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)
      const { start_time, end_time } = req.query

      if (!lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const campaignService = getCampaignAnalysisService(req)

      const roi = await campaignService.getCampaignROI(lottery_campaign_id, {
        start_time,
        end_time
      })

      logger.info('获取活动ROI成功', {
        admin_id: req.user.user_id,
        lottery_campaign_id,
        roi_percentage: roi.financial.roi_percentage,
        total_draws: roi.participation.total_draws
      })

      return res.apiSuccess(roi, '获取活动ROI成功')
    } catch (error) {
      logger.error('获取活动ROI失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_ROI_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 2. 策略效果分析 - /strategy-effectiveness
 * ==========================================
 */

/**
 * GET /strategy-effectiveness - 获取策略效果分析
 *
 * 分析抽奖策略（Pity/AntiEmpty/AntiHigh等）的实际效果
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选，不传则汇总所有活动）
 * - time_range: 时间范围（7d/30d/90d，默认30d）
 * - start_date: 自定义开始日期（YYYY-MM-DD）
 * - end_date: 自定义结束日期（YYYY-MM-DD）
 *
 * 返回数据：
 * - strategies: 各策略效果指标
 *   - pity: Pity机制触发次数、触发率、平均触发间隔
 *   - anti_empty: 防空奖触发次数、拯救用户数
 *   - anti_high: 防高奖触发次数、降级奖品价值
 * - comparison: 策略开启/关闭对比
 * - recommendations: 优化建议
 */
router.get(
  '/strategy-effectiveness',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { lottery_campaign_id, time_range = '30d', start_date, end_date } = req.query

      const campaignService = getCampaignAnalysisService(req)

      const result = await campaignService.getStrategyEffectiveness({
        lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
        time_range,
        start_date,
        end_date
      })

      logger.info('获取策略效果分析成功', {
        admin_id: req.user.user_id,
        lottery_campaign_id: lottery_campaign_id || 'all',
        time_range,
        strategies_count: Object.keys(result.strategies).length
      })

      return res.apiSuccess(result, '获取策略效果分析成功')
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
