/**
 * 对账报告路由 — 管理后台
 *
 * 路由：
 * - GET /api/v4/console/reconciliation/items — 物品守恒对账
 * - GET /api/v4/console/reconciliation/assets — 资产守恒对账
 *
 * @module routes/v4/console/risk/reconciliation
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')

/**
 * GET /items
 * 物品守恒对账（SUM(delta) GROUP BY item_id 全部为 0）
 */
router.get(
  '/items',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const services = req.app.locals.services
    const ItemLifecycleService = services.getService('asset_item_lifecycle')

    const result = await ItemLifecycleService.reconcileItems()
    return res.apiSuccess(result, '物品对账完成')
  })
)

/**
 * GET /assets
 * 资产守恒对账（SUM(delta_amount) GROUP BY asset_code 全部为 0）
 */
router.get(
  '/assets',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const services = req.app.locals.services
    const ItemLifecycleService = services.getService('asset_item_lifecycle')

    const result = await ItemLifecycleService.reconcileAssets()
    return res.apiSuccess(result, '资产对账完成')
  })
)

module.exports = router
