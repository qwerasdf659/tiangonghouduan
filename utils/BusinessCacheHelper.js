/**
 * 业务缓存助手 - Redis L2 缓存统一管理器
 *
 * @description 提供业务热点数据的 Redis 缓存读写、失效、监控功能
 *
 * 业务场景：
 * - 系统配置缓存（app:v4:{env}:api:sysconfig:{category}:{key}）
 * - 活动配置缓存（app:v4:{env}:api:lottery:cfg:{lottery_campaign_id}）
 * - 商品列表缓存（app:v4:{env}:api:exchange:items:list:*）
 * - 交易市场缓存（app:v4:{env}:api:market:listings:*）
 * - 统计报表缓存（app:v4:{env}:api:stats:{type}:{params}）
 * - 用户信息缓存（app:v4:{env}:api:user:id:{id} / user:mobile_hash:{hash}）
 *
 * 设计原则：
 * - 所有缓存读取包裹 try-catch，失败时降级查库（不抛异常）
 * - 所有缓存失效失败时记录 WARN 日志（不阻塞主流程）
 * - TTL 加随机抖动（±10%）避免缓存雪崩
 * - 使用 SCAN 而非 KEYS 批量删除（避免阻塞 Redis）
 * - Redis Key 强制命名空间隔离（决策5：多环境/多实例安全）
 * - 手机号 PII 治理（决策6B/24：HMAC-SHA256 hash，禁止明文）
 *
 * @see docs/Redis缓存策略现状核查报告.md
 *
 * 创建时间：2026年01月03日
 * 更新时间：2026年01月05日（决策5/6B/20-25实施）
 */

const logger = require('./logger').logger
const crypto = require('crypto')

// ==================== 决策5：Redis Key 命名空间隔离 ====================

/**
 * 环境归一化映射（决策5.1）
 * @description 将各种 NODE_ENV 值统一映射到标准环境标识
 * @constant
 */
const ENV_MAP = {
  development: 'dev',
  dev: 'dev',
  local: 'dev',
  staging: 'staging',
  test: 'staging',
  uat: 'staging',
  production: 'prod',
  prod: 'prod'
}

/**
 * 环境归一化函数
 * @param {string} env - 原始 NODE_ENV 值
 * @returns {string} 归一化后的环境标识（dev/staging/prod）
 */
function normalizeEnv(env) {
  return ENV_MAP[env] || 'dev'
}

/**
 * 服务标识（决策5.2）
 * @description 当前固定为 api，未来多服务可扩展为 api/worker/admin
 * @constant
 */
const SERVICE_NAME = 'api'

/**
 * 全局 Key 前缀（决策5）
 * @description 格式：app:v4:{env}:{service}:
 * @example app:v4:dev:api:sysconfig:points:lottery_cost_points
 * @constant
 */
const KEY_PREFIX = `app:v4:${normalizeEnv(process.env.NODE_ENV)}:${SERVICE_NAME}:`

// ==================== 决策6B/24：手机号 PII 治理 ====================

/**
 * 获取 PII Hash 密钥（决策6.1/25）
 * @description 优先使用独立的 PII_HASH_SECRET，决策25要求全环境强制配置
 * @returns {string} Hash 密钥
 * @throws {Error} 如果 PII_HASH_SECRET 未配置（决策25：全环境拒绝启动）
 */
function getPiiHashSecret() {
  const secret = process.env.PII_HASH_SECRET
  if (!secret) {
    // 决策25：全环境强制配置，这里是兜底检查（启动时应已验证）
    throw new Error('[BusinessCacheHelper] PII_HASH_SECRET 未配置（决策25：全环境强制）')
  }
  return secret
}

/**
 * 手机号 HMAC-SHA256 Hash（决策6B/24）
 * @description 用于生成手机号缓存 key，避免明文手机号出现在 Redis
 * @param {string} mobile - 用户手机号
 * @returns {string} 64字符 hex 字符串
 * @example hashMobile('13612227930') => 'a1b2c3d4e5f6...'
 */
function hashMobile(mobile) {
  const secret = getPiiHashSecret()
  return crypto.createHmac('sha256', secret).update(mobile).digest('hex')
}

/**
 * 缓存 Key 前缀常量
 * @constant
 */
