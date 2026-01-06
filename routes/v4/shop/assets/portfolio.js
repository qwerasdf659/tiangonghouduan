'use strict'

/**
 * 资产总览接口 - 统一资产域入口（后台/运营使用）
 *
 * 路由路径：GET /api/v4/shop/assets/portfolio
 *
 * 功能说明：
 * - 整合两类资产域，提供统一的资产查询入口
 * - 可叠加资产（POINTS、DIAMOND、材料） - 来自 account_asset_balances 表
 * - 不可叠加物品（优惠券、实物商品） - 来自 item_instances 表
 *
 * 业务场景：
 * - 后台/运营"用户资产总览"查询
 * - 资产统计仪表盘
 * - 客服"用户资产查账"
 *
 * 边界说明（决策1已拍板）：
 * - 用户端唯一背包入口：/api/v4/backpack
 * - 后台/运营资产查询：/api/v4/shop/assets/portfolio（本接口）
 *
 * 创建时间：2025-12-28
 * 更新时间：2025-01-07（修正数据来源注释，与暴力重构方案对齐）
 */

const express = require('express')
const router = express.Router()
const AssetService = require('../../../../services/AssetService')
const { authenticateToken } = require('../../../../middleware/auth')
const logger = require('../../../../utils/logger')

/**
 * GET /portfolio - 获取当前用户资产总览
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
 *         "asset_code": "DIAMOND",
 *         "display_name": "钻石",
 *         "available_amount": 1000,
 *         "frozen_amount": 0,
 *         "total_amount": 1000
 *       }
 *     ],
 *     "non_fungible_items": {
 *       "total_count": 10,
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
router.get('/portfolio', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const include_items = req.query.include_items === 'true'

    logger.info('📦 获取用户资产总览', { user_id, include_items })

    const portfolio = await AssetService.getAssetPortfolio({ user_id }, { include_items })

    return res.apiSuccess(portfolio, '获取资产总览成功')
  } catch (error) {
    logger.error('❌ 获取用户资产总览失败', {
      user_id: req.user?.user_id,
      error: error.message,
      stack: error.stack
    })

    return res.apiError(error.message || '获取资产总览失败', 500)
  }
})

/**
 * GET /portfolio/items - 获取用户物品详细列表
 *
 * 分页参数：
 * - page: number（可选）- 页码（默认1）
 * - page_size: number（可选）- 每页数量（默认20，最大100）
 * - item_type: string（可选）- 物品类型筛选
 * - status: string（可选）- 状态筛选（available/locked）
 */
router.get('/portfolio/items', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20))
    const item_type = req.query.item_type || null
    const status = req.query.status || null

    const { ItemInstance } = require('../../../../models')
    const { Op } = require('sequelize')

    // 构建查询条件
    const where = { owner_user_id: user_id }

    if (item_type) {
      where.item_type = item_type
    }

    if (status) {
      where.status = status
    } else {
      // 默认只查询 available 和 locked 状态
      where.status = { [Op.in]: ['available', 'locked'] }
    }

    const { count, rows } = await ItemInstance.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    const result = {
      items: rows,
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size)
    }

    return res.apiSuccess(result, '获取物品列表成功')
  } catch (error) {
    logger.error('❌ 获取物品列表失败', {
      user_id: req.user?.user_id,
      error: error.message
    })

    return res.apiError(error.message || '获取物品列表失败', 500)
  }
})

/**
 * GET /portfolio/items/:item_instance_id - 获取物品详情
 */
router.get('/portfolio/items/:item_instance_id', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const item_instance_id = parseInt(req.params.item_instance_id)

    if (!item_instance_id || isNaN(item_instance_id)) {
      return res.apiError('无效的物品ID', 400)
    }

    const { ItemInstance, ItemInstanceEvent } = require('../../../../models')

    // 查询物品（只能查看自己的物品）
    const item = await ItemInstance.findOne({
      where: {
        item_instance_id,
        owner_user_id: user_id
      }
    })

    if (!item) {
      return res.apiError('物品不存在或无权访问', 404)
    }

    // 查询物品事件历史
    const events = await ItemInstanceEvent.findAll({
      where: { item_instance_id },
      order: [['created_at', 'DESC']],
      limit: 10
    })

    const result = {
      item,
      events
    }

    return res.apiSuccess(result, '获取物品详情成功')
  } catch (error) {
    logger.error('❌ 获取物品详情失败', {
      user_id: req.user?.user_id,
      item_instance_id: req.params.item_instance_id,
      error: error.message
    })

    return res.apiError(error.message || '获取物品详情失败', 500)
  }
})

/**
 * GET /item-events - 获取用户物品事件历史
 *
 * 查询参数：
 * - item_instance_id: number（可选）- 指定物品的事件
 * - event_types: string（可选）- 事件类型过滤，逗号分隔（mint,lock,unlock,transfer,use）
 * - page: number（可选）- 页码（默认1）
 * - limit: number（可选）- 每页数量（默认20）
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
router.get('/item-events', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const item_instance_id = req.query.item_instance_id
      ? parseInt(req.query.item_instance_id)
      : null
    const event_types = req.query.event_types ? req.query.event_types.split(',') : null
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))

    logger.info('📜 获取物品事件历史', { user_id, item_instance_id, event_types, page, limit })

    const result = await AssetService.getItemEvents({
      user_id,
      item_instance_id,
      event_types,
      page,
      limit
    })

    return res.apiSuccess(result, '获取物品事件历史成功')
  } catch (error) {
    logger.error('❌ 获取物品事件历史失败', {
      user_id: req.user?.user_id,
      error: error.message,
      stack: error.stack
    })

    return res.apiError(error.message || '获取物品事件历史失败', 500)
  }
})

module.exports = router
