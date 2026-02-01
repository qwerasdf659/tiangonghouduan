/**
 * B2C材料兑换模块 - 商品列表/详情
 *
 * @route /api/v4/shop/exchange
 * @description 获取兑换市场商品列表和详情
 *
 * API列表：
 * - GET /items - 获取兑换市场商品列表（展示材料成本）
 * - GET /items/:item_id - 获取商品详情（展示cost_asset_code + cost_amount）
 *
 * 业务场景：
 * - 用户浏览兑换市场中的商品
 * - 查看商品详情和材料成本
 *
 * 创建时间：2025年12月22日
 * 从exchange_market.js拆分而来
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
/*
 * P1-9：DataSanitizer 通过 ServiceManager 获取（snake_case key）
 * 在路由处理函数内通过 req.app.locals.services.getService('data_sanitizer') 获取
 */
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/shop/exchange/items
 * @desc 获取兑换市场商品列表
 * @access Private (需要登录)
 *
 * @query {string} status - 商品状态（active/inactive，默认active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 *
 * @returns {Object} 商品列表和分页信息
 * @returns {Array} data.items - 商品列表
 * @returns {Object} data.pagination - 分页信息
 */
router.get('/items', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchange_query')

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
    const result = await ExchangeService.getMarketItems({
      status,
      asset_code,
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: sort_order.toUpperCase()
    })

    // 获取用户权限（role_level >= 100 为管理员）
    const userRoles = await getUserRoles(req.user.user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    /*
     * 数据脱敏
     * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
     */
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
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
      user_id: req.user?.user_id
    })
    return handleServiceError(error, res, '获取商品列表失败')
  }
})

/**
 * @route GET /api/v4/shop/exchange/items/:exchange_item_id
 * @desc 获取商品详情
 * @access Private (需要登录)
 *
 * @param {number} exchange_item_id - 商品ID
 *
 * @returns {Object} 商品详情
 * @returns {Object} data.item - 商品信息（包含cost_asset_code + cost_amount）
 */
router.get('/items/:exchange_item_id', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchange_query')

    const { exchange_item_id } = req.params
    const user_id = req.user.user_id

    logger.info('获取商品详情', { user_id, exchange_item_id })

    // 参数验证
    const itemId = parseInt(exchange_item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层
    const result = await ExchangeService.getItemDetail(itemId)

    // 获取用户权限（role_level >= 100 为管理员）
    const userRoles = await getUserRoles(user_id)
    const dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'

    /*
     * 数据脱敏
     * P1-9：通过 ServiceManager 获取 DataSanitizer（snake_case key）
     */
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, dataLevel)

    logger.info('获取商品详情成功', {
      user_id,
      exchange_item_id: itemId,
      item_name: result.item.item_name
    })

    return res.apiSuccess({ item: sanitizedItem }, '获取商品详情成功')
  } catch (error) {
    logger.error('获取商品详情失败', {
      error: error.message,
      user_id: req.user?.user_id,
      exchange_item_id: req.params.exchange_item_id
    })
    return handleServiceError(error, res, '获取商品详情失败')
  }
})

module.exports = router
