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
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
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
router.get('/listing-stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all', mobile } = req.query

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
      filter,
      mobile: mobile || null
    })

    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    const result = await ExchangeService.getUserListingStats({
      page,
      limit,
      filter,
      max_listings: maxListings,
      mobile
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
 * 查询指定用户的上架商品列表
 * GET /api/v4/console/marketplace/user-listings
 *
 * @description 运营通过用户ID查看该用户的所有上架商品，支持状态筛选
 *
 * @query {number} user_id - 用户ID（必填）
 * @query {string} [status] - 挂牌状态筛选（on_sale/locked/sold/withdrawn/admin_withdrawn）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 *
 * @returns {Object} 用户信息 + 挂牌列表 + 分页
 *
 * @security JWT + Admin权限
 * @created 2026-02-18（运营精细化管理：按用户查看上架商品）
 */
router.get('/user-listings', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id, status, page = 1, page_size = 20 } = req.query
    const admin_id = req.user.user_id

    if (!user_id) {
      return res.apiError('user_id 是必填参数', 'BAD_REQUEST', null, 400)
    }

    logger.info('管理员查询用户上架商品列表', { admin_id, user_id, status, page, page_size })

    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    const result = await ExchangeService.getUserListings({
      user_id: parseInt(user_id),
      status: status || undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户上架商品列表成功', {
      admin_id,
      user_id: parseInt(user_id),
      total: result.pagination.total
    })

    return res.apiSuccess(result)
  } catch (error) {
    logger.error('查询用户上架商品列表失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      user_id: req.query.user_id
    })

    if (error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 调整用户上架数量限制
 * PUT /api/v4/console/marketplace/user-listing-limit
 *
 * @description 运营调整指定用户的上架数量上限，支持设为自定义值或恢复全局默认
 *
 * @body {number} user_id - 目标用户ID（必填）
 * @body {number|null} max_active_listings - 新的上架限制（null=恢复全局默认）
 * @body {string} [reason] - 调整原因（运营备注）
 *
 * @returns {Object} 调整结果（含新旧限制对比）
 *
 * @security JWT + Admin权限
 * @created 2026-02-18（运营精细化管理：按用户调整上架限制）
 */
router.put('/user-listing-limit', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { user_id, max_active_listings, reason } = req.body
    const admin_id = req.user.user_id

    if (!user_id) {
      return res.apiError('user_id 是必填参数', 'BAD_REQUEST', null, 400)
    }

    logger.info('管理员调整用户上架限制', { admin_id, user_id, max_active_listings, reason })

    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    const result = await TransactionManager.execute(
      async transaction => {
        return await ExchangeService.updateUserListingLimit(
          { user_id: parseInt(user_id), max_active_listings, operator_id: admin_id, reason },
          { transaction }
        )
      },
      { description: `调整用户上架限制 user_id=${user_id}`, maxRetries: 1 }
    )

    logger.info('用户上架限制调整成功', {
      admin_id,
      user_id: parseInt(user_id),
      old_limit: result.old_limit,
      new_limit: result.new_limit,
      effective_limit: result.effective_limit
    })

    return res.apiSuccess(result, '上架数量限制调整成功')
  } catch (error) {
    logger.error('调整用户上架限制失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      user_id: req.body?.user_id
    })

    if (error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.message.includes('必须') || error.message.includes('必填')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError(error.message || '调整失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取兑换商品列表（Admin Only）
 * GET /api/v4/console/marketplace/exchange_market/items
 *
 * @description 管理员查看所有兑换商品列表，支持状态筛选、分页、排序
 *
 * 业务场景：
 * - 管理后台商品管理页面
 * - 支持按状态筛选（active/inactive）
 * - 支持关键词搜索
 *
 * @query {string} status - 商品状态筛选（active/inactive/all，默认all）
 * @query {string} keyword - 商品名称关键词搜索（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 * @query {string} sort_by - 排序字段（默认sort_order）
 * @query {string} sort_order - 排序方向（ASC/DESC，默认ASC）
 *
 * @returns {Object} 商品列表和分页信息
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get('/exchange_market/items', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      status = 'all',
      keyword,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询兑换商品列表', {
      admin_id,
      status,
      keyword,
      page,
      page_size
    })

    // 🎯 通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    // 调用服务层方法获取商品列表（管理后台查看所有状态）
    const result = await ExchangeService.getAdminMarketItems({
      status: status === 'all' ? null : status,
      keyword,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })

    logger.info('管理员查询兑换商品成功', {
      admin_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '商品列表查询成功')
  } catch (error) {
    logger.error('管理员查询兑换商品失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询商品列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取兑换市场统计数据（Admin Only）
 * GET /api/v4/console/marketplace/exchange_market/statistics
 *
 * @description 管理员查看兑换市场统计数据
 *
 * @returns {Object} 统计数据
 * @returns {number} data.total_items - 商品总数
 * @returns {number} data.active_items - 上架商品数
 * @returns {number} data.low_stock_items - 库存预警商品数（库存<10）
 * @returns {number} data.total_exchanges - 总兑换次数
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get(
  '/exchange_market/statistics',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const admin_id = req.user.user_id

      logger.info('管理员查询兑换市场统计', { admin_id })

      // 🎯 通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchange_admin')

      // 调用服务层方法获取统计数据
      const statistics = await ExchangeService.getMarketItemStatistics()

      logger.info('管理员查询兑换市场统计成功', {
        admin_id,
        total_items: statistics.total_items,
        active_items: statistics.active_items
      })

      return res.apiSuccess(statistics, '统计数据查询成功')
    } catch (error) {
      logger.error('管理员查询兑换市场统计失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id
      })

      return res.apiError(error.message || '查询统计数据失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 管理员获取单个兑换商品详情（Admin Only）
 * GET /api/v4/console/marketplace/exchange_market/items/:exchange_item_id
 *
 * @description 管理员查看单个商品详情，返回完整字段
 *
 * @param {number} exchange_item_id - 商品ID
 *
 * @returns {Object} 商品详情
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get(
  '/exchange_market/items/:exchange_item_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { exchange_item_id } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员查询兑换商品详情', {
        admin_id,
        exchange_item_id
      })

      // 参数验证
      const itemId = parseInt(exchange_item_id)
      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      // 🎯 通过 ServiceManager 获取查询服务（getItemDetail 在 QueryService 中）
      const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

      // 调用服务层方法获取商品详情
      const result = await ExchangeQueryService.getItemDetail(itemId)

      logger.info('管理员查询兑换商品详情成功', {
        admin_id,
        exchange_item_id: itemId,
        name: result.item?.name
      })

      return res.apiSuccess(result, '商品详情查询成功')
    } catch (error) {
      logger.error('管理员查询兑换商品详情失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id,
        exchange_item_id: req.params.exchange_item_id
      })

      // 业务错误处理
      if (error.message === '商品不存在') {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }

      return res.apiError(error.message || '查询商品详情失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

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
 * 2026-01-20 技术债务清理：
 * - 字段名统一为 name/description（与数据库模型一致）
 * - 已删除 item_name/item_description 兼容
 *
 * @body {string} name - 商品名称（必填，最长100字符）
 * @body {string} description - 商品描述（可选，最长500字符）
 * @body {string} cost_asset_code - 材料资产代码（必填，如 'red_shard'）
 * @body {number} cost_amount - 材料资产数量（必填，>0）
 * @body {number} cost_price - 成本价（必填）
 * @body {number} stock - 初始库存（必填，>=0）
 * @body {number} sort_order - 排序号（必填，默认100）
 * @body {string} status - 商品状态（必填：active/inactive）
 * @body {number} primary_image_id - 主图片ID（可选，关联 image_resources.image_resource_id）
 * @body {string} space - 空间归属（可选，lucky=幸运空间, premium=臻选空间, both=两者都展示，默认lucky）
 * @body {number} original_price - 原价材料数量（可选，用于展示划线价）
 * @body {Array} tags - 商品标签数组（可选，如 ["限量","新品"]）
 * @body {boolean} is_new - 是否新品（可选，默认false）
 * @body {boolean} is_hot - 是否热门（可选，默认false）
 * @body {boolean} is_lucky - 是否幸运商品（可选，默认false）
 * @body {boolean} has_warranty - 是否有质保（可选，默认false）
 * @body {boolean} free_shipping - 是否包邮（可选，默认false）
 * @body {boolean} is_limited - 是否限量商品（可选，默认false，管理员手动控制）
 * @body {string} sell_point - 营销卖点文案（可选，最长200字符）
 * @body {string} category - 商品分类（可选）
 */
router.post(
  '/exchange_market/items',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    const {
      name,
      description = '',
      cost_asset_code,
      cost_amount,
      cost_price,
      stock,
      sort_order = 100,
      status = 'active',
      // 🎯 2026-01-08 图片存储架构：主图片ID（关联 image_resources.image_resource_id）
      primary_image_id,
      // 臻选空间/幸运空间扩展字段（决策12：9个新字段）
      space,
      original_price,
      tags,
      is_new,
      is_hot,
      is_lucky,
      has_warranty,
      free_shipping,
      is_limited,
      sell_point,
      category
    } = req.body

    const admin_id = req.user.user_id

    logger.info('管理员创建兑换商品（材料资产支付）', {
      admin_id,
      name,
      cost_asset_code,
      cost_amount,
      stock,
      primary_image_id
    })

    // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    // 商品上架前置校验（在事务外执行，避免 TransactionManager 误重试业务校验错误）
    const targetStatus = status || 'active'
    if (targetStatus === 'active' && !primary_image_id) {
      return res.apiError(
        '商品上架必须上传主图片（primary_image_id 不能为空）',
        'IMAGE_REQUIRED',
        null,
        400
      )
    }

    // 🎯 2026-01-08 图片存储架构修复：使用 TransactionManager 包装事务
    const transactionResult = await TransactionManager.execute(async transaction => {
      // 调用服务层方法创建商品（V4.5.0 材料资产支付 + 臻选空间/幸运空间扩展字段）
      const result = await ExchangeService.createExchangeItem(
        {
          name,
          description,
          cost_asset_code,
          cost_amount,
          cost_price,
          stock,
          sort_order,
          status,
          primary_image_id,
          // 臻选空间/幸运空间扩展字段
          space,
          original_price,
          tags,
          is_new,
          is_hot,
          is_lucky,
          has_warranty,
          free_shipping,
          is_limited,
          sell_point,
          category
        },
        admin_id,
        { transaction }
      )

      return result
    })

    /*
     * 🔧 2026-01-09 修复：ExchangeService.createExchangeItem 直接返回
     * { success, item, bound_image, timestamp }，不需要检查 .data
     */
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

    // 直接使用 transactionResult（已包含 item, bound_image, timestamp）
    logger.info('兑换商品创建成功（材料资产支付）', {
      admin_id,
      exchange_item_id: transactionResult.item?.exchange_item_id,
      name: transactionResult.item?.name,
      cost_asset_code: transactionResult.item?.cost_asset_code,
      cost_amount: transactionResult.item?.cost_amount,
      bound_image: transactionResult.bound_image
    })

    // 🔌 WebSocket推送：通知所有在线用户商品已创建（2026-02-15 新增）
    try {
      /** 通过 ServiceManager 获取 ChatWebSocketService（不直接 require） */
      const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
      ChatWebSocketService.broadcastProductUpdated({
        action: 'created',
        exchange_item_id: transactionResult.item?.exchange_item_id,
        name: transactionResult.item?.name,
        stock: transactionResult.item?.stock,
        status: transactionResult.item?.status,
        operator_id: admin_id
      })
    } catch (wsError) {
      logger.warn('WebSocket推送商品创建通知失败（非致命）', { error: wsError.message })
    }

    return res.apiSuccess(
      {
        item: transactionResult.item,
        bound_image: transactionResult.bound_image
      },
      '商品创建成功'
    )
  }
)

/**
 * 更新兑换商品（管理员操作）
 * PUT /api/v4/console/marketplace/exchange_market/items/:exchange_item_id
 *
 * V4.5.0 材料资产支付版本
 *
 * 🎯 2026-01-08 图片存储架构核查修复：
 * - 使用 TransactionManager 包装事务
 * - 更换图片时删除旧图片 + 绑定新图片 context_id
 *
 * 2026-01-20 技术债务清理：
 * - 字段名统一为 name/description（与数据库模型一致）
 *
 * @param {number} exchange_item_id - 商品ID
 */
router.put(
  '/exchange_market/items/:exchange_item_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { exchange_item_id } = req.params
      const {
        name,
        description,
        cost_asset_code,
        cost_amount,
        cost_price,
        stock,
        sort_order,
        status,
        // 🎯 2026-01-08 图片存储架构：主图片ID（关联 image_resources.image_resource_id）
        primary_image_id,
        // 臻选空间/幸运空间扩展字段（决策12：9个新字段）
        space,
        original_price,
        tags,
        is_new,
        is_hot,
        is_lucky,
        has_warranty,
        free_shipping,
        is_limited,
        sell_point,
        category
      } = req.body

      const admin_id = req.user.user_id

      logger.info('管理员更新兑换商品（材料资产支付）', {
        admin_id,
        exchange_item_id,
        cost_asset_code,
        primary_image_id,
        cost_amount,
        space
      })

      // 参数验证
      const itemId = parseInt(exchange_item_id)
      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchange_admin')

      // 🎯 2026-01-08：使用事务包装更新操作（含图片处理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await ExchangeService.updateExchangeItem(
            itemId,
            {
              name,
              description,
              cost_asset_code,
              cost_amount,
              cost_price,
              stock,
              sort_order,
              status,
              primary_image_id,
              // 臻选空间/幸运空间扩展字段
              space,
              original_price,
              tags,
              is_new,
              is_hot,
              is_lucky,
              has_warranty,
              free_shipping,
              is_limited,
              sell_point,
              category
            },
            { transaction }
          )
        },
        {
          description: `更新兑换商品 exchange_item_id=${itemId}`,
          maxRetries: 1
        }
      )

      logger.info('兑换商品更新成功（材料资产支付）', {
        admin_id,
        exchange_item_id: itemId,
        item_name: result.item.item_name,
        cost_asset_code: result.item.cost_asset_code,
        cost_amount: result.item.cost_amount,
        image_changes: result.image_changes
      })

      // 🔌 WebSocket推送：通知所有在线用户商品已更新（2026-02-15 新增）
      try {
        const ChatWebSocketService = require('../../../services/ChatWebSocketService')
        ChatWebSocketService.broadcastProductUpdated({
          action: 'updated',
          exchange_item_id: itemId,
          name: result.item.item_name || result.item.name,
          stock: result.item.stock,
          status: result.item.status,
          operator_id: admin_id
        })
      } catch (wsError) {
        logger.warn('WebSocket推送商品更新通知失败（非致命）', { error: wsError.message })
      }

      return res.apiSuccess(result, '商品更新成功')
    } catch (error) {
      logger.error('更新兑换商品失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id,
        exchange_item_id: req.params.exchange_item_id
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
  }
)

/**
 * 删除兑换商品（管理员操作）
 * DELETE /api/v4/console/marketplace/exchange_market/items/:exchange_item_id
 *
 * 🎯 2026-01-08 图片存储架构核查修复：
 * - 使用 TransactionManager 包装事务
 * - 删除商品时联动删除关联图片（DB + 对象存储）
 *
 * @param {number} exchange_item_id - 商品ID
 */
router.delete(
  '/exchange_market/items/:exchange_item_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { exchange_item_id } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员删除兑换商品', {
        admin_id,
        exchange_item_id
      })

      // 参数验证
      const itemId = parseInt(exchange_item_id)
      if (isNaN(itemId) || itemId <= 0) {
        return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
      }

      // 🎯 P2-C架构重构：通过 ServiceManager 获取 ExchangeService
      const ExchangeService = req.app.locals.services.getService('exchange_admin')

      // 🎯 2026-01-08：使用事务包装删除操作（含图片删除）
      const result = await TransactionManager.execute(
        async transaction => {
          return await ExchangeService.deleteExchangeItem(itemId, { transaction })
        },
        {
          description: `删除兑换商品 exchange_item_id=${itemId}`,
          maxRetries: 1
        }
      )

      logger.info('兑换商品删除操作完成', {
        admin_id,
        exchange_item_id: itemId,
        action: result.action,
        message: result.message,
        // 2026-02-01 主键命名规范化：使用完整前缀 image_resource_id
        deleted_image_resource_id: result.deleted_image_resource_id
      })

      /* WebSocket推送：通知所有在线用户商品已删除/下架（通过 ServiceManager 获取） */
      try {
        const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
        ChatWebSocketService.broadcastProductUpdated({
          action: result.action === 'deactivated' ? 'status_changed' : 'deleted',
          exchange_item_id: itemId,
          status: result.action === 'deactivated' ? 'inactive' : 'deleted',
          operator_id: admin_id
        })
      } catch (wsError) {
        logger.warn('WebSocket推送商品删除通知失败（非致命）', { error: wsError.message })
      }

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
        exchange_item_id: req.params.exchange_item_id
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
 * 管理员获取交易市场订单列表（Admin Only）
 * GET /api/v4/console/marketplace/trade_orders
 *
 * @description 管理员查看所有交易市场订单，支持状态筛选、分页
 *
 * 业务场景：
 * - 管理后台交易市场订单管理页面
 * - 订单状态筛选和查看
 * - 交易纠纷处理
 *
 * 服务合并记录（2026-01-22）：
 * - 已使用 TradeOrderService.getOrders() 替代原 getAdminOrders()
 * - 排序固定为 created_at DESC（降序）
 *
 * @query {string} status - 订单状态筛选（created/frozen/completed/cancelled）
 * @query {number} buyer_user_id - 买家ID筛选（可选）
 * @query {number} seller_user_id - 卖家ID筛选（可选）
 * @query {number} market_listing_id - 挂牌ID筛选（可选）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认20）
 *
 * @returns {Object} 订单列表和分页信息
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 * @updated 2026-01-22（服务合并：使用 getOrders() 替代 getAdminOrders()）
 */
router.get('/trade_orders', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      status,
      buyer_user_id,
      seller_user_id,
      market_listing_id,
      page = 1,
      page_size = 20
    } = req.query
    const admin_id = req.user.user_id

    logger.info('管理员查询交易市场订单列表', {
      admin_id,
      status,
      buyer_user_id,
      seller_user_id,
      market_listing_id,
      page,
      page_size
    })

    // P1-9：通过 ServiceManager 获取 TradeOrderService（snake_case key）
    const TradeOrderService = req.app.locals.services.getService('trade_order')

    // 调用服务层方法获取订单列表（2026-01-22 合并：使用 getOrders() 替代 getAdminOrders()）
    const result = await TradeOrderService.getOrders({
      status,
      buyer_user_id: buyer_user_id ? parseInt(buyer_user_id) : undefined,
      seller_user_id: seller_user_id ? parseInt(seller_user_id) : undefined,
      market_listing_id: market_listing_id ? parseInt(market_listing_id) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('管理员查询交易市场订单成功', {
      admin_id,
      total: result.pagination.total_count,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '交易市场订单列表查询成功')
  } catch (error) {
    logger.error('管理员查询交易市场订单失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询订单列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * 管理员获取交易市场订单详情（Admin Only）
 * GET /api/v4/console/marketplace/trade_orders/:order_id
 *
 * @description 管理员查看交易市场订单详情，返回完整信息
 *
 * @param {number} order_id - 订单ID
 *
 * @returns {Object} 订单详情
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-09（web管理平台功能完善）
 */
router.get(
  '/trade_orders/:order_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员查询交易市场订单详情', {
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

      logger.info('管理员获取交易市场订单详情成功', {
        admin_id,
        order_id: orderId,
        status: order?.status
      })

      return res.apiSuccess(
        {
          success: true,
          order
        },
        '交易市场订单详情查询成功'
      )
    } catch (error) {
      logger.error('管理员查询交易市场订单详情失败', {
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
  }
)

/**
 * 客服强制撤回挂牌（管理员操作）
 * POST /api/v4/console/marketplace/listings/:market_listing_id/force-withdraw
 *
 * 业务场景：
 * - 客服人员可强制撤回任意用户的挂牌
 * - 必须提供撤回原因用于审计追踪
 * - 撤回操作会记录到管理员操作日志
 *
 * @param {number} market_listing_id - 挂牌ID（数据库主键字段名）
 * @body {string} withdraw_reason - 撤回原因（必填，审计需要）
 *
 * @returns {Object} 撤回结果
 * @returns {Object} data.listing - 更新后的挂牌信息
 * @returns {Object} data.unfreeze_result - 解冻结果（如适用）
 * @returns {Object} data.audit_log - 审计日志记录
 *
 * @security JWT + Admin权限
 *
 * @created 2026-01-08（交易市场材料交易 Phase 2）
 */
router.post(
  '/listings/:market_listing_id/force-withdraw',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { market_listing_id } = req.params
      const { withdraw_reason } = req.body
      const admin_id = req.user.user_id
      const ip_address = req.ip || req.connection.remoteAddress
      const user_agent = req.get('User-Agent') || 'unknown'

      logger.info('客服强制撤回挂牌请求', {
        admin_id,
        market_listing_id,
        withdraw_reason,
        ip_address
      })

      // 参数验证：market_listing_id
      const listingId = parseInt(market_listing_id)
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
      const MarketListingService = req.app.locals.services.getService('market_listing_query')

      const result = await TransactionManager.execute(
        async transaction => {
          return await MarketListingService.adminForceWithdrawListing(
            {
              market_listing_id: listingId,
              operator_id: admin_id,
              reason: withdraw_reason.trim(),
              ip_address,
              user_agent
            },
            { transaction }
          )
        },
        {
          description: `客服强制撤回挂牌 - market_listing_id: ${listingId}`,
          maxRetries: 1
        }
      )

      logger.info('客服强制撤回挂牌成功', {
        admin_id,
        market_listing_id: listingId,
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
        market_listing_id: req.params.market_listing_id
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
 * @query {number} exchange_item_id - 商品ID筛选（可选）
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
router.get(
  '/exchange_market/orders',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const {
        status,
        user_id,
        exchange_item_id,
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
        exchange_item_id,
        order_no,
        page,
        page_size
      })

      // 🎯 通过 ServiceManager 获取查询服务（getAdminOrders 在 QueryService 中）
      const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

      // 调用服务层方法获取订单列表
      const result = await ExchangeQueryService.getAdminOrders({
        status,
        user_id: user_id ? parseInt(user_id) : null,
        exchange_item_id: exchange_item_id ? parseInt(exchange_item_id) : null,
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
  }
)

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
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { order_no } = req.params
      const admin_id = req.user.user_id

      logger.info('管理员查询兑换订单详情', {
        admin_id,
        order_no
      })

      // 🎯 通过 ServiceManager 获取查询服务（getAdminOrderDetail 在 QueryService 中）
      const ExchangeQueryService = req.app.locals.services.getService('exchange_query')

      // 调用服务层方法获取订单详情
      const result = await ExchangeQueryService.getAdminOrderDetail(order_no)

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
 * 查询缺少图片的兑换商品列表（运营排查工具）
 * GET /api/v4/console/marketplace/exchange_market/missing-images
 *
 * @description 运营用于快速定位哪些商品还没有绑定图片，方便批量上传处理
 *
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页数量（默认50）
 *
 * @returns {Object} 缺图商品列表和分页信息
 *
 * @security JWT + Admin权限
 *
 * @created 2026-02-16（运营工具：商品图片批量绑定）
 */
router.get(
  '/exchange_market/missing-images',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { page = 1, page_size = 50 } = req.query
      const admin_id = req.user.user_id

      logger.info('管理员查询缺图商品列表', { admin_id, page, page_size })

      const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')

      const result = await ExchangeAdminService.getMissingImageItems({
        page: parseInt(page),
        page_size: parseInt(page_size)
      })

      logger.info('缺图商品列表查询成功', {
        admin_id,
        total: result.pagination.total,
        page: result.pagination.page
      })

      return res.apiSuccess(result, `共 ${result.pagination.total} 个商品缺少图片`)
    } catch (error) {
      logger.error('查询缺图商品列表失败', {
        error: error.message,
        admin_id: req.user?.user_id
      })
      return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 批量绑定兑换商品图片（运营批量操作）
 * POST /api/v4/console/marketplace/exchange_market/batch-bind-images
 *
 * @description 运营上传图片后，通过此接口批量绑定图片到对应商品
 *
 * @body {Array<Object>} bindings - 绑定关系数组
 * @body {number} bindings[].exchange_item_id - 商品ID
 * @body {number} bindings[].image_resource_id - 图片资源ID（先通过图片上传API获取）
 *
 * @returns {Object} 批量绑定结果
 * @returns {number} data.total - 总处理数
 * @returns {number} data.success - 成功数
 * @returns {number} data.failed - 失败数
 * @returns {Array} data.details - 每条记录的处理详情
 *
 * @security JWT + Admin权限
 *
 * @created 2026-02-16（运营工具：商品图片批量绑定）
 */
router.post(
  '/exchange_market/batch-bind-images',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { bindings } = req.body
      const admin_id = req.user.user_id

      // 参数验证
      if (!Array.isArray(bindings) || bindings.length === 0) {
        return res.apiError(
          'bindings 必须是非空数组，每项包含 exchange_item_id 和 image_resource_id',
          'BAD_REQUEST',
          {
            example: {
              bindings: [
                { exchange_item_id: 1, image_resource_id: 100 },
                { exchange_item_id: 2, image_resource_id: 101 }
              ]
            }
          },
          400
        )
      }

      // 数量限制（防止单次过多）
      if (bindings.length > 100) {
        return res.apiError('单次批量绑定最多100条，请分批操作', 'BAD_REQUEST', null, 400)
      }

      logger.info('管理员批量绑定商品图片', {
        admin_id,
        binding_count: bindings.length
      })

      const ExchangeAdminService = req.app.locals.services.getService('exchange_admin')

      const result = await TransactionManager.execute(
        async transaction => {
          return await ExchangeAdminService.batchBindImages(bindings, { transaction })
        },
        {
          description: `批量绑定商品图片 ${bindings.length} 条`,
          maxRetries: 1
        }
      )

      logger.info('批量绑定商品图片完成', {
        admin_id,
        total: result.total,
        success: result.success,
        failed: result.failed
      })

      return res.apiSuccess(result, `批量绑定完成：成功 ${result.success}，失败 ${result.failed}`)
    } catch (error) {
      logger.error('批量绑定商品图片失败', {
        error: error.message,
        stack: error.stack,
        admin_id: req.user?.user_id
      })
      return res.apiError(error.message || '批量绑定失败', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * 查看交易市场可交易资产配置
 * GET /api/v4/console/marketplace/tradable-assets
 *
 * P0-4: 管理端查看"交易市场可交易资产配置"的接口
 *
 * 业务场景：
 * - 管理员查看所有材料类资产及其可交易状态
 * - 显示硬编码黑名单、数据库配置、最终有效状态
 * - 帮助运营人员了解哪些资产允许在交易市场交易
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
router.get('/tradable-assets', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const admin_id = req.user.user_id

    logger.info('管理员查看交易市场可交易资产配置', { admin_id })

    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MaterialManagementService = req.app.locals.services.getService('material_management')

    // 导入黑名单相关常量和函数
    const {
      MARKET_BLACKLISTED_ASSET_CODES,
      isBlacklistedForMarket,
      getBlacklistReason
    } = require('../../../constants/TradableAssetTypes')

    // 通过 Service 层查询材料资产类型（符合路由层规范）
    const assets = await MaterialManagementService.getAllAssetTypesForTradeConfig()

    // 构建响应数据，添加黑名单检查结果
    const assetConfigs = assets.map(asset => {
      const inBlacklist = isBlacklistedForMarket(asset.asset_code)
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
      blacklisted_codes: [...MARKET_BLACKLISTED_ASSET_CODES]
    }

    logger.info('交易市场可交易资产配置查询成功', {
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
      '交易市场可交易资产配置'
    )
  } catch (error) {
    logger.error('查看交易市场可交易资产配置失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return res.apiError(error.message || '查询失败', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
