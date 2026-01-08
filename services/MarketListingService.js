/**
 * 市场挂牌服务（MarketListingService）
 *
 * 职责：
 * - 挂牌域（Listing Domain）核心服务
 * - 统一管理市场挂牌的创建、撤回、状态变更
 * - 缓存失效逻辑统一收口（决策5B/0C）
 * - 提供强幂等性保证（idempotency_key）
 *
 * 业务流程：
 * 1. 创建物品挂牌（createListing）：
 *    - 校验物品所有权和状态
 *    - 锁定物品（ItemInstance.status = locked）
 *    - 创建挂牌记录（MarketListing.status = on_sale）
 *    - 失效市场列表缓存
 * 2. 创建可叠加资产挂牌（createFungibleAssetListing）：
 *    - 校验卖家余额充足
 *    - 冻结资产（AssetService.freeze）
 *    - 创建挂牌记录（MarketListing.status = on_sale, seller_offer_frozen = true）
 *    - 失效市场列表缓存
 * 3. 撤回挂牌（withdrawListing / withdrawFungibleAssetListing）：
 *    - 校验挂牌状态和所有权
 *    - 解锁物品/解冻资产
 *    - 更新挂牌状态（MarketListing.status = withdrawn）
 *    - 失效市场列表缓存
 *
 * 设计原则（决策5B/0C）：
 * - 所有挂牌状态变更必须通过本Service
 * - 路由层禁止直接操作 MarketListing Model
 * - 缓存失效在Service层统一处理，避免路由层漏调
 *
 * 创建时间：2026-01-05（决策5B/0C实施）
 * 更新时间：2026-01-08（添加可叠加资产挂牌支持）
 */

const { MarketListing, ItemInstance, MaterialAssetType, sequelize } = require('../models')
const { Op } = sequelize.Sequelize
const AssetService = require('./AssetService')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const logger = require('../utils/logger').logger

/**
 * 挂牌限制配置默认值（兜底，优先从 DB system_settings 读取）
 *
 * 配置真相源：DB system_settings (marketplace/*)
 * 仅当 DB 读取失败时使用以下默认值
 */
const DEFAULT_LISTING_CONFIG = {
  /** 单个用户最大活跃挂牌数（材料+物品共享），DB key: marketplace/max_active_listings */
  max_active_listings: 10,
  /** 挂牌有效期（天），DB key: marketplace/listing_expiry_days */
  listing_expiry_days: 3
}

/**
 * 内存缓存配置值（避免频繁查库，60秒TTL）
 * @private
 */
const _configCache = {
  max_active_listings: { value: null, expires_at: 0 },
  listing_expiry_days: { value: null, expires_at: 0 }
}
const CONFIG_CACHE_TTL_MS = 60 * 1000 // 60秒缓存TTL

/**
 * 市场挂牌服务类
 *
 * @class MarketListingService
 * @description 挂牌域核心服务，负责市场挂牌的全生命周期管理
 */
class MarketListingService {
  /**
   * 获取挂牌配置值（从 DB system_settings 读取，带缓存）
   *
   * 配置真相源：DB system_settings (category='marketplace')
   * - max_active_listings: 单个用户最大活跃挂牌数
   * - listing_expiry_days: 挂牌有效期（天）
   *
   * @param {string} key - 配置键（'max_active_listings' 或 'listing_expiry_days'）
   * @returns {Promise<number>} 配置值
   * @example
   * // 获取最大挂牌数
   * const maxListings = await MarketListingService.getListingConfig('max_active_listings')
   */
  static async getListingConfig(key) {
    const now = Date.now()

    // 检查缓存是否有效
    if (_configCache[key] && _configCache[key].expires_at > now) {
      return _configCache[key].value
    }

    // 从 DB 读取（避免循环依赖，延迟引入）
    try {
      const AdminSystemService = require('./AdminSystemService')
      const value = await AdminSystemService.getSettingValue(
        'marketplace',
        key,
        DEFAULT_LISTING_CONFIG[key]
      )

      // 更新缓存（解析整数值，使用局部对象避免 ESLint require-atomic-updates 误报）
      const parsedValue = parseInt(value, 10) || DEFAULT_LISTING_CONFIG[key]
      const cacheEntry = {
        value: parsedValue,
        expires_at: now + CONFIG_CACHE_TTL_MS
      }
      // eslint-disable-next-line require-atomic-updates -- 缓存更新无真实竞态风险
      _configCache[key] = cacheEntry

      logger.debug(`[MarketListingService] 配置已加载 ${key}=${parsedValue}（来源：DB）`)
      return parsedValue
    } catch (err) {
      // DB 读取失败时使用默认值
      logger.warn(
        `[MarketListingService] 读取配置 ${key} 失败，使用默认值 ${DEFAULT_LISTING_CONFIG[key]}`,
        {
          error: err.message
        }
      )
      return DEFAULT_LISTING_CONFIG[key]
    }
  }