const CACHE_PREFIX = {
  /** 系统配置缓存前缀 */
  SYSCONFIG: 'sysconfig',
  /** 抽奖活动配置缓存前缀 */
  LOTTERY: 'lottery',
  /** 兑换商品缓存前缀 */
  EXCHANGE: 'exchange',
  /** 交易市场缓存前缀 */
  MARKET: 'market',
  /** 统计报表缓存前缀 */
  STATS: 'stats',
  /** 用户信息缓存前缀（P2 缓存优化 2026-01-03） */
  USER: 'user'
}

/**
 * 默认 TTL 配置（秒）
 * @description 基于决策拍板值（2026-01-06最终版）
 * @constant
 */
const DEFAULT_TTL = {
  /** 系统配置 TTL（60秒，决策2A/20：精准失效+立刻生效） */
  SYSCONFIG: 60,
  /** 活动配置 TTL（60秒，决策3：精准失效） */
  LOTTERY: 60,
  /** 商品列表 TTL（60秒，决策4/22：写后失效） */
  EXCHANGE: 60,
  /** 交易市场 TTL（20秒，决策4：变化频繁需快速反映） */
  MARKET: 20,
  /** 统计报表 TTL（180秒，决策23：准实时1-5分钟可接受） */
  STATS: 180,
  /** 用户信息 TTL（120秒，决策21：登录禁缓存+其他走缓存） */
  USER: 120
}

/**
 * 缓存统计数据（内存计数器）
 * @type {Object}
 */
const cacheStats = {
  sysconfig: { hits: 0, misses: 0, invalidations: 0 },
  lottery: { hits: 0, misses: 0, invalidations: 0 },
  exchange: { hits: 0, misses: 0, invalidations: 0 },
  market: { hits: 0, misses: 0, invalidations: 0 },
  stats: { hits: 0, misses: 0, invalidations: 0 },
  user: { hits: 0, misses: 0, invalidations: 0 }
}

/**
 * 监控定时器 ID
 * @type {NodeJS.Timeout|null}
 */
let monitorIntervalId = null

/**
 * 计算命中率
 * @param {Object} stat - 统计对象
 * @returns {string} 命中率百分比
 */
function calculateHitRate(stat) {
  const total = stat.hits + stat.misses
  return total > 0 ? ((stat.hits / total) * 100).toFixed(1) : '0.0'
}

/**
 * 添加 TTL 随机抖动（避免缓存雪崩）
 * @param {number} baseTTL - 基础 TTL（秒）
 * @param {number} jitterPercent - 抖动百分比（默认10%）
 * @returns {number} 带抖动的 TTL
 */
function addTTLJitter(baseTTL, jitterPercent = 10) {
  const jitterRange = Math.floor((baseTTL * jitterPercent) / 100)
  const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange
  return Math.max(1, baseTTL + jitter) // 确保至少 1 秒
}

/**
 * 获取 Redis 原始客户端（带懒加载）
 * @returns {Object|null} Redis 客户端或 null
 */
function getRedisClient() {
  try {
    const { getRawClient } = require('./UnifiedRedisClient')
    return getRawClient()
  } catch (error) {
    logger.warn('[业务缓存] Redis 客户端获取失败', { error: error.message })
    return null
  }
}

/**
 * 根据 key 前缀获取统计分类（决策5适配）
 * @description 兼容新的带命名空间的 key 格式
 * @param {string} key - 缓存 key
 * @returns {string|null} 统计分类名称
 */
function getStatsCategoryFromKey(key) {
  /*
   * 新格式：app:v4:{env}:{service}:{domain}:...
   * 提取 domain 部分进行匹配
   */
  if (key.includes(':sysconfig:')) return 'sysconfig'
  if (key.includes(':lottery:')) return 'lottery'
  if (key.includes(':exchange:')) return 'exchange'
  if (key.includes(':market:')) return 'market'
  if (key.includes(':stats:')) return 'stats'
  if (key.includes(':user:')) return 'user'
  return null
}

/**
 * 业务缓存助手类
 */
