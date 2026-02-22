/**
 * 对账报告路由 — 管理后台
 *
 * 路由：
 * - GET /api/v4/console/reconciliation/items — 物品守恒对账
 * - GET /api/v4/console/reconciliation/assets — 资产守恒对账
 *
 * @module routes/v4/console/reconciliation
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

/**
 * GET /items
 * 物品守恒对账（SUM(delta) GROUP BY item_id 全部为 0）
 */
router.get('/items', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const services = req.app.locals.services
    const ItemLifecycleService = services.getService('asset_item_lifecycle')

    const result = await ItemLifecycleService.reconcileItems()
    return res.apiSuccess(result, '物品对账完成')
  } catch (error) {
    return res.apiError(`物品对账失败：${error.message}`, 500)
  }
})

/**
 * GET /assets
 * 资产守恒对账（SUM(delta_amount) GROUP BY asset_code 全部为 0）
 */
router.get('/assets', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const services = req.app.locals.services
    const ItemLifecycleService = services.getService('asset_item_lifecycle')

    const result = await ItemLifecycleService.reconcileAssets()
    return res.apiSuccess(result, '资产对账完成')
  } catch (error) {
    return res.apiError(`资产对账失败：${error.message}`, 500)
  }
})

module.exports = router