  /**
   * 强制刷新配置缓存（运维/测试用）
   * @returns {void}
   */
  static clearConfigCache() {
    _configCache.max_active_listings = { value: null, expires_at: 0 }
    _configCache.listing_expiry_days = { value: null, expires_at: 0 }
    logger.info('[MarketListingService] 配置缓存已清除')
  }

  /**
   * 创建市场挂牌
   *
   * 业务流程：
   * 1. 幂等性检查（idempotency_key）
   * 2. 校验物品所有权和状态
   * 3. 锁定物品（status = locked）
   * 4. 创建挂牌记录（status = on_sale）
   * 5. 失效市场列表缓存
   *
   * @param {Object} params - 挂牌参数
   * @param {string} params.idempotency_key - 幂等键（必需）
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.price_amount - 价格金额
   * @param {string} [params.price_asset_code='DIAMOND'] - 价格资产类型
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 挂牌创建结果 {listing, is_duplicate}
   * @throws {Error} 参数验证失败、物品不存在、物品状态异常等
   */
  static async createListing(params, options = {}) {
    const {
      idempotency_key,
      seller_user_id,
      item_instance_id,
      price_amount,
      price_asset_code = 'DIAMOND'
    } = params

    // 1. 参数验证
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必需参数')
    }
    if (!seller_user_id) {
      throw new Error('seller_user_id 是必需参数')
    }
    if (!item_instance_id) {
      throw new Error('item_instance_id 是必需参数')
    }
    if (!price_amount || price_amount <= 0) {
      throw new Error('price_amount 必须大于0')
    }

    // 2. 幂等性检查
    const existingListing = await MarketListing.findOne({
      where: { idempotency_key },
      transaction: options.transaction
    })

