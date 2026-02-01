/**
 * 市场挂牌核心服务（CoreService）
 *
 * V4.7.0 大文件拆分方案 Phase 2（2026-01-31）
 * 从 MarketListingService.js (2295行) 拆分
 *
 * 职责：
 * - 挂牌/撤回核心操作
 * - 配置管理和校验方法
 * - 幂等性保证
 * - 缓存失效统一收口
 *
 * @module services/market-listing/CoreService
 */

const {
  MarketListing,
  ItemInstance,
  ItemTemplate,
  User,
  UserRiskProfile,
  TradeOrder,
  MaterialAssetType,
  AssetGroupDef,
  sequelize
} = require('../../models')
const { Op } = sequelize.Sequelize
/* V4.7.0 AssetService 拆分：使用子服务替代原 AssetService */
const BalanceService = require('../asset/BalanceService')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const logger = require('../../utils/logger').logger

/**
 * 挂牌限制配置默认值（兜底，优先从 DB system_settings 读取）
 */
const DEFAULT_LISTING_CONFIG = {
  max_active_listings: 10,
  listing_expiry_days: 3
}

/**
 * 多币种扩展 - 价格区间配置
 */
const DEFAULT_PRICE_RANGE_CONFIG = {
  DIAMOND: { min: 1, max: null },
  red_shard: { min: 1, max: 1000000 }
}

/**
 * 内存缓存配置值（60秒TTL）
 * @private
 */
const _configCache = {
  max_active_listings: { value: null, expires_at: 0 },
  listing_expiry_days: { value: null, expires_at: 0 }
}
const CONFIG_CACHE_TTL_MS = 60 * 1000

/**
 * 市场挂牌核心服务类
 *
 * @class MarketListingCoreService
 * @description 挂牌域核心操作服务
 */
class MarketListingCoreService {
  // ==================== 配置管理方法 ====================

  /**
   * 获取挂牌配置值（从 DB system_settings 读取，带缓存）
   *
   * @param {string} key - 配置键
   * @returns {Promise<number>} 配置值
   */
  static async getListingConfig(key) {
    const now = Date.now()

    if (_configCache[key] && _configCache[key].expires_at > now) {
      return _configCache[key].value
    }

    try {
      const AdminSystemService = require('../AdminSystemService')
      const value = await AdminSystemService.getSettingValue(
        'marketplace',
        key,
        DEFAULT_LISTING_CONFIG[key]
      )

      const parsedValue = parseInt(value, 10) || DEFAULT_LISTING_CONFIG[key]
      const cacheEntry = {
        value: parsedValue,
        expires_at: now + CONFIG_CACHE_TTL_MS
      }
      // eslint-disable-next-line require-atomic-updates
      _configCache[key] = cacheEntry

      logger.debug(`[MarketListingCoreService] 配置已加载 ${key}=${parsedValue}（来源：DB）`)
      return parsedValue
    } catch (err) {
      logger.warn(`[MarketListingCoreService] 读取配置 ${key} 失败，使用默认值`, {
        error: err.message
      })
      return DEFAULT_LISTING_CONFIG[key]
    }
  }

  /**
   * 强制刷新配置缓存
   * @returns {void}
   */
  static clearConfigCache() {
    _configCache.max_active_listings = { value: null, expires_at: 0 }
    _configCache.listing_expiry_days = { value: null, expires_at: 0 }
    logger.info('[MarketListingCoreService] 配置缓存已清除')
  }

  // ==================== 校验方法 ====================

  /**
   * 校验定价币种是否在挂牌白名单中
   *
   * @param {string} priceAssetCode - 定价币种代码
   * @returns {Promise<Object>} 校验结果
   */
  static async validateListingAssetWhitelist(priceAssetCode) {
    const AdminSystemService = require('../AdminSystemService')

    const whitelist = await AdminSystemService.getSettingValue(
      'marketplace',
      'allowed_listing_assets',
      ['DIAMOND', 'red_shard']
    )

    const whitelistArray = Array.isArray(whitelist) ? whitelist : JSON.parse(whitelist || '[]')

    if (!whitelistArray.includes(priceAssetCode)) {
      return {
        valid: false,
        whitelist: whitelistArray,
        message: `定价币种 ${priceAssetCode} 不在允许的挂牌币种白名单中`
      }
    }

    return { valid: true, whitelist: whitelistArray }
  }

