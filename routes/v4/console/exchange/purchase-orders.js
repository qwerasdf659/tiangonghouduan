/**
 * @file 采购单管理路由 — S1 进货管理
 * @route /api/v4/console/exchange/purchase-orders
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取采购单服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} PurchaseOrderService 实例
 */
function getService(req) {
  return req.app.locals.services.getService('purchase_order_service')
}
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { status, supplier_id, keyword, page, page_size } = req.query
    const result = await getService(req).listPurchaseOrders(
      { status, supplier_id, keyword },
      { page, page_size }
    )
    return res.apiSuccess(result, '获取采购单列表成功')
  })
)

router.get(
  '/:purchase_order_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await getService(req).getPurchaseOrder(req.params.purchase_order_id)
    return res.apiSuccess(result, '获取采购单详情成功')
  })
)

router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const created = await TransactionManager.execute(async transaction =>
      getService(req).createPurchaseOrder(req.body || {}, { transaction })
    )
    return res.apiSuccess(created, '创建采购单成功')
  })
)

router.put(
  '/:purchase_order_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const updated = await TransactionManager.execute(async transaction =>
      getService(req).updatePurchaseOrder(req.params.purchase_order_id, req.body || {}, {
        transaction
      })
    )
    return res.apiSuccess(updated, '更新采购单成功')
  })
)

router.post(
  '/:purchase_order_id/submit',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).submitPurchaseOrder(req.params.purchase_order_id, { transaction })
    )
    return res.apiSuccess(result, '采购单已提交下单')
  })
)

router.post(
  '/:purchase_order_id/receive',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).receivePurchaseOrder(req.params.purchase_order_id, req.body || {}, {
        transaction
      })
    )
    return res.apiSuccess(result, '采购单收货成功')
  })
)

router.post(
  '/:purchase_order_id/cancel',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).cancelPurchaseOrder(req.params.purchase_order_id, { transaction })
    )
    return res.apiSuccess(result, '采购单已取消')
  })
)

module.exports = router
