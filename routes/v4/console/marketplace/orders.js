/**
 * C2C 二级市场交易订单管理 API
 *
 * @route /api/v4/console/marketplace/orders/*
 * @description C2C 交易订单列表、详情、统计（合并原 trade_orders 和 trade-orders 两处重复路由）
 * @security JWT + Admin权限
 * @module routes/v4/console/marketplace/orders
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../../../../middleware/validation')

/**
 * 获取 TradeOrderService 实例
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} TradeOrderService 服务实例
 */
function getTradeOrderService(req) {
  return req.app.locals.services.getService('trade_order')
}

/**
 * GET / - 查询交易订单列表
 */
router.get('/', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const TradeOrderService = getTradeOrderService(req)
  const {
    buyer_user_id,
    seller_user_id,
    market_listing_id,
    merchant_id,
    status,
    asset_code,
    order_no,
    start_time,
    end_time,
    page = 1,
    page_size = 20
  } = req.query

  const result = await TradeOrderService.getOrders({
    buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : undefined,
    seller_user_id: seller_user_id ? parseInt(seller_user_id) : undefined,
    market_listing_id: market_listing_id ? parseInt(market_listing_id) : undefined,
    merchant_id: merchant_id ? parseInt(merchant_id) : undefined,
    order_no: order_no || undefined,
    status,
    asset_code,
    start_time,
    end_time,
    page: parseInt(page),
    page_size: parseInt(page_size)
  })

  logger.info('[C2C市场-订单] 查询列表', {
    admin_id: req.user.user_id,
    filters: { buyer_user_id, seller_user_id, merchant_id, status },
    total: result.pagination.total
  })

  return res.apiSuccess(result, '查询交易订单成功')
}))

/**
 * GET /stats - 交易订单统计汇总
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const TradeOrderService = getTradeOrderService(req)
  const { start_time, end_time, seller_user_id, buyer_user_id } = req.query

  const stats = await TradeOrderService.getOrderStats({
    start_time,
    end_time,
    seller_user_id: seller_user_id ? parseInt(seller_user_id) : undefined,
    buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : undefined
  })

  return res.apiSuccess(stats, '获取交易订单统计成功')
}))

/**
 * GET /user/:user_id/stats - 用户交易历史统计
 */
router.get('/user/:user_id/stats', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const TradeOrderService = getTradeOrderService(req)
  const user_id = parseInt(req.params.user_id)
  const stats = await TradeOrderService.getUserTradeStats(user_id)
  return res.apiSuccess(stats, '获取用户交易统计成功')
}))

/**
 * GET /by-business-id/:business_id - 根据业务ID查询订单
 */
router.get(
  '/by-business-id/:business_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const TradeOrderService = getTradeOrderService(req)
    const order = await TradeOrderService.getOrderByBusinessId(req.params.business_id)
    if (!order) return res.apiError('订单不存在', 'ORDER_NOT_FOUND', null, 404)
    return res.apiSuccess(order, '获取订单详情成功')
}))

/**
 * GET /:id - 获取单个交易订单详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), asyncHandler(async (req, res) => {
  const TradeOrderService = getTradeOrderService(req)
  const order = await TradeOrderService.getOrderDetail(parseInt(req.params.id))
  if (!order) return res.apiError('订单不存在', 'ORDER_NOT_FOUND', null, 404)
  return res.apiSuccess(order, '获取订单详情成功')
}))

module.exports = router
