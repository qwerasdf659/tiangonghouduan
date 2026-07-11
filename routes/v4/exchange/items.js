/**
 * 用户域 B2C 兑换路由 - 商品浏览类端点（技术债务方案 7.4-8：路由拆分）
 *
 * 路径：/api/v4/exchange（经 index.js 无前缀挂载，对外 URL 与拆分前完全一致）
 *
 * 端点清单（纯搬移自原 routes/v4/exchange/index.js，逻辑不变）：
 * - GET  /items                      - 获取兑换商品列表
 * - GET  /items/:exchange_item_id   - 获取商品详情
 * - GET  /space-stats                - 获取空间统计数据（臻选/幸运空间）
 * - GET  /premium-status             - 查询高级空间（臻选空间）状态
 * - POST /unlock-premium             - 解锁高级空间（臻选空间）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取服务（exchange_query / premium / data_sanitizer）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 *
 * @module routes/v4/exchange/items
 * @created 2026-07-11（技术债务方案 7.4-8 拆分）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, optionalAuth, getUserRoles } = require('../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/exchange/items
 *
 * @description 获取兑换商品列表（展示材料成本，支持空间筛选/搜索/价格范围）
 * @access Private（所有登录用户可访问）
 *
 * @query {string} status - 商品状态（active/inactive，默认 active）
 * @query {string} asset_code - 材料资产代码筛选（可选）
 * @query {string} space - 空间筛选：lucky/premium（可选，不传返回全部）
 * @query {string} item_type - 频道筛选：prop(道具商城)/product/voucher/virtual（可选，不传返回全部）
 * @query {string} keyword - 模糊搜索（匹配 item_name，可选）
 * @query {number} category_id - 分类ID筛选（categories.category_id，可选）
 * @query {number} min_cost - 最低价格（可选）
 * @query {number} max_cost - 最高价格（可选）
 * @query {string} stock_status - 库存状态：in_stock(>5)/low_stock(1-5)（可选）
 * @query {number} page - 页码（默认 1）
 * @query {number} page_size - 每页数量（默认 20，最大 50）
 * @query {string} sort_by - 排序字段（默认 sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认 ASC）
 *
 * @returns {Object} { items, pagination }
 */