    if (existingListing) {
      // 验证参数一致性
      const parameterMismatch = []
      if (existingListing.seller_user_id !== seller_user_id) {
        parameterMismatch.push(
          `seller_user_id: ${existingListing.seller_user_id} ≠ ${seller_user_id}`
        )
      }
      if (existingListing.offer_item_instance_id !== item_instance_id) {
        parameterMismatch.push(
          `item_instance_id: ${existingListing.offer_item_instance_id} ≠ ${item_instance_id}`
        )
      }
      if (Number(existingListing.price_amount) !== Number(price_amount)) {
        parameterMismatch.push(`price_amount: ${existingListing.price_amount} ≠ ${price_amount}`)
      }

      if (parameterMismatch.length > 0) {
        const error = new Error(`idempotency_key 冲突：${idempotency_key} 已存在但参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        error.details = {
          idempotency_key,
          existing_listing_id: existingListing.listing_id,
          mismatched_parameters: parameterMismatch
        }
        throw error
      }

      logger.info(`[MarketListingService] 幂等返回已有挂牌: ${existingListing.listing_id}`)
      return {
        listing: existingListing,
        is_duplicate: true
      }
    }

    // 3. 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'MarketListingService.createListing')

    // 4. 查询并校验物品
    const item = await ItemInstance.findOne({
      where: { item_instance_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!item) {
      const error = new Error(`物品不存在: ${item_instance_id}`)
      error.code = 'ITEM_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    if (Number(item.owner_user_id) !== Number(seller_user_id)) {
      const error = new Error('无权上架：物品不属于当前用户')
      error.code = 'NOT_OWNER'
      error.statusCode = 403
      throw error
    }

    if (item.status !== 'available') {
      const error = new Error(`物品状态不可上架: ${item.status}，期望 available`)
      error.code = 'INVALID_ITEM_STATUS'
      error.statusCode = 400
      throw error
    }

    // 5. 锁定物品
    await item.update({ status: 'locked' }, { transaction })

    // 6. 创建挂牌记录
    const listing = await MarketListing.create(
      {
        listing_kind: 'item_instance',
        seller_user_id,
        offer_item_instance_id: item_instance_id,
        price_amount,
        price_asset_code,
        seller_offer_frozen: false,
        status: 'on_sale',
        idempotency_key
      },
      { transaction }
    )

    // 7. 失效市场列表缓存（决策5B：Service层统一失效）
    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_created')
    } catch (cacheError) {
      logger.warn('[MarketListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info(`[MarketListingService] 挂牌创建成功: ${listing.listing_id}`, {
      idempotency_key,
      seller_user_id,
      item_instance_id,
      price_amount
    })

    return {
      listing,
      is_duplicate: false
    }
  }

  /**
   * 撤回市场挂牌
   *
   * 业务流程：
   * 1. 校验挂牌存在和状态
   * 2. 校验所有权
   * 3. 解锁物品（status = available）
   * 4. 更新挂牌状态（status = withdrawn）
   * 5. 失效市场列表缓存
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.listing_id - 挂牌ID
   * @param {number} params.seller_user_id - 卖家用户ID（用于校验所有权）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 撤回结果 {listing, item}
   * @throws {Error} 挂牌不存在、状态异常、无权操作等
   */
  static async withdrawListing(params, options = {}) {
    const { listing_id, seller_user_id } = params

    // 1. 参数验证
    if (!listing_id) {
      throw new Error('listing_id 是必需参数')
    }
    if (!seller_user_id) {
      throw new Error('seller_user_id 是必需参数')
    }

    // 2. 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'MarketListingService.withdrawListing')

    // 3. 查询挂牌
    const listing = await MarketListing.findOne({
      where: { listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 4. 校验所有权
    if (Number(listing.seller_user_id) !== Number(seller_user_id)) {
      const error = new Error('无权操作：不是挂牌所有者')
      error.code = 'NOT_OWNER'
      error.statusCode = 403
      throw error
    }

    // 5. 校验状态
    if (listing.status !== 'on_sale') {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}，期望 on_sale`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    // 6. 更新挂牌状态
    await listing.update({ status: 'withdrawn' }, { transaction })

    // 7. 解锁物品（如果是物品实例类型）
    let item = null
    if (listing.listing_kind === 'item_instance' && listing.offer_item_instance_id) {
      item = await ItemInstance.findOne({
        where: { item_instance_id: listing.offer_item_instance_id },
        transaction
      })

      if (item) {
        await item.update({ status: 'available' }, { transaction })
      }
    }

    // 8. 失效市场列表缓存（决策5B：Service层统一失效）
    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_withdrawn')
    } catch (cacheError) {
      logger.warn('[MarketListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info(`[MarketListingService] 挂牌撤回成功: ${listing_id}`, {
      seller_user_id,
      item_instance_id: listing.offer_item_instance_id
    })

    return {
      listing,
      item
    }
  }

  /**
   * 查询挂牌详情
   *
   * @param {number} listing_id - 挂牌ID
   * @param {Object} [options] - 查询选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object|null>} 挂牌详情或 null
   */
  static async getListingById(listing_id, options = {}) {
    const listing = await MarketListing.findOne({
      where: { listing_id },
      include: [
        {
          model: ItemInstance,
          as: 'offerItem',
          required: false
        }
      ],
      transaction: options.transaction
    })

    return listing
  }

  /**
   * 查询用户的挂牌列表
   *
   * @param {Object} params - 查询参数
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} [params.status] - 挂牌状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 挂牌列表 {listings, total, page, page_size}
   */
  static async getUserListings(params) {
    const { seller_user_id, status, page = 1, page_size = 20 } = params

    const where = { seller_user_id }
    if (status) {
      where.status = status
    }

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        {
          model: ItemInstance,
          as: 'offerItem',
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      listings: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 获取公开市场挂牌列表（带缓存）
   *
   * @description 用于交易市场首页展示，优先读取 Redis 缓存，未命中时查库并写入缓存
   * @param {Object} params - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.category] - 分类筛选（可选，兼容旧参数）
   * @param {string} [params.listing_kind] - 挂牌类型筛选（item_instance / fungible_asset，可选）
   * @param {string} [params.asset_code] - 资产代码筛选（如 red_shard，仅对 fungible_asset 有效）
   * @param {number} [params.min_price] - 最低价格筛选（可选）
   * @param {number} [params.max_price] - 最高价格筛选（可选）
   * @param {string} [params.sort='newest'] - 排序方式（newest/price_asc/price_desc）
   * @returns {Promise<Object>} 市场列表 {products, pagination}
   *
   * 缓存策略（决策4）：
   * - TTL: 20秒（交易市场变化频繁需快速反映）
   * - 缓存失效：上架/撤回/成交/取消时失效整个列表缓存
   */
  static async getMarketListings(params = {}) {
    const {
      page = 1,
      page_size = 20,
      category,
      listing_kind,
      asset_code,
      min_price,
      max_price,
      sort = 'newest'
    } = params

    // 构建缓存参数（包含新的筛选参数）
    const cacheParams = {
      page,
      page_size,
      category: category || 'all',
      listing_kind: listing_kind || 'all',
      asset_code: asset_code || 'all',
      min_price: min_price || 0,
      max_price: max_price || 0,
      sort
    }

    // ========== 尝试读取缓存 ==========
    try {
      const cached = await BusinessCacheHelper.getMarketListings(cacheParams)
      if (cached) {
        logger.debug('[市场服务] 市场列表缓存命中', cacheParams)
        return cached
      }
    } catch (cacheError) {
      // 缓存读取失败降级查库（不阻塞主流程）
      logger.warn('[市场服务] 市场列表缓存读取失败', {
        error: cacheError.message,
        params: cacheParams
      })
    }

    // ========== 缓存未命中，查询数据库 ==========
    logger.debug('[市场服务] 市场列表缓存未命中，查询数据库', cacheParams)

    // 构建查询条件 - 只查询上架中的商品
    const whereClause = { status: 'on_sale' }

    // 兼容旧的 category 参数
    if (category) {
      whereClause.category = category
    }

    // 新增：按挂牌类型筛选（item_instance / fungible_asset）
    if (listing_kind && ['item_instance', 'fungible_asset'].includes(listing_kind)) {
      whereClause.listing_kind = listing_kind
    }

    // 新增：按资产代码筛选（仅对 fungible_asset 有效）
    if (asset_code) {
      whereClause.offer_asset_code = asset_code
    }

    // 新增：按价格区间筛选
    if (min_price !== undefined && min_price > 0) {
      whereClause.price_amount = whereClause.price_amount || {}
      whereClause.price_amount[Op.gte] = Number(min_price)
    }
    if (max_price !== undefined && max_price > 0) {
      whereClause.price_amount = whereClause.price_amount || {}
      whereClause.price_amount[Op.lte] = Number(max_price)
    }

    // 排序逻辑
    let orderClause
    switch (sort) {
      case 'price_asc':
        orderClause = [['price_amount', 'ASC']]
        break
      case 'price_desc':
        orderClause = [['price_amount', 'DESC']]
        break
      case 'newest':
      default:
        orderClause = [['created_at', 'DESC']]
        break
    }

    // 分页查询
    const offset = (parseInt(page, 10) - 1) * parseInt(page_size, 10)
    const { count, rows } = await MarketListing.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ItemInstance,
          as: 'offerItem',
          attributes: ['item_instance_id', 'item_type', 'meta'],
          required: false
        }
      ],
      order: orderClause,
      limit: parseInt(page_size, 10),
      offset
    })

    // 格式化返回数据（支持 item_instance 和 fungible_asset 两种类型）
    const products = rows.map(listing => {
      const baseData = {
        listing_id: listing.listing_id,
        listing_kind: listing.listing_kind,
        price_amount: Number(listing.price_amount),
        price_asset_code: listing.price_asset_code || 'DIAMOND',
        seller_user_id: listing.seller_user_id,
        status: listing.status,
        listed_at: listing.created_at
      }

      if (listing.listing_kind === 'fungible_asset') {
        // 可叠加资产挂牌
        return {
          ...baseData,
          offer_asset_code: listing.offer_asset_code,
          offer_amount: Number(listing.offer_amount),
          item_name: `${listing.offer_amount} 个 ${listing.offer_asset_code}`,
          item_type: 'fungible_asset'
        }
      } else {
        // 物品实例挂牌（兼容原有逻辑）
        return {
          ...baseData,
          item_instance_id: listing.offer_item_instance_id,
          item_name: listing.offerItem?.meta?.name || listing.offerItem?.item_type || '未知商品',
          item_type: listing.offerItem?.item_type || 'unknown',
          rarity: listing.offerItem?.meta?.rarity || 'common'
        }
      }
    })

    const result = {
      products,
      pagination: {
        total: count,
        page: parseInt(page, 10),
        page_size: parseInt(page_size, 10),
        total_pages: Math.ceil(count / parseInt(page_size, 10))
      }
    }

    // ========== 写入缓存 ==========
    try {
      await BusinessCacheHelper.setMarketListings(cacheParams, result)
      logger.debug('[市场服务] 市场列表缓存写入成功', cacheParams)
    } catch (cacheError) {
      // 缓存写入失败不阻塞主流程
      logger.warn('[市场服务] 市场列表缓存写入失败', {
        error: cacheError.message,
        params: cacheParams
      })
    }

    return result
  }

  /**
   * 创建可叠加资产挂牌（C2C材料交易核心方法）
   *
   * 业务流程：
   * 1. 幂等性检查（idempotency_key）
   * 2. 挂牌数量限制检查（材料+物品共享 max_active_listings=10）
   * 3. 校验资产类型是否可交易
   * 4. 校验卖家可用余额充足
   * 5. 冻结卖家资产（AssetService.freeze）
   * 6. 创建挂牌记录（listing_kind='fungible_asset', seller_offer_frozen=true）
   * 7. 失效市场列表缓存
   *
   * @param {Object} params - 挂牌参数
   * @param {string} params.idempotency_key - 幂等键（必需）
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} params.offer_asset_code - 挂卖资产代码（如 red_shard）
   * @param {number} params.offer_amount - 挂卖数量（必须为正整数）
   * @param {number} params.price_amount - 定价金额（DIAMOND）
   * @param {string} [params.price_asset_code='DIAMOND'] - 价格资产类型
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 挂牌创建结果 {listing, freeze_result, is_duplicate}
   * @throws {Error} 参数验证失败、余额不足、超出挂牌限制等
   */
  static async createFungibleAssetListing(params, options = {}) {
    const {
      idempotency_key,
      seller_user_id,
      offer_asset_code,
      offer_amount,
      price_amount,
      price_asset_code = 'DIAMOND'
    } = params

    // ========== 1. 参数验证 ==========
    if (!idempotency_key) {
      throw new Error('idempotency_key 是必需参数')
    }
    if (!seller_user_id) {
      throw new Error('seller_user_id 是必需参数')
    }
    if (!offer_asset_code) {
      throw new Error('offer_asset_code 是必需参数')
    }
    if (!offer_amount || offer_amount <= 0 || !Number.isInteger(offer_amount)) {
      throw new Error('offer_amount 必须是正整数')
    }
    if (!price_amount || price_amount <= 0) {
      throw new Error('price_amount 必须大于0')
    }

    // ========== 2. 幂等性检查 ==========
    const existingListing = await MarketListing.findOne({
      where: { idempotency_key },
      transaction: options.transaction
    })

    if (existingListing) {
      // 验证参数一致性
      const parameterMismatch = []
      if (existingListing.seller_user_id !== seller_user_id) {
        parameterMismatch.push(
          `seller_user_id: ${existingListing.seller_user_id} ≠ ${seller_user_id}`
        )
      }
      if (existingListing.offer_asset_code !== offer_asset_code) {
        parameterMismatch.push(
          `offer_asset_code: ${existingListing.offer_asset_code} ≠ ${offer_asset_code}`
        )
      }
      if (Number(existingListing.offer_amount) !== Number(offer_amount)) {
        parameterMismatch.push(`offer_amount: ${existingListing.offer_amount} ≠ ${offer_amount}`)
      }
      if (Number(existingListing.price_amount) !== Number(price_amount)) {
        parameterMismatch.push(`price_amount: ${existingListing.price_amount} ≠ ${price_amount}`)
      }

      if (parameterMismatch.length > 0) {
        const error = new Error(`idempotency_key 冲突：${idempotency_key} 已存在但参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        error.details = {
          idempotency_key,
          existing_listing_id: existingListing.listing_id,
          mismatched_parameters: parameterMismatch
        }
        throw error
      }

      logger.info(
        `[MarketListingService] 幂等返回已有可叠加资产挂牌: ${existingListing.listing_id}`
      )
      return {
        listing: existingListing,
        freeze_result: null,
        is_duplicate: true
      }
    }

    // ========== 3. 强制要求事务边界 ==========
    const transaction = assertAndGetTransaction(
      options,
      'MarketListingService.createFungibleAssetListing'
    )

    // ========== 4. 挂牌数量限制检查（材料+物品共享，从 DB 读取配置） ==========
    const activeListingCount = await MarketListing.count({
      where: {
        seller_user_id,
        status: 'on_sale'
      },
      transaction
    })

    // 从 DB system_settings 读取最大挂牌数（配置真相源）
    const maxActiveListings = await MarketListingService.getListingConfig('max_active_listings')

    if (activeListingCount >= maxActiveListings) {
      const error = new Error(
        `超出挂牌数量限制：当前已有 ${activeListingCount} 个活跃挂牌，最多允许 ${maxActiveListings} 个`
      )
      error.code = 'LISTING_LIMIT_EXCEEDED'
      error.statusCode = 400
      error.details = {
        current_count: activeListingCount,
        max_count: maxActiveListings
      }
      throw error
    }

    // ========== 5. 校验资产类型是否存在、启用且可交易 ==========

    /*
     * 🔴 P0-4修复：首先检查硬编码黑名单（优先级最高）
     * POINTS 和 BUDGET_POINTS 永远禁止C2C交易，即使数据库is_tradable=true
     */
    const {
      isBlacklistedForC2C,
      createC2CBlacklistError
    } = require('../constants/TradableAssetTypes')

    if (isBlacklistedForC2C(offer_asset_code)) {
      throw createC2CBlacklistError(offer_asset_code, offer_asset_code)
    }

    // 检查数据库中的资产类型配置
    const assetType = await MaterialAssetType.findOne({
      where: {
        asset_code: offer_asset_code
      },
      transaction
    })

    if (!assetType) {
      const error = new Error(`资产类型不存在: ${offer_asset_code}`)
      error.code = 'INVALID_ASSET_TYPE'
      error.statusCode = 400
      throw error
    }

    if (!assetType.is_enabled) {
      const error = new Error(`资产类型已禁用: ${offer_asset_code}`)
      error.code = 'ASSET_TYPE_DISABLED'
      error.statusCode = 400
      throw error
    }

    // 数据库层面的 is_tradable 检查（作为第二道防线）
    if (!assetType.is_tradable) {
      const error = new Error(`该资产类型不可交易: ${offer_asset_code}`)
      error.code = 'ASSET_NOT_TRADABLE'
      error.statusCode = 400
      error.details = {
        asset_code: offer_asset_code,
        display_name: assetType.display_name,
        reason: '运营配置：该材料禁止在C2C市场交易'
      }
      throw error
    }

    // ========== 6. 校验卖家可用余额充足 ==========
    const balanceInfo = await AssetService.getBalance(
      { user_id: seller_user_id, asset_code: offer_asset_code },
      { transaction }
    )

    if (balanceInfo.available_amount < offer_amount) {
      const error = new Error(
        `可用余额不足：当前可用 ${balanceInfo.available_amount} 个 ${offer_asset_code}，需要 ${offer_amount} 个`
      )
      error.code = 'INSUFFICIENT_BALANCE'
      error.statusCode = 400
      error.details = {
        available_amount: balanceInfo.available_amount,
        required_amount: offer_amount,
        asset_code: offer_asset_code
      }
      throw error
    }

    // ========== 7. 冻结卖家资产 ==========
    const freezeIdempotencyKey = `listing_freeze_${idempotency_key}`
    const freezeResult = await AssetService.freeze(
      {
        user_id: seller_user_id,
        asset_code: offer_asset_code,
        amount: offer_amount,
        business_type: 'market_listing_freeze',
        idempotency_key: freezeIdempotencyKey,
        meta: {
          listing_idempotency_key: idempotency_key,
          price_amount,
          price_asset_code
        }
      },
      { transaction }
    )

    // ========== 8. 创建挂牌记录 ==========
    const listing = await MarketListing.create(
      {
        listing_kind: 'fungible_asset',
        seller_user_id,
        offer_asset_code,
        offer_amount,
        price_amount,
        price_asset_code,
        seller_offer_frozen: true,
        status: 'on_sale',
        idempotency_key
      },
      { transaction }
    )

    // ========== 9. 失效市场列表缓存 ==========
    try {
      await BusinessCacheHelper.invalidateMarketListings('fungible_asset_listing_created')
    } catch (cacheError) {
      logger.warn('[MarketListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    // ========== 10. 发送上架成功通知给卖家 ==========
    const NotificationService = require('./NotificationService')
    try {
      await NotificationService.notifyListingCreated(seller_user_id, {
        listing_id: listing.listing_id,
        offer_asset_code,
        offer_amount,
        price_amount
      })
    } catch (notifyError) {
      logger.warn('[MarketListingService] 发送上架通知失败（非致命）:', notifyError.message)
    }

    logger.info(`[MarketListingService] 可叠加资产挂牌创建成功: ${listing.listing_id}`, {
      idempotency_key,
      seller_user_id,
      offer_asset_code,
      offer_amount,
      price_amount,
      freeze_transaction_id: freezeResult.transaction_record?.transaction_id
    })

    return {
      listing,
      freeze_result: freezeResult,
      is_duplicate: false
    }
  }

  /**
   * 撤回可叠加资产挂牌
   *
   * 业务流程：
   * 1. 校验挂牌存在和状态
   * 2. 校验所有权
   * 3. 解冻卖家资产（AssetService.unfreeze）
   * 4. 更新挂牌状态（status = withdrawn）
   * 5. 失效市场列表缓存
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.listing_id - 挂牌ID
   * @param {number} params.seller_user_id - 卖家用户ID（用于校验所有权）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 撤回结果 {listing, unfreeze_result}
   * @throws {Error} 挂牌不存在、状态异常、无权操作等
   */
  static async withdrawFungibleAssetListing(params, options = {}) {
    const { listing_id, seller_user_id } = params

    // ========== 1. 参数验证 ==========
    if (!listing_id) {
      throw new Error('listing_id 是必需参数')
    }
    if (!seller_user_id) {
      throw new Error('seller_user_id 是必需参数')
    }

    // ========== 2. 强制要求事务边界 ==========
    const transaction = assertAndGetTransaction(
      options,
      'MarketListingService.withdrawFungibleAssetListing'
    )

    // ========== 3. 查询挂牌（悲观锁） ==========
    const listing = await MarketListing.findOne({
      where: { listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // ========== 4. 校验挂牌类型 ==========
    if (listing.listing_kind !== 'fungible_asset') {
      const error = new Error(`挂牌类型不是可叠加资产: ${listing.listing_kind}`)
      error.code = 'INVALID_LISTING_KIND'
      error.statusCode = 400
      throw error
    }

    // ========== 5. 校验所有权 ==========
    if (Number(listing.seller_user_id) !== Number(seller_user_id)) {
      const error = new Error('无权操作：不是挂牌所有者')
      error.code = 'NOT_OWNER'
      error.statusCode = 403
      throw error
    }

    // ========== 6. 校验状态 ==========
    if (listing.status !== 'on_sale') {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}，期望 on_sale`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    // ========== 7. 解冻卖家资产 ==========
    let unfreezeResult = null
    if (listing.seller_offer_frozen && listing.offer_asset_code && listing.offer_amount > 0) {
      const unfreezeIdempotencyKey = `listing_unfreeze_${listing.listing_id}_withdraw`
      unfreezeResult = await AssetService.unfreeze(
        {
          user_id: seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: Number(listing.offer_amount),
          business_type: 'market_listing_withdraw_unfreeze',
          idempotency_key: unfreezeIdempotencyKey,
          meta: {
            listing_id: listing.listing_id,
            withdraw_reason: 'seller_withdraw'
          }
        },
        { transaction }
      )
    }

    // ========== 8. 更新挂牌状态 ==========
    await listing.update(
      {
        status: 'withdrawn',
        seller_offer_frozen: false
      },
      { transaction }
    )

    // ========== 9. 失效市场列表缓存 ==========
    try {
      await BusinessCacheHelper.invalidateMarketListings('fungible_asset_listing_withdrawn')
    } catch (cacheError) {
      logger.warn('[MarketListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    // ========== 10. 发送撤回成功通知给卖家 ==========
    const NotificationService = require('./NotificationService')
    try {
      await NotificationService.notifyListingWithdrawn(seller_user_id, {
        listing_id: listing.listing_id,
        offer_asset_code: listing.offer_asset_code,
        offer_amount: Number(listing.offer_amount),
        reason: '用户主动撤回'
      })
    } catch (notifyError) {
      logger.warn('[MarketListingService] 发送撤回通知失败（非致命）:', notifyError.message)
    }

    logger.info(`[MarketListingService] 可叠加资产挂牌撤回成功: ${listing_id}`, {
      seller_user_id,
      offer_asset_code: listing.offer_asset_code,
      offer_amount: listing.offer_amount,
      unfreeze_transaction_id: unfreezeResult?.transaction_record?.transaction_id
    })

    return {
      listing,
      unfreeze_result: unfreezeResult
    }
  }

  /**
   * 获取用户活跃挂牌数量（用于前端显示剩余可挂牌数）
   *
   * @param {number} seller_user_id - 卖家用户ID
   * @param {Object} [options] - 查询选项
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} {active_count, max_count, remaining_count}
   */
  static async getUserActiveListingCount(seller_user_id, options = {}) {
    const activeCount = await MarketListing.count({
      where: {
        seller_user_id,
        status: 'on_sale'
      },
      transaction: options.transaction
    })

    // 从 DB system_settings 读取最大挂牌数
    const maxActiveListings = await MarketListingService.getListingConfig('max_active_listings')

    return {
      active_count: activeCount,
      max_count: maxActiveListings,
      remaining_count: Math.max(0, maxActiveListings - activeCount)
    }
  }

  /**
   * 客服强制撤回挂牌（需操作审计）
   *
   * 业务场景：
   * - 客服人员可强制撤回任意用户的挂牌
   * - 必须提供撤回原因用于审计追踪
   * - 撤回操作会记录到管理员操作日志
   *
   * 业务流程：
   * 1. 验证挂牌存在
   * 2. 验证挂牌状态为 on_sale
   * 3. 解冻卖家资产（如果是可叠加资产挂牌）
   * 4. 更新挂牌状态为 admin_withdrawn
   * 5. 记录操作审计日志
   * 6. 发送通知给卖家
   * 7. 失效缓存
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.listing_id - 挂牌ID
   * @param {number} params.admin_id - 客服/管理员ID
   * @param {string} params.withdraw_reason - 撤回原因（必填，审计需要）
   * @param {string} [params.ip_address] - IP地址（审计用）
   * @param {string} [params.user_agent] - 用户代理（审计用）
   * @param {Object} [options] - 事务选项
   * @param {Object} [options.transaction] - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 撤回结果 {listing, unfreeze_result, audit_log}
   * @throws {Error} 挂牌不存在、状态异常等
   */
  static async adminForceWithdrawListing(params, options = {}) {
    const { listing_id, admin_id, withdraw_reason, ip_address = null, user_agent = null } = params

    // ========== 1. 参数验证 ==========
    if (!listing_id) {
      throw new Error('listing_id 是必需参数')
    }
    if (!admin_id) {
      throw new Error('admin_id 是必需参数')
    }
    if (!withdraw_reason || withdraw_reason.trim().length === 0) {
      const error = new Error('撤回原因是必需参数（审计追踪需要）')
      error.code = 'MISSING_WITHDRAW_REASON'
      error.statusCode = 400
      throw error
    }

    // ========== 2. 强制要求事务边界 ==========
    const transaction = assertAndGetTransaction(
      options,
      'MarketListingService.adminForceWithdrawListing'
    )

    // ========== 3. 查询挂牌 ==========
    const listing = await MarketListing.findByPk(listing_id, { transaction })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // ========== 4. 校验状态 ==========
    if (listing.status !== 'on_sale' && listing.status !== 'locked') {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}，期望 on_sale 或 locked`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      error.details = { current_status: listing.status }
      throw error
    }

    // ========== 5. 解冻卖家资产（如果是可叠加资产挂牌） ==========
    let unfreezeResult = null
    if (
      listing.listing_kind === 'fungible_asset' &&
      listing.seller_offer_frozen &&
      listing.offer_asset_code &&
      listing.offer_amount > 0
    ) {
      const unfreezeIdempotencyKey = `listing_admin_withdraw_${listing_id}_${Date.now()}`
      unfreezeResult = await AssetService.unfreeze(
        {
          user_id: listing.seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: Number(listing.offer_amount),
          business_type: 'market_listing_admin_withdraw_unfreeze',
          idempotency_key: unfreezeIdempotencyKey,
          meta: {
            listing_id: listing.listing_id,
            admin_id,
            withdraw_reason
          }
        },
        { transaction }
      )
    }

    // ========== 6. 如果是物品挂牌，解锁物品 ==========
    if (listing.listing_kind === 'item_instance' && listing.item_instance_id) {
      const item = await ItemInstance.findByPk(listing.item_instance_id, { transaction })
      if (item && item.status === 'locked') {
        await item.update({ status: 'in_inventory' }, { transaction })
      }
    }

    // 记录原始状态用于审计
    const beforeData = {
      listing_id: listing.listing_id,
      status: listing.status,
      seller_user_id: listing.seller_user_id,
      listing_kind: listing.listing_kind,
      offer_asset_code: listing.offer_asset_code,
      offer_amount: listing.offer_amount,
      price_amount: listing.price_amount
    }

    // ========== 7. 更新挂牌状态 ==========
    await listing.update(
      {
        status: 'admin_withdrawn',
        seller_offer_frozen: false
      },
      { transaction }
    )

    /*
     * 【决策5/6/7/10】记录审计日志
     * - 决策5：market_listing_admin_withdraw 是关键操作，失败阻断业务
     * - 决策6：幂等键由 listing_id 派生
     * - 决策7：同一事务内
     * - 决策10：target_id 指向 MarketListing.listing_id
     */
    const AuditLogService = require('./AuditLogService')
    const auditLog = await AuditLogService.logAdminOperation(
      {
        admin_id,
        operation_type: 'market_listing_admin_withdraw',
        operation_target: 'market_listing',
        target_id: listing_id,
        operation_details: {
          listing_id,
          seller_user_id: listing.seller_user_id,
          listing_kind: listing.listing_kind,
          offer_asset_code: listing.offer_asset_code,
          offer_amount: listing.offer_amount,
          price_amount: listing.price_amount,
          reason: withdraw_reason,
          before_status: beforeData.status,
          after_status: 'admin_withdrawn',
          unfreeze_amount: listing.offer_amount
        },
        idempotency_key: `market_listing_admin_withdraw_${listing_id}`, // 决策6：业务主键派生
        ip_address,
        user_agent,
        is_critical_operation: true // 决策5：关键操作
      },
      { transaction }
    )

    // ========== 9. 发送通知给卖家 ==========
    const NotificationService = require('./NotificationService')
    try {
      await NotificationService.notifyListingWithdrawn(listing.seller_user_id, {
        listing_id,
        offer_asset_code: listing.offer_asset_code || null,
        offer_amount: listing.offer_amount || 0,
        reason: `管理员强制撤回：${withdraw_reason}`
      })
    } catch (notifyError) {
      logger.warn('[MarketListingService] 发送撤回通知失败（非致命）:', notifyError.message)
    }

    // ========== 10. 失效市场列表缓存 ==========
    try {
      await BusinessCacheHelper.invalidateMarketListings('admin_force_withdraw')
    } catch (cacheError) {
      logger.warn('[MarketListingService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info(`[MarketListingService] 客服强制撤回挂牌成功: ${listing_id}`, {
      admin_id,
      seller_user_id: listing.seller_user_id,
      listing_kind: listing.listing_kind,
      withdraw_reason,
      unfreeze_amount: listing.offer_amount
    })

    return {
      listing,
      unfreeze_result: unfreezeResult,
      audit_log: auditLog
    }
  }
}

module.exports = MarketListingService
