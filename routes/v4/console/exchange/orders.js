/**
 * B2C 兑换订单管理 API
 *
 * @route /api/v4/console/exchange/orders/*
 * @description 兑换订单列表、详情、审核、发货、退款、拒绝、完成、物流
 * @security JWT + Admin权限
 * @module routes/v4/console/exchange/orders
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/** GET /shipping-companies - 快递公司列表 */
router.get('/shipping-companies', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ShippingService = req.app.locals.services.getService('shipping_track')
    const companies = ShippingService.getCompanies()
    return res.apiSuccess({ companies }, '获取快递公司列表成功')
  } catch (error) {
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/** GET / - 管理员获取兑换订单列表 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      status,
      user_id,
      exchange_item_id,
      order_no,
      source,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const result = await ExchangeQueryService.getAdminOrders({
      status,
      user_id: user_id ? parseInt(user_id) : null,
      exchange_item_id: exchange_item_id ? parseInt(exchange_item_id) : null,
      order_no,
      source,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })
    return res.apiSuccess(
      { orders: result.orders, pagination: result.pagination, filters: result.filters },
      '订单列表查询成功'
    )
  } catch (error) {
    logger.error('[B2C兑换-订单] 查询失败', { error: error.message })
    return res.apiError(error.message || '查询订单列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** GET /:order_no - 管理员获取兑换订单详情 */
router.get('/:order_no', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const result = await ExchangeQueryService.getAdminOrderDetail(req.params.order_no)
    return res.apiSuccess({ order: result.order }, '订单详情查询成功')
  } catch (error) {
    if (error.errorCode === 'ORDER_NOT_FOUND' || error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    return res.apiError(error.message || '查询订单详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** GET /:order_no/track - 查询物流轨迹 */
router.get('/:order_no/track', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { order_no } = req.params
    const ExchangeRecord =
      req.app.locals.services.getService('exchange_admin').models.ExchangeRecord
    const order = await ExchangeRecord.findOne({
      where: { order_no },
      attributes: ['shipping_company', 'shipping_company_name', 'shipping_no', 'shipped_at']
    })
    if (!order) {
      return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
    }
    if (!order.shipping_no) {
      return res.apiSuccess({ has_shipping: false, message: '该订单尚未填写快递信息' })
    }
    const ShippingService = req.app.locals.services.getService('shipping_track')
    const track = await ShippingService.queryTrack(order.shipping_no, order.shipping_company)
    return res.apiSuccess({
      has_shipping: true,
      shipping_company: order.shipping_company,
      shipping_company_name: order.shipping_company_name,
      shipping_no: order.shipping_no,
      shipped_at: order.shipped_at,
      track
    })
  } catch (error) {
    logger.error('[B2C兑换-订单] 物流查询失败', { error: error.message })
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/** POST /:order_no/approve - 审核通过 */
router.post('/:order_no/approve', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '' } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.updateOrderStatus(
        order_no,
        'approved',
        req.user.user_id,
        remark || '管理员审核通过',
        { transaction }
      )
    })
    logger.info('[B2C兑换-订单] 审核通过', { operator_id: req.user.user_id, order_no })
    return res.apiSuccess(result.order, '订单审核通过')
  } catch (error) {
    if (error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.statusCode === 400) {
      return res.apiError(error.message, 'BAD_REQUEST', error.data, 400)
    }
    return res.apiError(error.message || '审核失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** POST /:order_no/ship - 发货 */
router.post('/:order_no/ship', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '', shipping_company, shipping_company_name, shipping_no } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      const updateResult = await ExchangeCoreService.updateOrderStatus(
        order_no,
        'shipped',
        req.user.user_id,
        remark,
        { transaction }
      )
      if (shipping_company || shipping_no) {
        const ExchangeRecord =
          req.app.locals.services.getService('exchange_admin').models.ExchangeRecord
        await ExchangeRecord.update(
          {
            shipping_company: shipping_company || null,
            shipping_company_name: shipping_company_name || null,
            shipping_no: shipping_no || null
          },
          { where: { order_no }, transaction }
        )
      }
      return updateResult
    })
    logger.info('[B2C兑换-订单] 发货成功', {
      operator_id: req.user.user_id,
      order_no,
      shipping_company,
      shipping_no
    })
    return res.apiSuccess(result.order, result.message)
  } catch (error) {
    if (error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.statusCode === 400) {
      return res.apiError(error.message, 'BAD_REQUEST', error.data, 400)
    }
    return res.apiError(error.message || '发货失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** POST /:order_no/refund - 退款 */
router.post('/:order_no/refund', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '' } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.refundOrder(order_no, req.user.user_id, remark, {
        transaction
      })
    })
    return res.apiSuccess(result.order, result.message)
  } catch (error) {
    if (error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.statusCode === 400) {
      return res.apiError(error.message, 'BAD_REQUEST', error.data, 400)
    }
    return res.apiError(error.message || '退款失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** POST /:order_no/reject - 拒绝 */
router.post('/:order_no/reject', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '' } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.rejectOrder(order_no, req.user.user_id, remark, {
        transaction
      })
    })
    return res.apiSuccess(result.order, result.message)
  } catch (error) {
    if (error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.statusCode === 400) {
      return res.apiError(error.message, 'BAD_REQUEST', error.data, 400)
    }
    return res.apiError(error.message || '拒绝失败', 'INTERNAL_ERROR', null, 500)
  }
})

/** POST /:order_no/complete - 标记完成 */
router.post('/:order_no/complete', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '' } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      return await ExchangeCoreService.updateOrderStatus(
        order_no,
        'completed',
        req.user.user_id,
        remark || '管理员标记完成',
        { transaction }
      )
    })
    return res.apiSuccess(result.order, '订单已完成')
  } catch (error) {
    if (error.statusCode === 404) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.statusCode === 400) {
      return res.apiError(error.message, 'BAD_REQUEST', error.data, 400)
    }
    return res.apiError(error.message || '完成订单失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
