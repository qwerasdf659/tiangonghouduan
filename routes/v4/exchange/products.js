/**
 * 餐厅积分抽奖系统 V4.5 - 兑换市场商品查询API
 *
 * 业务范围：
 * - 获取兑换市场商品列表
 * - 获取商品详情
 *
 * 架构规范：
 * - 路由层只负责：认证/鉴权、参数校验、调用Service、统一响应
 * - 使用统一错误处理 handleServiceError
 *
 * 创建时间：2025-12-22
 * 来源：从 items.js 拆分
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')
const logger = require('../../../utils/logger').logger

/**
 * 获取兑换市场商品列表
 * GET /api/v4/exchange_market/items
 *
 * @query {string} status - 商品状态（active/inactive，默认active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 */
router.get('/items', authenticateToken, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const {
      status = 'active',
      asset_code,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query

    logger.info('获取兑换市场商品列表', {
      user_id: req.user.user_id,
      status,
      asset_code,
      page,
      page_size
    })

    // 参数验证
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size) || 20, 1), 50)

    // 状态白名单验证
    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的status参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 排序方向白名单验证
    const validSortOrders = ['ASC', 'DESC']
    if (!validSortOrders.includes(sort_order.toUpperCase())) {
      return res.apiError(
        `无效的sort_order参数，允许值：${validSortOrders.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用服务层
    const result = await ExchangeMarketService.getMarketItems({
      status,
      asset_code,
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: sort_order.toUpperCase()
    })

    // 获取用户权限
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedItems = DataSanitizer.sanitizeExchangeMarketItems(result.items, dataLevel)

    logger.info('获取商品列表成功', {
      user_id: req.user.user_id,
      total: result.pagination.total,
      returned: sanitizedItems.length,
      page: finalPage
    })

    return res.apiSuccess(
      {
        items: sanitizedItems,
        pagination: result.pagination
      },
      '获取商品列表成功'
    )
  } catch (error) {
    logger.error('获取商品列表失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取商品列表失败')
  }
})

/**
 * 获取商品详情
 * GET /api/v4/exchange_market/items/:item_id
 *
 * @param {number} item_id - 商品ID
 */
router.get('/items/:item_id', authenticateToken, async (req, res) => {
  try {
    const ExchangeMarketService = req.app.locals.services.getService('exchangeMarket')

    const { item_id } = req.params
    const user_id = req.user.user_id

    logger.info('获取商品详情', { user_id, item_id })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeMarketService.getItemDetail(itemId)

    // 获取用户权限
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.isAdmin ? 'full' : 'public'

    // 数据脱敏
    const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, dataLevel)

    logger.info('获取商品详情成功', {
      user_id,
      item_id: itemId,
      item_name: result.item.item_name
    })

    return res.apiSuccess({ item: sanitizedItem }, '获取商品详情成功')
  } catch (error) {
    logger.error('获取商品详情失败', {
      error: error.message,
      stack: error.stack,
      user_id: req.user?.user_id,
      item_id: req.params.item_id
    })
    return handleServiceError(error, res, '获取商品详情失败')
  }
})

module.exports = router
