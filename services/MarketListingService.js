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

const {
  MarketListing,
  ItemInstance,
  MaterialAssetType,
  ItemTemplate,
  AssetGroupDef,
  User,
  UserRiskProfile,
  sequelize
} = require('../models')
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
 * 多币种扩展 - 价格区间配置（2026-01-14 新增）
 *
 * 配置真相源：DB system_settings (marketplace/*)
 * 用于校验不同币种的价格范围
 */
const DEFAULT_PRICE_RANGE_CONFIG = {
  /** DIAMOND 价格区间（无限制） */
  DIAMOND: { min: 1, max: null },
  /** red_shard 价格区间 */
  red_shard: { min: 1, max: 1000000 }
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

  // ================ 多币种扩展校验方法（2026-01-14 新增） ================

  /**
   * 校验定价币种是否在挂牌白名单中
   *
   * 业务决策（2026-01-14）：
   * - 双白名单机制：allowed_listing_assets（挂牌）与 allowed_settlement_assets（结算）分离
   * - 挂牌白名单控制新挂牌时可选的定价币种
   * - 用于"灰度下线"场景：禁止新挂牌，但存量可继续成交
   *
   * @param {string} priceAssetCode - 定价币种代码
   * @returns {Promise<Object>} 校验结果 {valid: boolean, whitelist: string[], message?: string}
   */
  static async validateListingAssetWhitelist(priceAssetCode) {
    const AdminSystemService = require('./AdminSystemService')

    // 从 DB 获取挂牌白名单（配置真相源）
    const whitelist = await AdminSystemService.getSettingValue(
      'marketplace',
      'allowed_listing_assets',
      ['DIAMOND', 'red_shard'] // 默认值
    )

    // 确保 whitelist 是数组
    const whitelistArray = Array.isArray(whitelist) ? whitelist : JSON.parse(whitelist || '[]')

    if (!whitelistArray.includes(priceAssetCode)) {
      return {
        valid: false,
        whitelist: whitelistArray,
        message: `定价币种 ${priceAssetCode} 不在允许的挂牌币种白名单中（当前白名单：${whitelistArray.join(', ')}）`
      }
    }

    return {
      valid: true,
      whitelist: whitelistArray
    }
  }

  /**
   * 校验定价金额是否在币种允许的价格区间内
   *
   * 业务决策（2026-01-14）：
   * - DIAMOND：无价格上限限制
   * - red_shard：价格区间 [1, 1000000]，防止恶意定价
   *
   * @param {string} priceAssetCode - 定价币种代码
   * @param {number} priceAmount - 定价金额
   * @returns {Promise<Object>} 校验结果 {valid: boolean, min?: number, max?: number, message?: string}
   */
  static async validatePriceRange(priceAssetCode, priceAmount) {
    const AdminSystemService = require('./AdminSystemService')

    // 从 DB 获取价格区间配置
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

    // 校验最小价格
    if (numPrice < minPrice) {
      return {
        valid: false,
        min: minPrice,
        max: maxPrice,
        message: `定价金额 ${numPrice} 低于最小价格 ${minPrice}（币种：${priceAssetCode}）`
      }
    }

    // 校验最大价格（如果有限制）
    if (maxPrice !== null && numPrice > maxPrice) {
      return {
        valid: false,
        min: minPrice,
        max: maxPrice,
        message: `定价金额 ${numPrice} 超过最大价格 ${maxPrice}（币种：${priceAssetCode}）`
      }
    }

    return {
      valid: true,
      min: minPrice,
      max: maxPrice
    }
  }

  /**
   * 校验同一物品是否已有其他币种的活跃挂牌（同物单币校验）
   *
   * 业务决策（2026-01-14）：
   * - 同一物品实例在同一时间只能用一种币种挂牌
   * - 防止定价混乱和套利行为
   * - 使用行锁（FOR UPDATE）防止并发插入
   *
   * @param {number} itemInstanceId - 物品实例ID（仅对 item_instance 类型有效）
   * @param {string} priceAssetCode - 本次挂牌的定价币种
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 校验结果对象
   */
  static async validateSameItemSingleCurrency(itemInstanceId, priceAssetCode, options = {}) {
    if (!itemInstanceId) {
      // fungible_asset 类型不需要此校验
      return { valid: true }
    }

    const transaction = options.transaction

    // 使用行锁查询是否存在其他币种的活跃挂牌
    const existingListing = await MarketListing.findOne({
      where: {
        offer_item_instance_id: itemInstanceId,
        status: 'on_sale'
      },
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
      transaction
    })

    if (existingListing) {
      // 检查是否为不同币种
      if (existingListing.price_asset_code !== priceAssetCode) {
        return {
          valid: false,
          existingListing: {
            listing_id: existingListing.listing_id,
            price_asset_code: existingListing.price_asset_code,
            price_amount: existingListing.price_amount
          },
          message: `物品 ${itemInstanceId} 已存在其他币种的挂牌（listing_id: ${existingListing.listing_id}，币种: ${existingListing.price_asset_code}）`
        }
      }
      // 如果是相同币种，说明物品已被挂牌（但不是"同物多币种"问题）
      return {
        valid: false,
        existingListing: {
          listing_id: existingListing.listing_id,
          price_asset_code: existingListing.price_asset_code,
          price_amount: existingListing.price_amount
        },
        message: `物品 ${itemInstanceId} 已存在活跃挂牌（listing_id: ${existingListing.listing_id}）`
      }
    }

    return { valid: true }
  }

  // ================ 风控限额校验方法（2026-01-14 新增） ================

  /**
   * 校验用户风控限额（挂牌场景）
   *
   * 业务决策（2026-01-14）：
   * - 日限统计维度：卖家+币种
   * - 优先使用 user_risk_profiles 中的配置，fallback 到 system_settings
   * - fail-closed 策略在中间件实现（此方法仅做数据库层校验）
   *
   * @param {Object} params - 校验参数
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} params.price_asset_code - 定价币种（用于日限统计）
   * @param {Object} [options] - 事务选项
   * @returns {Promise<Object>} 校验结果对象
   */
  static async validateRiskLimitsForListing(params, options = {}) {
    const { seller_user_id, price_asset_code } = params

    // 1. 检查用户是否被冻结
    const frozenStatus = await UserRiskProfile.checkFrozenStatus(seller_user_id)
    if (frozenStatus.is_frozen) {
      return {
        valid: false,
        code: 'USER_FROZEN',
        message: `账户已被冻结，禁止挂牌操作（原因：${frozenStatus.reason || '未知'}）`,
        details: {
          user_id: seller_user_id,
          frozen_reason: frozenStatus.reason
        }
      }
    }

    // 2. 获取用户等级
    const user = await User.findByPk(seller_user_id, {
      attributes: ['user_id', 'user_level'],
      transaction: options.transaction
    })

    if (!user) {
      return {
        valid: false,
        code: 'USER_NOT_FOUND',
        message: `用户不存在: ${seller_user_id}`
      }
    }

    const userLevel = user.user_level || 'normal'

    // 3. 获取用户风控阈值（优先从 user_risk_profiles，fallback 到 system_settings）
    const thresholds = await UserRiskProfile.getAssetThresholds(
      seller_user_id,
      userLevel,
      price_asset_code
    )
    const dailyMaxListings = thresholds.daily_max_listings || 20

    /*
     * 4. 统计今日该用户+该币种的挂牌次数（北京时间）
     * 🔴 数据库使用 UTC 存储，业务逻辑使用北京时间（GMT+8）
     * 北京时间今天 00:00:00 = UTC 昨天 16:00:00
     */
    const now = new Date()
    const beijingOffset = 8 * 60 // 北京时间偏移量（分钟）
    const utcOffset = now.getTimezoneOffset() // 当前时区偏移量（分钟）
    const todayStartBeijing = new Date(now)
    // 先转换为北京时间，设置为0点，再转回 UTC
    todayStartBeijing.setMinutes(todayStartBeijing.getMinutes() + utcOffset + beijingOffset)
    todayStartBeijing.setHours(0, 0, 0, 0)
    // 转回 UTC 进行数据库查询
    const todayStart = new Date(
      todayStartBeijing.getTime() - (utcOffset + beijingOffset) * 60 * 1000
    )

    const todayListingsCount = await MarketListing.count({
      where: {
        seller_user_id,
        price_asset_code,
        created_at: {
          [Op.gte]: todayStart
        }
      },
      transaction: options.transaction
    })

    // 5. 校验日限
    if (todayListingsCount >= dailyMaxListings) {
      logger.warn('[MarketListingService] 用户达到日挂牌上限', {
        user_id: seller_user_id,
        price_asset_code,
        today_count: todayListingsCount,
        daily_max: dailyMaxListings,
        user_level: userLevel
      })

      return {
        valid: false,
        code: 'DAILY_LISTING_LIMIT_EXCEEDED',
        message: `今日挂牌次数已达上限（${todayListingsCount}/${dailyMaxListings}），请明天再试`,
        details: {
          user_id: seller_user_id,
          price_asset_code,
          today_count: todayListingsCount,
          daily_max: dailyMaxListings,
          user_level: userLevel,
          threshold_source: thresholds.source
        }
      }
    }

    logger.debug('[MarketListingService] 风控校验通过', {
      user_id: seller_user_id,
      price_asset_code,
      today_count: todayListingsCount,
      daily_max: dailyMaxListings,
      remaining: dailyMaxListings - todayListingsCount
    })

    return {
      valid: true,
      today_count: todayListingsCount,
      daily_max: dailyMaxListings,
      remaining: dailyMaxListings - todayListingsCount,
      user_level: userLevel,
      threshold_source: thresholds.source
    }
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

    // 3.1 多币种扩展：定价币种白名单校验（2026-01-14 新增）
    const whitelistValidation =
      await MarketListingService.validateListingAssetWhitelist(price_asset_code)
    if (!whitelistValidation.valid) {
      const error = new Error(whitelistValidation.message)
      error.code = 'INVALID_PRICE_ASSET_CODE'
      error.statusCode = 400
      error.details = {
        price_asset_code,
        allowed_listing_assets: whitelistValidation.whitelist
      }
      throw error
    }

    // 3.2 多币种扩展：价格区间校验（2026-01-14 新增）
    const priceRangeValidation = await MarketListingService.validatePriceRange(
      price_asset_code,
      price_amount
    )
    if (!priceRangeValidation.valid) {
      const error = new Error(priceRangeValidation.message)
      error.code = 'PRICE_OUT_OF_RANGE'
      error.statusCode = 400
      error.details = {
        price_asset_code,
        price_amount,
        min_price: priceRangeValidation.min,
        max_price: priceRangeValidation.max
      }
      throw error
    }

    // 3.3 多币种扩展：同物单币校验（2026-01-14 新增）
    const sameItemValidation = await MarketListingService.validateSameItemSingleCurrency(
      item_instance_id,
      price_asset_code,
      { transaction }
    )
    if (!sameItemValidation.valid) {
      const error = new Error(sameItemValidation.message)
      error.code = 'ITEM_ALREADY_LISTED'
      error.statusCode = 409
      error.details = {
        item_instance_id,
        existing_listing: sameItemValidation.existingListing
      }
      throw error
    }

    // 3.4 多币种扩展：风控限额校验（2026-01-14 新增）
    const riskLimitValidation = await MarketListingService.validateRiskLimitsForListing(
      { seller_user_id, price_asset_code },
      { transaction }
    )
    if (!riskLimitValidation.valid) {
      const error = new Error(riskLimitValidation.message)
      error.code = riskLimitValidation.code
      error.statusCode = riskLimitValidation.code === 'USER_FROZEN' ? 403 : 429
      error.details = riskLimitValidation.details
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
      const error = new Error(`物品状态不可上架: ${item.status}，期望 available`)
      error.code = 'INVALID_ITEM_STATUS'
      error.statusCode = 400
      throw error
    }

    // 5. 锁定物品
    await item.update({ status: 'locked' }, { transaction })

    // 6. 获取物品模板信息（用于快照字段填充）
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
        logger.debug('[MarketListingService] 快照字段已填充', {
          item_instance_id,
          template_id: template.item_template_id,
          category: template.category_code,
          rarity: template.rarity_code
        })
      }
    } else if (item.meta?.name) {
      // 无模板时从 meta 获取显示名称
      snapshotFields = {
        offer_item_display_name: item.meta.name
      }
    }

    // 7. 创建挂牌记录（包含快照字段）
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
   * @param {string} [params.listing_kind] - 挂牌类型筛选（item_instance / fungible_asset，可选）
   * @param {string} [params.asset_code] - 资产代码筛选（如 red_shard，仅对 fungible_asset 有效）
   * @param {string} [params.item_category_code] - 物品类目代码筛选（仅对 item_instance 有效）
   * @param {string} [params.asset_group_code] - 资产分组代码筛选（仅对 fungible_asset 有效）
   * @param {string} [params.rarity_code] - 稀有度代码筛选（仅对 item_instance 有效）
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
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price,
      max_price,
      sort = 'newest'
    } = params

    // 构建缓存参数（包含新筛选维度）
    const cacheParams = {
      page,
      page_size,
      listing_kind: listing_kind || 'all',
      asset_code: asset_code || 'all',
      item_category_code: item_category_code || 'all',
      asset_group_code: asset_group_code || 'all',
      rarity_code: rarity_code || 'all',
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

    // 按挂牌类型筛选（item_instance / fungible_asset）
    if (listing_kind && ['item_instance', 'fungible_asset'].includes(listing_kind)) {
      whereClause.listing_kind = listing_kind
    }

    // 按资产代码筛选（仅对 fungible_asset 有效）
    if (asset_code) {
      whereClause.offer_asset_code = asset_code
    }

    // 按物品类目代码筛选（仅对 item_instance 有效，使用快照字段）
    if (item_category_code) {
      whereClause.offer_item_category_code = item_category_code
    }

    // 按资产分组代码筛选（仅对 fungible_asset 有效，使用快照字段）
    if (asset_group_code) {
      whereClause.offer_asset_group_code = asset_group_code
    }

    // 按稀有度代码筛选（仅对 item_instance 有效，使用快照字段）
    if (rarity_code) {
      whereClause.offer_item_rarity = rarity_code
    }

    // 按价格区间筛选
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
        // 可叠加资产挂牌（使用快照字段）
        return {
          ...baseData,
          offer_asset_code: listing.offer_asset_code,
          offer_amount: Number(listing.offer_amount),
          // 优先使用快照字段，fallback 到原有逻辑
          item_name:
            listing.offer_asset_display_name ||
            `${listing.offer_amount} 个 ${listing.offer_asset_code}`,
          item_type: 'fungible_asset',
          // 新增：分组信息（快照字段）
          asset_group_code: listing.offer_asset_group_code || null
        }
      } else {
        // 物品实例挂牌（优先使用快照字段）
        return {
          ...baseData,
          item_instance_id: listing.offer_item_instance_id,
          // 优先使用快照字段，fallback 到 offerItem 关联
          item_name:
            listing.offer_item_display_name ||
            listing.offerItem?.meta?.name ||
            listing.offerItem?.item_type ||
            '未知商品',
          item_type: listing.offerItem?.item_type || 'unknown',
          // 新增：分类信息（快照字段）
          item_template_id: listing.offer_item_template_id || null,
          item_category_code: listing.offer_item_category_code || null,
          rarity_code: listing.offer_item_rarity || null,
          // 兼容原有 rarity 字段（优先使用快照，fallback 到 meta）
          rarity: listing.offer_item_rarity || listing.offerItem?.meta?.rarity || 'common'
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

    // ========== 4.1 多币种扩展：定价币种白名单校验（2026-01-14 新增） ==========
    const whitelistValidation =
      await MarketListingService.validateListingAssetWhitelist(price_asset_code)
    if (!whitelistValidation.valid) {
      const error = new Error(whitelistValidation.message)
      error.code = 'INVALID_PRICE_ASSET_CODE'
      error.statusCode = 400
      error.details = {
        price_asset_code,
        allowed_listing_assets: whitelistValidation.whitelist
      }
      throw error
    }

    // ========== 4.2 多币种扩展：价格区间校验（2026-01-14 新增） ==========
    const priceRangeValidation = await MarketListingService.validatePriceRange(
      price_asset_code,
      price_amount
    )
    if (!priceRangeValidation.valid) {
      const error = new Error(priceRangeValidation.message)
      error.code = 'PRICE_OUT_OF_RANGE'
      error.statusCode = 400
      error.details = {
        price_asset_code,
        price_amount,
        min_price: priceRangeValidation.min,
        max_price: priceRangeValidation.max
      }
      throw error
    }

    // ========== 4.3 多币种扩展：风控限额校验（2026-01-14 新增） ==========
    const riskLimitValidation = await MarketListingService.validateRiskLimitsForListing(
      { seller_user_id, price_asset_code },
      { transaction }
    )
    if (!riskLimitValidation.valid) {
      const error = new Error(riskLimitValidation.message)
      error.code = riskLimitValidation.code
      error.statusCode = riskLimitValidation.code === 'USER_FROZEN' ? 403 : 429
      error.details = riskLimitValidation.details
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
    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
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

    // ========== 8. 获取资产分组信息（用于快照字段填充） ==========
    const assetSnapshotFields = {
      offer_asset_display_name: assetType.display_name
    }

    if (assetType.group_code) {
      const assetGroup = await AssetGroupDef.findOne({
        where: { group_code: assetType.group_code },
        transaction
      })
      if (assetGroup) {
        assetSnapshotFields.offer_asset_group_code = assetGroup.group_code
        logger.debug('[MarketListingService] 资产分组快照已填充', {
          asset_code: offer_asset_code,
          group_code: assetGroup.group_code,
          display_name: assetType.display_name
        })
      }
    }

    // ========== 9. 创建挂牌记录（包含快照字段） ==========
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
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
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
      // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
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

  /*
   * ============================================================================
   * 筛选维度查询相关方法（2026-01-15 新增）
   * ============================================================================
   */

  /**
   * 获取市场筛选维度配置（facets）
   *
   * 业务场景：
   * - 用户端市场页面需要展示可用的筛选选项（类目、稀有度、资产分组）
   * - 前端根据返回数据动态渲染筛选器
   *
   * 返回数据：
   * - categories[]：物品类目列表（仅已启用）
   * - rarities[]：稀有度列表（仅已启用，按 tier 升序）
   * - asset_groups[]：资产分组列表（仅已启用且可交易）
   * - listing_kinds[]：挂牌类型列表
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.include_disabled - 是否包含已禁用项（默认 false，仅管理端使用）
   * @returns {Promise<Object>} 筛选维度配置
   *
   * @example
   * const facets = await MarketListingService.getFilterFacets()
   * // 返回：{ categories: [...], rarities: [...], asset_groups: [...], listing_kinds: [...] }
   */
  static async getFilterFacets(options = {}) {
    const { include_disabled = false } = options

    // 延迟加载字典模型（避免循环依赖）
    const { CategoryDef, RarityDef, AssetGroupDef } = require('../models')

    // ========== 1. 查询物品类目列表 ==========
    const categoryWhere = include_disabled ? {} : { is_enabled: true }
    const categories = await CategoryDef.findAll({
      where: categoryWhere,
      attributes: ['category_code', 'display_name', 'description', 'icon_url', 'sort_order'],
      order: [
        ['sort_order', 'ASC'],
        ['category_code', 'ASC']
      ],
      raw: true
    })

    // ========== 2. 查询稀有度列表 ==========
    const rarityWhere = include_disabled ? {} : { is_enabled: true }
    const rarities = await RarityDef.findAll({
      where: rarityWhere,
      attributes: ['rarity_code', 'display_name', 'description', 'color_hex', 'tier', 'sort_order'],
      order: [
        ['tier', 'ASC'],
        ['sort_order', 'ASC']
      ],
      raw: true
    })

    // ========== 3. 查询资产分组列表（仅可交易） ==========
    const assetGroupWhere = include_disabled ? {} : { is_enabled: true, is_tradable: true }
    const assetGroups = await AssetGroupDef.findAll({
      where: assetGroupWhere,
      attributes: [
        'group_code',
        'display_name',
        'description',
        'group_type',
        'color_hex',
        'sort_order'
      ],
      order: [
        ['sort_order', 'ASC'],
        ['group_code', 'ASC']
      ],
      raw: true
    })

    // ========== 4. 返回挂牌类型列表（静态定义） ==========
    const listingKinds = [
      {
        listing_kind: 'item_instance',
        display_name: '物品',
        description: '不可叠加物品（NFT类），如奖品实例'
      },
      {
        listing_kind: 'fungible_asset',
        display_name: '材料',
        description: '可叠加资产，如材料碎片'
      }
    ]

    logger.debug('[MarketListingService] 获取筛选维度配置成功', {
      categories_count: categories.length,
      rarities_count: rarities.length,
      asset_groups_count: assetGroups.length,
      include_disabled
    })

    return {
      categories,
      rarities,
      asset_groups: assetGroups,
      listing_kinds: listingKinds
    }
  }

  /*
   * ============================================================================
   * 止损能力相关方法（2026-01-15 P1 - 孤儿冻结止损）
   * ============================================================================
   */

  /**
   * 暂停指定资产的新挂单（止损措施）
   *
   * 业务场景：
   * - 孤儿冻结检测任务发现 P0 级别异常时触发
   * - 暂时禁止该资产的新挂牌，防止异常扩大化
   * - 不影响已有挂牌，不改动余额
   *
   * 实现方式：
   * - 在 system_settings 中设置 marketplace/paused_assets 标记
   * - createListing 时检查该标记，若暂停则拒绝创建
   * - 记录审计日志便于追溯
   *
   * @param {string} asset_code - 资产代码（如 'POINTS', 'red_shard'）
   * @param {Object} options - 配置选项
   * @param {string} options.reason - 暂停原因（必填）
   * @param {number} [options.duration_hours=24] - 暂停时长（小时，默认24）
   * @param {number} [options.operator_id] - 操作者ID（可选，系统任务时为空）
   * @returns {Promise<Object>} 暂停结果
   *
   * @example
   * await MarketListingService.pauseListingForAsset('red_shard', {
   *   reason: '孤儿冻结异常止损',
   *   duration_hours: 24
   * })
   */
  static async pauseListingForAsset(asset_code, options = {}) {
    const { reason, duration_hours = 24, operator_id } = options

    if (!asset_code) {
      throw new Error('资产代码（asset_code）不能为空')
    }

    if (!reason) {
      throw new Error('暂停原因（reason）不能为空')
    }

    const { SystemSetting } = require('../models')

    // 1. 获取当前已暂停的资产列表
    const settingKey = 'marketplace/paused_assets'
    let pausedAssets = {}

    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (existingSetting && existingSetting.setting_value) {
      try {
        pausedAssets = JSON.parse(existingSetting.setting_value)
      } catch {
        logger.warn('[MarketListingService] 解析暂停资产配置失败，使用空对象')
        pausedAssets = {}
      }
    }

    // 2. 添加/更新暂停记录
    const pauseInfo = {
      paused_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString(),
      reason,
      operator_id: operator_id || 'SYSTEM_ORPHAN_FROZEN_CHECK',
      duration_hours
    }

    pausedAssets[asset_code] = pauseInfo

    // 3. 保存配置
    if (existingSetting) {
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
    } else {
      await SystemSetting.create({
        setting_key: settingKey,
        setting_value: JSON.stringify(pausedAssets),
        setting_type: 'json',
        category: 'marketplace',
        description: '暂停挂牌的资产列表（止损用）',
        is_public: false
      })
    }

    // 4. 记录审计日志
    const AuditLogService = require('./AuditLogService')
    await AuditLogService.logOperation({
      operator_id: operator_id || 0,
      operation_type: 'system_config',
      target_type: 'SystemSetting',
      target_id: settingKey,
      action: 'pause_asset_listing',
      before_data: existingSetting
        ? { paused_assets: JSON.parse(existingSetting.setting_value || '{}') }
        : {},
      after_data: { paused_assets: pausedAssets },
      reason,
      is_critical_operation: true
    })

    logger.warn(`[MarketListingService] 已暂停资产 ${asset_code} 的新挂单`, {
      asset_code,
      reason,
      duration_hours,
      expires_at: pauseInfo.expires_at
    })

    return {
      asset_code,
      paused: true,
      pause_info: pauseInfo
    }
  }

  /**
   * 恢复指定资产的挂单功能
   *
   * @param {string} asset_code - 资产代码
   * @param {Object} options - 配置选项
   * @param {string} options.reason - 恢复原因
   * @param {number} [options.operator_id] - 操作者ID
   * @returns {Promise<Object>} 恢复结果
   */
  static async resumeListingForAsset(asset_code, options = {}) {
    const { reason = '手动恢复', operator_id } = options

    if (!asset_code) {
      throw new Error('资产代码（asset_code）不能为空')
    }

    const { SystemSetting } = require('../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      logger.info(`[MarketListingService] 资产 ${asset_code} 未被暂停，无需恢复`)
      return { asset_code, resumed: false, reason: 'not_paused' }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      pausedAssets = {}
    }

    if (!pausedAssets[asset_code]) {
      logger.info(`[MarketListingService] 资产 ${asset_code} 未被暂停，无需恢复`)
      return { asset_code, resumed: false, reason: 'not_paused' }
    }

    // 记录恢复前状态
    const beforeData = { ...pausedAssets }

    // 移除暂停记录
    delete pausedAssets[asset_code]

    await existingSetting.update({
      setting_value: JSON.stringify(pausedAssets)
    })

    // 记录审计日志
    const AuditLogService = require('./AuditLogService')
    await AuditLogService.logOperation({
      operator_id: operator_id || 0,
      operation_type: 'system_config',
      target_type: 'SystemSetting',
      target_id: settingKey,
      action: 'resume_asset_listing',
      before_data: { paused_assets: beforeData },
      after_data: { paused_assets: pausedAssets },
      reason,
      is_critical_operation: true
    })

    logger.info(`[MarketListingService] 已恢复资产 ${asset_code} 的挂单功能`, {
      asset_code,
      reason
    })

    return {
      asset_code,
      resumed: true,
      reason
    }
  }

  /**
   * 检查资产是否被暂停挂单
   *
   * @param {string} asset_code - 资产代码
   * @returns {Promise<Object>} 检查结果 { is_paused, pause_info }
   */
  static async isAssetListingPaused(asset_code) {
    const { SystemSetting } = require('../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      return { is_paused: false, pause_info: null }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      return { is_paused: false, pause_info: null }
    }

    const pauseInfo = pausedAssets[asset_code]

    if (!pauseInfo) {
      return { is_paused: false, pause_info: null }
    }

    // 检查是否已过期
    if (pauseInfo.expires_at && new Date(pauseInfo.expires_at) < new Date()) {
      // 自动清理过期记录
      delete pausedAssets[asset_code]
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
      logger.info(`[MarketListingService] 资产 ${asset_code} 暂停已过期，自动恢复`)
      return { is_paused: false, pause_info: null, expired: true }
    }

    return {
      is_paused: true,
      pause_info: pauseInfo
    }
  }

  /**
   * 获取所有暂停的资产列表
   *
   * @returns {Promise<Object>} 暂停资产列表
   */
  static async getPausedAssets() {
    const { SystemSetting } = require('../models')

    const settingKey = 'marketplace/paused_assets'
    const existingSetting = await SystemSetting.findOne({
      where: { setting_key: settingKey }
    })

    if (!existingSetting || !existingSetting.setting_value) {
      return { paused_assets: {}, count: 0 }
    }

    let pausedAssets = {}
    try {
      pausedAssets = JSON.parse(existingSetting.setting_value)
    } catch {
      pausedAssets = {}
    }

    // 清理已过期的暂停记录
    const now = new Date()
    let hasExpired = false
    for (const [assetCode, info] of Object.entries(pausedAssets)) {
      if (info.expires_at && new Date(info.expires_at) < now) {
        delete pausedAssets[assetCode]
        hasExpired = true
        logger.info(`[MarketListingService] 资产 ${assetCode} 暂停已过期，自动清理`)
      }
    }

    // 如果有过期记录，更新数据库
    if (hasExpired) {
      await existingSetting.update({
        setting_value: JSON.stringify(pausedAssets)
      })
    }

    return {
      paused_assets: pausedAssets,
      count: Object.keys(pausedAssets).length
    }
  }
}

module.exports = MarketListingService
