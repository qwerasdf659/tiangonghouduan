/**
 * DisplayNameService - 中文化显示名称服务
 *
 * 核心职责：
 * 1. 从数据库加载字典数据到 Redis 缓存
 * 2. 提供快速的显示名称查询接口
 * 3. 版本管理和缓存刷新
 * 4. 字典修改和历史回滚
 * 5. 应用启动时的 ENUM 映射验证
 *
 * 技术实现：
 * - Redis 缓存前缀：display_name:
 * - 版本控制键：display_name:version
 * - 静态方法设计，无需实例化
 *
 * @module services/DisplayNameService
 * @author 中文化显示名称系统
 * @since 2026-01-22
 * @see docs/中文化显示名称实施文档.md
 */

'use strict'

const { getRedisClient, isRedisHealthy } = require('../utils/UnifiedRedisClient')
const logger = require('../utils/logger').logger
const { SystemDictionary, SystemDictionaryHistory, sequelize } = require('../models')

/**
 * 中文化显示名称服务类
 *
 * @class DisplayNameService
 */
class DisplayNameService {
  // ==================== 静态常量 ====================

  /**
   * Redis 键前缀
   * @type {string}
   */
  static REDIS_PREFIX = 'display_name:'

  /**
   * Redis 版本键
   * @type {string}
   */
  static REDIS_VERSION_KEY = 'display_name:version'

  /**
   * Redis 全量数据键
   * @type {string}
   */
  static REDIS_ALL_DATA_KEY = 'display_name:all'

  /**
   * 缓存过期时间（7天，单位：秒）
   * @type {number}
   */
  static CACHE_TTL = 7 * 24 * 60 * 60

  /**
   * 内存缓存（降级方案，Redis 不可用时使用）
   * @type {Map<string, Object>}
   */
  static memoryCache = new Map()

  /**
   * 内存缓存版本号
   * @type {number}
   */
  static memoryCacheVersion = 0

  /**
   * 是否已初始化
   * @type {boolean}
   */
  static initialized = false

  /**
   * 初始化 Promise（用于防止重复初始化）
   * @type {Promise<boolean>|null}
   */
  static initializePromise = null

  // ==================== 初始化方法 ====================

  /**
   * 服务初始化
   *
   * 在应用启动时调用，执行以下操作：
   * 1. 验证 ENUM 映射完整性
   * 2. 加载字典数据到 Redis 缓存
   *
   * @returns {Promise<boolean>} 初始化成功返回 true
   * @throws {Error} 验证失败时抛出错误，阻止应用启动
   */
  static async initialize() {
    // 已完成初始化，直接返回
    if (DisplayNameService.initialized) {
      logger.debug('[DisplayNameService] 服务已初始化，跳过')
      return true
    }

    // 正在初始化中，返回现有 Promise（防止竞态条件）
    if (DisplayNameService.initializePromise) {
      logger.debug('[DisplayNameService] 初始化进行中，等待完成...')
      return DisplayNameService.initializePromise
    }

    // 开始初始化，保存 Promise
    DisplayNameService.initializePromise = DisplayNameService._doInitialize()
    return DisplayNameService.initializePromise
  }