  /**
   * 校验定价金额是否在币种允许的价格区间内
   *
   * @param {string} priceAssetCode - 定价币种代码
   * @param {number} priceAmount - 定价金额
   * @returns {Promise<Object>} 校验结果
   */
  static async validatePriceRange(priceAssetCode, priceAmount) {
    const AdminSystemService = require('../AdminSystemService')

    const minPrice = await AdminSystemService.getSettingValue(
      'marketplace',
      `min_price_${priceAssetCode}`,
      DEFAULT_PRICE_RANGE_CONFIG[priceAssetCode]?.min || 1
    )
    const maxPrice = await AdminSystemService.getSettingValue(
      'marketplace',
      `max_price_${priceAssetCode}`,
      DEFAULT_PRICE_RANGE_CONFIG[priceAssetCode]?.max || null
    )

    const numPrice = Number(priceAmount)

    if (numPrice < minPrice) {
      return {
        valid: false,
        min: minPrice,
        max: maxPrice,
        message: `定价金额 ${numPrice} 低于最小价格 ${minPrice}`
      }
    }

    if (maxPrice !== null && numPrice > maxPrice) {
      return {
        valid: false,
        min: minPrice,
        max: maxPrice,
        message: `定价金额 ${numPrice} 超过最大价格 ${maxPrice}`
      }
    }

    return { valid: true, min: minPrice, max: maxPrice }
  }

  /**
   * 校验同一物品是否已有其他币种的活跃挂牌
   *
   * @param {number} itemInstanceId - 物品实例ID
   * @param {string} priceAssetCode - 本次挂牌的定价币种
   * @param {Object} options - 事务选项
   * @returns {Promise<Object>} 校验结果
   */
  static async validateSameItemSingleCurrency(itemInstanceId, priceAssetCode, options = {}) {
    if (!itemInstanceId) {
      return { valid: true }
    }

    const transaction = options.transaction

    const existingListing = await MarketListing.findOne({
      where: {
        offer_item_instance_id: itemInstanceId,
        status: 'on_sale'
      },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction
    })

    if (existingListing) {
      return {
        valid: false,
        existingListing: {
          market_listing_id: existingListing.market_listing_id,
          price_asset_code: existingListing.price_asset_code,
          price_amount: existingListing.price_amount
        },
        message: `物品 ${itemInstanceId} 已存在活跃挂牌`
      }
    }

    return { valid: true }
  }

  /**
   * 校验用户风控限额（挂牌场景）
   *
   * @param {Object} params - 校验参数
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} params.price_asset_code - 定价币种
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 校验结果
   */
  static async validateRiskLimitsForListing(params, options = {}) {
    const { seller_user_id, price_asset_code } = params

    // 1. 检查用户是否被冻结
    const frozenStatus = await UserRiskProfile.checkFrozenStatus(seller_user_id)
    if (frozenStatus.is_frozen) {
      return {
        valid: false,
        code: 'USER_FROZEN',
        message: `账户已被冻结，禁止挂牌操作`,
        details: { user_id: seller_user_id, frozen_reason: frozenStatus.reason }
      }
    }

    // 2. 获取用户等级
    const user = await User.findByPk(seller_user_id, {
      attributes: ['user_id', 'user_level'],
      transaction: options.transaction
    })

    if (!user) {
      return { valid: false, code: 'USER_NOT_FOUND', message: `用户不存在: ${seller_user_id}` }
    }

    const userLevel = user.user_level || 'normal'

    // 3. 获取风控阈值
    const thresholds = await UserRiskProfile.getAssetThresholds(
      seller_user_id,
      userLevel,
      price_asset_code
    )
    const dailyMaxListings = thresholds.daily_max_listings || 20

    // 4. 统计今日挂牌次数（北京时间）
    const now = new Date()
    const beijingOffset = 8 * 60
    const utcOffset = now.getTimezoneOffset()
    const todayStartBeijing = new Date(now)
    todayStartBeijing.setMinutes(todayStartBeijing.getMinutes() + utcOffset + beijingOffset)
    todayStartBeijing.setHours(0, 0, 0, 0)
    const todayStart = new Date(
      todayStartBeijing.getTime() - (utcOffset + beijingOffset) * 60 * 1000
    )

    const todayListingsCount = await MarketListing.count({
      where: {
        seller_user_id,
        price_asset_code,
        created_at: { [Op.gte]: todayStart }
      },
      transaction: options.transaction
    })

    // 5. 校验日限
    if (todayListingsCount >= dailyMaxListings) {
      return {
        valid: false,
        code: 'DAILY_LISTING_LIMIT_EXCEEDED',
        message: `今日挂牌次数已达上限（${todayListingsCount}/${dailyMaxListings}）`,
        details: {
          user_id: seller_user_id,
          price_asset_code,
          today_count: todayListingsCount,
          daily_max: dailyMaxListings
        }
      }
    }

    return {
      valid: true,
      today_count: todayListingsCount,
      daily_max: dailyMaxListings,
      remaining: dailyMaxListings - todayListingsCount,
      user_level: userLevel
    }
  }

