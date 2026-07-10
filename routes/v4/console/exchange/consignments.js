/**
 * @file 寄卖管理路由 — S3 二手回流/寄卖
 * @route /api/v4/console/exchange/consignments
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../../middleware/validation')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 获取寄卖服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ConsignmentService 实例
 */
function getService(req) {
  return req.app.locals.services.getService('consignment_service')
}

router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { status, consignor_account_id, keyword, page, page_size } = req.query
    const result = await getService(req).listConsignments(
      { status, consignor_account_id, keyword },
      { page, page_size }
    )
    return res.apiSuccess(result, '获取寄卖单列表成功')
  })
)

router.get(
  '/:consignment_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await getService(req).getConsignment(req.params.consignment_id)
    return res.apiSuccess(result, '获取寄卖单详情成功')
  })
)

router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const created = await TransactionManager.execute(async transaction =>
      getService(req).createConsignment(req.body || {}, { transaction })
    )
    return res.apiSuccess(created, '创建寄卖单成功')
  })
)

router.post(
  '/:consignment_id/list',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).listConsignment(req.params.consignment_id, { transaction })
    )
    return res.apiSuccess(result, '寄卖单已上架')
  })
)

router.post(
  '/:consignment_id/sold',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).markConsignmentSold(req.params.consignment_id, { transaction })
    )
    return res.apiSuccess(result, '寄卖单已标记售出')
  })
)

router.post(
  '/:consignment_id/withdraw',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).withdrawConsignment(req.params.consignment_id, { transaction })
    )
    return res.apiSuccess(result, '寄卖单已撤回')
  })
)

router.post(
  '/:consignment_id/reject',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(async transaction =>
      getService(req).rejectConsignment(req.params.consignment_id, { transaction })
    )
    return res.apiSuccess(result, '寄卖单已驳回')
  })
)

module.exports = router
