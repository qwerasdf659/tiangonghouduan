/**
 * 业务缓存助手 - Redis L2 缓存统一管理器
 *
 * @description 提供业务热点数据的 Redis 缓存读写、失效、监控功能
 *
 * 业务场景：
 * - 系统配置缓存（sysconfig:{category}:{key}）
 * - 活动配置缓存（lottery:cfg:{campaign_id}）
 * - 商品列表缓存（exchange:items:list:*）
 * - 交易市场缓存（market:listings:*）
 * - 统计报表缓存（stats:{type}:{params}）
 *
 * 设计原则：
 * - 所有缓存读取包裹 try-catch，失败时降级查库（不抛异常）
 * - 所有缓存失效失败时记录 WARN 日志（不阻塞主流程）
 * - TTL 加随机抖动（±10%）避免缓存雪崩
 * - 使用 SCAN 而非 KEYS 批量删除（避免阻塞 Redis）
 *
 * @see docs/Redis缓存策略现状与DB压力风险评估-2026-01-02.md
 *
 * 创建时间：2026年01月03日
 */

const logger = require('./logger').logger

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
 * @constant
 */
const DEFAULT_TTL = {
  /** 系统配置 TTL（60秒，最终拍板值） */
  SYSCONFIG: 60,
  /** 活动配置 TTL（60秒） */
  LOTTERY: 60,
  /** 商品列表 TTL（60秒） */
  EXCHANGE: 60,
  /** 交易市场 TTL（60秒） */
  MARKET: 60,
  /** 统计报表 TTL（60秒） */
  STATS: 60,
  /** 用户信息 TTL（120秒，用户数据变更频率较低） */
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
function calculateHitRate (stat) {
  const total = stat.hits + stat.misses
  return total > 0 ? ((stat.hits / total) * 100).toFixed(1) : '0.0'
}

/**
 * 添加 TTL 随机抖动（避免缓存雪崩）
 * @param {number} baseTTL - 基础 TTL（秒）
 * @param {number} jitterPercent - 抖动百分比（默认10%）
 * @returns {number} 带抖动的 TTL
 */
function addTTLJitter (baseTTL, jitterPercent = 10) {
  const jitterRange = Math.floor((baseTTL * jitterPercent) / 100)
  const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange
  return Math.max(1, baseTTL + jitter) // 确保至少 1 秒
}

/**
 * 获取 Redis 原始客户端（带懒加载）
 * @returns {Object|null} Redis 客户端或 null
 */
function getRedisClient () {
  try {
    const { getRawClient } = require('./UnifiedRedisClient')
    return getRawClient()
  } catch (error) {
    logger.warn('[业务缓存] Redis 客户端获取失败', { error: error.message })
    return null
  }
}

/**
 * 根据 key 前缀获取统计分类
 * @param {string} key - 缓存 key
 * @returns {string|null} 统计分类名称
 */
function getStatsCategoryFromKey (key) {
  if (key.startsWith('sysconfig:')) return 'sysconfig'
  if (key.startsWith('lottery:')) return 'lottery'
  if (key.startsWith('exchange:')) return 'exchange'
  if (key.startsWith('market:')) return 'market'
  if (key.startsWith('stats:')) return 'stats'
  if (key.startsWith('user:')) return 'user'
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
  static async get (key) {
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
  static async set (key, value, ttl = DEFAULT_TTL.SYSCONFIG, withJitter = true) {
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
  static async del (key, reason = 'unknown') {
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
  static async delByPattern (pattern, reason = 'unknown') {
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
   * 构建系统配置缓存 key
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildSysConfigKey('points', 'lottery_cost_points')
   * // 返回: 'sysconfig:points:lottery_cost_points'
   */
  static buildSysConfigKey (category, setting_key) {
    return `${CACHE_PREFIX.SYSCONFIG}:${category}:${setting_key}`
  }

  /**
   * 获取系统配置缓存
   *
   * @param {string} category - 配置分类
   * @param {string} setting_key - 配置项键名
   * @returns {Promise<any|null>} 缓存数据或 null
   */
  static async getSysConfig (category, setting_key) {
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
  static async setSysConfig (category, setting_key, value) {
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
  static async invalidateSysConfig (category, setting_key, reason = 'config_updated') {
    const key = this.buildSysConfigKey(category, setting_key)
    return await this.del(key, reason)
  }

  // ==================== 活动配置缓存专用方法 ====================

  /**
   * 构建活动配置缓存 key
   *
   * @param {number} campaign_id - 活动 ID
   * @returns {string} 缓存 key
   */
  static buildLotteryCampaignKey (campaign_id) {
    return `${CACHE_PREFIX.LOTTERY}:cfg:${campaign_id}`
  }

  /**
   * 获取活动配置缓存
   *
   * @param {number} campaign_id - 活动 ID
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getLotteryCampaign (campaign_id) {
    const key = this.buildLotteryCampaignKey(campaign_id)
    return await this.get(key)
  }

  /**
   * 写入活动配置缓存
   *
   * @param {number} campaign_id - 活动 ID
   * @param {Object} config - 活动配置对象
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setLotteryCampaign (campaign_id, config) {
    const key = this.buildLotteryCampaignKey(campaign_id)
    return await this.set(key, config, DEFAULT_TTL.LOTTERY)
  }

  /**
   * 失效活动配置缓存
   *
   * @param {number} campaign_id - 活动 ID
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否失效成功
   */
  static async invalidateLotteryCampaign (campaign_id, reason = 'campaign_updated') {
    const key = this.buildLotteryCampaignKey(campaign_id)
    return await this.del(key, reason)
  }

  // ==================== 商品列表缓存专用方法 ====================

  /**
   * 构建商品列表缓存 key
   *
   * @param {Object} params - 查询参数
   * @returns {string} 缓存 key
   */
  static buildExchangeItemsKey (params = {}) {
    const {
      status = 'active',
      asset_code = 'all',
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = params
    return `${CACHE_PREFIX.EXCHANGE}:items:list:${status}:${asset_code}:${page}:${page_size}:${sort_by}:${sort_order}`
  }

  /**
   * 获取商品列表缓存
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getExchangeItems (params) {
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
  static async setExchangeItems (params, data) {
    const key = this.buildExchangeItemsKey(params)
    return await this.set(key, data, DEFAULT_TTL.EXCHANGE)
  }

  /**
   * 失效所有商品列表缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateExchangeItems (reason = 'items_updated') {
    return await this.delByPattern(`${CACHE_PREFIX.EXCHANGE}:items:list:*`, reason)
  }

  // ==================== 交易市场缓存专用方法 ====================

  /**
   * 构建交易市场列表缓存 key
   *
   * @param {Object} params - 查询参数
   * @returns {string} 缓存 key
   */
  static buildMarketListingsKey (params = {}) {
    const {
      status = 'active',
      category = 'all',
      sort = 'created_desc',
      page = 1,
      page_size = 20
    } = params
    return `${CACHE_PREFIX.MARKET}:listings:${status}:${category}:${sort}:${page}:${page_size}`
  }

  /**
   * 获取交易市场列表缓存
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getMarketListings (params) {
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
  static async setMarketListings (params, data) {
    const key = this.buildMarketListingsKey(params)
    return await this.set(key, data, DEFAULT_TTL.MARKET)
  }

  /**
   * 失效所有交易市场列表缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateMarketListings (reason = 'listings_updated') {
    return await this.delByPattern(`${CACHE_PREFIX.MARKET}:listings:*`, reason)
  }

  // ==================== 统计报表缓存专用方法 ====================

  /**
   * 构建统计报表缓存 key
   *
   * @param {string} type - 报表类型（decision/trends/today/charts）
   * @param {Object} params - 查询参数
   * @returns {string} 缓存 key
   */
  static buildStatsKey (type, params = {}) {
    const paramsStr =
      Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(':') || 'default'
    return `${CACHE_PREFIX.STATS}:${type}:${paramsStr}`
  }

  /**
   * 获取统计报表缓存
   *
   * @param {string} type - 报表类型
   * @param {Object} params - 查询参数
   * @returns {Promise<Object|null>} 缓存数据或 null
   */
  static async getStats (type, params) {
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
  static async setStats (type, params, data) {
    const key = this.buildStatsKey(type, params)
    return await this.set(key, data, DEFAULT_TTL.STATS)
  }

  /**
   * 失效所有统计报表缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateStats (reason = 'data_updated') {
    return await this.delByPattern(`${CACHE_PREFIX.STATS}:*`, reason)
  }

  // ==================== 用户信息缓存专用方法（P2 缓存优化 2026-01-03）====================

  /**
   * 构建用户信息缓存 key（按手机号）
   *
   * @param {string} mobile - 用户手机号
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildUserMobileKey('13612227930')
   * // 返回: 'user:mobile:13612227930'
   */
  static buildUserMobileKey (mobile) {
    return `${CACHE_PREFIX.USER}:mobile:${mobile}`
  }

  /**
   * 构建用户信息缓存 key（按用户ID）
   *
   * @param {number} user_id - 用户ID
   * @returns {string} 缓存 key
   *
   * @example
   * const key = BusinessCacheHelper.buildUserIdKey(1)
   * // 返回: 'user:id:1'
   */
  static buildUserIdKey (user_id) {
    return `${CACHE_PREFIX.USER}:id:${user_id}`
  }

  /**
   * 获取用户信息缓存（按手机号）
   *
   * @description 用于登录场景，根据手机号查找用户
   *
   * @param {string} mobile - 用户手机号
   * @returns {Promise<Object|null>} 用户数据或 null
   */
  static async getUserByMobile (mobile) {
    const key = this.buildUserMobileKey(mobile)
    return await this.get(key)
  }

  /**
   * 写入用户信息缓存（按手机号）
   *
   * @param {string} mobile - 用户手机号
   * @param {Object} userData - 用户数据对象（需要包含可序列化字段）
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setUserByMobile (mobile, userData) {
    const key = this.buildUserMobileKey(mobile)
    return await this.set(key, userData, DEFAULT_TTL.USER)
  }

  /**
   * 获取用户信息缓存（按用户ID）
   *
   * @description 用于认证后场景，根据用户ID获取用户信息
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户数据或 null
   */
  static async getUserById (user_id) {
    const key = this.buildUserIdKey(user_id)
    return await this.get(key)
  }

  /**
   * 写入用户信息缓存（按用户ID）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} userData - 用户数据对象
   * @returns {Promise<boolean>} 是否写入成功
   */
  static async setUserById (user_id, userData) {
    const key = this.buildUserIdKey(user_id)
    return await this.set(key, userData, DEFAULT_TTL.USER)
  }

  /**
   * 失效用户缓存（同时失效 mobile 和 id 两个维度）
   *
   * @description 用户信息变更时调用，确保缓存一致性
   *
   * @param {Object} params - 失效参数
   * @param {number} params.user_id - 用户ID（必填）
   * @param {string} params.mobile - 用户手机号（可选，如果提供则同时失效）
   * @param {string} reason - 失效原因（用于日志）
   * @returns {Promise<boolean>} 是否成功
   *
   * @example
   * // 用户更新昵称后失效缓存
   * await BusinessCacheHelper.invalidateUser({ user_id: 1, mobile: '13612227930' }, 'profile_updated')
   */
  static async invalidateUser (params, reason = 'user_updated') {
    const { user_id, mobile } = params
    let success = true

    // 失效 ID 维度缓存
    if (user_id) {
      const idResult = await this.del(this.buildUserIdKey(user_id), reason)
      success = success && idResult
    }

    // 失效手机号维度缓存
    if (mobile) {
      const mobileResult = await this.del(this.buildUserMobileKey(mobile), reason)
      success = success && mobileResult
    }

    logger.info('[业务缓存] 用户缓存已失效', { user_id, mobile, reason })
    return success
  }

  /**
   * 失效所有用户缓存
   *
   * @description 批量操作或数据迁移后调用
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<number>} 失效的 key 数量
   */
  static async invalidateAllUsers (reason = 'batch_operation') {
    return await this.delByPattern(`${CACHE_PREFIX.USER}:*`, reason)
  }

  // ==================== 缓存监控方法 ====================

  /**
   * 获取缓存统计数据
   *
   * @returns {Object} 各业务域的缓存统计
   */
  static getStatsSnapshot () {
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
  static resetStats () {
    Object.keys(cacheStats).forEach(prefix => {
      cacheStats[prefix].hits = 0
      cacheStats[prefix].misses = 0
      cacheStats[prefix].invalidations = 0
    })
    logger.info('[业务缓存] 统计数据已重置')
  }

  /**
   * 启动缓存监控定时输出
   *
   * @param {number} intervalMs - 输出间隔（毫秒），默认 10 分钟
   * @returns {void}
   */
  static startMonitor (intervalMs = 10 * 60 * 1000) {
    if (monitorIntervalId) {
      logger.warn('[业务缓存] 监控已在运行')
      return
    }

    monitorIntervalId = setInterval(() => {
      const snapshot = this.getStatsSnapshot()

      logger.info('📊 [业务缓存监控] 统计报告', snapshot)

      // 告警检查
      Object.keys(snapshot).forEach(prefix => {
        const hitRate = parseFloat(snapshot[prefix].hit_rate)
        if (hitRate < 60 && cacheStats[prefix].hits + cacheStats[prefix].misses > 10) {
          logger.warn(`⚠️ [业务缓存监控] ${prefix} 缓存命中率偏低: ${hitRate}%`)
        }
      })
    }, intervalMs)

    logger.info('[业务缓存] 监控已启动', { interval_ms: intervalMs })
  }

  /**
   * 停止缓存监控
   * @returns {void}
   */
  static stopMonitor () {
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
  DEFAULT_TTL
}
