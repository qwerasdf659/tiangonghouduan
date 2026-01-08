/**
 * 餐厅积分抽奖系统 V4.0 - 市场管理API
 *
 * @description 管理员查看市场统计信息和管理兑换商品
 * @version 3.0.0（P2-C架构重构版）
 * @created 2025-12-05
 * @updated 2025-12-11（P2-C重构：AdminMarketplaceService合并到ExchangeService）
 *
 * 核心功能：
 * - 查询所有用户的上架统计
 * - 识别接近上限和达到上限的用户
 * - 管理兑换商品（创建、更新、删除）
 * - 分页查询和筛选
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 ExchangeService 统一管理兑换市场业务
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const MaterialManagementService = require('../../../services/MaterialManagementService')
 */

const logger = require('../../../utils/logger').logger

/**
 * 管理员查询所有用户上架状态
 * GET /api/v4/console/marketplace/listing-stats
 *
 * @description 查询所有用户的上架状态统计，支持筛选和分页
 *
 * 🎯 核心功能：
 * 1. 按用户分组统计在售商品数量
 * 2. 支持筛选（全部/接近上限/达到上限）
 * 3. 分页查询
 * 4. 返回用户详情和统计信息
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} filter - 筛选条件：all/near_limit/at_limit（默认all）
 *
 * @returns {Object} 统计数据
 * @returns {Array} data.stats - 用户上架统计列表
 * @returns {Object} data.pagination - 分页信息
 * @returns {Object} data.summary - 总体统计摘要
 */
