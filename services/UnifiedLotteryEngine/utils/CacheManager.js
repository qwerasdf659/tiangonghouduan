const _logger = require('../../../utils/logger').logger

/**
 * 缓存管理器
 * 提供内存缓存功能，支持TTL和统计
 *
 * @version 4.0.0
 * @date 2025-09-10
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 缓存管理器类
 *
 * 提供基于内存的缓存功能，支持TTL过期时间、统计信息和自动清理
 *
 * 业务场景：
 * - 缓存活动配置，减少数据库查询
 * - 缓存奖品库存，提升抽奖性能
 * - 缓存用户信息，降低查询压力
 *
 * 核心功能：
 * - 设置/获取缓存，支持TTL自动过期
 * - 缓存统计（命中率、设置次数、删除次数）
 * - 自动清理过期缓存（每10分钟）
 * - 安全销毁，避免内存泄漏
 */
class CacheManager {
  /**
   * 构造函数
   *
   * 业务场景：初始化缓存管理器，启动自动清理定时器
   *
   * @example
   * const cacheManager = new CacheManager()
   */
  /**
   * 构造函数
   *
   * 业务场景：初始化缓存管理器
   *
   * ⚠️ 2026-01-30 定时任务统一管理改进：
   * - 原有的 setInterval 自动清理已被移除
   * - 缓存清理现在由 ScheduledTasks.scheduleLotteryEngineCacheCleanup() 统一管理
   * - 详见 scripts/maintenance/scheduled_tasks.js (Task 27)
   *
   * @example
   * const cacheManager = new CacheManager()
   */
  constructor() {
    this.cache = new Map()
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    }

    /*
     * 2026-01-30: setInterval 已移除
     * 缓存清理现在由 ScheduledTasks (Task 27) 统一调度
     * 如需手动清理，请调用 cleanup() 方法
     */
  }

  /**
   * 设置缓存
   *
   * 业务场景：缓存活动配置、奖品信息、用户数据等，减少数据库查询
   *
   * @param {string} key - 缓存键名
   * @param {*} value - 缓存值（可以是任意类型）
   * @param {number} [ttl=300] - 过期时间（秒），默认5分钟
   * @returns {Promise<boolean>} 是否设置成功
   *
   * @example
   * await cacheManager.set('activity_1', activityData, 600) // 缓存10分钟
   */
  async set(key, value, ttl = 300) {
    const expireAt = BeijingTimeHelper.timestamp() + ttl * 1000
    this.cache.set(key, {
      value,
      expireAt
    })
    this.stats.sets++
    return true
  }

  /**
   * 获取缓存
   *
   * 业务场景：获取缓存的活动配置、奖品信息等，自动检查TTL并清理过期数据
   *
   * @param {string} key - 缓存键名
   * @returns {Promise<*>} 缓存值，如果不存在或已过期返回null
   *
   * @example
   * const activityData = await cacheManager.get('activity_1')
   * if (activityData) {
   *   logger.info('使用缓存数据')
   * } else {
   *   logger.info('缓存未命中，需要查询数据库')
   * }
   */
  async get(key) {
    const item = this.cache.get(key)

    if (!item) {
      this.stats.misses++
      return null
    }

    if (BeijingTimeHelper.timestamp() > item.expireAt) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return item.value
  }

  /**
   * 删除缓存
   *
   * 业务场景：删除指定的缓存项，如活动更新后删除旧缓存
   *
   * @param {string} key - 缓存键名
   * @returns {Promise<boolean>} 是否删除成功
   *
   * @example
   * await cacheManager.delete('activity_1') // 删除活动缓存
   */
  async delete(key) {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.deletes++
    }
    return deleted
  }

  /**
   * 清理过期缓存
   *
   * 业务场景：自动清理过期的缓存项，释放内存空间（每10分钟自动执行）
   *
   * @returns {number} 清理的缓存项数量
   *
   * @example
   * const cleaned = cacheManager.cleanup()
   * logger.info('清理了', cleaned, '个过期缓存')
   */
  cleanup() {
    const now = BeijingTimeHelper.timestamp()
    let cleaned = 0

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expireAt) {
        this.cache.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * 获取缓存统计
   *
   * 业务场景：监控缓存性能，查看命中率、缓存大小等指标
   *
   * @returns {Promise<Object>} 统计信息对象
   * @returns {number} return.size - 当前缓存项数量
   * @returns {number} return.hitRate - 缓存命中率（0-1）
   * @returns {number} return.hits - 命中次数
   * @returns {number} return.misses - 未命中次数
   * @returns {number} return.sets - 设置次数
   * @returns {number} return.deletes - 删除次数
   *
   * @example
   * const stats = await cacheManager.getStats()
   * logger.info('缓存命中率:', (stats.hitRate * 100).toFixed(2) + '%')
   */
  async getStats() {
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0

    return {
      size: this.cache.size,
      hitRate: parseFloat(hitRate.toFixed(3)),
      ...this.stats
    }
  }

  /**
   * 清空所有缓存
   *
   * 业务场景：重置缓存系统，清空所有缓存数据和统计信息
   *
   * @returns {void}
   *
   * @example
   * cacheManager.clear() // 清空所有缓存
   */
  clear() {
    this.cache.clear()
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    }
  }

  /**
   * 销毁缓存管理器，清理定时器
   *
   * 业务场景：应用关闭时清理资源，防止内存泄漏
   *
   * @returns {void}
   *
   * @example
   * // 应用关闭时
   * cacheManager.destroy()
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }
}

module.exports = CacheManager
