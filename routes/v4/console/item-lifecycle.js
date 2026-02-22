/**
 * 物品全链路追踪路由 — 管理后台
 *
 * 路由：
 * - GET /api/v4/console/items/:identifier/lifecycle — 查询物品完整生命周期
 * - GET /api/v4/console/item-ledger — 查询账本条目（支持多维度筛选）
 *
 * @module routes/v4/console/item-lifecycle
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

/**
 * GET /:identifier/lifecycle
 * 获取物品完整生命周期（tracking_code 或 item_id）
 */
router.get('/:identifier/lifecycle', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const services = req.app.locals.services
    const ItemLifecycleService = services.getService('asset_item_lifecycle')

    const result = await ItemLifecycleService.getItemLifecycle(req.params.identifier)

    if (!result) {
      return res.apiError('物品不存在', 404)
    }

    return res.apiSuccess(result, '获取物品生命周期成功')
  } catch (error) {
    return res.apiError(`获取物品生命周期失败：${error.message}`, 500)
  }
})

/**
 * GET /ledger
 * 查询物品账本条目（支持 item_id / account_id / event_type / 时间范围筛选）
 */
router.get('/ledger', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const services = req.app.locals.services
    const ItemService = services.getService('asset_item')

    const { item_id, account_id, event_types, page, page_size } = req.query

    const result = await ItemService.getLedgerEntries({
      item_id: item_id ? Number(item_id) : undefined,
      account_id: account_id ? Number(account_id) : undefined,
      event_types: event_types ? event_types.split(',') : undefined,
      page: page ? Number(page) : 1,
      page_size: page_size ? Number(page_size) : 20
    })

    return res.apiSuccess(result, '获取账本条目成功')
  } catch (error) {
    return res.apiError(`获取账本条目失败：${error.message}`, 500)
  }
})

module.exports = router
