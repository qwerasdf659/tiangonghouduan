/**
 * 市场挂牌校验服务（ValidationService）
 *
 * V4.7.0 大文件拆分方案 Phase 3
 * 从 CoreService.js (1375行) 拆分
 *
 * 职责：
 * - 挂牌配置管理（getListingConfig / clearConfigCache）
 * - 定价币种白名单校验
 * - 价格区间校验
 * - 同物单币校验
 * - 风控限额校验
 * - 价格管控检查
 * - 撤回频率限制
 * - 高取消率检查
 *
 * @module services/market-listing/ValidationService
 */

const {
  MarketListing,
  User,
  UserRiskProfile,
  sequelize
} = require('../../models')
const { Op } = sequelize.Sequelize
const { AssetCode } = require('../../constants/AssetCode')
const AdminSystemService = require('../AdminSystemService')
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
  [AssetCode.STAR_STONE]: { min: 1, max: null },
  [AssetCode.RED_CORE_SHARD]: { min: 1, max: 1000000 }
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
 * 市场挂牌校验服务类
 *
 * @class MarketListingValidationService
 * @description 挂牌域校验/配置服务
 */
class MarketListingValidationService {
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

      logger.debug(`[ValidationService] 配置已加载 ${key}=${parsedValue}（来源：DB）`)
      return parsedValue
    } catch (err) {
      logger.warn(`[ValidationService] 读取配置 ${key} 失败，使用默认值`, {
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
    logger.info('[ValidationService] 配置缓存已清除')
  }

  // ==================== 校验方法 ====================

  /**
   * 校验定价币种是否在挂牌白名单中
   *
   * @param {string} priceAssetCode - 定价币种代码
   * @returns {Promise<Object>} 校验结果
   */
  static async validateListingAssetWhitelist(priceAssetCode) {
    const whitelist = await AdminSystemService.getSettingValue(
      'marketplace',
      'allowed_listing_assets',
      [AssetCode.STAR_STONE, AssetCode.RED_CORE_SHARD]
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
   * @param {number} itemId - 物品ID
   * @param {string} priceAssetCode - 本次挂牌的定价币种
   * @param {Object} options - 事务选项
   * @returns {Promise<Object>} 校验结果
   */
  static async validateSameItemSingleCurrency(itemId, priceAssetCode, options = {}) {
    if (!itemId) {
      return { valid: true }
    }

    const transaction = options.transaction

    const existingListing = await MarketListing.findOne({
      where: {
        offer_item_id: itemId,
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
        message: `物品 ${itemId} 已存在活跃挂牌`
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

    const frozenStatus = await UserRiskProfile.checkFrozenStatus(seller_user_id)
    if (frozenStatus.is_frozen) {
      return {
        valid: false,
        code: 'USER_FROZEN',
        message: `账户已被冻结，禁止挂牌操作`,
        details: { user_id: seller_user_id, frozen_reason: frozenStatus.reason }
      }
    }

    const user = await User.findByPk(seller_user_id, {
      attributes: ['user_id', 'user_level'],
      transaction: options.transaction
    })

    if (!user) {
      return { valid: false, code: 'USER_NOT_FOUND', message: `用户不存在: ${seller_user_id}` }
    }

    const userLevel = user.user_level || 'normal'

    const thresholds = await UserRiskProfile.getAssetThresholds(
      seller_user_id,
      userLevel,
      price_asset_code
    )
    const dailyMaxListings = thresholds.daily_max_listings || 20

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

  /**
   * 撤回频率限制检查（每用户每日最多撤回次数，从 system_settings 读取）
   *
   * @param {number} sellerUserId - 卖家用户ID
   * @param {Object} transaction - Sequelize 事务
   * @returns {Promise<void>} 校验通过则静默返回，超限则抛出 429 错误
   * @private
   */
  static async _checkWithdrawRateLimit(sellerUserId, transaction) {
    try {
      const dailyLimit = await AdminSystemService.getSettingValue(
        'marketplace',
        'daily_withdraw_limit',
        0
      )
      if (!dailyLimit || dailyLimit <= 0) return

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const todayWithdrawCount = await MarketListing.count({
        where: {
          seller_user_id: sellerUserId,
          status: 'withdrawn',
          updated_at: { [Op.gte]: todayStart }
        },
        transaction
      })

      if (todayWithdrawCount >= dailyLimit) {
        const error = new Error(`今日撤回次数已达上限（${dailyLimit}次/天）`)
        error.statusCode = 429
        error.code = 'WITHDRAW_DAILY_LIMIT'
        throw error
      }
    } catch (error) {
      if (error.code === 'WITHDRAW_DAILY_LIMIT') throw error
      logger.warn('[ValidationService] 撤回频率限制检查失败（非致命）:', error.message)
    }
  }

  /**
   * 高取消率用户交易限制检查（NEW-8）
   *
   * 业务规则：近30天内撤回/取消次数占总挂牌次数的比例超过阈值时，限制新挂牌
   * - 阈值从 system_settings 读取（marketplace/high_cancel_rate_threshold）
   * - 最低挂牌数量门槛：至少有5次挂牌记录才触发检查（避免新用户误判）
   * - 0=关闭检查
   *
   * @param {number} sellerUserId - 卖家用户 ID
   * @param {Object} transaction - Sequelize 事务
   * @returns {Promise<void>} 校验通过则静默返回，超限则抛出 403 错误
   * @private
   */
  static async _checkHighCancelRate(sellerUserId, transaction) {
    try {
      const threshold = await AdminSystemService.getSettingValue(
        'marketplace',
        'high_cancel_rate_threshold',
        0
      )
      if (!threshold || threshold <= 0) return

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const totalListings = await MarketListing.count({
        where: {
          seller_user_id: sellerUserId,
          created_at: { [Op.gte]: thirtyDaysAgo }
        },
        transaction
      })

      if (totalListings < 5) return

      const cancelledCount = await MarketListing.count({
        where: {
          seller_user_id: sellerUserId,
          status: { [Op.in]: ['withdrawn', 'admin_withdrawn', 'cancelled'] },
          created_at: { [Op.gte]: thirtyDaysAgo }
        },
        transaction
      })

      const cancelRate = cancelledCount / totalListings
      if (cancelRate >= threshold) {
        const error = new Error(
          `您近30天的取消率为 ${(cancelRate * 100).toFixed(1)}%，超过平台限制（${(threshold * 100).toFixed(0)}%），暂时无法创建新挂牌`
        )
        error.statusCode = 403
        error.code = 'HIGH_CANCEL_RATE'
        throw error
      }
    } catch (error) {
      if (error.code === 'HIGH_CANCEL_RATE') throw error
      logger.warn('[ValidationService] 高取消率检查失败（非致命）:', error.message)
    }
  }

  /**
   * 挂牌价格管控检查（价格上下限，从 system_settings 读取）
   *
   * @param {number} priceAmount - 挂牌价格
   * @param {string} priceAssetCode - 结算币种
   * @returns {Promise<void>} 校验通过则静默返回，不通过则抛出业务错误
   */
  static async checkPriceControl(priceAmount, priceAssetCode) {
    try {
      const minPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        `listing_price_min_${priceAssetCode}`,
        0
      )
      const maxPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        `listing_price_max_${priceAssetCode}`,
        0
      )

      if (minPrice > 0 && priceAmount < minPrice) {
        const error = new Error(`挂牌价格不能低于最低限价 ${minPrice} ${priceAssetCode}`)
        error.statusCode = 400
        error.code = 'PRICE_BELOW_MINIMUM'
        error.data = { min_price: minPrice, current_price: priceAmount }
        throw error
      }

      if (maxPrice > 0 && priceAmount > maxPrice) {
        const error = new Error(`挂牌价格不能高于最高限价 ${maxPrice} ${priceAssetCode}`)
        error.statusCode = 400
        error.code = 'PRICE_ABOVE_MAXIMUM'
        error.data = { max_price: maxPrice, current_price: priceAmount }
        throw error
      }
    } catch (error) {
      if (error.code === 'PRICE_BELOW_MINIMUM' || error.code === 'PRICE_ABOVE_MAXIMUM') throw error
      logger.warn('[ValidationService] 价格管控检查失败（非致命）:', error.message)
    }
  }
}

module.exports = MarketListingValidationService
