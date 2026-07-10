/**
 * @file 组合商品管理路由 — S4 组合/套装
 * @route /api/v4/console/exchange/product-bundles
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取组合商品服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ProductBundleService 实例
 */
function getService(req) {
  return req.app.locals.services.getService('product_bundle_service')
}

router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { status, bundle_type, keyword, page, page_size } = req.query
    const result = await getService(req).listProductBundles(
      { status, bundle_type, keyword },
      { page, page_size }
    )
    return res.apiSuccess(result, '获取组合商品列表成功')
  })
)

router.get(
  '/:bundle_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await getService(req).getProductBundle(req.params.bundle_id)
    return res.apiSuccess(result, '获取组合商品详情成功')
  })
)

router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const created = await TransactionManager.execute(async transaction =>
      getService(req).createProductBundle(req.body || {}, { transaction })
    )
    return res.apiSuccess(created, '创建组合商品成功')
  })
)

router.put(
  '/:bundle_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const updated = await TransactionManager.execute(async transaction =>
      getService(req).updateProductBundle(req.params.bundle_id, req.body || {}, { transaction })
    )
    return res.apiSuccess(updated, '更新组合商品成功')
  })
)

module.exports = router