class BusinessCacheHelper {
  /**
   * 从缓存读取数据
   *
   * @description 带降级逻辑的缓存读取，失败时返回 null（不抛异常）
   *
   * @param {string} key - 缓存 key
   * @returns {Promise<any|null>} 缓存数据或 null
   *
   * @example
   * const cached = await BusinessCacheHelper.get('sysconfig:points:lottery_cost_points')
   * if (cached !== null) {
   *   return cached // 命中缓存
   * }
   * // 未命中，查库
   */
  static async get(key) {
    const redisClient = getRedisClient()
    if (!redisClient) {
      return null
    }

    try {
      const cached = await redisClient.get(key)

      const category = getStatsCategoryFromKey(key)
      if (category) {
        if (cached !== null) {
          cacheStats[category].hits++
        } else {
          cacheStats[category].misses++
        }
      }

      if (cached !== null) {
        logger.debug('[业务缓存] 命中', { key })
        return JSON.parse(cached)
      }

      logger.debug('[业务缓存] 未命中', { key })
      return null
    } catch (error) {
      logger.warn('[业务缓存] 读取失败，降级返回 null', {
        key,
        error: error.message
      })
      return null
    }
  }

  /**
   * 写入缓存数据
   *
   * @description 带降级逻辑的缓存写入，失败时只记录日志（不抛异常）
   *
   * @param {string} key - 缓存 key
   * @param {any} value - 要缓存的数据
   * @param {number} ttl - 过期时间（秒），默认 60 秒
   * @param {boolean} withJitter - 是否添加 TTL 抖动，默认 true
   * @returns {Promise<boolean>} 是否写入成功
   *
   * @example
   * await BusinessCacheHelper.set('sysconfig:points:lottery_cost_points', 100, 60)
   */
  static async set(key, value, ttl = DEFAULT_TTL.SYSCONFIG, withJitter = true) {
    const redisClient = getRedisClient()
    if (!redisClient) {
      return false
    }

    try {
      const finalTTL = withJitter ? addTTLJitter(ttl) : ttl
      await redisClient.setex(key, finalTTL, JSON.stringify(value))

      logger.debug('[业务缓存] 写入成功', { key, ttl: finalTTL })
      return true
    } catch (error) {
      logger.warn('[业务缓存] 写入失败（非致命）', {
        key,
        error: error.message
      })
      return false
    }
  }

  /**
   * 删除单个缓存
   *
   * @description 带降级逻辑的缓存删除，失败时只记录日志（不抛异常）
   *
   * @param {string} key - 缓存 key
   * @param {string} reason - 删除原因（用于日志）
   * @returns {Promise<boolean>} 是否删除成功
   *
   * @example
   * await BusinessCacheHelper.del('sysconfig:points:lottery_cost_points', 'config_updated')
   */
  static async del(key, reason = 'unknown') {
    const redisClient = getRedisClient()
    if (!redisClient) {
      return false
    }

    try {
      const deleted = await redisClient.del(key)

      const category = getStatsCategoryFromKey(key)
      if (category && deleted > 0) {
        cacheStats[category].invalidations++
      }

      logger.info('[业务缓存] 已失效', { key, reason, deleted: deleted > 0 })
      return deleted > 0
    } catch (error) {
      logger.warn('[业务缓存] 失效失败（非致命，依赖 TTL 过期）', {
        key,
        reason,
        error: error.message
      })
      return false
    }
  }

