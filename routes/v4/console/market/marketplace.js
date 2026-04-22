/**
 * C2C 二级市场管理 API（瘦身后仅包含 C2C 路由）
 *
 * @description 管理员管理 C2C 二级市场：用户上架统计、挂牌运营、强制撤回、市场统计、可交易资产配置
 * @route /api/v4/console/marketplace/*
 * @version 4.1.0
 *
 * 路由清单：
 * - GET    /listings                                 - 挂牌列表（管理视图，多维筛选）
 * - GET    /listings/:market_listing_id              - 挂牌详情
 * - POST   /listings                                 - 管理员代创建挂牌
 * - PUT    /listings/:market_listing_id              - 管理员修改挂牌（改价/排序/备注）
 * - DELETE /listings/:market_listing_id              - 管理员硬删除（仅终态可删）
 * - GET    /listing-stats                            - 用户上架统计
 * - GET    /user-listings                            - 查指定用户的挂牌
 * - PUT    /user-listing-limit                       - 调整用户上架上限
 * - PUT    /listings/:id/pin                         - 挂牌置顶
 * - PUT    /listings/:id/recommend                   - 挂牌推荐
 * - PUT    /listings/batch-sort                      - 批量排序
 * - POST   /listings/:market_listing_id/force-withdraw - 强制撤回
 * - GET    /stats/overview                           - 市场概览
 * - GET    /stats/price-history                      - 价格走势
 * - GET    /config/tradable-assets                   - 可交易资产配置
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { handleServiceError } = require('../../../../middleware/validation')

// ==================== C2C 挂牌管理 CRUD ====================

/**
 * GET /api/v4/console/marketplace/listings
 * @desc 管理员查看全部挂牌列表（支持多维筛选、分页、排序）
 */
router.get('/listings', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const admin_id = req.user.user_id
    const {
      status,
      listing_kind,
      asset_code,
      seller_user_id,
      sort = 'newest',
      page = 1,
      page_size = 20
    } = req.query

    logger.info('[C2C管理] 查询挂牌列表', { admin_id, status, listing_kind, asset_code })

    const { MarketListing, User, Item, ItemTemplate } = require('../../../../models')
    const where = {}
    if (status) where.status = status
    if (listing_kind) where.listing_kind = listing_kind
    if (asset_code) where.offer_asset_code = asset_code
    if (seller_user_id) where.seller_user_id = parseInt(seller_user_id)

    const sortMap = {
      newest: [['created_at', 'DESC']],
      oldest: [['created_at', 'ASC']],
      price_asc: [['asking_price', 'ASC']],
      price_desc: [['asking_price', 'DESC']]
    }

    const safePage = Math.max(1, parseInt(page) || 1)
    const safePageSize = Math.min(100, Math.max(1, parseInt(page_size) || 20))

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        { model: User, as: 'seller', attributes: ['user_id', 'nickname', 'mobile'] },
        { model: Item, as: 'offerItem', required: false },
        {
          model: ItemTemplate,
          as: 'offerItemTemplate',
          attributes: ['item_template_id', 'display_name'],
          required: false
        }
      ],
      order: sortMap[sort] || sortMap.newest,
      limit: safePageSize,
      offset: (safePage - 1) * safePageSize
    })

    return res.apiSuccess(
      {
        listings: rows,
        pagination: {
          page: safePage,
          page_size: safePageSize,
          total: count,
          total_pages: Math.ceil(count / safePageSize)
        }
      },
      '获取挂牌列表成功'
    )
  } catch (error) {
    logger.error('[C2C管理] 查询挂牌列表失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })
    return handleServiceError(error, res)
  }
})

/**
 * GET /api/v4/console/marketplace/listings/:market_listing_id
 * @desc 管理员查看挂牌详情
 */
router.get(
  '/listings/:market_listing_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const listingId = parseInt(req.params.market_listing_id)
      if (isNaN(listingId) || listingId <= 0) {
        return res.apiError('无效的挂牌ID', 'BAD_REQUEST', null, 400)
      }

      const MarketListingQueryService = req.app.locals.services.getService('market_listing_query')
      const listing = await MarketListingQueryService.getListingById(listingId)
      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(listing, '获取挂牌详情成功')
    } catch (error) {
      logger.error('[C2C管理] 查询挂牌详情失败', { error: error.message })
      return handleServiceError(error, res)
    }
  }
)

/**
 * POST /api/v4/console/marketplace/listings
 * @desc 管理员代创建挂牌（运营干预：测试/补偿/活动）
 */
