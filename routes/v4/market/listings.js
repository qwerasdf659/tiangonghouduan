/**
 * 交易市场模块 - 列表查询
 *
 * @route /api/v4/market
 * @description 交易市场商品列表查询与详情获取
 *
 * API列表：
 * - GET /listings - 获取交易市场挂牌列表（带缓存）
 * - GET /listings/:market_listing_id - 获取市场挂牌详情
 * - GET /listing-status - 获取用户上架状态
 *
 * 业务场景：
 * - 用户浏览交易市场中其他用户上架的商品
 * - 查看市场商品的详细信息
 * - 查询用户当前上架商品数量和剩余上架额度
 *
 * 架构原则（决策7）：
 * - 路由层不直连 models，所有数据库操作通过 Service 层
 * - 缓存读取/写入/失效统一在 Service 层处理
 *
 * 创建时间：2025年12月22日
 * 更新时间：2026年01月06日 - 收口到 Service 层 + 缓存支持
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
/*
 * 决策7：路由层不直连 models，通过 Service 层操作
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const MarketListingService = require('../../../services/MarketListingService')
 */

/**
 * @route GET /api/v4/market/listings
 * @desc 获取交易市场挂牌列表（带缓存）
 * @access Private (需要登录)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} listing_kind - 挂牌类型筛选（item / fungible_asset，可选）
 * @query {string} asset_code - 资产代码筛选（如 red_shard，仅对 fungible_asset 有效）
 * @query {string} item_category_code - 物品类目代码筛选（仅对 item 类型有效）
 * @query {string} asset_group_code - 资产分组代码筛选（仅对 fungible_asset 有效）
 * @query {string} rarity_code - 稀有度代码筛选（仅对 item_instance 有效）
 * @query {number} min_price - 最低价格筛选（可选）
 * @query {number} max_price - 最高价格筛选（可选）
 * @query {string} sort - 排序方式（newest/price_asc/price_desc，默认newest）
 *
 * @returns {Object} 市场商品列表和分页信息
 * @returns {Array} data.products - 商品列表
 * @returns {Object} data.pagination - 分页信息
 *
 * 缓存策略（决策4）：
 * - TTL: 20秒（交易市场变化频繁需快速反映）
 * - 缓存命中率目标：>80%
 *
 * 业务场景：用户浏览交易市场中其他用户上架的商品（物品和材料）
 */
router.get('/listings', authenticateToken, async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MarketListingService = req.app.locals.services.getService('market_listing_query')

    const {
      page = 1,
      limit = 20,
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price,
      max_price,
      sort = 'newest'
    } = req.query

    // 决策7：通过 Service 层获取市场列表（带缓存）
    const result = await MarketListingService.getMarketListings({
      page: parseInt(page, 10),
      page_size: parseInt(limit, 10),
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price: min_price ? parseInt(min_price, 10) : undefined,
      max_price: max_price ? parseInt(max_price, 10) : undefined,
      sort
    })

    /*
     * γ 模式（2026-02-21）：通过 DataSanitizer 统一脱敏
     * - 卖家昵称经 maskUserName() PII 脱敏
     * - 内部字段（idempotency_key、locked_by_order_id 等）自动删除
     */
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const dataLevel = req.dataLevel || 'public'
    const sanitizedProducts = DataSanitizer.sanitizeMarketProducts(result.products, dataLevel)

    logger.info('获取交易市场挂牌列表成功', {
      user_id: req.user.user_id,
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price,
      max_price,
      sort,
      total: result.pagination.total,
      returned: sanitizedProducts.length
    })

    return res.apiSuccess(
      {
        products: sanitizedProducts,
        pagination: {
          total: result.pagination.total,
          page: result.pagination.page,
          limit: result.pagination.page_size,
          total_pages: result.pagination.total_pages
        }
      },
      '获取市场挂牌列表成功'
    )
  } catch (error) {
    logger.error('获取交易市场挂牌列表失败', {
      error: error.message,
      user_id: req.user?.user_id,
      query: req.query
    })

    return handleServiceError(error, res, '获取市场挂牌列表失败')
  }
})

/**
 * @route GET /api/v4/market/listings/facets
 * @desc 获取市场筛选维度配置（类目、稀有度、资产分组、挂牌类型）
 * @access Private (需要登录)
 *
 * @returns {Object} 筛选维度配置
 * @returns {Array} data.categories - 物品类目列表
 * @returns {Array} data.rarities - 稀有度列表
 * @returns {Array} data.asset_groups - 资产分组列表
 * @returns {Array} data.listing_kinds - 挂牌类型列表
 *
 * 业务场景：前端市场页面根据返回数据动态渲染筛选器
 *
 * 接口设计说明（2026-01-15 新增）：
 * - 此接口返回所有可用的筛选维度，用于前端筛选器 UI 渲染
 * - 仅返回已启用（is_enabled=true）且可交易（is_tradable=true）的选项
 */
