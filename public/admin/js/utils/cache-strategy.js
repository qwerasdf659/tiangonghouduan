/**
 * 缓存策略模块
 * 提供多种缓存策略和自动失效机制
 * 
 * @file public/admin/js/utils/cache-strategy.js
 * @description 定义缓存策略类型、自动失效规则和缓存预热
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 使用静态数据策略
 * const roles = await CacheStrategy.fetch('roles', loadRoles, CacheStrategy.Types.STATIC)
 * 
 * // 注册数据变更后自动失效
 * CacheStrategy.registerInvalidation('users', ['user_*', 'stats_*'])
 */

const CacheStrategy = {
  // ========== 策略类型 ==========
  
  /**
   * 缓存策略类型
   */
  Types: {
    /** 静态数据：很少变化，长期缓存（30分钟） */
    STATIC: 'static',
    
    /** 字典数据：偶尔变化，中等缓存（10分钟） */
    DICTIONARY: 'dictionary',
    
    /** 统计数据：定期更新，短期缓存（5分钟） */
    STATISTICS: 'statistics',
    
    /** 列表数据：频繁变化，短期缓存（2分钟） */
    LIST: 'list',
    
    /** 实时数据：频繁变化，很短缓存（30秒） */
    REALTIME: 'realtime',
    
    /** 不缓存 */
    NONE: 'none'
  },
  
  /**
   * 各策略对应的 TTL（毫秒）
   */
  TTL: {
    static: 30 * 60 * 1000,      // 30分钟
    dictionary: 10 * 60 * 1000,   // 10分钟
    statistics: 5 * 60 * 1000,    // 5分钟
    list: 2 * 60 * 1000,          // 2分钟
    realtime: 30 * 1000,          // 30秒
    none: 0
  },
  
  // ========== 失效规则 ==========
  
  /** 缓存失效规则映射 { 模块: [要失效的缓存前缀] } */
  _invalidationRules: {},
  
  /**
   * 注册缓存失效规则
   * 当某模块数据变更时，自动失效相关缓存
   * 
   * @param {string} module - 模块名
   * @param {string[]} cachePatterns - 要失效的缓存模式列表
   * 
   * @example
   * // 当用户数据变更时，失效用户相关缓存和统计缓存
   * CacheStrategy.registerInvalidation('users', [
   *   'users_*',
   *   'stats_users',
   *   'dashboard_*'
   * ])
   */
  registerInvalidation(module, cachePatterns) {
    this._invalidationRules[module] = cachePatterns
    console.log(`[CacheStrategy] 注册失效规则: ${module} -> ${cachePatterns.join(', ')}`)
  },
  
  /**
   * 触发缓存失效
   * 
   * @param {string} module - 模块名
   */
  invalidate(module) {
    const patterns = this._invalidationRules[module]
    
    if (!patterns || !window.DataCache) {
      return
    }
    
    console.log(`[CacheStrategy] 触发失效: ${module}`)
    
    patterns.forEach(pattern => {
      if (pattern.endsWith('*')) {
        // 前缀匹配
        window.DataCache.deleteByPrefix(pattern.slice(0, -1))
      } else {
        // 精确匹配
        window.DataCache.delete(pattern)
      }
    })
  },
  
  // ========== 核心方法 ==========
  
  /**
   * 获取策略对应的 TTL
   * 
   * @param {string} strategyType - 策略类型
   * @returns {number} TTL（毫秒）
   */
  getTTL(strategyType) {
    return this.TTL[strategyType] || this.TTL.list
  },
  
  /**
   * 根据策略获取缓存数据
   * 
   * @param {string} key - 缓存键
   * @param {Function} fetcher - 数据获取函数
   * @param {string} [strategyType='list'] - 策略类型
   * @param {Object} [options={}] - 额外选项
   * @param {boolean} [options.forceRefresh=false] - 强制刷新
   * @returns {Promise<any>}
   * 
   * @example
   * const users = await CacheStrategy.fetch('users_list', loadUsers, 'list')
   */
  async fetch(key, fetcher, strategyType = 'list', options = {}) {
    const { forceRefresh = false } = options
    const ttl = this.getTTL(strategyType)
    
    // 不缓存策略
    if (strategyType === this.Types.NONE || ttl === 0) {
      console.log(`[CacheStrategy] 跳过缓存: ${key}`)
      return await fetcher()
    }
    
    // 检查 DataCache 是否可用
    if (!window.DataCache) {
      console.warn('[CacheStrategy] DataCache 不可用，直接获取数据')
      return await fetcher()
    }
    
    // 强制刷新
    if (forceRefresh) {
      window.DataCache.delete(key)
    }
    
    // 使用缓存
    return await window.DataCache.getOrSet(key, fetcher, ttl)
  },
  
  /**
   * 批量预热缓存
   * 
   * @param {Array<{key: string, fetcher: Function, strategy: string}>} items
   * @returns {Promise<void>}
   * 
   * @example
   * await CacheStrategy.preheat([
   *   { key: 'roles', fetcher: loadRoles, strategy: 'dictionary' },
   *   { key: 'settings', fetcher: loadSettings, strategy: 'static' }
   * ])
   */
  async preheat(items) {
    console.log(`[CacheStrategy] 预热 ${items.length} 个缓存项...`)
    
    const promises = items.map(({ key, fetcher, strategy }) => 
      this.fetch(key, fetcher, strategy).catch(err => {
        console.warn(`[CacheStrategy] 预热失败: ${key}`, err)
        return null
      })
    )
    
    await Promise.all(promises)
    console.log('[CacheStrategy] 预热完成')
  },
  
  // ========== 便捷方法 ==========
  
  /**
   * 获取静态数据（长期缓存）
   */
  async fetchStatic(key, fetcher, options) {
    return this.fetch(key, fetcher, this.Types.STATIC, options)
  },
  
  /**
   * 获取字典数据（中等缓存）
   */
  async fetchDictionary(key, fetcher, options) {
    return this.fetch(key, fetcher, this.Types.DICTIONARY, options)
  },
  
  /**
   * 获取统计数据（短期缓存）
   */
  async fetchStatistics(key, fetcher, options) {
    return this.fetch(key, fetcher, this.Types.STATISTICS, options)
  },
  
  /**
   * 获取列表数据（短期缓存）
   */
  async fetchList(key, fetcher, options) {
    return this.fetch(key, fetcher, this.Types.LIST, options)
  },
  
  /**
   * 获取实时数据（很短缓存）
   */
  async fetchRealtime(key, fetcher, options) {
    return this.fetch(key, fetcher, this.Types.REALTIME, options)
  },
  
  // ========== 初始化 ==========
  
  /**
   * 初始化默认失效规则
   */
  initDefaultRules() {
    // 用户相关
    this.registerInvalidation('users', [
      'users_*',
      'user_*',
      'stats_users',
      'dashboard_*'
    ])
    
    // 奖品相关
    this.registerInvalidation('prizes', [
      'prizes_*',
      'prize_*',
      'lottery_*',
      'stats_prizes'
    ])
    
    // 订单相关
    this.registerInvalidation('orders', [
      'orders_*',
      'order_*',
      'stats_orders',
      'dashboard_*'
    ])
    
    // 商品相关
    this.registerInvalidation('products', [
      'products_*',
      'product_*',
      'inventory_*',
      'stats_products'
    ])
    
    // 配置相关
    this.registerInvalidation('settings', [
      'settings_*',
      'config_*'
    ])
    
    console.log('[CacheStrategy] 默认失效规则已初始化')
  }
}

// 初始化默认规则
CacheStrategy.initDefaultRules()

// 导出到全局作用域
window.CacheStrategy = CacheStrategy

console.log('✅ CacheStrategy 缓存策略模块已加载')