router.get('/listing-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all' } = req.query

    /**
     * 从数据库读取最大上架数量配置（2025-12-30 配置管理三层分离方案）
     *
     * 读取优先级：
     * 1. DB system_settings.max_active_listings（全局配置）
     * 2. 代码默认值 10（兜底降级）
     *
     * @see docs/配置管理三层分离与校验统一方案.md
     */
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const maxListings = await AdminSystemService.getSettingValue(
      'marketplace',
      'max_active_listings',
      10
    )

    logger.info('管理员查询用户上架状态', {
      admin_id: req.user.user_id,
      page,
      limit,
      filter
    })

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchange_market')

    // 🎯 调用服务层方法获取用户上架统计
    const result = await ExchangeService.getUserListingStats({
      page,
      limit,
      filter,
      max_listings: maxListings
    })

    logger.info('查询用户上架状态成功', {
      admin_id: req.user.user_id,
      total_users: result.summary.total_users_with_listings,
      filtered_count: result.pagination.total,
      page: parseInt(page)
    })

    return res.apiSuccess(result)
  } catch (error) {
    logger.error('查询用户上架状态失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 创建兑换商品（管理员操作）
 * POST /api/v4/console/marketplace/exchange_market/items
 *
 * V4.5.0 材料资产支付版本
 *
 * 🎯 2026-01-08 图片存储架构核查修复：
 * - 使用 TransactionManager 包装事务
 * - 创建商品后自动绑定图片 context_id（避免被24h定时清理误删）
 *
 * @body {string} item_name - 商品名称（必填，最长100字符）
 * @body {string} item_description - 商品描述（可选，最长500字符）
 * @body {string} cost_asset_code - 材料资产代码（必填，如 'red_shard'）
 * @body {number} cost_amount - 材料资产数量（必填，>0）
 * @body {number} cost_price - 成本价（必填）
 * @body {number} stock - 初始库存（必填，>=0）
 * @body {number} sort_order - 排序号（必填，默认100）
 * @body {string} status - 商品状态（必填：active/inactive）
 * @body {number} primary_image_id - 主图片ID（可选，关联 image_resources.image_id）
 */
router.post('/exchange_market/items', authenticateToken, requireAdmin, async (req, res) => {
  const {
    item_name,
    item_description = '',
    cost_asset_code,
    cost_amount,
    cost_price,
    stock,
    sort_order = 100,
    status = 'active',
    // 🎯 2026-01-08 图片存储架构：主图片ID（关联 image_resources.image_id）
    primary_image_id
  } = req.body

  const admin_id = req.user.user_id

  logger.info('管理员创建兑换商品（材料资产支付）', {
    admin_id,
    item_name,
    cost_asset_code,
    cost_amount,
    stock,
    primary_image_id
  })

  // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
  const ExchangeService = req.app.locals.services.getService('exchange_market')

  // 🎯 2026-01-08 图片存储架构修复：使用 TransactionManager 包装事务
  const transactionResult = await TransactionManager.executeTransaction(async transaction => {
    // 调用服务层方法创建商品（V4.5.0 材料资产支付 + 图片存储架构）
    const result = await ExchangeService.createExchangeItem(
      {
        item_name,
        item_description,
        cost_asset_code,
        cost_amount,
        cost_price,
        stock,
        sort_order,
        status,
        primary_image_id
      },
      admin_id,
      { transaction }
    )

    return result
  })

  if (!transactionResult.success) {
    const errorMessage = transactionResult.error?.message || '创建商品失败'
    logger.error('创建兑换商品失败', {
      error: errorMessage,
      admin_id
    })

    // 业务错误直接返回错误消息
    if (
      errorMessage.includes('不能为空') ||
      errorMessage.includes('最长') ||
      errorMessage.includes('无效') ||
      errorMessage.includes('必须')
    ) {
      return res.apiError(errorMessage, 'BAD_REQUEST', null, 400)
    }

    return res.apiError(errorMessage, 'INTERNAL_ERROR', null, 500)
  }

  const result = transactionResult.data

  logger.info('兑换商品创建成功（材料资产支付）', {
    admin_id,
    item_id: result.item?.item_id,
    item_name: result.item?.item_name,
    cost_asset_code: result.item?.cost_asset_code,
    cost_amount: result.item?.cost_amount,
    bound_image: result.bound_image
  })

  return res.apiSuccess(result, '商品创建成功')
})

/**
 * 更新兑换商品（管理员操作）
 * PUT /api/v4/console/marketplace/exchange_market/items/:item_id
 *
 * V4.5.0 材料资产支付版本
 *
 * 🎯 2026-01-08 图片存储架构核查修复：
 * - 使用 TransactionManager 包装事务
 * - 更换图片时删除旧图片 + 绑定新图片 context_id
 *
 * @param {number} item_id - 商品ID
 */
router.put('/exchange_market/items/:item_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { item_id } = req.params
    const {
      item_name,
      item_description,
      cost_asset_code,
      cost_amount,
      cost_price,
      stock,
      sort_order,
      status,
      // 🎯 2026-01-08 图片存储架构：主图片ID（关联 image_resources.image_id）
      primary_image_id
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员更新兑换商品（材料资产支付）', {
      admin_id,
      item_id,
      cost_asset_code,
      primary_image_id,
      cost_amount
    })

    // 参数验证
    const itemId = parseInt(item_id)
    if (isNaN(itemId) || itemId <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchange_market')

    // 🎯 2026-01-08：使用事务包装更新操作（含图片处理）
    const result = await TransactionManager.execute(
      async transaction => {
        return await ExchangeService.updateExchangeItem(
          itemId,
          {
            item_name,
            item_description,
            cost_asset_code,
            cost_amount,
            cost_price,
            stock,
            sort_order,
            status,
            primary_image_id
          },
          { transaction }
        )
      },
      {
        description: `更新兑换商品 item_id=${itemId}`,
        maxRetries: 1
      }
    )

    logger.info('兑换商品更新成功（材料资产支付）', {
      admin_id,
      item_id: itemId,
      item_name: result.item.item_name,
      cost_asset_code: result.item.cost_asset_code,
      cost_amount: result.item.cost_amount,
      image_changes: result.image_changes
    })

    return res.apiSuccess(result, '商品更新成功')
  } catch (error) {
    logger.error('更新兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      item_id: req.params.item_id
    })

    // 业务错误处理
    if (error.message === '商品不存在') {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (
      error.message.includes('不能为空') ||
      error.message.includes('最长') ||
      error.message.includes('无效') ||
      error.message.includes('必须')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    return res.apiError(error.message || '更新商品失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 删除兑换商品（管理员操作）
 * DELETE /api/v4/console/marketplace/exchange_market/items/:item_id
 *
 * 🎯 2026-01-08 图片存储架构核查修复：
 * - 使用 TransactionManager 包装事务
 * - 删除商品时联动删除关联图片（DB + 对象存储）
 *
 * @param {number} item_id - 商品ID
 */
router.delete(
  '/exchange_market/items/:item_id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { item_id } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员删除兑换商品', {
        admin_id,
        item_id
      })

      // 参数验证
      const itemId = parseInt(item_id)
      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchange_market')

      // 🎯 2026-01-08：使用事务包装删除操作（含图片删除）
      const result = await TransactionManager.execute(
        async transaction => {
          return await ExchangeService.deleteExchangeItem(itemId, { transaction })
        },
        {
          description: `删除兑换商品 item_id=${itemId}`,
          maxRetries: 1
        }
      )

      logger.info('兑换商品删除操作完成', {
        admin_id,
        item_id: itemId,
        action: result.action,
        message: result.message,
        deleted_image_id: result.deleted_image_id
      })

      // 根据操作结果返回不同响应
      if (result.action === 'deactivated') {
        return res.apiSuccess(
          {
            item: result.item || null
          },
          result.message
        )
      }

      return res.apiSuccess({}, result.message)
    } catch (error) {
      logger.error('删除兑换商品失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id,
        item_id: req.params.item_id
      })

      // 业务错误处理
      if (error.message === '商品不存在') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      return res.apiError(error.message || '删除商品失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 管理员获取C2C交易订单列表（Admin Only）
 * GET /api/v4/console/marketplace/trade_orders
 *
 * @description 管理员查看所有C2C交易订单，支持状态筛选、分页、排序
 *
 * 业务场景：
 * - 管理后台C2C交易订单管理页面
 * - 订单状态筛选和查看
 * - 交易纠纷处理
 *
 * @query {string} status - 订单状态筛选（created/frozen/completed/cancelled）
 * @query {number} buyer_user_id - 买家ID筛选（可选）
 * @query {number} seller_user_id - 卖家ID筛选（可选）
 * @query {number} listing_id - 挂牌ID筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 * @query {string} sort_by - 排序字段（默认created_at）
 * @query {string} sort_order - 排序方向（默认DESC）
 *
 * @returns {Object} 订单列表和分页信息
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get('/trade_orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      status,
      buyer_user_id,
      seller_user_id,
      listing_id,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询C2C交易订单列表', {
      admin_id,
      status,
      buyer_user_id,
      seller_user_id,
      listing_id,
      page,
      page_size
    })

    // P1-9：通过 ServiceManager 获取 TradeOrderService（snake_case key）
    const TradeOrderService = req.app.locals.services.getService('trade_order')

    // 调用服务层方法获取订单列表
    const result = await TradeOrderService.getAdminOrders({
      status,
      buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : null,
      seller_user_id: seller_user_id ? parseInt(seller_user_id) : null,
      listing_id: listing_id ? parseInt(listing_id) : null,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })

    logger.info('管理员查询C2C交易订单成功', {
      admin_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, 'C2C交易订单列表查询成功')
  } catch (error) {
    logger.error('管理员查询C2C交易订单失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询订单列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取C2C交易订单详情（Admin Only）
 * GET /api/v4/console/marketplace/trade_orders/:order_id
 *
 * @description 管理员查看C2C交易订单详情，返回完整信息
 *
 * @param {number} order_id - 订单ID
 *
 * @returns {Object} 订单详情
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get('/trade_orders/:order_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { order_id } = req.params
    const admin_id = req.user.user_id

    logger.info('管理员查询C2C交易订单详情', {
      admin_id,
      order_id
    })

    // 参数验证
    const orderId = parseInt(order_id)
    if (isNaN(orderId) || orderId <= 0) {
      return res.apiError('无效的订单ID', 'BAD_REQUEST', null, 400)
    }

    // P1-9：通过 ServiceManager 获取 TradeOrderService（snake_case key）
    const TradeOrderService = req.app.locals.services.getService('trade_order')

    // 调用服务层方法获取订单详情
    const order = await TradeOrderService.getOrderDetail(orderId)

    logger.info('管理员获取C2C交易订单详情成功', {
      admin_id,
      order_id: orderId,
      status: order?.status
    })

    return res.apiSuccess(
      {
        success: true,
        order
      },
      'C2C交易订单详情查询成功'
    )
  } catch (error) {
    logger.error('管理员查询C2C交易订单详情失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id,
      order_id: req.params.order_id
    })

    // 业务错误处理
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return res.apiError(error.message || '查询订单详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 客服强制撤回挂牌（管理员操作）
 * POST /api/v4/console/marketplace/listings/:listing_id/force-withdraw
 *
 * 业务场景：
 * - 客服人员可强制撤回任意用户的挂牌
 * - 必须提供撤回原因用于审计追踪
 * - 撤回操作会记录到管理员操作日志
 *
 * @param {number} listing_id - 挂牌ID
 * @body {string} withdraw_reason - 撤回原因（必填，审计需要）
 *
 * @returns {Object} 撤回结果
 * @returns {Object} data.listing - 更新后的挂牌信息
 * @returns {Object} data.unfreeze_result - 解冻结果（如适用）
 * @returns {Object} data.audit_log - 审计日志记录
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-08（C2C材料交易 Phase 2）
 */
router.post(
  '/listings/:listing_id/force-withdraw',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { listing_id } = req.params
      const { withdraw_reason } = req.body
      const admin_id = req.user.user_id
      const ip_address = req.ip || req.connection.remoteAddress
      const user_agent = req.get('User-Agent') || 'unknown'

      logger.info('客服强制撤回挂牌请求', {
        admin_id,
        listing_id,
        withdraw_reason,
        ip_address
      })

      // 参数验证：listing_id
      const listingId = parseInt(listing_id)
      if (isNaN(listingId) || listingId <= 0) {
        return res.apiError('无效的挂牌ID', 'BAD_REQUEST', null, 400)
      }

      // 参数验证：withdraw_reason
      if (!withdraw_reason || withdraw_reason.trim().length === 0) {
        return res.apiError(
          '撤回原因是必填项（审计追踪需要）',
          'MISSING_WITHDRAW_REASON',
          null,
          400
        )
      }

      // 🎯 P1-9：通过 ServiceManager 获取 MarketListingService（snake_case key）
      const MarketListingService = req.app.locals.services.getService('market_listing')

      const result = await TransactionManager.executeTransaction(
        async transaction => {
          return await MarketListingService.adminForceWithdrawListing(
            {
              listing_id: listingId,
              admin_id,
              withdraw_reason: withdraw_reason.trim(),
              ip_address,
              user_agent
            },
            { transaction }
          )
        },
        {
          description: `客服强制撤回挂牌 - listing_id: ${listingId}`,
          maxRetries: 1
        }
      )

      logger.info('客服强制撤回挂牌成功', {
        admin_id,
        listing_id: listingId,
        seller_user_id: result.listing?.seller_user_id,
        listing_kind: result.listing?.listing_kind
      })

      return res.apiSuccess(
        {
          listing: result.listing,
          unfreeze_result: result.unfreeze_result,
          audit_log_id: result.audit_log?.log_id || null
        },
        '挂牌已强制撤回'
      )
    } catch (error) {
      logger.error('客服强制撤回挂牌失败', {
        error: error.message,
        code: error.code,
        stack: error.stack,
        admin_id: req.user?.user_id,
        listing_id: req.params.listing_id
      })

      // 业务错误处理
      if (error.code === 'LISTING_NOT_FOUND') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      if (error.code === 'INVALID_LISTING_STATUS') {
        return res.apiError(
          error.message,
          'INVALID_LISTING_STATUS',
          { current_status: error.details?.current_status },
          400
        )
      }

      if (error.code === 'MISSING_WITHDRAW_REASON') {
        return res.apiError(error.message, 'MISSING_WITHDRAW_REASON', null, 400)
      }

      return res.apiError(error.message || '强制撤回失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 管理员获取兑换订单列表（Admin Only）
 * GET /api/v4/console/marketplace/exchange_market/orders
 *
 * @description 管理员查看所有兑换订单，支持状态筛选、分页、排序
 *
 * 业务场景：
 * - 管理后台订单管理页面
 * - 订单状态筛选和批量处理
 * - 订单详情查看
 *
 * @query {string} status - 订单状态筛选（pending/completed/shipped/cancelled）
 * @query {number} user_id - 用户ID筛选（可选）
 * @query {number} item_id - 商品ID筛选（可选）
 * @query {string} order_no - 订单号模糊搜索（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 * @query {string} sort_by - 排序字段（默认created_at）
 * @query {string} sort_order - 排序方向（默认DESC）
 *
 * @returns {Object} 订单列表和分页信息
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get('/exchange_market/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      status,
      user_id,
      item_id,
      order_no,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询兑换订单列表', {
      admin_id,
      status,
      user_id,
      item_id,
      order_no,
      page,
      page_size
    })

    // 🎯 通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchange_market')

    // 调用服务层方法获取订单列表
    const result = await ExchangeService.getAdminOrders({
      status,
      user_id: user_id ? parseInt(user_id) : null,
      item_id: item_id ? parseInt(item_id) : null,
      order_no,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })

    logger.info('管理员查询兑换订单成功', {
      admin_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '订单列表查询成功')
  } catch (error) {
    logger.error('管理员查询兑换订单失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询订单列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取兑换订单详情（Admin Only）
 * GET /api/v4/console/marketplace/exchange_market/orders/:order_no
 *
 * @description 管理员查看订单详情，返回所有字段（包含敏感信息）
 *
 * @param {string} order_no - 订单号
 *
 * @returns {Object} 订单详情
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get(
  '/exchange_market/orders/:order_no',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { order_no } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员查询兑换订单详情', {
        admin_id,
        order_no
      })

      // 🎯 通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchange_market')

      // 调用服务层方法获取订单详情
      const result = await ExchangeService.getAdminOrderDetail(order_no)

      logger.info('管理员获取兑换订单详情成功', {
        admin_id,
        order_no,
        status: result.order?.status
      })

      return res.apiSuccess(result, '订单详情查询成功')
    } catch (error) {
      logger.error('管理员查询兑换订单详情失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id,
        order_no: req.params.order_no
      })

      // 业务错误处理
      if (error.errorCode === 'ORDER_NOT_FOUND' || error.statusCode === 404) {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      return res.apiError(error.message || '查询订单详情失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 查看C2C可交易资产配置
 * GET /api/v4/console/marketplace/tradable-assets
 *
 * P0-4: 管理端查看"C2C可交易资产配置"的接口
 *
 * 业务场景：
 * - 管理员查看所有材料类资产及其可交易状态
 * - 显示硬编码黑名单、数据库配置、最终有效状态
 * - 帮助运营人员了解哪些资产允许在C2C市场交易
 *
 * 响应字段说明：
 * - asset_code: 资产代码
 * - display_name: 资产显示名称
 * - is_tradable: 数据库配置的可交易状态
 * - is_enabled: 资产是否启用
 * - in_blacklist: 是否在硬编码黑名单中（POINTS/BUDGET_POINTS）
 * - effective_tradable: 最终有效的可交易状态（综合数据库配置和黑名单）
 * - blacklist_reason: 如在黑名单中，显示原因
 *
 * @security JWT + Admin权限
 *
 * @returns {Object} 可交易资产配置列表
 * @returns {Array} data.assets - 资产配置列表
 * @returns {Object} data.summary - 统计摘要
 *
 * @created 2026-01-09（P0-4）
 */
router.get('/tradable-assets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const admin_id = req.user.user_id

    logger.info('管理员查看C2C可交易资产配置', { admin_id })

    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 导入黑名单相关常量和函数
    const {
      C2C_BLACKLISTED_ASSET_CODES,
      isBlacklistedForC2C,
      getBlacklistReason
    } = require('../../../constants/TradableAssetTypes')

    // 通过 Service 层查询材料资产类型（符合路由层规范）
    const assets = await MaterialManagementService.getAllAssetTypesForTradeConfig()

    // 构建响应数据，添加黑名单检查结果
    const assetConfigs = assets.map(asset => {
      const inBlacklist = isBlacklistedForC2C(asset.asset_code)
      const blacklistReason = getBlacklistReason(asset.asset_code)

      /*
       * 最终有效的可交易状态计算：
       * 1. 必须是启用状态（is_enabled = true）
       * 2. 数据库配置允许交易（is_tradable = true）
       * 3. 不在硬编码黑名单中（!inBlacklist）
       */
      const effectiveTradable = asset.is_enabled && asset.is_tradable && !inBlacklist

      return {
        asset_code: asset.asset_code,
        display_name: asset.display_name,
        group_code: asset.group_code,
        form: asset.form,
        tier: asset.tier,
        is_tradable: asset.is_tradable,
        is_enabled: asset.is_enabled,
        in_blacklist: inBlacklist,
        blacklist_reason: blacklistReason,
        effective_tradable: effectiveTradable
      }
    })

    // 统计摘要
    const summary = {
      total_assets: assetConfigs.length,
      enabled_count: assetConfigs.filter(a => a.is_enabled).length,
      tradable_count: assetConfigs.filter(a => a.effective_tradable).length,
      blacklisted_count: assetConfigs.filter(a => a.in_blacklist).length,
      blacklisted_codes: [...C2C_BLACKLISTED_ASSET_CODES]
    }

    logger.info('C2C可交易资产配置查询成功', {
      admin_id,
      total: summary.total_assets,
      tradable: summary.tradable_count,
      blacklisted: summary.blacklisted_count
    })

    return res.apiSuccess(
      {
        assets: assetConfigs,
        summary
      },
      'C2C可交易资产配置'
    )
  } catch (error) {
    logger.error('查看C2C可交易资产配置失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