router.get('/listings/facets', authenticateToken, async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MarketListingService = req.app.locals.services.getService('market_listing_query')

    // 获取筛选维度配置（仅返回已启用的选项）
    const facets = await MarketListingService.getFilterFacets({
      include_disabled: false
    })

    logger.info('获取市场筛选维度配置成功', {
      user_id: req.user.user_id,
      categories_count: facets.categories.length,
      rarities_count: facets.rarities.length,
      asset_groups_count: facets.asset_groups.length
    })

    return res.apiSuccess(facets, '获取筛选维度配置成功')
  } catch (error) {
    logger.error('获取市场筛选维度配置失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return handleServiceError(error, res, '获取筛选维度配置失败')
  }
})

/**
 * @route GET /api/v4/market/listings/:market_listing_id
 * @desc 获取市场挂牌详情
 * @access Private (需要登录)
 *
 * @param {number} market_listing_id - 挂牌ID
 *
 * @returns {Object} 挂牌详情
 * @returns {number} data.market_listing_id - 挂牌ID
 * @returns {number} data.item_id - 物品ID
 * @returns {string} data.name - 物品名称（2026-01-20 统一字段名）
 * @returns {string} data.item_type - 物品类型
 * @returns {number} data.price_amount - 价格数量
 * @returns {string} data.price_asset_code - 价格资产类型（如DIAMOND）
 * @returns {number} data.seller_user_id - 卖家用户ID
 * @returns {string} data.status - 状态（on_sale/sold/withdrawn）
 * @returns {string} data.listed_at - 上架时间
 * @returns {string} data.description - 物品描述
 * @returns {string} data.rarity - 稀有度
 * @returns {boolean} data.is_own - 是否是自己的商品
 *
 * 业务场景：用户查看市场商品的详细信息
 */
router.get(
  '/listings/:market_listing_id',
  authenticateToken,
  validatePositiveInteger('market_listing_id', 'params'),
  async (req, res) => {
    try {
      // P1-9：通过 ServiceManager 获取服务（snake_case key）
      const MarketListingService = req.app.locals.services.getService('market_listing_query')

      const listingId = req.validated.market_listing_id

      // 决策7：通过 Service 层获取挂牌详情
      const listing = await MarketListingService.getListingById(listingId)

      if (!listing) {
        return res.apiError('挂牌不存在', 'NOT_FOUND', null, 404)
      }

      /*
       * γ 模式（2026-02-21）：通过 DataSanitizer 统一脱敏
       * - 主键 market_listing_id → listing_id（与列表接口一致）
       * - 卖家昵称 PII 脱敏
       * - 内部字段自动删除
       */
      const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
      const dataLevel = req.dataLevel || 'public'

      const plainListing = listing.toJSON ? listing.toJSON() : { ...listing }

      // 补充详情专有字段（列表接口不包含）
      plainListing.item_id = plainListing.offer_item_id
      plainListing.item_template_id = plainListing.offer_item_template_id || null
      plainListing.name =
        plainListing.offer_item_display_name ||
        plainListing.offerItem?.meta?.name ||
        plainListing.offerItem?.item_type ||
        '未知商品'
      plainListing.item_type = plainListing.offerItem?.item_type || 'unknown'
      plainListing.item_category_code = plainListing.offer_item_category_code || null
      plainListing.rarity_code = plainListing.offer_item_rarity || null
      plainListing.rarity =
        plainListing.offer_item_rarity || plainListing.offerItem?.meta?.rarity || 'common'
      plainListing.offer_amount = plainListing.offer_amount
        ? Number(plainListing.offer_amount)
        : null
      plainListing.asset_group_code = plainListing.offer_asset_group_code || null
      plainListing.asset_display_name = plainListing.offer_asset_display_name || null
      plainListing.price_asset_code = plainListing.price_asset_code || 'DIAMOND'
      plainListing.listed_at = plainListing.created_at
      plainListing.description = plainListing.offerItem?.meta?.description || ''
      plainListing.is_own = plainListing.seller_user_id === req.user.user_id

      const [sanitizedDetail] = DataSanitizer.sanitizeMarketProducts([plainListing], dataLevel)

      logger.info('获取市场挂牌详情成功', {
        market_listing_id: listingId,
        user_id: req.user.user_id
      })

      return res.apiSuccess(sanitizedDetail, '获取挂牌详情成功')
    } catch (error) {
      logger.error('获取市场挂牌详情失败', {
        error: error.message,
        market_listing_id: req.validated.market_listing_id,
        user_id: req.user?.user_id
      })

      return handleServiceError(error, res, '获取挂牌详情失败')
    }
  }
)