router.post('/listings', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const admin_id = req.user.user_id
    const {
      seller_user_id,
      listing_kind,
      offer_item_id,
      offer_asset_code,
      offer_amount,
      asking_price,
      admin_note
    } = req.body

    if (!seller_user_id || !listing_kind || !asking_price) {
      return res.apiError(
        'seller_user_id、listing_kind、asking_price 为必填',
        'VALIDATION_ERROR',
        null,
        400
      )
    }

    logger.info('[C2C管理] 管理员创建挂牌', {
      admin_id,
      seller_user_id,
      listing_kind,
      asking_price
    })

    const MarketListingService = req.app.locals.services.getService('market_listing_core')
    const result = await TransactionManager.execute(
      async transaction => {
        return await MarketListingService.createListing(
          {
            seller_user_id,
            listing_kind,
            offer_item_id,
            offer_asset_code,
            offer_amount,
            asking_price,
            admin_note,
            operator_id: admin_id
          },
          { transaction }
        )
      },
      { description: `管理员创建挂牌 seller=${seller_user_id}`, maxRetries: 1 }
    )

    return res.apiSuccess(result, '挂牌创建成功')
  } catch (error) {
    logger.error('[C2C管理] 创建挂牌失败', { error: error.message, admin_id: req.user?.user_id })
    if (error.message.includes('不存在') || error.message.includes('not found')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (
      error.message.includes('不能') ||
      error.message.includes('无效') ||
      error.message.includes('必填')
    ) {
      return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
    }
    return handleServiceError(error, res)
  }
})

/**
 * PUT /api/v4/console/marketplace/listings/:market_listing_id
 * @desc 管理员修改挂牌（改价/排序权重/备注，仅 on_sale 状态可改）
 */
router.put(
  '/listings/:market_listing_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const listingId = parseInt(req.params.market_listing_id)
      if (isNaN(listingId) || listingId <= 0) {
        return res.apiError('无效的挂牌ID', 'BAD_REQUEST', null, 400)
      }

      const { asking_price, sort_order, admin_note } = req.body
      const { MarketListing } = require('../../../../models')
      const listing = await MarketListing.findByPk(listingId)
      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }
      if (listing.status !== 'on_sale') {
        return res.apiError(
          `仅在售挂牌可修改，当前状态: ${listing.status}`,
          'INVALID_LISTING_STATUS',
          null,
          400
        )
      }

      const updateFields = {}
      if (asking_price !== undefined) updateFields.asking_price = asking_price
      if (sort_order !== undefined) updateFields.sort_order = sort_order
      if (admin_note !== undefined) updateFields.admin_note = admin_note

      await listing.update(updateFields)

      logger.info('[C2C管理] 修改挂牌成功', {
        admin_id: req.user.user_id,
        market_listing_id: listingId
      })
      return res.apiSuccess(listing, '挂牌修改成功')
    } catch (error) {
      logger.error('[C2C管理] 修改挂牌失败', { error: error.message })
      return handleServiceError(error, res)
    }
  }
)

/**
 * DELETE /api/v4/console/marketplace/listings/:market_listing_id
 * @desc 管理员硬删除挂牌（仅 withdrawn/admin_withdrawn 终态可删）
 */
router.delete(
  '/listings/:market_listing_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const listingId = parseInt(req.params.market_listing_id)
      if (isNaN(listingId) || listingId <= 0) {
        return res.apiError('无效的挂牌ID', 'BAD_REQUEST', null, 400)
      }

      const { MarketListing } = require('../../../../models')
      const listing = await MarketListing.findByPk(listingId)
      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      const deletableStatuses = ['withdrawn', 'admin_withdrawn']
      if (!deletableStatuses.includes(listing.status)) {
        return res.apiError(
          `仅已撤回的挂牌可删除，当前状态: ${listing.status}`,
          'INVALID_LISTING_STATUS',
          { current_status: listing.status, deletable_statuses: deletableStatuses },
          400
        )
      }

      logger.info('[C2C管理] 管理员删除挂牌', {
        admin_id: req.user.user_id,
        market_listing_id: listingId,
        status: listing.status
      })
      await listing.destroy()

      return res.apiSuccess({ market_listing_id: listingId }, '挂牌已删除')
    } catch (error) {
      logger.error('[C2C管理] 删除挂牌失败', { error: error.message })
      return handleServiceError(error, res)
    }
  }
)

// ==================== C2C 用户上架统计 ====================

