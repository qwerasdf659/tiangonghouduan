/**
 * 数据缓存模块
 * 解决：API 重复请求、数据重复加载
 * 
 * @file public/admin/js/core/cache.js
 * @description 提供内存级别的数据缓存，支持 TTL 过期和前缀批量删除
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 设置缓存
 * DataCache.set('users_list', userData, 5 * 60 * 1000) // 5分钟过期
 * 
 * // 获取缓存
 * const cached = DataCache.get('users_list')
 * if (cached) {
 *   console.log('使用缓存数据')
 * }
 * 
 * // 删除相关缓存
 * DataCache.deleteByPrefix('users_') // 删除所有 users_ 开头的缓存
 */

const DataCache = {
  // ========== 私有属性 ==========
  
  /** 缓存存储 */
  _store: new Map(),
  
  /** 默认过期时间（5分钟） */
  defaultTTL: 5 * 60 * 1000,
  
  /** 最大缓存条目数 */
  maxSize: 500,
  
  /** 统计信息 */
  _stats: {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  },
  
  // ========== 核心方法 ==========
  
  /**
   * 设置缓存
   * 
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {number} [ttl] - 过期时间（毫秒），默认 5 分钟
   * @returns {boolean} 是否设置成功
   * 
   * @example
   * DataCache.set('user_123', { name: 'John' }, 10 * 60 * 1000)
   */
  set(key, value, ttl = this.defaultTTL) {
    // 检查容量限制
    if (this._store.size >= this.maxSize) {
      this._evictOldest()
    }
    
    const item = {
      value,
      expireAt: Date.now() + ttl,
      createdAt: Date.now(),
      accessCount: 0
    }
    
    this._store.set(key, item)
    this._stats.sets++
    
    console.log(`[DataCache] SET: ${key} (TTL: ${Math.round(ttl/1000)}s)`)
    return true
  },
  
  /**
   * 获取缓存
   * 
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存值或 null（不存在或已过期）
   * 
   * @example
   * const user = DataCache.get('user_123')
   * if (user) {
   *   // 使用缓存数据
   * }
   */
  get(key) {
    const item = this._store.get(key)
    
    if (!item) {
      this._stats.misses++
      return null
    }
    
    // 检查是否过期
    if (Date.now() > item.expireAt) {
      this._store.delete(key)
      this._stats.misses++
      console.log(`[DataCache] EXPIRED: ${key}`)
      return null
    }
    
    // 更新访问计数
    item.accessCount++
    this._stats.hits++
    
    console.log(`[DataCache] HIT: ${key} (访问次数: ${item.accessCount})`)
    return item.value
  },
  
  /**
   * 检查缓存是否存在且有效
   * 
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null
  },
  
  /**
   * 删除缓存
   * 
   * @param {string} key - 缓存键
   * @returns {boolean} 是否删除成功
   */
  delete(key) {
    const result = this._store.delete(key)
    if (result) {
      this._stats.deletes++
      console.log(`[DataCache] DELETE: ${key}`)
    }
    return result
  },
  
  /**
   * 删除匹配前缀的所有缓存
   * 
   * @param {string} prefix - 键前缀
   * @returns {number} 删除的条目数
   * 
   * @example
   * // 当用户数据变更时，删除所有用户相关缓存
   * DataCache.deleteByPrefix('users_')
   */
  deleteByPrefix(prefix) {
    let count = 0
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key)
        count++
      }
    }
    
    if (count > 0) {
      this._stats.deletes += count
      console.log(`[DataCache] DELETE BY PREFIX: ${prefix}* (${count} 条)`)
    }
    
    return count
  },
  
  /**
   * 删除匹配正则表达式的所有缓存
   * 
   * @param {RegExp} pattern - 正则表达式
   * @returns {number} 删除的条目数
   */
  deleteByPattern(pattern) {
    let count = 0
    for (const key of this._store.keys()) {
      if (pattern.test(key)) {
        this._store.delete(key)
        count++
      }
    }
    
    if (count > 0) {
      this._stats.deletes += count
      console.log(`[DataCache] DELETE BY PATTERN: ${pattern} (${count} 条)`)
    }
    
    return count
  },
  
  /**
   * 清空所有缓存
   */
  clear() {
    const count = this._store.size
    this._store.clear()
    console.log(`[DataCache] CLEAR: 清空 ${count} 条缓存`)
  },
  
  /**
   * 清理过期缓存
   * 
   * @returns {number} 清理的条目数
   */
  cleanup() {
    const now = Date.now()
    let count = 0
    
    for (const [key, item] of this._store.entries()) {
      if (now > item.expireAt) {
        this._store.delete(key)
        count++
      }
    }
    
    if (count > 0) {
      console.log(`[DataCache] CLEANUP: 清理 ${count} 条过期缓存`)
    }
    
    return count
  },
  
  /**
   * 淘汰最旧的缓存条目（LRU 策略）
   * @private
   */
  _evictOldest() {
    let oldestKey = null
    let oldestTime = Infinity
    
    for (const [key, item] of this._store.entries()) {
      if (item.createdAt < oldestTime) {
        oldestTime = item.createdAt
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this._store.delete(oldestKey)
      console.log(`[DataCache] EVICT: ${oldestKey} (容量限制)`)
    }
  },
  
  // ========== 便捷方法 ==========
  
  /**
   * 获取或设置缓存（如果不存在则执行 getter 并缓存结果）
   * 
   * @param {string} key - 缓存键
   * @param {Function} getter - 获取数据的函数（异步）
   * @param {number} [ttl] - 过期时间
   * @returns {Promise<any>} 缓存或新获取的数据
   * 
   * @example
   * const users = await DataCache.getOrSet('users_list', async () => {
   *   const response = await apiRequest('/api/users')
   *   return response.data
   * }, 5 * 60 * 1000)
   */
  async getOrSet(key, getter, ttl = this.defaultTTL) {
    const cached = this.get(key)
    if (cached !== null) {
      return cached
    }
    
    const value = await getter()
    this.set(key, value, ttl)
    return value
  },
  
  /**
   * 刷新缓存（删除后重新获取）
   * 
   * @param {string} key - 缓存键
   * @param {Function} getter - 获取数据的函数
   * @param {number} [ttl] - 过期时间
   * @returns {Promise<any>}
   */
  async refresh(key, getter, ttl = this.defaultTTL) {
    this.delete(key)
    const value = await getter()
    this.set(key, value, ttl)
    return value
  },
  
  // ========== 统计信息 ==========
  
  /**
   * 获取缓存统计信息
   * 
   * @returns {Object} 统计信息
   */
  stats() {
    const hitRate = this._stats.hits + this._stats.misses > 0
      ? (this._stats.hits / (this._stats.hits + this._stats.misses) * 100).toFixed(1)
      : '0.0'
    
    return {
      size: this._store.size,
      maxSize: this.maxSize,
      hits: this._stats.hits,
      misses: this._stats.misses,
      hitRate: `${hitRate}%`,
      sets: this._stats.sets,
      deletes: this._stats.deletes,
      keys: Array.from(this._store.keys())
    }
  },
  
  /**
   * 打印统计信息到控制台
   */
  printStats() {
    const stats = this.stats()
    console.log('📊 DataCache 统计信息:')
    console.log(`   大小: ${stats.size}/${stats.maxSize}`)
    console.log(`   命中: ${stats.hits} | 未命中: ${stats.misses} | 命中率: ${stats.hitRate}`)
    console.log(`   设置: ${stats.sets} | 删除: ${stats.deletes}`)
  },
  
  /**
   * 重置统计信息
   */
  resetStats() {
    this._stats = { hits: 0, misses: 0, sets: 0, deletes: 0 }
  }
}

// 定期清理过期缓存（每分钟）
setInterval(() => DataCache.cleanup(), 60 * 1000)

// 导出到全局作用域
window.DataCache = DataCache

console.log('✅ DataCache 数据缓存模块已加载')

