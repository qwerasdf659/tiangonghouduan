/**
 * @file 交易订单查询路由 - P2表只读查询API
 * @description 提供交易订单的只读查询接口
 *
 * 覆盖P2优先级表：
 * - trade_orders: 交易订单表
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 所有接口均为 GET 方法（只读查询）
 * - 严格遵循项目 snake_case 命名规范
 * - 使用 res.apiSuccess/res.apiError 统一响应格式
 *
 * 服务合并记录（2026-01-21）：
 * - 原 TradeOrderQueryService 已合并到 TradeOrderService
 * - 本路由现使用 TradeOrderService 的静态查询方法
 *
 * @version 1.1.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const TradeOrderService = require('../../../services/TradeOrderService')

/**
 * GET / - 查询交易订单列表
 *
 * Query参数：
 * - buyer_user_id: 买家用户ID（可选）
 * - seller_user_id: 卖家用户ID（可选）
 * - listing_id: 挂牌ID（可选）
 * - status: 订单状态（created/frozen/completed/cancelled/failed，可选）
 * - asset_code: 结算资产代码（可选）
 * - start_time: 开始时间（ISO8601格式，可选）
 * - end_time: 结束时间（ISO8601格式，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：订单列表和分页信息
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      buyer_user_id,
      seller_user_id,
      listing_id,
      status,
      asset_code,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = req.query

    const result = await TradeOrderService.getOrders({
      buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : undefined,
      seller_user_id: seller_user_id ? parseInt(seller_user_id) : undefined,
      listing_id: listing_id ? parseInt(listing_id) : undefined,
      status,
      asset_code,
      start_time,
      end_time,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询交易订单列表', {
      admin_id: req.user.user_id,
      filters: { buyer_user_id, seller_user_id, status },
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询交易订单成功')
  } catch (error) {
    logger.error('查询交易订单失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_ORDERS_FAILED', null, 500)
  }
})

/**
 * GET /stats - 获取交易订单统计汇总
 *
 * Query参数：
 * - start_time: 开始时间（可选）
 * - end_time: 结束时间（可选）
 * - seller_user_id: 卖家用户ID（可选）
 * - buyer_user_id: 买家用户ID（可选）
 *
 * 返回：统计汇总数据
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { start_time, end_time, seller_user_id, buyer_user_id } = req.query

    const stats = await TradeOrderService.getOrderStats({
      start_time,
      end_time,
      seller_user_id: seller_user_id ? parseInt(seller_user_id) : undefined,
      buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : undefined
    })

    logger.info('获取交易订单统计', {
      admin_id: req.user.user_id,
      period: { start_time, end_time }
    })

    return res.apiSuccess(stats, '获取交易订单统计成功')
  } catch (error) {
    logger.error('获取交易订单统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ORDER_STATS_FAILED', null, 500)
  }
})

/**
 * GET /user/:user_id/stats - 获取用户的交易历史统计
 *
 * 路径参数：
 * - user_id: 用户ID
 *
 * 返回：用户交易统计（作为买家和卖家的统计）
 */
router.get('/user/:user_id/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    const stats = await TradeOrderService.getUserTradeStats(user_id)

    logger.info('获取用户交易统计', {
      admin_id: req.user.user_id,
      target_user_id: user_id
    })

    return res.apiSuccess(stats, '获取用户交易统计成功')
  } catch (error) {
    logger.error('获取用户交易统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_USER_TRADE_STATS_FAILED', null, 500)
  }
})

/**
 * GET /by-business-id/:business_id - 根据业务ID查询订单
 *
 * 路径参数：
 * - business_id: 业务唯一键
 *
 * 返回：订单详情
 */
router.get('/by-business-id/:business_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { business_id } = req.params

    const order = await TradeOrderService.getOrderByBusinessId(business_id)

    if (!order) {
      return res.apiError('订单不存在', 'ORDER_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(order, '获取订单详情成功')
  } catch (error) {
    logger.error('根据业务ID查询订单失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ORDER_BY_BUSINESS_ID_FAILED', null, 500)
  }
})

/**
 * GET /:id - 获取单个交易订单详情
 *
 * 路径参数：
 * - id: 订单ID（数字）
 *
 * 返回：订单详情
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const order_id = parseInt(req.params.id)

    const order = await TradeOrderService.getOrderById(order_id)

    if (!order) {
      return res.apiError('订单不存在', 'ORDER_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(order, '获取订单详情成功')
  } catch (error) {
    logger.error('获取订单详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ORDER_FAILED', null, 500)
  }
})

module.exports = router
