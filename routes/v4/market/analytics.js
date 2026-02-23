/**
 * 市场域 - 市场数据分析（用户端 + 管理端共用）
 *
 * @route /api/v4/market/analytics
 * @description 定价建议、市场总览、价格历史
 *
 * API列表：
 * - GET /analytics/pricing-advice  - 定价建议（卖家视角）
 * - GET /analytics/overview        - 市场总览
 * - GET /analytics/history         - 价格历史
 *
 * @version 1.0.0
 * @date 2026-02-23
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger

/**
 * @route GET /api/v4/market/analytics/pricing-advice
 * @desc 获取定价建议（卖家挂牌定价参考）
 * @access Private
 * @query {string} asset_code - 资产代码（与 template_id 二选一）
 * @query {number} template_id - 物品模板ID
 */
router.get('/analytics/pricing-advice', authenticateToken, async (req, res) => {
  try {
    const { asset_code, template_id } = req.query
    if (!asset_code && !template_id) {
      return res.apiError('需要 asset_code 或 template_id 参数', 'MISSING_PARAMS', null, 400)
    }

    const MarketAnalyticsService = req.app.locals.services.getService('market_analytics')
    const result = await MarketAnalyticsService.getPricingAdvice({ asset_code, template_id })

    return res.apiSuccess(result, '获取定价建议成功')
  } catch (error) {
    logger.error('获取定价建议失败', { error: error.message })
    return handleServiceError(error, res, '获取定价建议')
  }
})

/**
 * @route GET /api/v4/market/analytics/overview
 * @desc 市场总览（各资产成交量排行）
 * @access Private
 */
router.get('/analytics/overview', authenticateToken, async (req, res) => {
  try {
    const MarketAnalyticsService = req.app.locals.services.getService('market_analytics')
    const result = await MarketAnalyticsService.getMarketOverview()

    return res.apiSuccess(result, '获取市场总览成功')
  } catch (error) {
    logger.error('获取市场总览失败', { error: error.message })
    return handleServiceError(error, res, '获取市场总览')
  }
})

/**
 * @route GET /api/v4/market/analytics/history
 * @desc 价格历史
 * @access Private
 * @query {string} asset_code - 资产代码
 * @query {number} days - 天数（默认30）
 */
router.get('/analytics/history', authenticateToken, async (req, res) => {
  try {
    const { asset_code, days } = req.query
    if (!asset_code) {
      return res.apiError('需要 asset_code 参数', 'MISSING_PARAMS', null, 400)
    }

    const MarketAnalyticsService = req.app.locals.services.getService('market_analytics')
    const result = await MarketAnalyticsService.getAssetPriceHistory({
      asset_code,
      days: parseInt(days) || 30
    })

    return res.apiSuccess(result, '获取价格历史成功')
  } catch (error) {
    logger.error('获取价格历史失败', { error: error.message })
    return handleServiceError(error, res, '获取价格历史')
  }
})

module.exports = router
