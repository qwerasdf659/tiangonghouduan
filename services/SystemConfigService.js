/**
 * @file 系统配置服务 - 动态配置管理核心服务
 * @description 提供系统配置的读取、更新、缓存功能，支持批量操作限流配置
 *
 * 业务职责：
 * - 读取和管理系统配置参数
 * - 支持 Redis 缓存 + MySQL 回落
 * - 提供批量操作限流配置获取
 * - 配置变更时自动清除缓存
 *
 * 缓存策略：
 * - 配置值缓存TTL：5分钟（可调整）
 * - 缓存键格式：system_config:{config_key}
 * - 更新操作自动清除缓存
 *
 * 设计决策来源：需求文档 阶段C技术决策
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

'use strict'

/* eslint-disable no-await-in-loop */
// 缓存预热和批量操作需要循环中的 await

const { SystemConfig } = require('../models')
const logger = require('../utils/logger').logger
const { getUnifiedRedisClient } = require('../utils/UnifiedRedisClient')

/**
 * 缓存配置常量
 */
const CACHE_CONFIG = {
  // 缓存键前缀
  PREFIX: 'system_config:',
  // 默认缓存TTL（秒）
  DEFAULT_TTL: 300, // 5分钟
  // 批量操作配置缓存TTL（秒）- 较短以便快速响应配置变更
  BATCH_CONFIG_TTL: 60 // 1分钟
}

/**
 * 系统配置服务类
 * 提供配置的读取、更新、缓存管理功能
 */
class SystemConfigService {
  // ==================== Redis 缓存操作 ====================

  /**
   * 获取 Redis 客户端（延迟初始化）
   * @returns {Object|null} Redis客户端实例
   */
  static getRedisClient() {
    try {
      return getUnifiedRedisClient()
    } catch (error) {
      logger.warn('Redis 客户端初始化失败，将使用数据库回落', { error: error.message })
      return null
    }
  }

  /**
   * 生成缓存键
   * @param {string} config_key - 配置键
   * @returns {string} 完整缓存键
   */
  static getCacheKey(config_key) {
    return `${CACHE_CONFIG.PREFIX}${config_key}`
  }

  /**
   * 从缓存获取配置值
   * @param {string} config_key - 配置键
   * @returns {Promise<Object|null>} 缓存的配置值
   */
  static async getFromCache(config_key) {
    const redis = SystemConfigService.getRedisClient()
    if (!redis) return null

    try {
      const cacheKey = SystemConfigService.getCacheKey(config_key)
      const cached = await redis.get(cacheKey)

      if (cached) {
        logger.debug('配置缓存命中', { config_key })
        return JSON.parse(cached)
      }

      return null
    } catch (error) {
      logger.warn('读取配置缓存失败', { config_key, error: error.message })
      return null
    }
  }

  /**
   * 将配置值写入缓存
   * @param {string} config_key - 配置键
   * @param {Object} value - 配置值
   * @param {number} [ttl] - 缓存TTL（秒）
   * @returns {Promise<void>} 无返回值
   */
  static async setToCache(config_key, value, ttl = CACHE_CONFIG.DEFAULT_TTL) {
    const redis = SystemConfigService.getRedisClient()
    if (!redis) return

    try {
      const cacheKey = SystemConfigService.getCacheKey(config_key)
      await redis.set(cacheKey, JSON.stringify(value), 'EX', ttl)
      logger.debug('配置已缓存', { config_key, ttl })
    } catch (error) {
      logger.warn('写入配置缓存失败', { config_key, error: error.message })
    }
  }

  /**
   * 清除配置缓存
   * @param {string} config_key - 配置键
   * @returns {Promise<void>} 无返回值
   */
  static async clearCache(config_key) {
    const redis = SystemConfigService.getRedisClient()
    if (!redis) return

    try {
      const cacheKey = SystemConfigService.getCacheKey(config_key)
      await redis.del(cacheKey)
      logger.debug('配置缓存已清除', { config_key })
    } catch (error) {
      logger.warn('清除配置缓存失败', { config_key, error: error.message })
    }
  }

