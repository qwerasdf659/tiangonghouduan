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
 * @desc 获取兑换市场商品列表（支持按空间筛选：幸运空间/臻选空间）
 * @access Private (需要登录)
 *
 * @query {string} status - 商品状态（active/inactive，默认active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {string} space - 空间筛选（lucky=幸运空间, premium=臻选空间，可选）
 * @query {string} keyword - 商品名称关键词搜索（可选）
 * @query {string} category - 商品分类筛选（可选）
 * @query {number} min_cost - 最低价格筛选（可选）
 * @query {number} max_cost - 最高价格筛选（可选）
 * @query {string} stock_status - 库存状态（in_stock=有货, low_stock=即将售罄，可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20，最大50）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 *
 * @returns {Object} 商品列表和分页信息
 * @returns {Array} data.items - 商品列表
 * @returns {Object} data.pagination - 分页信息
 * @returns {Object} data.summary - 统计摘要（趋势销量、平均折扣、平均评分）
 */
router.get('/items', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 ExchangeService（符合TR-005规范）
    const ExchangeService = req.app.locals.services.getService('exchange_query')

    const {
      status = 'active',
      asset_code,
      space,
      keyword,
      category,
      min_cost,
      max_cost,
      stock_status,
      with_counts,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query

    logger.info('获取兑换市场商品列表', {
      user_id: req.user.user_id,
      status,
      asset_code,
      space,
      keyword,
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

    // 空间参数白名单验证（可选参数）
    if (space) {
      const validSpaces = ['lucky', 'premium']
      if (!validSpaces.includes(space)) {
        return res.apiError(
          `无效的space参数，允许值：${validSpaces.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
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

    // 调用服务层（筛选 + C+++ 聚合计数）
    const result = await ExchangeService.getMarketItems({
      status,
      asset_code,
      space: space || null,
      keyword: keyword || null,
      category: category || null,
      min_cost: min_cost != null ? parseInt(min_cost, 10) : null,
      max_cost: max_cost != null ? parseInt(max_cost, 10) : null,
      stock_status: stock_status || null,
      with_counts: with_counts === 'true',
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

    const responseData = {
      items: sanitizedItems,
      pagination: result.pagination
    }

    // C+++ 聚合计数：仅在 with_counts=true 时返回
    if (result.filters_count) {
      responseData.filters_count = result.filters_count
    }

    return res.apiSuccess(responseData, '获取商品列表成功')
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
