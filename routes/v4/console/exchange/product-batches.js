/**
 * @file 产品批次管理路由 — S2 批次管理
 * @route /api/v4/console/exchange/product-batches
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取批次服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ProductBatchService 实例
 */
function getService(req) {
  return req.app.locals.services.getService('product_batch_service')
}

router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { status, supplier_id, exchange_item_id, keyword, page, page_size } = req.query
    const result = await getService(req).listProductBatches(
      { status, supplier_id, exchange_item_id, keyword },
      { page, page_size }
    )
    return res.apiSuccess(result, '获取批次列表成功')
  })
)

router.get(
  '/:batch_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await getService(req).getProductBatch(req.params.batch_id)
    return res.apiSuccess(result, '获取批次详情成功')
  })
)

router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const created = await TransactionManager.execute(async transaction =>
      getService(req).createProductBatch(req.body || {}, { transaction })
    )
    return res.apiSuccess(created, '创建批次成功')
  })
)

router.put(
  '/:batch_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const updated = await TransactionManager.execute(async transaction =>
      getService(req).updateProductBatch(req.params.batch_id, req.body || {}, { transaction })
    )
    return res.apiSuccess(updated, '更新批次成功')
  })
)

router.post(
  '/:batch_id/recall',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).recallProductBatch(req.params.batch_id, { transaction })
    )
    return res.apiSuccess(result, '批次召回成功')
  })
)

module.exports = router