/**
 * @route GET /api/v4/market/settlement-currencies
 * @desc 获取允许的结算币种列表（用户端）
 * @access Private (需要登录)
 *
 * @returns {Object} 结算币种列表
 * @returns {Array} data.currencies - 币种列表 [{asset_code, display_name}]
 *
 * 业务场景：前端卖家上架商品时，需要知道可选的定价币种
 * 数据来源：system_settings.allowed_settlement_assets + material_asset_types.display_name
 */
router.get('/settlement-currencies', authenticateToken, async (req, res) => {
  try {
    const MarketListingService = req.app.locals.services.getService('market_listing_query')

    const currencies = await MarketListingService.getSettlementCurrencies()

    logger.info('获取结算币种列表成功', {
      user_id: req.user.user_id,
      count: currencies.length
    })

    return res.apiSuccess({ currencies }, '获取结算币种列表成功')
  } catch (error) {
    logger.error('获取结算币种列表失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return handleServiceError(error, res, '获取结算币种列表失败')
  }
})

/**
 * @route GET /api/v4/market/my-listings
 * @desc 获取当前用户的挂单列表（我的挂单）
 * @access Private (需要登录)
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认20）
 * @query {string} status - 状态筛选（on_sale/locked/sold/withdrawn/admin_withdrawn，可选）
 *
 * @returns {Object} 用户挂单列表和分页信息
 * @returns {Array} data.listings - 挂单列表
 * @returns {Object} data.pagination - 分页信息
 *
 * 业务场景：用户查看自己在市场上架的所有挂单（含历史订单）
 * Service层已完整实现（MarketListingQueryService.getUserListings），路由层仅做参数透传
 */
router.get('/my-listings', authenticateToken, async (req, res) => {
  try {
    const MarketListingService = req.app.locals.services.getService('market_listing_query')

    const userId = req.user.user_id
    const { page = 1, limit = 20, status } = req.query

    const result = await MarketListingService.getUserListings({
      seller_user_id: userId,
      status: status || undefined,
      page: parseInt(page, 10),
      page_size: parseInt(limit, 10)
    })

    logger.info('获取用户挂单列表成功', {
      user_id: userId,
      status,
      total: result.total,
      returned: result.listings.length
    })

    return res.apiSuccess(
      {
        listings: result.listings,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.page_size,
          total_pages: Math.ceil(result.total / result.page_size)
        },
        status_counts: result.status_counts
      },
      '获取我的挂单列表成功'
    )
  } catch (error) {
    logger.error('获取用户挂单列表失败', {
      error: error.message,
      user_id: req.user?.user_id,
      query: req.query
    })

    return handleServiceError(error, res, '获取我的挂单列表失败')
  }
})

/**
 * @route GET /api/v4/market/listing-status
 * @desc 获取用户上架状态
 * @access Private (需要登录)
 *
 * @returns {Object} 用户上架状态
 * @returns {number} data.current - 当前上架数量
 * @returns {number} data.limit - 上架上限（10）
 * @returns {number} data.remaining - 剩余可上架数量
 * @returns {number} data.percentage - 已使用百分比
 *
 * 业务场景：查询用户当前上架商品数量和剩余上架额度
 */
router.get('/listing-status', authenticateToken, async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const MarketListingService = req.app.locals.services.getService('market_listing_query')

    const userId = req.user.user_id

    // 决策7：通过 Service 层获取用户上架列表
    const result = await MarketListingService.getUserListings({
      seller_user_id: userId,
      status: 'on_sale',
      page: 1,
      page_size: 1 // 只需要获取 total 计数
    })

    const onSaleCount = result.total
    const maxListings = 10

    logger.info('查询上架状态', {
      user_id: userId,
      current: onSaleCount,
      limit: maxListings
    })

    return res.apiSuccess(
      {
        current: onSaleCount,
        limit: maxListings,
        remaining: maxListings - onSaleCount,
        percentage: Math.round((onSaleCount / maxListings) * 100)
      },
      '获取上架状态成功'
    )
  } catch (error) {
    logger.error('获取上架状态失败', {
      error: error.message,
      user_id: req.user?.user_id
    })

    return handleServiceError(error, res, '获取上架状态失败')
  }
})

module.exports = router
