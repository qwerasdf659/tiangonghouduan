/**
 * B2C 兑换订单管理 API
 *
 * @route /api/v4/console/exchange/orders/*
 * @description 兑换订单列表、详情、审核、发货、退款、拒绝、完成、物流
 * @security JWT + 运营级权限（requireRoleLevel(30)：运营可审核/发货，客服级只读走客服工作台）
 * @module routes/v4/console/exchange/orders
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/** GET /shipping-companies - 快递公司列表 */
router.get(
  '/shipping-companies',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const ShippingService = req.app.locals.services.getService('shipping_track')
    const companies = ShippingService.getCompanies()
    return res.apiSuccess({ companies }, '获取快递公司列表成功')
  })
)

/** GET / - 管理员获取兑换订单列表 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const {
      status,
      user_id,
      exchange_item_id,
      order_no,
      source,
      item_type,
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
      item_type,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })
    return res.apiSuccess(
      { orders: result.orders, pagination: result.pagination, filters: result.filters },
      '订单列表查询成功'
    )
  })
)

/** GET /:order_no - 管理员获取兑换订单详情 */
router.get(
  '/:order_no',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')
    const result = await ExchangeQueryService.getAdminOrderDetail(req.params.order_no)
    return res.apiSuccess({ order: result.order }, '订单详情查询成功')
  })
)

/** GET /:order_no/track - 查询物流轨迹（优先自有轨迹表，降级第三方实时查） */
router.get(
  '/:order_no/track',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const { order_no } = req.params
    const ExchangeRecord =
      req.app.locals.services.getService('exchange_admin').models.ExchangeRecord
    const order = await ExchangeRecord.findOne({
      where: { order_no },
      attributes: [
        'exchange_record_id',
        'shipping_company',
        'shipping_company_name',
        'shipping_no',
        'shipped_at'
      ]
    })
    if (!order) {
      return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
    }
    if (!order.shipping_no) {
      return res.apiSuccess({ has_shipping: false, message: '该订单尚未填写快递信息' })
    }
    const ShippingService = req.app.locals.services.getService('shipping_track')

    // 物流方案一：优先读自有轨迹表（秒回），无则降级第三方实时查
    const localTracks = await ShippingService.getOrderTracks(order.exchange_record_id)
    const track =
      localTracks && localTracks.length > 0
        ? { success: true, source: 'local', tracks: localTracks }
        : await ShippingService.queryTrack(order.shipping_no, order.shipping_company)

    return res.apiSuccess({
      has_shipping: true,
      shipping_company: order.shipping_company,
      shipping_company_name: order.shipping_company_name,
      shipping_no: order.shipping_no,
      shipped_at: order.shipped_at,
      track
    })
  })
)

/** POST /:order_no/approve - 审核通过 */
router.post(
  '/:order_no/approve',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
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
  })
)

/** POST /:order_no/ship - 发货 */
router.post(
  '/:order_no/ship',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { remark = '', shipping_company, shipping_company_name, shipping_no } = req.body
    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(async transaction => {
      // 物流信息随状态变更一并写入（收口到 Service，路由不直连 models）
      const extraFields = {}
      if (shipping_company || shipping_no) {
        extraFields.shipping_company = shipping_company || null
        extraFields.shipping_company_name = shipping_company_name || null
        extraFields.shipping_no = shipping_no || null
      }
      return ExchangeCoreService.updateOrderStatus(order_no, 'shipped', req.user.user_id, remark, {
        transaction,
        extraFields
      })
    })

    /*
     * 发货成功后向第三方网关订阅该单号的轨迹推送（物流方案一·拍板③）。
     * 非阻塞：订阅失败不影响发货结果（.env 未配快递密钥/回调地址时仅记录日志）。
     */
    if (shipping_no && shipping_company) {
      const ShippingService = req.app.locals.services.getService('shipping_track')
      ShippingService.subscribe({ shippingNo: shipping_no, companyCode: shipping_company }).catch(
        subErr => {
          logger.warn('[B2C兑换-订单] 快递订阅失败（不影响发货结果）', {
            order_no,
            error: subErr.message
          })
        }
      )
    }

    logger.info('[B2C兑换-订单] 发货成功', {
      operator_id: req.user.user_id,
      order_no,
      shipping_company,
      shipping_no
    })
    return res.apiSuccess(result.order, result.message)
  })
)

/** POST /:order_no/refund - 退款 */
router.post(
  '/:order_no/refund',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
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
  })
)

/** POST /:order_no/reject - 拒绝 */
router.post(
  '/:order_no/reject',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
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
  })
)

/** POST /:order_no/complete - 标记完成 */
router.post(
  '/:order_no/complete',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
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
  })
)

/**
 * PUT /:order_no/address - 运营/客服修改订单收货地址（手填字段覆写快照）
 *
 * 业务场景：对标淘宝京东客服改地址。用户联系运营改某笔未发货订单的收货地址，
 * 运营手动录入新的收货信息覆写该订单 address_snapshot（不绑用户地址簿、不改用户地址簿）。
 *
 * 边界：仅 pending/approved（未发货）阶段可改；requireRoleLevel(30) 运营级；写审计日志。
 *
 * @body {string} receiver_name - 收件人姓名
 * @body {string} receiver_phone - 收件人手机号
 * @body {string} province - 省
 * @body {string} city - 市
 * @body {string} district - 区/县
 * @body {string} detail_address - 详细地址
 */
router.put(
  '/:order_no/address',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')
    const { order_no } = req.params
    const { receiver_name, receiver_phone, province, city, district, detail_address } = req.body

    if (!order_no || order_no.trim().length === 0) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }
    // 必填字段校验（运营手填，全部必填）
    const missing = []
    if (!receiver_name || String(receiver_name).trim() === '') missing.push('receiver_name')
    if (!receiver_phone || String(receiver_phone).trim() === '') missing.push('receiver_phone')
    if (!province || String(province).trim() === '') missing.push('province')
    if (!city || String(city).trim() === '') missing.push('city')
    if (!district || String(district).trim() === '') missing.push('district')
    if (!detail_address || String(detail_address).trim() === '') missing.push('detail_address')
    if (missing.length > 0) {
      return res.apiError(`收货信息缺少必填字段：${missing.join('、')}`, 'BAD_REQUEST', null, 400)
    }
    // 手机号格式校验（中国大陆 11 位）
    if (!/^1[3-9]\d{9}$/.test(String(receiver_phone).trim())) {
      return res.apiError('收件人手机号格式无效', 'BAD_REQUEST', null, 400)
    }

    try {
      const result = await TransactionManager.execute(async transaction => {
        return await ExchangeCoreService.updateOrderAddressByAdmin(
          order_no,
          {
            receiver_name: String(receiver_name).trim(),
            receiver_phone: String(receiver_phone).trim(),
            province: String(province).trim(),
            city: String(city).trim(),
            district: String(district).trim(),
            detail_address: String(detail_address).trim()
          },
          req.user.user_id,
          { transaction }
        )
      })
      return res.apiSuccess(result, '收货地址修改成功')
    } catch (error) {
      // Service 抛出的业务错误（404 订单不存在 / 400 状态不可改）映射为标准错误响应
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }
      throw error
    }
  })
)

module.exports = router
