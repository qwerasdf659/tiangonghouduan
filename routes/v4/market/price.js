/**
 * 市场域 - 价格发现（用户端）
 *
 * @route /api/v4/market/price
 * @description 价格走势、成交量、价格摘要、最近成交
 *
 * API列表：
 * - GET /price/trend          - 价格走势
 * - GET /price/volume         - 成交量走势
 * - GET /price/summary        - 价格摘要
 * - GET /price/recent-trades  - 最近成交列表
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
 * @route GET /api/v4/market/price/trend
 * @desc 价格走势（按时间粒度聚合）
 * @access Private
 * @query {string} asset_code - 资产代码（与 template_id 二选一）
 * @query {number} template_id - 物品模板ID
 * @query {string} period - 时间范围（1d/7d/30d/90d，默认7d）
 * @query {string} granularity - 聚合粒度（1h/1d/1w，默认1d）
 */
router.get('/price/trend', authenticateToken, async (req, res) => {
  try {
    const { asset_code, template_id, period, granularity } = req.query
    if (!asset_code && !template_id) {
      return res.apiError('需要 asset_code 或 template_id 参数', 'MISSING_PARAMS', null, 400)
    }

    const PriceDiscoveryService = req.app.locals.services.getService('price_discovery')
    const result = await PriceDiscoveryService.getPriceTrend({
      asset_code,
      template_id,
      period,
      granularity
    })

    return res.apiSuccess(result, '获取价格走势成功')
  } catch (error) {
    logger.error('获取价格走势失败', { error: error.message })
    return handleServiceError(error, res, '获取价格走势')
  }
})

/**
 * @route GET /api/v4/market/price/volume
 * @desc 成交量走势
 * @access Private
 */
router.get('/price/volume', authenticateToken, async (req, res) => {
  try {
    const { asset_code, template_id, period, granularity } = req.query
    if (!asset_code && !template_id) {
      return res.apiError('需要 asset_code 或 template_id 参数', 'MISSING_PARAMS', null, 400)
    }

    const PriceDiscoveryService = req.app.locals.services.getService('price_discovery')
    const result = await PriceDiscoveryService.getVolumeTrend({
      asset_code,
      template_id,
      period,
      granularity
    })

    return res.apiSuccess(result, '获取成交量走势成功')
  } catch (error) {
    logger.error('获取成交量走势失败', { error: error.message })
    return handleServiceError(error, res, '获取成交量走势')
  }
})

/**
 * @route GET /api/v4/market/price/summary
 * @desc 价格摘要（中位数、极值、均值、总成交数）
 * @access Private
 */
router.get('/price/summary', authenticateToken, async (req, res) => {
  try {
    const { asset_code, template_id } = req.query
    if (!asset_code && !template_id) {
      return res.apiError('需要 asset_code 或 template_id 参数', 'MISSING_PARAMS', null, 400)
    }

    const PriceDiscoveryService = req.app.locals.services.getService('price_discovery')
    const result = await PriceDiscoveryService.getPriceSummary({ asset_code, template_id })

    return res.apiSuccess(result, '获取价格摘要成功')
  } catch (error) {
    logger.error('获取价格摘要失败', { error: error.message })
    return handleServiceError(error, res, '获取价格摘要')
  }
})

/**
 * @route GET /api/v4/market/price/recent-trades
 * @desc 最近成交列表
 * @access Private
 * @query {number} limit - 数量限制（默认10，最大50）
 */
router.get('/price/recent-trades', authenticateToken, async (req, res) => {
  try {
    const { asset_code, template_id, limit = 10 } = req.query
    if (!asset_code && !template_id) {
      return res.apiError('需要 asset_code 或 template_id 参数', 'MISSING_PARAMS', null, 400)
    }

    const safeLimit = Math.min(parseInt(limit) || 10, 50)
    const PriceDiscoveryService = req.app.locals.services.getService('price_discovery')
    const result = await PriceDiscoveryService.getLatestTrades({
      asset_code,
      template_id,
      limit: safeLimit
    })

    return res.apiSuccess(result, '获取最近成交列表成功')
  } catch (error) {
    logger.error('获取最近成交列表失败', { error: error.message })
    return handleServiceError(error, res, '获取最近成交')
  }
})

module.exports = router
