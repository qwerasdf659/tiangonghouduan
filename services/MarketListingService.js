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
 * 1. 创建挂牌（createListing）：
 *    - 校验物品所有权和状态
 *    - 锁定物品（ItemInstance.status = locked）
 *    - 创建挂牌记录（MarketListing.status = on_sale）
 *    - 失效市场列表缓存
 * 2. 撤回挂牌（withdrawListing）：
 *    - 校验挂牌状态和所有权
 *    - 解锁物品（ItemInstance.status = available）
 *    - 更新挂牌状态（MarketListing.status = withdrawn）
 *    - 失效市场列表缓存
 *
 * 设计原则（决策5B/0C）：
 * - 所有挂牌状态变更必须通过本Service
 * - 路由层禁止直接操作 MarketListing Model
 * - 缓存失效在Service层统一处理，避免路由层漏调
 *
 * 创建时间：2026-01-05（决策5B/0C实施）
 */

const { MarketListing, ItemInstance } = require('../models')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const logger = require('../utils/logger').logger

/**
 * 市场挂牌服务类
 *
 * @class MarketListingService
 * @description 挂牌域核心服务，负责市场挂牌的全生命周期管理
 */
class MarketListingService {
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
   * @param {string} [params.category] - 分类筛选（可选）
   * @param {string} [params.sort='newest'] - 排序方式（newest/price_asc/price_desc）
   * @returns {Promise<Object>} 市场列表 {products, pagination}
   *
   * 缓存策略（决策4）：
   * - TTL: 20秒（交易市场变化频繁需快速反映）
   * - 缓存失效：上架/撤回/成交/取消时失效整个列表缓存
   */
  static async getMarketListings(params = {}) {
    const { page = 1, page_size = 20, category, sort = 'newest' } = params

    // 构建缓存参数
    const cacheParams = { page, page_size, category: category || 'all', sort }

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
    if (category) {
      whereClause.category = category
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

    // 格式化返回数据
    const products = rows.map(listing => ({
      listing_id: listing.listing_id,
      item_instance_id: listing.offer_item_instance_id,
      item_name: listing.offerItem?.meta?.name || listing.offerItem?.item_type || '未知商品',
      item_type: listing.offerItem?.item_type || 'unknown',
      price_amount: listing.price_amount,
      price_asset_code: listing.price_asset_code || 'DIAMOND',
      seller_user_id: listing.seller_user_id,
      status: listing.status,
      listed_at: listing.created_at,
      rarity: listing.offerItem?.meta?.rarity || 'common'
    }))

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
}

module.exports = MarketListingService