  // ==================== 核心操作方法 ====================

  /**
   * 创建市场挂牌（物品实例类型）
   *
   * @param {Object} params - 挂牌参数
   * @param {string} params.idempotency_key - 幂等键
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {number} params.item_instance_id - 物品实例ID
   * @param {number} params.price_amount - 价格金额
   * @param {string} [params.price_asset_code='DIAMOND'] - 价格资产类型
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 挂牌创建结果
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
    if (!idempotency_key) throw new Error('idempotency_key 是必需参数')
    if (!seller_user_id) throw new Error('seller_user_id 是必需参数')
    if (!item_instance_id) throw new Error('item_instance_id 是必需参数')
    if (!price_amount || price_amount <= 0) throw new Error('price_amount 必须大于0')

    // 2. 幂等性检查
    const existingListing = await MarketListing.findOne({
      where: { idempotency_key },
      transaction: options.transaction
    })

    if (existingListing) {
      const parameterMismatch = []
      if (Number(existingListing.seller_user_id) !== Number(seller_user_id)) {
        parameterMismatch.push(
          `seller_user_id: ${existingListing.seller_user_id} ≠ ${seller_user_id}`
        )
      }
      if (Number(existingListing.offer_item_instance_id) !== Number(item_instance_id)) {
        parameterMismatch.push(
          `item_instance_id: ${existingListing.offer_item_instance_id} ≠ ${item_instance_id}`
        )
      }

      if (parameterMismatch.length > 0) {
        const error = new Error(`idempotency_key 冲突：参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        throw error
      }

      logger.info(
        `[MarketListingCoreService] 幂等返回已有挂牌: ${existingListing.market_listing_id}`
      )
      return { listing: existingListing, is_duplicate: true }
    }

    // 3. 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'MarketListingCoreService.createListing')

    // 3.1 定价币种白名单校验
    const whitelistValidation = await this.validateListingAssetWhitelist(price_asset_code)
    if (!whitelistValidation.valid) {
      const error = new Error(whitelistValidation.message)
      error.code = 'INVALID_PRICE_ASSET_CODE'
      error.statusCode = 400
      throw error
    }

    // 3.2 价格区间校验
    const priceRangeValidation = await this.validatePriceRange(price_asset_code, price_amount)
    if (!priceRangeValidation.valid) {
      const error = new Error(priceRangeValidation.message)
      error.code = 'PRICE_OUT_OF_RANGE'
      error.statusCode = 400
      throw error
    }

    // 3.3 同物单币校验
    const sameItemValidation = await this.validateSameItemSingleCurrency(
      item_instance_id,
      price_asset_code,
      { transaction }
    )
    if (!sameItemValidation.valid) {
      const error = new Error(sameItemValidation.message)
      error.code = 'ITEM_ALREADY_LISTED'
      error.statusCode = 409
      throw error
    }

    // 3.4 风控限额校验
    const riskLimitValidation = await this.validateRiskLimitsForListing(
      { seller_user_id, price_asset_code },
      { transaction }
    )
    if (!riskLimitValidation.valid) {
      const error = new Error(riskLimitValidation.message)
      error.code = riskLimitValidation.code
      error.statusCode = riskLimitValidation.code === 'USER_FROZEN' ? 403 : 429
      throw error
    }

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
      const error = new Error(`物品状态不可上架: ${item.status}`)
      error.code = 'INVALID_ITEM_STATUS'
      error.statusCode = 400
      throw error
    }

    // 5. 锁定物品
    await item.update({ status: 'locked' }, { transaction })

    // 6. 获取物品模板信息（快照字段填充）
    let snapshotFields = {}
    if (item.item_template_id) {
      const template = await ItemTemplate.findOne({
        where: { item_template_id: item.item_template_id },
        transaction
      })
      if (template) {
        snapshotFields = {
          offer_item_template_id: template.item_template_id,
          offer_item_category_code: template.category_code,
          offer_item_rarity: template.rarity_code,
          offer_item_display_name: template.display_name
        }
      }
    }

    // 7. 创建挂牌记录
    const listing = await MarketListing.create(
      {
        listing_kind: 'item_instance',
        seller_user_id,
        offer_item_instance_id: item_instance_id,
        price_amount,
        price_asset_code,
        seller_offer_frozen: false,
        status: 'on_sale',
        idempotency_key,
        ...snapshotFields
      },
      { transaction }
    )

    // 8. 失效市场列表缓存
    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_created')
    } catch (cacheError) {
      logger.warn('[MarketListingCoreService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info(`[MarketListingCoreService] 挂牌创建成功: ${listing.market_listing_id}`)

    return { listing, is_duplicate: false }
  }

  /**
   * 撤回市场挂牌
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.market_listing_id - 挂牌ID
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 撤回结果
   */
  static async withdrawListing(params, options = {}) {
    const { market_listing_id, seller_user_id } = params

    if (!market_listing_id) throw new Error('market_listing_id 是必需参数')
    if (!seller_user_id) throw new Error('seller_user_id 是必需参数')

    const transaction = assertAndGetTransaction(options, 'MarketListingCoreService.withdrawListing')

    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${market_listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    if (Number(listing.seller_user_id) !== Number(seller_user_id)) {
      const error = new Error('无权操作：不是挂牌所有者')
      error.code = 'NOT_OWNER'
      error.statusCode = 403
      throw error
    }

    if (listing.status !== 'on_sale') {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    // 取消所有关联的买家订单并解冻资产
    const cancelledOrders = await this._cancelBuyerOrdersForListing(
      listing.market_listing_id,
      transaction
    )

    await listing.update({ status: 'withdrawn' }, { transaction })

    // 解锁物品
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

    try {
      await BusinessCacheHelper.invalidateMarketListings('listing_withdrawn')
    } catch (cacheError) {
      logger.warn('[MarketListingCoreService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info(`[MarketListingCoreService] 挂牌撤回成功: ${listing.market_listing_id}`)

    return { listing, item, cancelled_orders: cancelledOrders }
  }

  /**
   * 取消挂牌关联的所有买家订单并解冻资产
   *
   * @param {number} market_listing_id - 挂牌ID（数据库主键字段名）
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<Array>} 已取消的订单列表
   * @private
   */
  static async _cancelBuyerOrdersForListing(market_listing_id, transaction) {
    const pendingOrders = await TradeOrder.findAll({
      where: {
        market_listing_id,
        status: { [Op.in]: ['frozen', 'created'] }
      },
      transaction
    })

    if (pendingOrders.length === 0) {
      return []
    }

    logger.info(
      `[MarketListingCoreService] 挂牌 ${market_listing_id} 发现 ${pendingOrders.length} 个待取消的买家订单`
    )

    const cancelledOrders = []

    for (const order of pendingOrders) {
      try {
        if (order.status === 'frozen') {
          // eslint-disable-next-line no-restricted-syntax
          await BalanceService.unfreeze(
            {
              idempotency_key: `${order.idempotency_key}:withdraw_unfreeze`,
              business_type: 'listing_withdrawn_unfreeze',
              user_id: order.buyer_user_id,
              asset_code: order.asset_code,
              amount: order.gross_amount,
              meta: {
                order_action: 'withdraw_unfreeze',
                order_id: order.order_id,
                market_listing_id,
                unfreeze_reason: `挂牌 ${market_listing_id} 被卖家撤回`
              }
            },
            { transaction }
          )
        }

        await order.update(
          {
            status: 'cancelled',
            cancelled_at: new Date(),
            meta: {
              ...order.meta,
              cancel_reason: '挂牌被卖家撤回',
              cancelled_by: 'listing_withdrawal'
            }
          },
          { transaction }
        )

        cancelledOrders.push({
          order_id: order.order_id,
          buyer_user_id: order.buyer_user_id,
          asset_code: order.asset_code,
          amount: order.gross_amount,
          original_status: order.status
        })
      } catch (orderError) {
        logger.error(`[MarketListingCoreService] 取消订单 ${order.order_id} 失败`, {
          error: orderError.message
        })
        cancelledOrders.push({
          order_id: order.order_id,
          status: 'failed',
          error: orderError.message
        })
      }
    }

    return cancelledOrders
  }

  /**
   * 获取用户活跃挂牌数
   *
   * @param {number} seller_user_id - 卖家用户ID
   * @param {Object} [options] - 查询选项
   * @returns {Promise<number>} 活跃挂牌数
   */
  static async getUserActiveListingCount(seller_user_id, options = {}) {
    const count = await MarketListing.count({
      where: {
        seller_user_id,
        status: 'on_sale'
      },
      transaction: options.transaction
    })

    return count
  }

  // ==================== 可叠加资产挂牌操作 ====================

  /**
   * 创建可叠加资产挂牌（fungible_asset 类型）
   *
   * @param {Object} params - 挂牌参数
   * @param {string} params.idempotency_key - 幂等键
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} params.offer_asset_code - 出售资产代码
   * @param {number} params.offer_amount - 出售数量
   * @param {number} params.price_amount - 价格
   * @param {string} [params.price_asset_code='DIAMOND'] - 价格资产代码
   * @param {Object} [options] - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 挂牌创建结果 {listing, freeze_result, is_duplicate}
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

    // 参数验证
    if (!idempotency_key) throw new Error('idempotency_key 是必需参数')
    if (!seller_user_id) throw new Error('seller_user_id 是必需参数')
    if (!offer_asset_code) throw new Error('offer_asset_code 是必需参数')
    if (!offer_amount || offer_amount <= 0 || !Number.isInteger(offer_amount)) {
      throw new Error('offer_amount 必须是正整数')
    }
    if (!price_amount || price_amount <= 0) {
      throw new Error('price_amount 必须大于0')
    }

    // 幂等性检查
    const existingListing = await MarketListing.findOne({
      where: { idempotency_key },
      transaction: options.transaction
    })

    if (existingListing) {
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

      if (parameterMismatch.length > 0) {
        const error = new Error(`idempotency_key 冲突：${idempotency_key} 已存在但参数不一致`)
        error.code = 'CONFLICT'
        error.statusCode = 409
        error.details = {
          idempotency_key,
          existing_market_listing_id: existingListing.market_listing_id,
          mismatched_parameters: parameterMismatch
        }
        throw error
      }

      logger.info(
        `[MarketListingCoreService] 幂等返回已有可叠加资产挂牌: ${existingListing.market_listing_id}`
      )
      return { listing: existingListing, freeze_result: null, is_duplicate: true }
    }

    // 强制要求事务边界
    const transaction = assertAndGetTransaction(
      options,
      'MarketListingCoreService.createFungibleAssetListing'
    )

    // 挂牌数量限制检查
    const activeListingCount = await MarketListing.count({
      where: { seller_user_id, status: 'on_sale' },
      transaction
    })
    const maxActiveListings = await MarketListingCoreService.getListingConfig('max_active_listings')
    if (activeListingCount >= maxActiveListings) {
      const error = new Error(
        `超出挂牌数量限制：当前已有 ${activeListingCount} 个活跃挂牌，最多允许 ${maxActiveListings} 个`
      )
      error.code = 'LISTING_LIMIT_EXCEEDED'
      error.statusCode = 400
      error.details = { current_count: activeListingCount, max_count: maxActiveListings }
      throw error
    }

    // 定价币种白名单校验
    const whitelistValidation =
      await MarketListingCoreService.validateListingAssetWhitelist(price_asset_code)
    if (!whitelistValidation.valid) {
      const error = new Error(whitelistValidation.message)
      error.code = 'INVALID_PRICE_ASSET_CODE'
      error.statusCode = 400
      throw error
    }

    // 价格区间校验
    const priceRangeValidation = await MarketListingCoreService.validatePriceRange(
      price_asset_code,
      price_amount
    )
    if (!priceRangeValidation.valid) {
      const error = new Error(priceRangeValidation.message)
      error.code = 'PRICE_OUT_OF_RANGE'
      error.statusCode = 400
      throw error
    }

    // 风控限额校验
    const riskLimitValidation = await MarketListingCoreService.validateRiskLimitsForListing(
      { seller_user_id, price_asset_code },
      { transaction }
    )
    if (!riskLimitValidation.valid) {
      const error = new Error(riskLimitValidation.message)
      error.code = riskLimitValidation.code
      error.statusCode = riskLimitValidation.code === 'USER_FROZEN' ? 403 : 429
      throw error
    }

    // C2C黑名单检查
    const {
      isBlacklistedForC2C,
      createC2CBlacklistError
    } = require('../../constants/TradableAssetTypes')
    if (isBlacklistedForC2C(offer_asset_code)) {
      throw createC2CBlacklistError(offer_asset_code, offer_asset_code)
    }

    // 校验资产类型
    const assetType = await MaterialAssetType.findOne({
      where: { asset_code: offer_asset_code },
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
    if (!assetType.is_tradable) {
      const error = new Error(`该资产类型不可交易: ${offer_asset_code}`)
      error.code = 'ASSET_NOT_TRADABLE'
      error.statusCode = 400
      throw error
    }

    // 校验卖家可用余额
    const balanceInfo = await BalanceService.getBalance(
      { user_id: seller_user_id, asset_code: offer_asset_code },
      { transaction }
    )
    if (balanceInfo.available_amount < offer_amount) {
      const error = new Error(
        `可用余额不足：当前可用 ${balanceInfo.available_amount} 个 ${offer_asset_code}，需要 ${offer_amount} 个`
      )
      error.code = 'INSUFFICIENT_BALANCE'
      error.statusCode = 400
      throw error
    }

    // 冻结卖家资产
    const freezeIdempotencyKey = `listing_freeze_${idempotency_key}`
    // eslint-disable-next-line no-restricted-syntax -- 已确认传递 { transaction }
    const freezeResult = await BalanceService.freeze(
      {
        user_id: seller_user_id,
        asset_code: offer_asset_code,
        amount: offer_amount,
        business_type: 'market_listing_freeze',
        idempotency_key: freezeIdempotencyKey,
        meta: { listing_idempotency_key: idempotency_key, price_amount, price_asset_code }
      },
      { transaction }
    )

    // 资产快照字段
    const assetSnapshotFields = { offer_asset_display_name: assetType.display_name }
    if (assetType.group_code) {
      const assetGroup = await AssetGroupDef.findOne({
        where: { group_code: assetType.group_code },
        transaction
      })
      if (assetGroup) {
        assetSnapshotFields.offer_asset_group_code = assetGroup.group_code
      }
    }

    // 创建挂牌记录
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
        idempotency_key,
        ...assetSnapshotFields
      },
      { transaction }
    )

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateMarketListings('fungible_asset_listing_created')
    } catch (cacheError) {
      logger.warn('[MarketListingCoreService] 缓存失效失败（非致命）:', cacheError.message)
    }

    // 发送通知
    try {
      const NotificationService = require('../NotificationService')
      await NotificationService.notifyListingCreated(seller_user_id, {
        market_listing_id: listing.market_listing_id,
        offer_asset_code,
        offer_amount,
        price_amount
      })
    } catch (notifyError) {
      logger.warn('[MarketListingCoreService] 发送上架通知失败（非致命）:', notifyError.message)
    }

    logger.info(`[MarketListingCoreService] 可叠加资产挂牌创建成功: ${listing.market_listing_id}`, {
      idempotency_key,
      seller_user_id,
      offer_asset_code,
      offer_amount,
      price_amount
    })

    return { listing, freeze_result: freezeResult, is_duplicate: false }
  }

  /**
   * 撤回可叠加资产挂牌
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.market_listing_id - 挂牌ID
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {Object} [options] - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 撤回结果 {listing, unfreeze_result, cancelled_orders}
   */
  static async withdrawFungibleAssetListing(params, options = {}) {
    const { market_listing_id, seller_user_id } = params

    if (!market_listing_id) throw new Error('market_listing_id 是必需参数')
    if (!seller_user_id) throw new Error('seller_user_id 是必需参数')

    const transaction = assertAndGetTransaction(
      options,
      'MarketListingCoreService.withdrawFungibleAssetListing'
    )

    // 查询挂牌（悲观锁）
    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${market_listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    if (listing.listing_kind !== 'fungible_asset') {
      const error = new Error(`挂牌类型不是可叠加资产: ${listing.listing_kind}`)
      error.code = 'INVALID_LISTING_KIND'
      error.statusCode = 400
      throw error
    }

    if (Number(listing.seller_user_id) !== Number(seller_user_id)) {
      const error = new Error('无权操作：不是挂牌所有者')
      error.code = 'NOT_OWNER'
      error.statusCode = 403
      throw error
    }

    const withdrawableStatuses = ['on_sale', 'locked']
    if (!withdrawableStatuses.includes(listing.status)) {
      const error = new Error(
        `挂牌状态不可撤回: ${listing.status}，期望 ${withdrawableStatuses.join(' 或 ')}`
      )
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    // 取消所有关联的买家订单
    const cancelledOrders = await this._cancelBuyerOrdersForListing(
      listing.market_listing_id,
      transaction
    )

    // 解冻卖家资产
    let unfreezeResult = null
    if (listing.seller_offer_frozen && listing.offer_asset_code && listing.offer_amount > 0) {
      const unfreezeIdempotencyKey = `listing_unfreeze_${listing.market_listing_id}_withdraw`
      // eslint-disable-next-line no-restricted-syntax -- 已确认传递 { transaction }
      unfreezeResult = await BalanceService.unfreeze(
        {
          user_id: seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: Number(listing.offer_amount),
          business_type: 'market_listing_withdraw_unfreeze',
          idempotency_key: unfreezeIdempotencyKey,
          meta: { market_listing_id: listing.market_listing_id, withdraw_reason: 'seller_withdraw' }
        },
        { transaction }
      )
    }

    // 更新挂牌状态
    await listing.update({ status: 'withdrawn', seller_offer_frozen: false }, { transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateMarketListings('fungible_asset_listing_withdrawn')
    } catch (cacheError) {
      logger.warn('[MarketListingCoreService] 缓存失效失败（非致命）:', cacheError.message)
    }

    // 发送通知
    try {
      const NotificationService = require('../NotificationService')
      await NotificationService.notifyListingWithdrawn(seller_user_id, {
        market_listing_id: listing.market_listing_id,
        offer_asset_code: listing.offer_asset_code,
        offer_amount: Number(listing.offer_amount),
        reason: '用户主动撤回'
      })
    } catch (notifyError) {
      logger.warn('[MarketListingCoreService] 发送撤回通知失败（非致命）:', notifyError.message)
    }

    logger.info(`[MarketListingCoreService] 可叠加资产挂牌撤回成功: ${listing.market_listing_id}`, {
      seller_user_id,
      cancelled_orders_count: cancelledOrders.length
    })

    return { listing, unfreeze_result: unfreezeResult, cancelled_orders: cancelledOrders }
  }

  // ==================== 管理后台操作 ====================

  /**
   * 管理员强制撤回挂牌
   *
   * @param {Object} params - 撤回参数
   * @param {number} params.market_listing_id - 挂牌ID
   * @param {number} params.operator_id - 操作员ID
   * @param {string} params.reason - 撤回原因
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 撤回结果
   */
  static async adminForceWithdrawListing(params, options = {}) {
    const { market_listing_id, operator_id, reason } = params

    if (!market_listing_id) throw new Error('market_listing_id 是必需参数')
    if (!operator_id) throw new Error('operator_id 是必需参数')
    if (!reason) throw new Error('reason 是必需参数')

    const transaction = assertAndGetTransaction(
      options,
      'MarketListingCoreService.adminForceWithdrawListing'
    )

    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!listing) {
      const error = new Error(`挂牌不存在: ${market_listing_id}`)
      error.code = 'LISTING_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 管理员强制撤回支持 on_sale 和 locked 状态
    const allowedStatuses = ['on_sale', 'locked']
    if (!allowedStatuses.includes(listing.status)) {
      const error = new Error(`挂牌状态不可撤回: ${listing.status}（仅支持 on_sale、locked 状态）`)
      error.code = 'INVALID_LISTING_STATUS'
      error.statusCode = 400
      throw error
    }

    const originalStatus = listing.status

    // 如果是 locked 状态，取消关联的买家订单
    let cancelledOrders = []
    if (listing.status === 'locked' && listing.locked_by_order_id) {
      cancelledOrders = await this._cancelBuyerOrdersForListing(
        listing.market_listing_id,
        transaction
      )
    }

    // 更新挂牌状态为 admin_withdrawn（管理员强制撤回使用专用状态）
    await listing.update(
      {
        status: 'admin_withdrawn',
        locked_by_order_id: null,
        locked_at: null,
        meta: {
          ...listing.meta,
          force_withdrawn_by: operator_id,
          force_withdrawn_reason: reason,
          force_withdrawn_at: new Date().toISOString(),
          original_status: originalStatus
        }
      },
      { transaction }
    )

    // 解锁物品/解冻资产
    let item = null
    if (listing.listing_kind === 'item_instance' && listing.offer_item_instance_id) {
      item = await ItemInstance.findOne({
        where: { item_instance_id: listing.offer_item_instance_id },
        transaction
      })
      if (item) {
        await item.update({ status: 'available' }, { transaction })
      }
    } else if (listing.listing_kind === 'fungible_asset' && listing.seller_offer_frozen) {
      // eslint-disable-next-line no-restricted-syntax
      await BalanceService.unfreeze(
        {
          idempotency_key: `admin_force_withdraw_${listing.market_listing_id}`,
          business_type: 'admin_force_withdraw_unfreeze',
          user_id: listing.seller_user_id,
          asset_code: listing.offer_asset_code,
          amount: listing.offer_amount,
          meta: {
            market_listing_id: listing.market_listing_id,
            reason,
            operator_id
          }
        },
        { transaction }
      )
    }

    // 记录审计日志（使用正确的操作类型）
    const AuditLogService = require('../AuditLogService')
    const { OPERATION_TYPES } = require('../../constants/AuditOperationTypes')
    await AuditLogService.logOperation({
      operator_id,
      operation_type: OPERATION_TYPES.MARKET_LISTING_ADMIN_WITHDRAW,
      target_type: 'MarketListing',
      target_id: listing.market_listing_id,
      action: 'admin_force_withdraw',
      before_data: { status: originalStatus },
      after_data: { status: 'admin_withdrawn' },
      reason,
      is_critical_operation: true,
      idempotency_key: `admin_force_withdraw_${listing.market_listing_id}_${Date.now()}`
    })

    try {
      await BusinessCacheHelper.invalidateMarketListings('admin_force_withdrawn')
    } catch (cacheError) {
      logger.warn('[MarketListingCoreService] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.warn(`[MarketListingCoreService] 管理员强制撤回挂牌: ${listing.market_listing_id}`, {
      operator_id,
      reason,
      original_status: originalStatus,
      new_status: 'admin_withdrawn',
      cancelled_orders_count: cancelledOrders.length
    })

    return { listing, item, cancelled_orders: cancelledOrders }
  }
}

module.exports = MarketListingCoreService
