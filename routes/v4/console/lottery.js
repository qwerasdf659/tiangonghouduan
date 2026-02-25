/**
 * 抽奖分析Dashboard路由（Lottery Dashboard）
 *
 * @route /api/v4/console/lottery
 * @description 为运营仪表盘"抽奖分析"模块提供数据接口
 *
 * 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供抽奖分析所需的统计、趋势、分布、排行等聚合数据
 * - 所有查询通过 ServiceManager 调用 LotteryAnalyticsQueryService（lottery_analytics_query）
 * - 路由层不直连 models，数据库操作全部收口到 Service 层
 *
 * API列表：
 * - GET /stats - 抽奖统计数据（总抽奖次数、中奖次数、中奖率、奖品价值）
 * - GET /trend - 抽奖趋势数据（按时间范围的趋势图表数据）
 * - GET /prize-distribution - 奖品分布数据（各档位奖品的分布占比）
 * - GET /campaign-ranking - 活动排行数据（按抽奖次数/中奖率排序的活动列表）
 *
 * @module routes/v4/console/lottery
 * @created 2026-02-04
 * @updated 2026-02-24（收口到 Service 层 + merchant_id 数据隔离）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/console/lottery/stats
 * @desc 获取抽奖统计数据（总抽奖次数、中奖次数、中奖率、奖品总价值）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {number} [merchant_id] - 按商家筛选（可选，通过 LotteryPrize 关联）
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', merchant_id } = req.query

    logger.info('[抽奖分析] 获取抽奖统计数据', {
      admin_id: req.user.user_id,
      range,
      merchant_id: merchant_id || null
    })

    const LotteryAnalyticsQueryService =
      req.app.locals.services.getService('lottery_analytics_query')
    const result = await LotteryAnalyticsQueryService.getDashboardStats({
      range,
      merchant_id: merchant_id ? parseInt(merchant_id) : undefined
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[抽奖分析] 获取抽奖统计失败', { error: error.message })
    return handleServiceError(error, res, '获取抽奖统计失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/trend
 * @desc 获取抽奖趋势数据（按天/小时的抽奖次数和中奖率趋势）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {string} [granularity=day] - 数据粒度（hour/day）
 * @query {number} [merchant_id] - 按商家筛选（可选）
 */
router.get('/trend', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', granularity = 'day', merchant_id } = req.query

    logger.info('[抽奖分析] 获取抽奖趋势数据', {
      admin_id: req.user.user_id,
      range,
      granularity,
      merchant_id: merchant_id || null
    })

    const LotteryAnalyticsQueryService =
      req.app.locals.services.getService('lottery_analytics_query')
    const result = await LotteryAnalyticsQueryService.getDashboardTrend({
      range,
      granularity,
      merchant_id: merchant_id ? parseInt(merchant_id) : undefined
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[抽奖分析] 获取抽奖趋势失败', { error: error.message })
    return handleServiceError(error, res, '获取抽奖趋势失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/prize-distribution
 * @desc 获取奖品分布数据（各档位奖品的分布占比）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {number} [merchant_id] - 按商家筛选（可选）
 */
router.get('/prize-distribution', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', merchant_id } = req.query

    logger.info('[抽奖分析] 获取奖品分布数据', {
      admin_id: req.user.user_id,
      range,
      merchant_id: merchant_id || null
    })

    const LotteryAnalyticsQueryService =
      req.app.locals.services.getService('lottery_analytics_query')
    const result = await LotteryAnalyticsQueryService.getDashboardPrizeDistribution({
      range,
      merchant_id: merchant_id ? parseInt(merchant_id) : undefined
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[抽奖分析] 获取奖品分布失败', { error: error.message })
    return handleServiceError(error, res, '获取奖品分布失败')
  }
})

/**
 * @route GET /api/v4/console/lottery/campaign-ranking
 * @desc 获取活动排行数据（按抽奖次数排序的活动列表）
 * @access Private (管理员，role_level >= 100)
 *
 * @query {string} [range=7d] - 统计时间范围（7d/30d/90d）
 * @query {string} [sort_by=draws] - 排序字段（draws/wins）
 * @query {number} [limit=10] - 返回数量
 * @query {number} [merchant_id] - 按商家筛选（可选）
 */
router.get('/campaign-ranking', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { range = '7d', sort_by = 'draws', limit = 10, merchant_id } = req.query

    logger.info('[抽奖分析] 获取活动排行数据', {
      admin_id: req.user.user_id,
      range,
      sort_by,
      limit,
      merchant_id: merchant_id || null
    })

    const LotteryAnalyticsQueryService =
      req.app.locals.services.getService('lottery_analytics_query')
    const result = await LotteryAnalyticsQueryService.getDashboardCampaignRanking({
      range,
      sort_by,
      limit: parseInt(limit),
      merchant_id: merchant_id ? parseInt(merchant_id) : undefined
    })

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[抽奖分析] 获取活动排行失败', { error: error.message })
    return handleServiceError(error, res, '获取活动排行失败')
  }
})

module.exports = router