router.get('/listing-stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { page = 1, page_size = 20, filter = 'all', mobile, merchant_id } = req.query

    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const maxListings = await AdminSystemService.getSettingValue(
      'marketplace',
      'max_active_listings',
      10
    )

    logger.info('管理员查询用户上架状态', {
      admin_id: req.user.user_id,
      page,
      page_size,
      filter,
      mobile: mobile || null,
      merchant_id: merchant_id || null
    })

    const ExchangeService = req.app.locals.services.getService('exchange_admin')

    const result = await ExchangeService.getUserListingStats({
      page,
      page_size,
      filter,
      max_listings: maxListings,
      mobile,
      merchant_id: merchant_id ? parseInt(merchant_id) : undefined
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

    return handleServiceError(error, res)
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
    const {
      user_id,
      status,
      page = 1,
      page_size = 20,
      quality_grade,
      sort_by,
      sort_order
    } = req.query
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
      page_size: parseInt(page_size),
      quality_grade: quality_grade || undefined,
      sort_by: sort_by || undefined,
      sort_order: sort_order || undefined
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
    return handleServiceError(error, res)
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
    return handleServiceError(error, res)
  }
})

// ==================== C2C 挂牌运营操作 ====================

/**
 * 置顶/取消置顶挂牌
 * PUT /api/v4/console/marketplace/listings/:id/pin
 *
 * @param {number} id - 挂牌ID
 * @body {boolean} [is_pinned] - 指定置顶状态（省略则 toggle）
 *
 * @security JWT + Admin权限
 */
router.put(
  '/listings/:market_listing_id/pin',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const listingId = parseInt(req.params.market_listing_id)
      const { is_pinned } = req.body
      const { MarketListing } = req.app.locals.services.getService('exchange_admin').models

      const result = await TransactionManager.execute(
        async transaction => {
          const listing = await MarketListing.findByPk(listingId, {
            lock: transaction.LOCK.UPDATE,
            transaction
          })
          if (!listing) throw new Error('挂牌不存在')

          const pinned = is_pinned !== undefined ? !!is_pinned : !listing.is_pinned
          const BeijingTimeHelper = require('../../../../utils/timeHelper')
          await listing.update(
            {
              is_pinned: pinned,
              pinned_at: pinned ? BeijingTimeHelper.createDatabaseTime() : null
            },
            { transaction }
          )

          return { market_listing_id: listingId, is_pinned: pinned }
        },
        { description: `置顶挂牌 ${listingId}`, maxRetries: 1 }
      )

      return res.apiSuccess(result, result.is_pinned ? '挂牌已置顶' : '已取消置顶')
    } catch (error) {
      logger.error('置顶挂牌失败', { error: error.message })
      return handleServiceError(error, res)
    }
  }
)

/**
 * 推荐/取消推荐挂牌
 * PUT /api/v4/console/marketplace/listings/:id/recommend
 *
 * @param {number} id - 挂牌ID
 * @body {boolean} [is_recommended] - 指定推荐状态（省略则 toggle）
 *
 * @security JWT + Admin权限
 */
router.put(
  '/listings/:market_listing_id/recommend',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const listingId = parseInt(req.params.market_listing_id)
      const { is_recommended } = req.body
      const { MarketListing } = req.app.locals.services.getService('exchange_admin').models

      const result = await TransactionManager.execute(
        async transaction => {
          const listing = await MarketListing.findByPk(listingId, {
            lock: transaction.LOCK.UPDATE,
            transaction
          })
          if (!listing) throw new Error('挂牌不存在')

          const recommended =
            is_recommended !== undefined ? !!is_recommended : !listing.is_recommended
          await listing.update({ is_recommended: recommended }, { transaction })

          return { market_listing_id: listingId, is_recommended: recommended }
        },
        { description: `推荐挂牌 ${listingId}`, maxRetries: 1 }
      )

      return res.apiSuccess(result, result.is_recommended ? '挂牌已推荐' : '已取消推荐')
    } catch (error) {
      logger.error('推荐挂牌失败', { error: error.message })
      return handleServiceError(error, res)
    }
  }
)

/**
 * 批量调整挂牌排序
 * PUT /api/v4/console/marketplace/listings/batch-sort
 *
 * @body {Array<{market_listing_id: number, sort_order: number}>} items - 排序数组
 *
 * @security JWT + Admin权限
 */