router.get(
  '/items',
  optionalAuth,
  asyncHandler(async (req, res) => {
    // 通过 ServiceManager 获取 ExchangeQueryService
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const {
      status = 'active',
      asset_code,
      space,
      item_type,
      keyword,
      category_id,
      exclude_id,
      min_cost,
      max_cost,
      stock_status,
      with_counts,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      refresh
    } = req.query

    logger.info('用户浏览兑换商品列表', {
      user_id: req.user?.user_id || null,
      status,
      asset_code,
      space,
      item_type,
      keyword,
      page,
      page_size
    })

    // 参数验证
    const finalPage = Math.max(parseInt(page, 10) || 1, 1)
    const finalPageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 50)

    // 状态白名单验证
    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      return res.apiError(
        `无效的 status 参数，允许值：${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 空间白名单验证
    if (space) {
      const validSpaces = ['lucky', 'premium']
      if (!validSpaces.includes(space)) {
        return res.apiError(
          `无效的 space 参数，允许值：${validSpaces.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    // item_type 白名单验证（双轨频道筛选：prop=道具商城/星石轨）
    if (item_type) {
      const validItemTypes = ['prop', 'product', 'voucher', 'virtual']
      if (!validItemTypes.includes(item_type)) {
        return res.apiError(
          `无效的 item_type 参数，允许值：${validItemTypes.join(', ')}`,
          'BAD_REQUEST',
          null,
          400
        )
      }
    }

    // 排序方向白名单验证
    const validSortOrders = ['ASC', 'DESC']
    const upperSortOrder = sort_order.toUpperCase()
    if (!validSortOrders.includes(upperSortOrder)) {
      return res.apiError(
        `无效的 sort_order 参数，允许值：${validSortOrders.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 调用服务层（筛选 + C+++ 聚合计数）
    const result = await ExchangeQueryService.getMarketItems({
      status,
      asset_code,
      space: space || null,
      item_type: item_type || null,
      keyword: keyword || null,
      category: category_id || null,
      exclude_id: exclude_id || null,
      min_cost: min_cost ? parseInt(min_cost, 10) : null,
      max_cost: max_cost ? parseInt(max_cost, 10) : null,
      stock_status: stock_status || null,
      with_counts: with_counts === 'true',
      page: finalPage,
      page_size: finalPageSize,
      sort_by,
      sort_order: upperSortOrder,
      refresh: refresh === 'true',
      // 当前用户（可空）：用于等级门槛摘要 level_requirement.satisfied 实时计算（拍板⑪）
      user_id: req.user?.user_id || null
    })

    // 获取用户权限（未登录用户默认 public 级别，role_level >= 100 为管理员）
    let dataLevel = 'public'
    if (req.user?.user_id) {
      const userRoles = await getUserRoles(req.user.user_id)
      dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    }

    // 数据脱敏
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItems = DataSanitizer.sanitizeExchangeMarketItems(result.items, dataLevel)

    logger.info('获取兑换商品列表成功', {
      user_id: req.user?.user_id || null,
      total: result.pagination.total,
      returned: sanitizedItems.length,
      page: finalPage
    })

    const responseData = {
      items: sanitizedItems,
      pagination: result.pagination,
      /** 统计摘要（需求6 趋势销量 + 需求8 折扣率） */
      summary: result.summary || null
    }

    // C+++ 聚合计数：仅在 with_counts=true 时返回
    if (result.filters_count) {
      responseData.filters_count = result.filters_count
    }

    return res.apiSuccess(responseData, '获取商品列表成功')
  })
)

/**
 * GET /api/v4/exchange/items/:exchange_item_id
 *
 * @description 获取兑换商品详情（展示 cost_asset_code + cost_amount）
 * @access Public（optionalAuth - 未登录可浏览商品详情）
 *
 * @param {number} exchange_item_id - 商品ID（路由参数）
 *
 * @returns {Object} { item }
 */
router.get(
  '/items/:exchange_item_id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const { exchange_item_id } = req.params
    const user_id = req.user?.user_id || null

    logger.info('获取兑换商品详情', { user_id, exchange_item_id })

    // 参数验证
    const itemId = parseInt(exchange_item_id, 10)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 调用服务层（user_id 用于等级门槛摘要 level_requirement.satisfied 实时计算，拍板⑪）
    const result = await ExchangeQueryService.getItemDetail(itemId, { user_id })

    // 获取用户权限（未登录用户默认 public 级别）
    let dataLevel = 'public'
    if (user_id) {
      const userRoles = await getUserRoles(user_id)
      dataLevel = userRoles.role_level >= 100 ? 'full' : 'public'
    }

    // 数据脱敏
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const sanitizedItem = DataSanitizer.sanitizeExchangeMarketItem(result.item, dataLevel)

    logger.info('获取兑换商品详情成功', {
      user_id,
      exchange_item_id: itemId,
      item_name: result.item.item_name
    })

    return res.apiSuccess({ item: sanitizedItem }, '获取商品详情成功')
  })
)

/**
 * GET /api/v4/exchange/space-stats
 *
 * @description 获取空间统计数据（臻选空间/幸运空间）
 * @access Public（optionalAuth - 未登录可浏览空间统计）
 *
 * @query {string} space - 空间类型（必填）：lucky / premium
 *
 * @returns {Object} { space, total_items, new_count, hot_count, asset_code_distribution }
 */
router.get(
  '/space-stats',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

    const { space } = req.query

    // 参数验证：space 必填
    if (!space) {
      return res.apiError('space 参数不能为空', 'BAD_REQUEST', null, 400)
    }

    const validSpaces = ['lucky', 'premium']
    if (!validSpaces.includes(space)) {
      return res.apiError(
        `无效的 space 参数，允许值：${validSpaces.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    logger.info('查询空间统计', { user_id: req.user?.user_id || null, space })

    const stats = await ExchangeQueryService.getSpaceStats(space)

    return res.apiSuccess(stats, '获取空间统计成功')
  })
)

/**
 * GET /api/v4/exchange/premium-status
 *
 * @description 查询高级空间（臻选空间）状态
 * @access Private（所有登录用户可访问）
 *
 * 复用 PremiumService.getPremiumStatus(user_id)
 *
 * @returns {Object} 解锁状态和条件信息
 */
router.get(
  '/premium-status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const PremiumService = req.app.locals.services.getService('premium')
    const userId = req.user.user_id

    logger.info('查询高级空间状态', { user_id: userId })

    try {
      const status = await PremiumService.getPremiumStatus(userId)

      if (!status.unlocked || !status.is_valid) {
        // 未解锁或已过期：返回明确的解锁条件，由 PremiumService 提供权威字段（费用/有效期/条件明细）
        return res.apiSuccess(
          {
            unlocked: false,
            is_expired: status.is_expired || false,
            can_unlock: status.can_unlock,
            unlock_cost: status.unlock_cost,
            validity_hours: status.validity_hours,
            conditions: status.conditions
          },
          status.is_expired ? '高级空间已过期' : '高级空间未解锁'
        )
      }

      // 已解锁且在有效期内
      return res.apiSuccess(
        {
          unlocked: true,
          is_valid: true,
          unlock_cost: status.unlock_cost,
          validity_hours: status.validity_hours,
          remaining_hours: status.remaining_hours,
          total_unlock_count: status.total_unlock_count
        },
        '高级空间访问中'
      )
    } catch (error) {
      logger.error('查询高级空间状态失败', { user_id: userId, error: error.message })
      return handleServiceError(error, res, '查询高级空间状态失败')
    }
  })
)

/**
 * POST /api/v4/exchange/unlock-premium
 *
 * @description 解锁高级空间（臻选空间）
 * @access Private（所有登录用户可访问，需满足解锁条件）
 *
 * 复用 PremiumService.unlockPremium(user_id, {transaction})
 *
 * @returns {Object} 解锁结果
 */
router.post(
  '/unlock-premium',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const PremiumService = req.app.locals.services.getService('premium')
    const userId = req.user.user_id

    logger.info('用户解锁高级空间', { user_id: userId })

    try {
      // 通过 TransactionManager 统一管理事务边界（PremiumService 强制要求外部事务）
      const result = await TransactionManager.execute(async transaction => {
        return await PremiumService.unlockPremium(userId, { transaction })
      })

      logger.info('高级空间解锁成功', {
        user_id: userId,
        is_first_unlock: result.is_first_unlock,
        unlock_cost: result.unlock_cost
      })

      return res.apiSuccess(
        {
          unlocked: true,
          is_first_unlock: result.is_first_unlock,
          unlock_cost: result.unlock_cost,
          remaining_points: result.remaining_points,
          validity_hours: result.validity_hours,
          total_unlock_count: result.total_unlock_count
        },
        '高级空间解锁成功'
      )
    } catch (error) {
      logger.error('高级空间解锁失败', { user_id: userId, error: error.message })

      // 处理业务错误（来自 PremiumService，带有明确的 code + statusCode）
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }

      return handleServiceError(error, res, '解锁失败')
    }
  })
)

module.exports = router