  /**
   * 实际执行初始化逻辑
   *
   * @returns {Promise<boolean>} 初始化成功返回 true
   * @private
   */
  static async _doInitialize() {
    try {
      logger.info('[DisplayNameService] 开始初始化中文显示名称服务...')

      // 1. 检查数据库连接
      await sequelize.authenticate()
      logger.info('[DisplayNameService] 数据库连接正常')

      // 2. 检查 Redis 连接
      const redisHealthy = await isRedisHealthy()
      if (!redisHealthy) {
        logger.warn('[DisplayNameService] Redis 不可用，将使用内存缓存降级方案')
      }

      // 3. 加载数据到缓存
      await DisplayNameService.loadToCache()

      // 4. 标记为已初始化（安全的，因为 initializePromise 保证单一初始化流程）
      // eslint-disable-next-line require-atomic-updates
      DisplayNameService.initialized = true
      logger.info('[DisplayNameService] 中文显示名称服务初始化完成')

      return true
    } catch (error) {
      // 初始化失败，清理状态以便重试
      DisplayNameService.initializePromise = null
      logger.error('[DisplayNameService] 初始化失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  // ==================== 缓存管理方法 ====================

  /**
   * 加载字典数据到缓存
   *
   * 从数据库读取所有启用的字典项，写入 Redis 和内存缓存
   *
   * @returns {Promise<{loaded: number, version: number}>} 加载结果
   */
  static async loadToCache() {
    try {
      logger.info('[DisplayNameService] 开始加载字典数据到缓存...')

      // 从数据库读取所有启用的字典数据
      const dictionaries = await SystemDictionary.scope('enabled', 'ordered').findAll()

      if (dictionaries.length === 0) {
        logger.warn('[DisplayNameService] 字典表为空，请检查数据库初始化')
        return { loaded: 0, version: 0 }
      }

      // 构建缓存数据结构
      const cacheData = {}
      for (const item of dictionaries) {
        const key = `${item.dict_type}:${item.dict_code}`
        cacheData[key] = {
          name: item.dict_name,
          color: item.dict_color,
          sort_order: item.sort_order
        }
      }

      // 生成新版本号
      const newVersion = Date.now()

      // 尝试写入 Redis
      const redisHealthy = await isRedisHealthy()
      if (redisHealthy) {
        try {
          const redis = await getRedisClient()

          // 使用 pipeline 批量写入（UnifiedRedisClient.pipeline() 是异步方法）
          const pipeline = await redis.pipeline()

          // 写入全量数据（JSON）
          pipeline.set(
            DisplayNameService.REDIS_ALL_DATA_KEY,
            JSON.stringify(cacheData),
            'EX',
            DisplayNameService.CACHE_TTL
          )

          // 写入版本号
          pipeline.set(DisplayNameService.REDIS_VERSION_KEY, newVersion.toString())

          // 写入单条记录（用于快速查询）
          for (const [key, value] of Object.entries(cacheData)) {
            const redisKey = `${DisplayNameService.REDIS_PREFIX}${key}`
            pipeline.hmset(redisKey, {
              name: value.name,
              color: value.color || '',
              sort_order: value.sort_order.toString()
            })
            pipeline.expire(redisKey, DisplayNameService.CACHE_TTL)
          }

          await pipeline.exec()
          logger.info('[DisplayNameService] Redis 缓存写入成功', {
            count: dictionaries.length,
            version: newVersion
          })
        } catch (redisError) {
          logger.error('[DisplayNameService] Redis 写入失败，使用内存缓存', {
            error: redisError.message
          })
        }
      }

      // 同时更新内存缓存（作为降级方案）
      DisplayNameService.memoryCache.clear()
      for (const [key, value] of Object.entries(cacheData)) {
        DisplayNameService.memoryCache.set(key, value)
      }
      DisplayNameService.memoryCacheVersion = newVersion

      logger.info('[DisplayNameService] 缓存加载完成', {
        loaded: dictionaries.length,
        version: newVersion,
        redis_available: redisHealthy
      })

      return { loaded: dictionaries.length, version: newVersion }
    } catch (error) {
      logger.error('[DisplayNameService] 加载缓存失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 刷新缓存
   *
   * 清除现有缓存并重新加载
   *
   * @returns {Promise<{loaded: number, version: number}>} 刷新结果
   */
  static async refreshCache() {
    logger.info('[DisplayNameService] 刷新缓存...')

    // 清除 Redis 缓存
    const redisHealthy = await isRedisHealthy()
    if (redisHealthy) {
      try {
        const redis = await getRedisClient()
        const keys = await DisplayNameService._scanKeys(
          redis,
          `${DisplayNameService.REDIS_PREFIX}*`
        )
        if (keys.length > 0) {
          await redis.del(...keys)
        }
        await redis.del(DisplayNameService.REDIS_ALL_DATA_KEY)
        await redis.del(DisplayNameService.REDIS_VERSION_KEY)
        logger.info('[DisplayNameService] Redis 缓存已清除', { deleted_keys: keys.length + 2 })
      } catch (error) {
        logger.warn('[DisplayNameService] 清除 Redis 缓存失败', { error: error.message })
      }
    }

    // 重新加载
    return DisplayNameService.loadToCache()
  }

  /**
   * 使用 SCAN 命令获取匹配的 Redis 键（避免 KEYS 命令阻塞）
   *
   * @param {Object} redis - Redis 客户端
   * @param {string} pattern - 匹配模式
   * @returns {Promise<string[]>} 匹配的键列表
   * @private
   */
  static async _scanKeys(redis, pattern) {
    const keys = []
    let cursor = '0'

    // SCAN 命令是迭代器，必须循环调用直到 cursor 为 '0'
    do {
      // eslint-disable-next-line no-await-in-loop
      const [nextCursor, matchedKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor
      keys.push(...matchedKeys)
    } while (cursor !== '0')

    return keys
  }

  // ==================== 查询方法 ====================

  /**
   * 获取单个显示名称
   *
   * @param {string} dictType - 字典类型（如：user_status, order_status）
   * @param {string} dictCode - 字典编码（如：active, pending）
   * @returns {Promise<string|null>} 中文名称，未找到返回 null
   */
  static async getDisplayName(dictType, dictCode) {
    if (!dictType || !dictCode) {
      return null
    }

    const key = `${dictType}:${dictCode}`

    // 优先从 Redis 获取
    const redisHealthy = await isRedisHealthy()
    if (redisHealthy) {
      try {
        const redis = await getRedisClient()
        const redisKey = `${DisplayNameService.REDIS_PREFIX}${key}`
        const result = await redis.hget(redisKey, 'name')
        if (result) {
          return result
        }
      } catch (error) {
        logger.warn('[DisplayNameService] Redis 查询失败，使用内存缓存', {
          error: error.message,
          key
        })
      }
    }

    // 降级到内存缓存
    const cached = DisplayNameService.memoryCache.get(key)
    if (cached) {
      return cached.name
    }

    // 最后尝试从数据库查询（兜底方案）
    try {
      const record = await SystemDictionary.findByTypeAndCode(dictType, dictCode)
      if (record) {
        // 更新内存缓存
        DisplayNameService.memoryCache.set(key, {
          name: record.dict_name,
          color: record.dict_color,
          sort_order: record.sort_order
        })
        return record.dict_name
      }
    } catch (error) {
      logger.error('[DisplayNameService] 数据库查询失败', {
        error: error.message,
        dict_type: dictType,
        dict_code: dictCode
      })
    }

    return null
  }

  /**
   * 获取单个显示颜色
   *
   * @param {string} dictType - 字典类型
   * @param {string} dictCode - 字典编码
   * @returns {Promise<string|null>} 颜色类名，未找到返回 null
   */
  static async getDisplayColor(dictType, dictCode) {
    if (!dictType || !dictCode) {
      return null
    }

    const key = `${dictType}:${dictCode}`

    // 优先从 Redis 获取
    const redisHealthy = await isRedisHealthy()
    if (redisHealthy) {
      try {
        const redis = await getRedisClient()
        const redisKey = `${DisplayNameService.REDIS_PREFIX}${key}`
        const result = await redis.hget(redisKey, 'color')
        if (result) {
          return result || null
        }
      } catch (error) {
        logger.warn('[DisplayNameService] Redis 查询颜色失败', { error: error.message, key })
      }
    }

    // 降级到内存缓存
    const cached = DisplayNameService.memoryCache.get(key)
    if (cached) {
      return cached.color || null
    }

    // 数据库查询兜底
    try {
      const record = await SystemDictionary.findByTypeAndCode(dictType, dictCode)
      if (record) {
        DisplayNameService.memoryCache.set(key, {
          name: record.dict_name,
          color: record.dict_color,
          sort_order: record.sort_order
        })
        return record.dict_color
      }
    } catch (error) {
      logger.error('[DisplayNameService] 数据库查询颜色失败', { error: error.message })
    }

    return null
  }

  /**
   * 批量获取显示名称和颜色
   *
   * @param {Array<{type: string, code: string}>} items - 要查询的字典项
   * @returns {Promise<Map<string, {name: string, color: string}>>} 映射表
   */
  static async batchGet(items) {
    if (!items || items.length === 0) {
      return new Map()
    }

    const result = new Map()

    // 尝试从 Redis 批量获取
    const redisHealthy = await isRedisHealthy()
    if (redisHealthy) {
      try {
        const redis = await getRedisClient()
        // 注意：pipeline() 是 async 方法，需要 await
        const pipeline = await redis.pipeline()

        for (const { type, code } of items) {
          const redisKey = `${DisplayNameService.REDIS_PREFIX}${type}:${code}`
          pipeline.hgetall(redisKey)
        }

        const results = await pipeline.exec()
        let hasAllData = true

        for (let i = 0; i < items.length; i++) {
          const { type, code } = items[i]
          const key = `${type}:${code}`
          const [err, data] = results[i]

          if (!err && data && data.name) {
            result.set(key, {
              name: data.name,
              color: data.color || null
            })
          } else {
            hasAllData = false
          }
        }

        if (hasAllData) {
          return result
        }
      } catch (error) {
        logger.warn('[DisplayNameService] Redis 批量查询失败', { error: error.message })
      }
    }

    // 从内存缓存或数据库补全
    for (const { type, code } of items) {
      const key = `${type}:${code}`
      if (!result.has(key)) {
        const cached = DisplayNameService.memoryCache.get(key)
        if (cached) {
          result.set(key, { name: cached.name, color: cached.color || null })
        }
      }
    }

    // 如果仍有缺失，从数据库批量查询
    const missingItems = items.filter(({ type, code }) => !result.has(`${type}:${code}`))
    if (missingItems.length > 0) {
      try {
        const dbResult = await SystemDictionary.batchGetDisplayNames(missingItems)
        for (const [key, value] of dbResult) {
          result.set(key, value)
          // 更新内存缓存
          DisplayNameService.memoryCache.set(key, {
            name: value.name,
            color: value.color,
            sort_order: 0
          })
        }
      } catch (error) {
        logger.error('[DisplayNameService] 数据库批量查询失败', { error: error.message })
      }
    }

    return result
  }

  /**
   * 获取指定类型的所有字典项
   *
   * @param {string} dictType - 字典类型
   * @returns {Promise<Array<{code: string, name: string, color: string}>>} 字典项列表
   */
  static async getByType(dictType) {
    if (!dictType) {
      return []
    }

    try {
      const items = await SystemDictionary.findAllByType(dictType)
      return items.map(item => ({
        code: item.dict_code,
        name: item.dict_name,
        color: item.dict_color
      }))
    } catch (error) {
      logger.error('[DisplayNameService] 获取类型字典失败', {
        error: error.message,
        dict_type: dictType
      })
      return []
    }
  }

  /**
   * 获取所有字典类型列表
   *
   * @returns {Promise<string[]>} 类型列表
   */
  static async getAllTypes() {
    try {
      return await SystemDictionary.findAllTypes()
    } catch (error) {
      logger.error('[DisplayNameService] 获取所有类型失败', { error: error.message })
      return []
    }
  }

  // ==================== 字典管理方法 ====================

  /**
   * 更新字典项
   *
   * 更新字典的中文名称或颜色，并记录历史版本
   *
   * @param {number} dictId - 字典ID
   * @param {Object} updateData - 更新数据
   * @param {string} [updateData.dict_name] - 新的中文名称
   * @param {string} [updateData.dict_color] - 新的颜色
   * @param {number} operatorId - 操作人ID
   * @param {string} [reason] - 修改原因
   * @returns {Promise<Object>} 更新后的字典记录
   */
  static async updateDictionary(dictId, updateData, operatorId, reason = null) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 查找字典记录
      const dictionary = await SystemDictionary.findByPk(dictId, { transaction })
      if (!dictionary) {
        await transaction.rollback()
        const error = new Error(`字典项不存在: ${dictId}`)
        error.status = 404
        error.code = 'DICT_NOT_FOUND'
        throw error
      }

      // 2. 保存历史记录（修改前快照）
      await SystemDictionaryHistory.createFromDictionary(dictionary, operatorId, reason, {
        transaction
      })

      // 3. 更新字典
      const newVersion = dictionary.version + 1
      const fieldsToUpdate = {
        version: newVersion,
        updated_by: operatorId
      }

      if (updateData.dict_name !== undefined) {
        fieldsToUpdate.dict_name = updateData.dict_name
      }
      if (updateData.dict_color !== undefined) {
        fieldsToUpdate.dict_color = updateData.dict_color
      }

      await dictionary.update(fieldsToUpdate, { transaction })

      await transaction.commit()

      // 4. 刷新缓存
      await DisplayNameService.refreshCache()

      logger.info('[DisplayNameService] 更新字典成功', {
        dict_id: dictId,
        dict_type: dictionary.dict_type,
        dict_code: dictionary.dict_code,
        new_version: newVersion,
        operator_id: operatorId
      })

      return dictionary.reload()
    } catch (error) {
      await transaction.rollback()
      logger.error('[DisplayNameService] 更新字典失败', {
        dict_id: dictId,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 回滚到指定版本
   *
   * @param {number} dictId - 字典ID
   * @param {number} targetVersion - 目标版本号
   * @param {number} operatorId - 操作人ID
   * @returns {Promise<Object>} 回滚后的字典记录
   */
  static async rollbackToVersion(dictId, targetVersion, operatorId) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 查找当前字典记录
      const dictionary = await SystemDictionary.findByPk(dictId, { transaction })
      if (!dictionary) {
        await transaction.rollback()
        const error = new Error(`字典项不存在: ${dictId}`)
        error.status = 404
        error.code = 'DICT_NOT_FOUND'
        throw error
      }

      // 2. 查找目标版本的历史记录
      const historyRecord = await SystemDictionaryHistory.findByDictIdAndVersion(
        dictId,
        targetVersion,
        { transaction }
      )

      if (!historyRecord) {
        await transaction.rollback()
        const error = new Error(`版本不存在: ${targetVersion}`)
        error.status = 404
        error.code = 'VERSION_NOT_FOUND'
        throw error
      }

      // 3. 保存当前版本到历史（回滚前快照）
      await SystemDictionaryHistory.createFromDictionary(
        dictionary,
        operatorId,
        `回滚到版本 ${targetVersion}`,
        { transaction }
      )

      // 4. 回滚到目标版本
      const newVersion = dictionary.version + 1
      await dictionary.update(
        {
          dict_name: historyRecord.dict_name,
          dict_color: historyRecord.dict_color,
          version: newVersion,
          updated_by: operatorId
        },
        { transaction }
      )

      await transaction.commit()

      // 5. 刷新缓存
      await DisplayNameService.refreshCache()

      logger.info('[DisplayNameService] 版本回滚成功', {
        dict_id: dictId,
        target_version: targetVersion,
        new_version: newVersion,
        operator_id: operatorId
      })

      return dictionary.reload()
    } catch (error) {
      await transaction.rollback()
      logger.error('[DisplayNameService] 版本回滚失败', {
        dict_id: dictId,
        target_version: targetVersion,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取字典的版本历史
   *
   * @param {number} dictId - 字典ID
   * @returns {Promise<Array>} 历史版本列表（按版本号降序）
   */
  static async getVersionHistory(dictId) {
    try {
      const histories = await SystemDictionaryHistory.findByDictId(dictId)
      return histories.map(h => ({
        history_id: h.history_id,
        version: h.version,
        dict_name: h.dict_name,
        dict_color: h.dict_color,
        changed_by: h.changed_by,
        changed_at: h.changed_at,
        change_reason: h.change_reason
      }))
    } catch (error) {
      logger.error('[DisplayNameService] 获取版本历史失败', {
        dict_id: dictId,
        error: error.message
      })
      return []
    }
  }

  // ==================== 验证方法 ====================

  /**
   * 验证 ENUM 映射完整性
   *
   * 检查代码中定义的所有 ENUM 值是否都有对应的字典映射
   * 此方法可在应用启动时调用，验证失败时可选择阻止启动
   *
   * @param {Object} enumDefinitions - ENUM 定义对象 { dict_type: [code1, code2, ...] }
   * @returns {Promise<{valid: boolean, missing: Array}>} 验证结果
   */
  static async validateEnumMappings(enumDefinitions) {
    const missing = []

    try {
      // 获取数据库中所有启用的字典数据
      const allTypes = await SystemDictionary.findAllGroupedByType()

      for (const [dictType, codes] of Object.entries(enumDefinitions)) {
        const dbItems = allTypes[dictType] || []
        const dbCodes = new Set(dbItems.map(item => item.dict_code))

        for (const code of codes) {
          if (!dbCodes.has(code)) {
            missing.push({ dict_type: dictType, dict_code: code })
          }
        }
      }

      if (missing.length > 0) {
        logger.warn('[DisplayNameService] ENUM 映射验证发现缺失项', {
          missing_count: missing.length,
          missing: missing.slice(0, 10) // 只记录前10个
        })
      } else {
        logger.info('[DisplayNameService] ENUM 映射验证通过')
      }

      return { valid: missing.length === 0, missing }
    } catch (error) {
      logger.error('[DisplayNameService] ENUM 映射验证失败', { error: error.message })
      return { valid: false, missing: [], error: error.message }
    }
  }

  /**
   * 获取缓存统计信息
   *
   * @returns {Promise<Object>} 缓存统计
   */
  static async getCacheStats() {
    const stats = {
      initialized: DisplayNameService.initialized,
      memory_cache_size: DisplayNameService.memoryCache.size,
      memory_cache_version: DisplayNameService.memoryCacheVersion,
      redis_available: false,
      redis_version: null,
      redis_key_count: 0
    }

    try {
      const redisHealthy = await isRedisHealthy()
      stats.redis_available = redisHealthy

      if (redisHealthy) {
        const redis = await getRedisClient()
        stats.redis_version = await redis.get(DisplayNameService.REDIS_VERSION_KEY)
        const keys = await DisplayNameService._scanKeys(
          redis,
          `${DisplayNameService.REDIS_PREFIX}*`
        )
        stats.redis_key_count = keys.length
      }
    } catch (error) {
      logger.warn('[DisplayNameService] 获取 Redis 统计失败', { error: error.message })
    }

    return stats
  }
}

module.exports = DisplayNameService
