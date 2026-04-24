'use strict'

/**
 * 资产总览接口 - 后台运营资产中心
 *
 * 路由路径：GET /api/v4/console/assets/portfolio
 *
 * 功能说明：
 * - 整合两类资产域，提供统一的资产查询入口
 * - 可叠加资产（POINTS、star_stone、材料） - 来自 account_asset_balances 表
 * - 不可叠加物品（优惠券、实物商品） - 来自 items 表（三表架构）
 *
 * 业务场景：
 * - 后台/运营"用户资产总览"查询
 * - 资产统计仪表盘
 * - 客服"用户资产查账"
 *
 * 边界说明（2026-01-07 架构重构）：
 * - 用户端唯一背包入口：/api/v4/backpack
 * - 后台/运营资产查询：/api/v4/console/assets/portfolio（本接口）
 * - 基础资产能力：/api/v4/assets/*（跨业务域底座）
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 架构规范：
 * - 路由层通过 req.app.locals.services.getService() 获取服务
 * - 路由层禁止直接 require models（所有数据库操作通过 Service 层）
 *
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger')

/**
 * GET /portfolio - 获取当前用户资产总览
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 响应示例：
 * {
 *   "success": true,
 *   "data": {
 *     "user_id": 1,
 *     "points": {
 *       "available": 5000,
 *       "total_earned": 10000,
 *       "total_consumed": 5000
 *     },
 *     "fungible_assets": [
 *       {
 *         "asset_code": "star_stone",
 *         "display_name": "星石",
 *         "available_amount": 1000,
 *         "frozen_amount": 0,
 *         "total_amount": 1000
 *       }
 *     ],
 *     "non_fungible_items": {
 *       "total": 10,
 *       "available_count": 8,
 *       "locked_count": 2,
 *       "by_type": {
 *         "voucher": { "available": 5, "locked": 1 },
 *         "product": { "available": 3, "locked": 1 }
 *       }
 *     },
 *     "retrieved_at": "2025-12-28T12:00:00.000Z"
 *   }
 * }
 *
 * 查询参数：
 * - include_items: boolean（可选）- 是否包含物品详细列表（默认false）
 */
router.get('/portfolio', authenticateToken, requireRoleLevel(30), asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
  const include_items = req.query.include_items === 'true'

  logger.info('📦 获取用户资产总览', { user_id, include_items })

  // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 QueryService
  const QueryService = req.app.locals.services.getService('asset_query')
  const portfolio = await QueryService.getAssetPortfolio({ user_id }, { include_items })

  return res.apiSuccess(portfolio, '获取资产总览成功')
}))

/**
 * GET /portfolio/items - 获取用户物品详细列表
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 分页参数：
 * - page: number（可选）- 页码（默认1）
 * - page_size: number（可选）- 每页数量（默认20，最大100）
 * - item_type: string（可选）- 物品类型筛选
 * - status: string（可选）- 状态筛选（available/locked）
 */
router.get('/portfolio/items', authenticateToken, requireRoleLevel(30), asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20))
  const item_type = req.query.item_type || null
  const status = req.query.status || null

  // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 ItemService
  const ItemService = req.app.locals.services.getService('asset_item')

  const result = await ItemService.getUserItems(
    { user_id },
    { item_type, status, page, page_size }
  )

  return res.apiSuccess(result, '获取物品列表成功')
}))

/**
 * GET /portfolio/items/:item_id - 获取物品详情
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 */
router.get(
  '/portfolio/items/:item_id',
  authenticateToken,
  requireRoleLevel(30),
  asyncHandler(async (req, res) => {
        const user_id = req.user.user_id
    const item_id = parseInt(req.params.item_id)

    if (!item_id || isNaN(item_id)) {
      return res.apiError('无效的物品ID', 400)
    }

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 ItemService
    const ItemService = req.app.locals.services.getService('asset_item')

    const result = await ItemService.getItemDetail({ user_id, item_id }, { event_limit: 10 })

    if (!result) {
      return res.apiError('物品不存在或无权访问', 404)
    }

    return res.apiSuccess(result, '获取物品详情成功')
  })
)

/**
 * GET /item-events - 获取用户物品事件历史
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 查询参数：
 * - item_id: number（可选）- 指定物品的账本事件
 * - event_types: string（可选）- 事件类型过滤，逗号分隔（mint,lock,unlock,transfer,use）
 * - page: number（可选）- 页码（默认1）
 * - page_size: number（可选）- 每页数量（默认20，最大100）
 *
 * 响应示例：
 * {
 *   "success": true,
 *   "data": {
 *     "events": [...],
 *     "total": 100,
 *     "page": 1,
 *     "limit": 20,
 *     "total_pages": 5
 *   }
 * }
 */
router.get('/item-events', authenticateToken, requireRoleLevel(30), asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
  const item_id = req.query.item_id ? parseInt(req.query.item_id) : null
  const event_types = req.query.event_types ? req.query.event_types.split(',') : null
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20))

  logger.info('📜 获取物品账本事件', { user_id, item_id, event_types, page, page_size })

  const ItemService = req.app.locals.services.getService('asset_item')

  const result = await ItemService.getLedgerEntries({
    item_id,
    account_id: null,
    event_types,
    page,
    page_size
  })

  return res.apiSuccess(result, '获取物品事件历史成功')
}))

module.exports = router
