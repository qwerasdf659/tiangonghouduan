/**
 * 缓存管理器
 * 提供内存缓存功能，支持TTL和统计
 *
 * @version 4.0.0
 * @date 2025-09-10
 */

class CacheManager {
  constructor () {
    this.cache = new Map()
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    }

    // 只在非测试环境启动自动清理
    // 避免在Jest测试中导致超时问题
    if (process.env.NODE_ENV !== 'test' && typeof jest === 'undefined') {
      // 每10分钟清理一次过期缓存
      this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000)
    }
  }

  /**
   * 设置缓存
   */
  async set (key, value, ttl = 300) {
    const expireAt = Date.now() + ttl * 1000
    this.cache.set(key, {
      value,
      expireAt
    })
    this.stats.sets++
    return true
  }

  /**
   * 获取缓存
   */
  async get (key) {
    const item = this.cache.get(key)

    if (!item) {
      this.stats.misses++
      return null
    }

    if (Date.now() > item.expireAt) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return item.value
  }

  /**
   * 删除缓存
   */
  async delete (key) {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.deletes++
    }
    return deleted
  }

  /**
   * 清理过期缓存
   */
  cleanup () {
    const now = Date.now()
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
   */
  async getStats () {
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
   */
  clear () {
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
   */
  destroy () {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }
}

module.exports = CacheManager