router.put('/listings/batch-sort', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.apiError('排序数据不能为空', 'BAD_REQUEST', null, 400)
    }

    const { MarketListing } = req.app.locals.services.getService('exchange_admin').models

    const result = await TransactionManager.execute(
      async transaction => {
        const updatePromises = items
          .filter(item => item.market_listing_id && item.sort_order !== undefined)
          .map(item =>
            MarketListing.update(
              { sort_order: parseInt(item.sort_order, 10) },
              { where: { market_listing_id: parseInt(item.market_listing_id, 10) }, transaction }
            )
          )
        const results = await Promise.all(updatePromises)
        const updatedCount = results.reduce((sum, [affected]) => sum + affected, 0)
        return { updated_count: updatedCount }
      },
      { description: '批量排序挂牌', maxRetries: 1 }
    )

    const { BusinessCacheHelper } = require('../../../../utils/BusinessCacheHelper')
    await BusinessCacheHelper.invalidateMarketListings('batch_sort')

    const AuditLogService = req.app.locals.services.getService('audit_log')
    await AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: 'sort_change',
      target_type: 'market_listing',
      target_id: null,
      action: 'batch_sort',
      after_data: { items: items.slice(0, 10), updated_count: result.updated_count },
      reason: '管理员批量调整挂牌排序',
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    }).catch(e => logger.warn('排序审计日志写入失败（非致命）', { error: e.message }))

    return res.apiSuccess(result, `已更新 ${result.updated_count} 个挂牌排序`)
  } catch (error) {
    logger.error('批量排序挂牌失败', { error: error.message })
    return handleServiceError(error, res)
  }
})

// ==================== C2C 客服强制撤回 ====================

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

      // 通过 ServiceManager 获取 MarketListingCoreService（写操作需要 core 服务）
      const MarketListingService = req.app.locals.services.getService('market_listing_core')

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

      return handleServiceError(error, res)
    }
  }
)

// ==================== C2C 市场统计 ====================

/**
 * 市场概览数据（复用 MarketAnalyticsService）
 * GET /api/v4/console/marketplace/stats/overview
 *
 * @description 管理后台查看交易市场总览数据，包括：
 *   - 近7天各资产成交量排行
 *   - 当前在售统计
 *   - 汇总数据（总成交笔数、总成交量、买家/卖家活跃数）
 *
 * @query {number} [merchant_id] - 按商家筛选（可选，预留多商家场景）
 *
 * @returns {Object} 市场概览数据
 * @returns {Object} data.totals - 汇总统计
 * @returns {Array}  data.asset_ranking - 各资产成交量排行
 * @returns {Array}  data.on_sale_summary - 当前在售统计
 * @returns {string} data.period - 统计周期
 *
 * @security JWT + Admin权限
 *
 * @created 2026-02-24（文档 6.5 节要求 - 管理后台市场概览端点）
 */
router.get('/stats/overview', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const admin_id = req.user.user_id

    logger.info('管理员查询市场概览数据', { admin_id })

    const MarketAnalyticsService = req.app.locals.services.getService('market_analytics')
    const { days = 7 } = req.query
    const overview = await MarketAnalyticsService.getMarketOverview(parseInt(days) || 7)

    logger.info('市场概览数据查询成功', {
      admin_id,
      total_trades: overview.totals.total_trades,
      asset_count: overview.asset_ranking.length
    })

    return res.apiSuccess(overview, '市场概览数据查询成功')
  } catch (error) {
    logger.error('查询市场概览数据失败', {
      error: error.message,
      stack: error.stack,
      admin_id: req.user?.user_id
    })

    return handleServiceError(error, res)
  }
})

/**
 * 资产价格历史（复用 MarketAnalyticsService）
 * GET /api/v4/console/marketplace/stats/price-history
 *
 * @description 管理后台查看指定资产的价格走势
 *
 * @query {string} asset_code - 资产代码（必填）
 * @query {number} [days=30] - 查询天数
 *
 * @returns {Object} 价格历史数据
 *
 * @security JWT + Admin权限
 *
 * @created 2026-02-24（文档 6.5 节要求 - 管理后台市场分析）
 */
router.get('/stats/price-history', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { asset_code, days = 30 } = req.query
    const admin_id = req.user.user_id

    if (!asset_code) {
      return res.apiError('需要 asset_code 参数', 'MISSING_PARAMS', null, 400)
    }

    logger.info('管理员查询资产价格历史', { admin_id, asset_code, days })

    const MarketAnalyticsService = req.app.locals.services.getService('market_analytics')
    const result = await MarketAnalyticsService.getAssetPriceHistory({
      asset_code,
      days: parseInt(days)
    })

    return res.apiSuccess(result, '价格历史查询成功')
  } catch (error) {
    logger.error('查询价格历史失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })

    return handleServiceError(error, res)
  }
})

// ==================== C2C 可交易资产配置 ====================

/**
 * GET /api/v4/console/marketplace/config/tradable-assets
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
router.get(
  '/config/tradable-assets',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
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
      } = require('../../../../constants/TradableAssetTypes')

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

      return handleServiceError(error, res)
    }
  }
)

module.exports = router
