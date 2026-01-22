/**
 * 带缓存的 API 请求模块
 * 解决：重复的 API 请求、数据重复加载
 * 
 * @file public/admin/js/core/api-cached.js
 * @description 在 apiRequest 基础上增加缓存层，自动管理缓存失效
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // GET 请求自动缓存
 * const users = await CachedAPI.get('/api/v4/console/users', { cache: true })
 * 
 * // POST 请求自动清除相关缓存
 * await CachedAPI.post('/api/v4/console/users', data, {
 *   invalidateCache: ['/api/v4/console/users*']
 * })
 */

const CachedAPI = {
  // ========== 配置 ==========
  
  /** 默认缓存时间（5分钟） */
  defaultTTL: 5 * 60 * 1000,
  
  /** 不同 API 类型的缓存时间配置 */
  ttlConfig: {
    // 静态数据（30分钟）
    static: 30 * 60 * 1000,
    // 字典/角色等半静态数据（10分钟）
    dictionary: 10 * 60 * 1000,
    // 统计数据（5分钟）
    stats: 5 * 60 * 1000,
    // 列表数据（2分钟）
    list: 2 * 60 * 1000,
    // 实时数据（30秒）
    realtime: 30 * 1000
  },
  
  // ========== 核心方法 ==========
  
  /**
   * 带缓存的 GET 请求
   * 
   * @param {string} url - API 地址
   * @param {Object} options - 配置选项
   * @param {boolean} [options.cache=true] - 是否启用缓存
   * @param {number} [options.ttl] - 缓存时间（毫秒）
   * @param {boolean} [options.forceRefresh=false] - 是否强制刷新
   * @param {string} [options.cacheKey] - 自定义缓存键（默认使用 URL）
   * @param {string} [options.cacheType] - 缓存类型（用于确定 TTL）
   * @returns {Promise<Object>} API 响应
   * 
   * @example
   * // 使用默认缓存
   * const data = await CachedAPI.get('/api/v4/console/roles')
   * 
   * // 强制刷新
   * const freshData = await CachedAPI.get('/api/v4/console/roles', { forceRefresh: true })
   * 
   * // 自定义缓存时间
   * const stats = await CachedAPI.get('/api/v4/console/stats', { 
   *   ttl: 60 * 1000,  // 1分钟
   *   cacheType: 'stats' 
   * })
   */
  async get(url, options = {}) {
    const { 
      cache = true, 
      ttl,
      forceRefresh = false,
      cacheKey = url,
      cacheType
    } = options
    
    // 确定缓存时间
    const cacheTTL = ttl || this._getTTLByType(url, cacheType)
    
    // 检查缓存
    if (cache && !forceRefresh && typeof DataCache !== 'undefined') {
      const cached = DataCache.get(cacheKey)
      if (cached) {
        console.log(`[CachedAPI] GET (缓存): ${url}`)
        return cached
      }
    }
    
    // 发起请求
    console.log(`[CachedAPI] GET (请求): ${url}`)
    const response = await apiRequest(url)
    
    // 成功时缓存结果
    if (response?.success && cache && typeof DataCache !== 'undefined') {
      DataCache.set(cacheKey, response, cacheTTL)
    }
    
    return response
  },
  
  /**
   * POST 请求（自动清除相关缓存）
   * 
   * @param {string} url - API 地址
   * @param {Object} data - 请求数据
   * @param {Object} options - 配置选项
   * @param {Array<string>} [options.invalidateCache=[]] - 需要清除的缓存键
   * @returns {Promise<Object>} API 响应
   * 
   * @example
   * await CachedAPI.post('/api/v4/console/users', userData, {
   *   invalidateCache: [
   *     '/api/v4/console/users',     // 精确匹配
   *     '/api/v4/console/users/*'    // 前缀匹配
   *   ]
   * })
   */
  async post(url, data = {}, options = {}) {
    const { invalidateCache = [] } = options
    
    console.log(`[CachedAPI] POST: ${url}`)
    const response = await apiRequest(url, {
      method: 'POST',
      body: JSON.stringify(data)
    })
    
    // 成功后清除相关缓存
    if (response?.success) {
      this._invalidateCache(invalidateCache, url)
    }
    
    return response
  },
  
  /**
   * PUT 请求（自动清除相关缓存）
   * 
   * @param {string} url - API 地址
   * @param {Object} data - 请求数据
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} API 响应
   */
  async put(url, data = {}, options = {}) {
    const { invalidateCache = [] } = options
    
    console.log(`[CachedAPI] PUT: ${url}`)
    const response = await apiRequest(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    
    if (response?.success) {
      this._invalidateCache(invalidateCache, url)
    }
    
    return response
  },
  
  /**
   * DELETE 请求（自动清除相关缓存）
   * 
   * @param {string} url - API 地址
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} API 响应
   */
  async delete(url, options = {}) {
    const { invalidateCache = [] } = options
    
    console.log(`[CachedAPI] DELETE: ${url}`)
    const response = await apiRequest(url, {
      method: 'DELETE'
    })
    
    if (response?.success) {
      this._invalidateCache(invalidateCache, url)
    }
    
    return response
  },
  
  // ========== 便捷方法 ==========
  
  /**
   * 清除指定模块的所有缓存
   * 
   * @param {string} module - 模块名（如 users, roles, prizes）
   * 
   * @example
   * // 用户数据变更后清除所有用户相关缓存
   * CachedAPI.invalidateModule('users')
   */
  invalidateModule(module) {
    if (typeof DataCache === 'undefined') return
    
    const patterns = [
      `/api/v4/${module}`,
      `/api/v4/console/${module}`,
      `${module}_`
    ]
    
    patterns.forEach(prefix => {
      DataCache.deleteByPrefix(prefix)
    })
    
    console.log(`[CachedAPI] 清除模块缓存: ${module}`)
  },
  
  /**
   * 清除所有 API 缓存
   */
  clearAll() {
    if (typeof DataCache === 'undefined') return
    
    DataCache.deleteByPrefix('/api/')
    console.log('[CachedAPI] 清除所有 API 缓存')
  },
  
  /**
   * 预加载数据到缓存
   * 
   * @param {Array<{url: string, options?: Object}>} requests - 要预加载的请求列表
   * @returns {Promise<void>}
   * 
   * @example
   * // 页面初始化时预加载常用数据
   * await CachedAPI.preload([
   *   { url: '/api/v4/console/roles' },
   *   { url: '/api/v4/console/dictionaries' }
   * ])
   */
  async preload(requests) {
    console.log(`[CachedAPI] 预加载 ${requests.length} 个请求...`)
    
    const promises = requests.map(({ url, options = {} }) => 
      this.get(url, { ...options, cache: true }).catch(err => {
        console.warn(`[CachedAPI] 预加载失败: ${url}`, err)
        return null
      })
    )
    
    await Promise.all(promises)
    console.log('[CachedAPI] 预加载完成')
  },
  
  // ========== 私有方法 ==========
  
  /**
   * 根据 URL 或类型确定缓存时间
   * @private
   */
  _getTTLByType(url, cacheType) {
    if (cacheType && this.ttlConfig[cacheType]) {
      return this.ttlConfig[cacheType]
    }
    
    // 根据 URL 自动判断类型
    if (url.includes('/roles') || url.includes('/dictionaries')) {
      return this.ttlConfig.dictionary
    }
    if (url.includes('/stats') || url.includes('/dashboard') || url.includes('/analytics')) {
      return this.ttlConfig.stats
    }
    if (url.includes('/config') || url.includes('/settings')) {
      return this.ttlConfig.static
    }
    
    return this.ttlConfig.list
  },
  
  /**
   * 清除缓存
   * @private
   */
  _invalidateCache(cacheKeys, currentUrl) {
    if (typeof DataCache === 'undefined') return
    
    // 自动清除当前 URL 的缓存
    DataCache.delete(currentUrl)
    
    // 清除指定的缓存键
    cacheKeys.forEach(key => {
      if (key.endsWith('*')) {
        // 前缀匹配
        DataCache.deleteByPrefix(key.slice(0, -1))
      } else {
        // 精确匹配
        DataCache.delete(key)
      }
    })
    
    // 根据 URL 自动推断需要清除的缓存
    const module = this._extractModule(currentUrl)
    if (module) {
      DataCache.deleteByPrefix(`/api/v4/${module}`)
      DataCache.deleteByPrefix(`/api/v4/console/${module}`)
    }
  },
  
  /**
   * 从 URL 提取模块名
   * @private
   */
  _extractModule(url) {
    const match = url.match(/\/api\/v\d+(?:\/console)?\/(\w+)/)
    return match ? match[1] : null
  }
}

// 导出到全局作用域
window.CachedAPI = CachedAPI

console.log('✅ CachedAPI 缓存请求模块已加载')