  /**
   * 清除所有配置缓存
   * @returns {Promise<void>} 无返回值
   */
  static async clearAllCache() {
    const redis = SystemConfigService.getRedisClient()
    if (!redis) return

    try {
      // 使用 SCAN 命令避免阻塞
      const pattern = `${CACHE_CONFIG.PREFIX}*`
      let cursor = '0'
      let deletedCount = 0

      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = result[0]
        const keys = result[1]

        if (keys.length > 0) {
          await redis.del(...keys)
          deletedCount += keys.length
        }
      } while (cursor !== '0')

      logger.info('所有配置缓存已清除', { deleted_count: deletedCount })
    } catch (error) {
      logger.warn('清除所有配置缓存失败', { error: error.message })
    }
  }

  // ==================== 配置读取方法 ====================

  /**
   * 根据配置键获取配置（优先从缓存读取）
   * @param {string} config_key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} 配置值
   */
  static async getValue(config_key, defaultValue = null) {
    try {
      // 1. 尝试从缓存读取
      const cached = await SystemConfigService.getFromCache(config_key)
      if (cached !== null) {
        return cached.is_active ? cached.config_value : defaultValue
      }

      // 2. 从数据库读取
      const config = await SystemConfig.getByKey(config_key)
      if (!config) {
        logger.debug('配置不存在', { config_key })
        return defaultValue
      }

      // 3. 写入缓存
      await SystemConfigService.setToCache(config_key, {
        config_value: config.getValue(),
        is_active: config.is_active
      })

      // 4. 返回配置值（检查是否启用）
      if (!config.is_active) {
        logger.debug('配置已禁用', { config_key })
        return defaultValue
      }

      return config.getValue()
    } catch (error) {
      logger.error('获取配置失败', { config_key, error: error.message })
      return defaultValue
    }
  }

  /**
   * 获取配置值中的指定属性
   * @param {string} config_key - 配置键
   * @param {string} property - 属性名
   * @param {*} defaultValue - 默认值
   * @returns {Promise<*>} 属性值
   */
  static async getProperty(config_key, property, defaultValue = null) {
    const value = await SystemConfigService.getValue(config_key)
    if (value && typeof value === 'object') {
      return value[property] !== undefined ? value[property] : defaultValue
    }
    return defaultValue
  }

  /**
   * 获取批量操作限流配置（核心业务方法）
   * @param {string} operation_type - 操作类型（如 quota_grant_batch）
   * @returns {Promise<Object>} 限流配置 { max_items_per_request, cooldown_seconds }
   */
  static async getBatchRateLimitConfig(operation_type) {
    // 映射操作类型到配置键
    const keyMap = {
      quota_grant_batch: 'batch_rate_limit_quota_grant',
      preset_batch: 'batch_rate_limit_preset',
      redemption_verify_batch: 'batch_rate_limit_redemption',
      campaign_status_batch: 'batch_rate_limit_campaign_status',
      budget_adjust_batch: 'batch_rate_limit_budget'
    }

    const config_key = keyMap[operation_type]
    if (!config_key) {
      logger.warn('未知的批量操作类型', { operation_type })
      // 返回默认配置
      return {
        max_items_per_request: 50,
        cooldown_seconds: 60
      }
    }

    const config = await SystemConfigService.getValue(config_key)
    if (!config) {
      // 返回默认配置
      return {
        max_items_per_request: 50,
        cooldown_seconds: 60
      }
    }

    return {
      max_items_per_request: config.max_items_per_request || 50,
      cooldown_seconds: config.cooldown_seconds || 60
    }
  }

  /**
   * 获取批量操作全局配置
   * @returns {Promise<Object>} 全局配置
   */
  static async getBatchGlobalConfig() {
    const config = await SystemConfigService.getValue('batch_operation_global')
    if (!config) {
      // 返回默认配置
      return {
        max_concurrent_batches: 3,
        default_retry_count: 3,
        retry_delay_seconds: 5,
        idempotency_key_ttl_hours: 24
      }
    }
    return config
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新配置值
   * @param {string} config_key - 配置键
   * @param {Object} config_value - 新的配置值
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize 事务
   * @returns {Promise<Object>} 更新后的配置
   */
  static async updateValue(config_key, config_value, options = {}) {
    const { transaction } = options

    try {
      const config = await SystemConfig.getByKey(config_key, { transaction })
      if (!config) {
        throw new Error(`配置不存在: ${config_key}`)
      }

      await config.updateValue(config_value, { transaction })

      // 清除缓存
      await SystemConfigService.clearCache(config_key)

      logger.info('配置已更新', { config_key })

      return {
        config_key,
        config_value: config.getValue(),
        updated_at: config.updated_at
      }
    } catch (error) {
      logger.error('更新配置失败', { config_key, error: error.message })
      throw error
    }
  }

  /**
   * 合并更新配置值（保留原有属性，更新指定属性）
   * @param {string} config_key - 配置键
   * @param {Object} partialValue - 部分配置值
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize 事务
   * @returns {Promise<Object>} 更新后的配置
   */
  static async mergeValue(config_key, partialValue, options = {}) {
    const { transaction } = options

    try {
      const config = await SystemConfig.getByKey(config_key, { transaction })
      if (!config) {
        throw new Error(`配置不存在: ${config_key}`)
      }

      await config.mergeValue(partialValue, { transaction })

      // 清除缓存
      await SystemConfigService.clearCache(config_key)

      logger.info('配置已合并更新', { config_key, partial_keys: Object.keys(partialValue) })

      return {
        config_key,
        config_value: config.getValue(),
        updated_at: config.updated_at
      }
    } catch (error) {
      logger.error('合并更新配置失败', { config_key, error: error.message })
      throw error
    }
  }

  /**
   * 创建或更新配置（upsert）
   * @param {string} config_key - 配置键
   * @param {Object} config_value - 配置值
   * @param {Object} [options] - 选项
   * @param {string} [options.description] - 配置说明
   * @param {string} [options.config_category] - 配置分类
   * @param {boolean} [options.is_active] - 是否启用
   * @param {Object} [options.transaction] - Sequelize 事务
   * @returns {Promise<Object>} 配置
   */
  static async upsert(config_key, config_value, options = {}) {
    const { description, config_category = 'general', is_active = true, transaction } = options

    try {
      const [config, created] = await SystemConfig.upsert(config_key, config_value, {
        description,
        config_category,
        is_active,
        transaction
      })

      // 清除缓存
      await SystemConfigService.clearCache(config_key)

      logger.info(created ? '配置已创建' : '配置已更新', { config_key })

      return {
        config_key,
        config_value: config.getValue(),
        created,
        updated_at: config.updated_at
      }
    } catch (error) {
      logger.error('创建或更新配置失败', { config_key, error: error.message })
      throw error
    }
  }

  // ==================== 配置管理方法 ====================

  /**
   * 启用配置
   * @param {string} config_key - 配置键
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 更新后的配置
   */
  static async enableConfig(config_key, options = {}) {
    const { transaction } = options

    try {
      const config = await SystemConfig.getByKey(config_key, { transaction })
      if (!config) {
        throw new Error(`配置不存在: ${config_key}`)
      }

      await config.enable({ transaction })

      // 清除缓存
      await SystemConfigService.clearCache(config_key)

      logger.info('配置已启用', { config_key })

      return { config_key, is_active: true }
    } catch (error) {
      logger.error('启用配置失败', { config_key, error: error.message })
      throw error
    }
  }

  /**
   * 禁用配置
   * @param {string} config_key - 配置键
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 更新后的配置
   */
  static async disableConfig(config_key, options = {}) {
    const { transaction } = options

    try {
      const config = await SystemConfig.getByKey(config_key, { transaction })
      if (!config) {
        throw new Error(`配置不存在: ${config_key}`)
      }

      await config.disable({ transaction })

      // 清除缓存
      await SystemConfigService.clearCache(config_key)

      logger.info('配置已禁用', { config_key })

      return { config_key, is_active: false }
    } catch (error) {
      logger.error('禁用配置失败', { config_key, error: error.message })
      throw error
    }
  }

  /**
   * 获取指定分类的所有配置
   * @param {string} category - 配置分类
   * @param {boolean} [activeOnly=true] - 是否只返回启用的配置
   * @returns {Promise<Array>} 配置列表
   */
  static async getByCategory(category, activeOnly = true) {
    try {
      const configs = await SystemConfig.getByCategory(category, activeOnly)

      return configs.map(config => ({
        config_id: config.config_id,
        config_key: config.config_key,
        config_value: config.getValue(),
        description: config.description,
        config_category: config.config_category,
        is_active: config.is_active,
        created_at: config.created_at,
        updated_at: config.updated_at
      }))
    } catch (error) {
      logger.error('获取分类配置失败', { category, error: error.message })
      throw error
    }
  }

  /**
   * 获取所有批量操作配置
   * @returns {Promise<Array>} 配置列表
   */
  static async getAllBatchConfigs() {
    return await SystemConfigService.getByCategory('batch_operation', true)
  }

  /**
   * 获取配置详情
   * @param {string} config_key - 配置键
   * @returns {Promise<Object|null>} 配置详情
   */
  static async getConfigDetail(config_key) {
    try {
      const config = await SystemConfig.getByKey(config_key)
      if (!config) {
        return null
      }

      return {
        config_id: config.config_id,
        config_key: config.config_key,
        config_value: config.getValue(),
        description: config.description,
        config_category: config.config_category,
        category_name: SystemConfig.CATEGORY_NAMES[config.config_category] || '未知分类',
        is_active: config.is_active,
        created_at: config.created_at,
        updated_at: config.updated_at
      }
    } catch (error) {
      logger.error('获取配置详情失败', { config_key, error: error.message })
      throw error
    }
  }

  // ==================== 缓存预热方法 ====================

  /**
   * 预热批量操作配置缓存
   * 在服务启动时调用，减少首次访问延迟
   * @returns {Promise<void>} 无返回值
   */
  static async warmupBatchConfigs() {
    try {
      logger.info('开始预热批量操作配置缓存...')

      const configs = await SystemConfig.getByCategory('batch_operation', true)

      for (const config of configs) {
        await SystemConfigService.setToCache(
          config.config_key,
          {
            config_value: config.getValue(),
            is_active: config.is_active
          },
          CACHE_CONFIG.BATCH_CONFIG_TTL
        )
      }

      logger.info('批量操作配置缓存预热完成', { count: configs.length })
    } catch (error) {
      logger.warn('配置缓存预热失败', { error: error.message })
    }
  }
}

module.exports = SystemConfigService