  /**
   * 批量删除缓存（使用 SCAN 避免阻塞）
   *
   * @description 使用 SCAN 遍历匹配模式，分批删除（避免 KEYS 阻塞 Redis）
   *
   * @param {string} pattern - 匹配模式（如 'exchange:items:list:*'）
   * @param {string} reason - 删除原因（用于日志）
   * @returns {Promise<number>} 删除的 key 数量
   *
   * @example
   * await BusinessCacheHelper.delByPattern('exchange:items:list:*', 'item_created')
   */
  static async delByPattern(pattern, reason = 'unknown') {
    const redisClient = getRedisClient()
    if (!redisClient) {
      return 0
    }

    try {
      let cursor = '0'
      let totalDeleted = 0
      const keysToDelete = []

      // 使用 SCAN 遍历（避免 KEYS 阻塞）
      do {
        // eslint-disable-next-line no-await-in-loop
        const [newCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = newCursor
        keysToDelete.push(...keys)
      } while (cursor !== '0')

      if (keysToDelete.length > 0) {
        const deleted = await redisClient.del(...keysToDelete)
        totalDeleted = Number(deleted) || 0

        // 更新统计
        const category = getStatsCategoryFromKey(pattern)
        if (category) {
          cacheStats[category].invalidations += totalDeleted
        }

        logger.info('[业务缓存] 批量失效完成', {
          pattern,
          reason,
          matched: keysToDelete.length,
          deleted: totalDeleted
        })
      }

      return totalDeleted
    } catch (error) {
      logger.warn('[业务缓存] 批量失效失败（非致命，依赖 TTL 过期）', {
        pattern,
        reason,
        error: error.message
      })
      return 0
    }
  }

  // ==================== 系统配置缓存专用方法 ====================

  /**
   * 构建系统配置缓存 key（决策5适配）
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildSysConfigKey('points', 'lottery_cost_points')
   * // 返回: 'app:v4:dev:api:sysconfig:points:lottery_cost_points'
   */
  static buildSysConfigKey(category, setting_key) {
    return `${KEY_PREFIX}${CACHE_PREFIX.SYSCONFIG}:${category}:${setting_key}`
  }

  /**
   * 获取系统配置缓存
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @returns {Promise<any|null>} 缓存数据或 null
   */
  static async getSysConfig(category, setting_key) {
    const key = this.buildSysConfigKey(category, setting_key)
    return await this.get(key)
  }

  /**
   * 写入系统配置缓存
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @param {any} value - 配置值
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setSysConfig(category, setting_key, value) {
    const key = this.buildSysConfigKey(category, setting_key)
    return await this.set(key, value, DEFAULT_TTL.SYSCONFIG)
  }

  /**
   * 失效系统配置缓存
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否失效成功
   */
  static async invalidateSysConfig(category, setting_key, reason = 'config_updated') {
    const key = this.buildSysConfigKey(category, setting_key)
    return await this.del(key, reason)
  }

  // ==================== 活动配置缓存专用方法 ====================

  /**
   * 构建活动配置缓存 key（决策5适配）
   *
   * @param {number} lottery_campaign_id - 活动 ID
   * @returns {string} 缓存 key
   * @example 返回: 'app:v4:dev:api:lottery:cfg:1'
   */
  static buildLotteryCampaignKey(lottery_campaign_id) {
    return `${KEY_PREFIX}${CACHE_PREFIX.LOTTERY}:cfg:${lottery_campaign_id}`
  }

  /**
   * 获取活动配置缓存
   *
   * @param {number} lottery_campaign_id - 活动 ID
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getLotteryCampaign(lottery_campaign_id) {
    const key = this.buildLotteryCampaignKey(lottery_campaign_id)
    return await this.get(key)
  }

  /**
   * 写入活动配置缓存
   *
   * @param {number} lottery_campaign_id - 活动 ID
   * @param {Object} config - 活动配置对象
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setLotteryCampaign(lottery_campaign_id, config) {
    const key = this.buildLotteryCampaignKey(lottery_campaign_id)
    return await this.set(key, config, DEFAULT_TTL.LOTTERY)
  }

  /**
   * 失效活动配置缓存
   *
   * @param {number} lottery_campaign_id - 活动 ID
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否失效成功
   */
  static async invalidateLotteryCampaign(lottery_campaign_id, reason = 'campaign_updated') {
    const key = this.buildLotteryCampaignKey(lottery_campaign_id)
    return await this.del(key, reason)
  }

  // ==================== 定价配置缓存专用方法（2026-01-21 技术债务修复）====================

  /**
   * 构建定价配置缓存 key
   *
   * @description 用于缓存活动的定价配置（lottery_campaign_pricing_config 表）
   * @param {number} lottery_campaign_id - 活动 ID
   * @returns {string} 缓存 key
   * @example 返回: 'app:v4:dev:api:lottery:pricing:1'
   *
   * @see docs/技术债务-getDrawPricing定价逻辑迁移方案.md - 问题3决策
   */
  static buildLotteryPricingKey(lottery_campaign_id) {
    return `${KEY_PREFIX}${CACHE_PREFIX.LOTTERY}:pricing:${lottery_campaign_id}`
  }

  /**
   * 获取定价配置缓存
   *
   * @description 获取活动的定价配置缓存（TTL=60秒）
   * @param {number} lottery_campaign_id - 活动 ID
   * @returns {Promise<Object|null>} 定价配置对象或 null
   */
  static async getLotteryPricing(lottery_campaign_id) {
    const key = this.buildLotteryPricingKey(lottery_campaign_id)
    return await this.get(key)
  }

  /**
   * 写入定价配置缓存
   *
   * @description 缓存活动的定价配置（TTL=60秒，与活动配置一致）
   * @param {number} lottery_campaign_id - 活动 ID
   * @param {Object} pricing_config - 定价配置对象
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setLotteryPricing(lottery_campaign_id, pricing_config) {
    const key = this.buildLotteryPricingKey(lottery_campaign_id)
    return await this.set(key, pricing_config, DEFAULT_TTL.LOTTERY)
  }

  /**
   * 失效定价配置缓存
   *
   * @description 配置变更时调用，实现写后精准失效
   * @param {number} lottery_campaign_id - 活动 ID
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否失效成功
   *
   * @example
   * // 运营后台修改定价配置后
   * await BusinessCacheHelper.invalidateLotteryPricing(1, 'pricing_config_updated')
   */
  static async invalidateLotteryPricing(lottery_campaign_id, reason = 'pricing_config_updated') {
    const key = this.buildLotteryPricingKey(lottery_campaign_id)
    return await this.del(key, reason)
  }

  // ==================== 商品列表缓存专用方法 ====================

  /**
   * 构建商品列表缓存 key（决策5适配）
   *
   * @param {Object} params - 查询参数
   * @returns {string} 缓存 key
   * @example 返回: 'app:v4:dev:api:exchange:items:list:active:all:1:20:sort_order:ASC'
   */
  static buildExchangeItemsKey(params = {}) {
    const {
      status = 'active',
      asset_code = 'all',
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = params
    return `${KEY_PREFIX}${CACHE_PREFIX.EXCHANGE}:items:list:${status}:${asset_code}:${page}:${page_size}:${sort_by}:${sort_order}`
  }

  /**
   * 获取商品列表缓存
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getExchangeItems(params) {
    const key = this.buildExchangeItemsKey(params)
    return await this.get(key)
  }

  /**
   * 写入商品列表缓存
   *
   * @param {Object} params - 查询参数
   * @param {Object} data - 商品列表数据
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setExchangeItems(params, data) {
    const key = this.buildExchangeItemsKey(params)
    return await this.set(key, data, DEFAULT_TTL.EXCHANGE)
  }

  /**
   * 失效所有商品列表缓存（决策5适配）
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateExchangeItems(reason = 'items_updated') {
    return await this.delByPattern(`${KEY_PREFIX}${CACHE_PREFIX.EXCHANGE}:items:list:*`, reason)
  }

  // ==================== 交易市场缓存专用方法 ====================

  /**
   * 构建交易市场列表缓存 key（决策5适配 + 2026-01-14 分类系统升级）
   *
   * @description category 参数已废弃，使用 listing_kind / item_category_code / asset_group_code / rarity_code 替代
   *
   * @param {Object} params - 查询参数
   * @param {string} [params.listing_kind='all'] - 挂牌类型（item_instance/fungible_asset/all）
   * @param {string} [params.asset_code='all'] - 资产代码
   * @param {string} [params.item_category_code='all'] - 物品类目代码
   * @param {string} [params.asset_group_code='all'] - 资产分组代码
   * @param {string} [params.rarity_code='all'] - 稀有度代码
   * @param {number} [params.min_price=0] - 最低价格
   * @param {number} [params.max_price=0] - 最高价格
   * @param {string} [params.sort='newest'] - 排序方式
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {string} 缓存 key
   * @example 返回: 'app:v4:dev:api:market:listings:item_instance:all:electronics:all:rare:0:0:newest:1:20'
   */
  static buildMarketListingsKey(params = {}) {
    const {
      listing_kind = 'all',
      asset_code = 'all',
      item_category_code = 'all',
      asset_group_code = 'all',
      rarity_code = 'all',
      min_price = 0,
      max_price = 0,
      sort = 'newest',
      page = 1,
      page_size = 20
    } = params

    // 缓存 key 格式：按筛选维度组合（移除废弃的 category 参数）
    const keyParts = [
      KEY_PREFIX,
      CACHE_PREFIX.MARKET,
      'listings',
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price,
      max_price,
      sort,
      page,
      page_size
    ]

    return keyParts.join(':')
  }

  /**
   * 获取交易市场列表缓存
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getMarketListings(params) {
    const key = this.buildMarketListingsKey(params)
    return await this.get(key)
  }

  /**
   * 写入交易市场列表缓存
   *
   * @param {Object} params - 查询参数
   * @param {Object} data - 列表数据
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setMarketListings(params, data) {
    const key = this.buildMarketListingsKey(params)
    return await this.set(key, data, DEFAULT_TTL.MARKET)
  }

  /**
   * 失效所有交易市场列表缓存（决策5适配）
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateMarketListings(reason = 'listings_updated') {
    return await this.delByPattern(`${KEY_PREFIX}${CACHE_PREFIX.MARKET}:listings:*`, reason)
  }

  // ==================== 汇率兑换缓存专用方法（2026-02-23 市场增强） ====================

  /**
   * 获取汇率兑换缓存
   *
   * @param {string} subKey - 子键（如 'all_active', 'red_shard:DIAMOND'）
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getExchangeRate(subKey) {
    const key = `${KEY_PREFIX}exchange_rate:${subKey}`
    return await this.get(key)
  }

  /**
   * 写入汇率兑换缓存（TTL 60秒）
   *
   * @param {string} subKey - 子键
   * @param {Object} data - 缓存数据
   * @returns {Promise<boolean>} 是否成功
   */
  static async setExchangeRate(subKey, data) {
    const key = `${KEY_PREFIX}exchange_rate:${subKey}`
    return await this.set(key, data, DEFAULT_TTL.SYSCONFIG)
  }

  /**
   * 失效所有汇率缓存（规则变更时调用）
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateExchangeRate(reason = 'exchange_rate_updated') {
    return await this.delByPattern(`${KEY_PREFIX}exchange_rate:*`, reason)
  }

  // ==================== 价格发现缓存专用方法（2026-02-23 市场增强） ====================

  /**
   * 获取价格趋势缓存
   *
   * @param {string} subKey - 子键（如 'red_shard:7d:1d'）
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getPriceTrend(subKey) {
    const key = `${KEY_PREFIX}price:trend:${subKey}`
    return await this.get(key)
  }

  /**
   * 写入价格趋势缓存（TTL 10分钟）
   *
   * @param {string} subKey - 子键
   * @param {Object} data - 缓存数据
   * @returns {Promise<boolean>} 是否成功
   */
  static async setPriceTrend(subKey, data) {
    const key = `${KEY_PREFIX}price:trend:${subKey}`
    return await this.set(key, data, 600)
  }

  /**
   * 获取价格摘要缓存
   *
   * @param {string} asset_key - 资产标识
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getPriceSummary(asset_key) {
    const key = `${KEY_PREFIX}price:summary:${asset_key}`
    return await this.get(key)
  }

  /**
   * 写入价格摘要缓存（TTL 5分钟）
   *
   * @param {string} asset_key - 资产标识
   * @param {Object} data - 缓存数据
   * @returns {Promise<boolean>} 是否成功
   */
  static async setPriceSummary(asset_key, data) {
    const key = `${KEY_PREFIX}price:summary:${asset_key}`
    return await this.set(key, data, 300)
  }

  /**
   * 失效价格相关缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidatePriceCache(reason = 'trade_completed') {
    return await this.delByPattern(`${KEY_PREFIX}price:*`, reason)
  }

  // ==================== 统计报表缓存专用方法 ====================

  /**
   * 构建统计报表缓存 key（决策5适配）
   *
   * @param {string} type - 报表类型（decision/trends/today/charts）
   * @param {Object} params - 查询参数
   * @returns {string} 缓存 key
   * @example 返回: 'app:v4:dev:api:stats:today:date:2026-01-05'
   */
  static buildStatsKey(type, params = {}) {
    const paramsStr =
      Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(':') || 'default'
    return `${KEY_PREFIX}${CACHE_PREFIX.STATS}:${type}:${paramsStr}`
  }

  /**
   * 获取统计报表缓存
   *
   * @param {string} type - 报表类型
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getStats(type, params) {
    const key = this.buildStatsKey(type, params)
    return await this.get(key)
  }

  /**
   * 写入统计报表缓存
   *
   * @param {string} type - 报表类型
   * @param {Object} params - 查询参数
   * @param {Object} data - 报表数据
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setStats(type, params, data) {
    const key = this.buildStatsKey(type, params)
    return await this.set(key, data, DEFAULT_TTL.STATS)
  }

  /**
   * 失效所有统计报表缓存（决策5适配）
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateStats(reason = 'data_updated') {
    return await this.delByPattern(`${KEY_PREFIX}${CACHE_PREFIX.STATS}:*`, reason)
  }

  // ==================== 用户信息缓存专用方法（决策6B/10/21：PII治理+认证链路优化）====================

  /**
   * 构建用户信息缓存 key（按手机号hash，决策6B/24：PII治理）
   *
   * @description 使用 HMAC-SHA256 对手机号进行 hash，避免明文手机号出现在 Redis
   * @param {string} mobile - 用户手机号（明文）
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildUserMobileKey('13612227930')
   * // 返回: 'app:v4:dev:api:user:mobile_hash:a1b2c3d4...'（64字符hex）
   */
  static buildUserMobileKey(mobile) {
    const mobileHash = hashMobile(mobile)
    return `${KEY_PREFIX}${CACHE_PREFIX.USER}:mobile_hash:${mobileHash}`
  }

  /**
   * 构建用户信息缓存 key（按用户ID，决策5适配）
   *
   * @param {number} user_id - 用户ID
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildUserIdKey(1)
   * // 返回: 'app:v4:dev:api:user:id:1'
   */
  static buildUserIdKey(user_id) {
    return `${KEY_PREFIX}${CACHE_PREFIX.USER}:id:${user_id}`
  }

  /**
   * 获取用户信息缓存（按手机号hash）
   *
   * @warning 登录场景禁止直接调用此方法！
   * @description 决策10A：此方法被 UserService.findByMobile() 内部调用
   * @see UserService.findByMobile(mobile, { useCache: false }) - 登录场景的正确调用方式
   * @internal 仅供 UserService 非登录场景内部使用
   *
   * 使用规范（P1修复 - 2026-01-30）：
   * - 登录场景：必须使用 useCache: false 参数禁用缓存
   * - 非登录场景：可以使用缓存提高性能
   * - 所有调用已验证符合规范（routes/v4/auth/login.js 全部使用 useCache: false）
   *
   * @param {string} mobile - 用户手机号
   * @returns {Promise<Object|null>} 用户数据或 null
   */
  static async getUserByMobile(mobile) {
    const key = this.buildUserMobileKey(mobile)
    return await this.get(key)
  }

  /**
   * 写入用户信息缓存（按手机号hash）
   *
   * @description 决策10A：登录场景禁止写缓存，此方法仅用于非登录场景
   *
   * @param {string} mobile - 用户手机号
   * @param {Object} userData - 用户数据对象（需要包含可序列化字段）
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setUserByMobile(mobile, userData) {
    const key = this.buildUserMobileKey(mobile)
    return await this.set(key, userData, DEFAULT_TTL.USER)
  }

  /**
   * 获取用户信息缓存（按用户ID）
   *
   * @description 决策10B：认证后场景走缓存，用于 JWT 验证后获取用户详情
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户数据或 null
   */
  static async getUserById(user_id) {
    const key = this.buildUserIdKey(user_id)
    return await this.get(key)
  }

  /**
   * 写入用户信息缓存（按用户ID）
   *
   * @description 决策10B：认证后场景走缓存
   *
   * @param {number} user_id - 用户ID
   * @param {Object} userData - 用户数据对象
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setUserById(user_id, userData) {
    const key = this.buildUserIdKey(user_id)
    return await this.set(key, userData, DEFAULT_TTL.USER)
  }

  /**
   * 失效用户缓存（同时失效 mobile_hash 和 id 两个维度）
   *
   * @description 决策7A：用户信息变更时调用，确保缓存一致性
   * 注意：日志不输出明文手机号（决策6B/24：PII保护）
   *
   * @param {Object} params - 失效参数
   * @param {number} params.user_id - 用户ID（必填）
   * @param {string} params.mobile - 用户手机号（可选，如果提供则同时失效hash维度）
   * @param {string} reason - 失效原因（用于日志）
   * @returns {Promise<boolean>} 是否成功
   *
   * @example
   * // 用户更新昵称后失效缓存
   * await BusinessCacheHelper.invalidateUser({ user_id: 1, mobile: '13612227930' }, 'profile_updated')
   */
  static async invalidateUser(params, reason = 'user_updated') {
    const { user_id, mobile } = params
    let success = true

    // 失效 ID 维度缓存
    if (user_id) {
      const idResult = await this.del(this.buildUserIdKey(user_id), reason)
      success = success && idResult
    }

    // 失效手机号hash维度缓存
    if (mobile) {
      const mobileResult = await this.del(this.buildUserMobileKey(mobile), reason)
      success = success && mobileResult
    }

    // 决策6B/24：日志不输出明文手机号
    logger.info('[业务缓存] 用户缓存已失效', {
      user_id,
      has_mobile: !!mobile,
      reason
    })
    return success
  }

  /**
   * 失效所有用户缓存（决策5适配）
   *
   * @description 批量操作或数据迁移后调用
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateAllUsers(reason = 'batch_operation') {
    return await this.delByPattern(`${KEY_PREFIX}${CACHE_PREFIX.USER}:*`, reason)
  }

  // ==================== 缓存监控方法 ====================

  /**
   * 获取缓存统计数据
   *
   * @returns {Object} 各业务域的缓存统计
   */
  static getStatsSnapshot() {
    const snapshot = {}

    Object.keys(cacheStats).forEach(prefix => {
      snapshot[prefix] = {
        hits: cacheStats[prefix].hits,
        misses: cacheStats[prefix].misses,
        hit_rate: calculateHitRate(cacheStats[prefix]),
        invalidations: cacheStats[prefix].invalidations
      }
    })

    return snapshot
  }

  /**
   * 重置缓存统计数据
   * @returns {void}
   */
  static resetStats() {
    Object.keys(cacheStats).forEach(prefix => {
      cacheStats[prefix].hits = 0
      cacheStats[prefix].misses = 0
      cacheStats[prefix].invalidations = 0
    })
    logger.info('[业务缓存] 统计数据已重置')
  }

  /**
   * [已废弃] 启动缓存监控定时输出
   *
   * ⚠️ 2026-01-30 定时任务统一管理改进：
   * - 此方法中的 setInterval 已被移除
   * - 缓存监控现在由 ScheduledTasks.scheduleBusinessCacheMonitor() 统一管理
   * - 详见 scripts/maintenance/scheduled_tasks.js (Task 28)
   *
   * @deprecated 请使用 ScheduledTasks 中的 Task 28 替代
   * @param {number} _intervalMs - 输出间隔（毫秒），此参数已无效
   * @returns {void}
   */
  static startMonitor(_intervalMs = 10 * 60 * 1000) {
    logger.warn(
      '[业务缓存] startMonitor() 已废弃，' +
        '请使用 ScheduledTasks.scheduleBusinessCacheMonitor() (Task 28) 替代'
    )
    /*
     * 兼容性处理：不再启动定时器，避免重复执行
     * 如需获取统计数据，请直接调用 getStatsSnapshot()
     */
  }

  /**
   * 停止缓存监控
   * @returns {void}
   */
  static stopMonitor() {
    if (monitorIntervalId) {
      clearInterval(monitorIntervalId)
      monitorIntervalId = null
      logger.info('[业务缓存] 监控已停止')
    }
  }
}

// 导出
module.exports = {
  BusinessCacheHelper,
  CACHE_PREFIX,
  DEFAULT_TTL,
  // 决策5：命名空间相关
  KEY_PREFIX,
  ENV_MAP,
  normalizeEnv,
  SERVICE_NAME,
  // 决策6B/24：PII治理相关
  hashMobile,
  getPiiHashSecret
}
