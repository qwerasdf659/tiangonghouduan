/**
 * 页面状态管理 Store
 * 解决：页面切换后状态丢失、无法保持筛选条件
 *
 * @file public/admin/js/alpine/stores/page-state.js
 * @description 提供页面状态的持久化和恢复
 * @version 1.1.0
 * @date 2026-01-23
 * @updated 2026-02-03 - P1-16: 添加缓存失效策略
 *
 * @example
 * // 保存页面状态
 * Alpine.store('pageState').save('users', {
 *   filters: this.filters,
 *   current_page: this.current_page,
 *   page_size: this.page_size
 * })
 *
 * // 恢复页面状态
 * const state = Alpine.store('pageState').restore('users')
 * if (state) {
 *   this.filters = state.filters
 *   this.current_page = state.current_page
 * }
 *
 * // P1-16: 缓存失效
 * Alpine.store('pageState').invalidateByPattern('user_')  // 失效所有用户相关缓存
 * Alpine.store('pageState').invalidateOnDataChange('consumption', recordId)  // 数据变更时失效
 */

import { logger } from '../../utils/logger.js'

// P1-16: 缓存失效策略配置
const CACHE_INVALIDATION_RULES = {
  // 数据变更时失效相关缓存
  consumption: ['consumption', 'finance', 'dashboard', 'pending'],
  lottery: ['lottery', 'campaign', 'dashboard', 'alerts'],
  user: ['user', 'customer', 'segment'],
  alert: ['alert', 'risk', 'lottery-alert'],
  // 操作类型触发的失效
  create: (type) => [`${type}`, 'dashboard', 'stats'],
  update: (type) => [`${type}`],
  delete: (type) => [`${type}`, 'dashboard', 'stats']
}

document.addEventListener('alpine:init', () => {
  logger.info('🔧 注册页面状态 Store...')

  /**
   * 页面状态 Store
   */
  Alpine.store('pageState', {
    // ========== 配置 ==========

    /** 存储键前缀 */
    prefix: 'page_state_',

    /** 默认过期时间（1小时） */
    defaultTTL: 60 * 60 * 1000,

    // ========== 方法 ==========

    /**
     * 保存页面状态
     *
     * @param {string} pageKey - 页面标识
     * @param {Object} state - 状态数据
     * @param {number} [ttl] - 过期时间（毫秒）
     */
    save(pageKey, state, ttl = this.defaultTTL) {
      const key = this.prefix + pageKey
      const data = {
        state,
        savedAt: Date.now(),
        expireAt: Date.now() + ttl
      }

      try {
        sessionStorage.setItem(key, JSON.stringify(data))
        logger.info(`[PageState] 保存: ${pageKey}`)
      } catch (e) {
        logger.warn(`[PageState] 保存失败: ${pageKey}`, e)
      }
    },

    /**
     * 恢复页面状态
     *
     * @param {string} pageKey - 页面标识
     * @returns {Object|null} 状态数据或 null
     */
    restore(pageKey) {
      const key = this.prefix + pageKey

      try {
        const json = sessionStorage.getItem(key)
        if (!json) return null

        const data = JSON.parse(json)

        // 检查是否过期
        if (Date.now() > data.expireAt) {
          sessionStorage.removeItem(key)
          logger.info(`[PageState] 已过期: ${pageKey}`)
          return null
        }

        logger.info(`[PageState] 恢复: ${pageKey}`)
        return data.state
      } catch (e) {
        logger.warn(`[PageState] 恢复失败: ${pageKey}`, e)
        return null
      }
    },

    /**
     * 清除页面状态
     *
     * @param {string} pageKey - 页面标识
     */
    clear(pageKey) {
      const key = this.prefix + pageKey
      sessionStorage.removeItem(key)
      logger.info(`[PageState] 清除: ${pageKey}`)
    },

    /**
     * 清除所有页面状态
     */
    clearAll() {
      const keysToRemove = []

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach(key => sessionStorage.removeItem(key))
      logger.info(`[PageState] 清除所有: ${keysToRemove.length} 条`)
    },

    /**
     * 检查是否有保存的状态
     *
     * @param {string} pageKey - 页面标识
     * @returns {boolean}
     */
    has(pageKey) {
      const key = this.prefix + pageKey
      const json = sessionStorage.getItem(key)

      if (!json) return false

      try {
        const data = JSON.parse(json)
        return Date.now() <= data.expireAt
      } catch {
        return false
      }
    },

    /**
     * 更新部分状态
     *
     * @param {string} pageKey - 页面标识
     * @param {Object} partialState - 部分状态
     */
    update(pageKey, partialState) {
      const currentState = this.restore(pageKey) || {}
      const newState = { ...currentState, ...partialState }
      this.save(pageKey, newState)
    },

    /**
     * 自动保存和恢复辅助方法
     * 返回一个对象，包含用于组件的方法
     *
     * @param {string} pageKey - 页面标识
     * @param {string[]} fields - 要保存的字段列表
     * @returns {Object}
     */
    createAutoSaver(pageKey, fields) {
      const store = this

      return {
        /**
         * 从组件中保存指定字段
         * @param {Object} component - Alpine 组件 this
         */
        save(component) {
          const state = {}
          fields.forEach(field => {
            if (field in component) {
              state[field] = component[field]
            }
          })
          store.save(pageKey, state)
        },

        /**
         * 恢复状态到组件
         * @param {Object} component - Alpine 组件 this
         */
        restore(component) {
          const state = store.restore(pageKey)
          if (state) {
            fields.forEach(field => {
              if (field in state) {
                component[field] = state[field]
              }
            })
          }
          return state
        }
      }
    },

    // ==================== P1-16: 缓存失效策略 ====================

    /**
     * P1-16: 按模式失效缓存
     * @description 失效所有匹配指定前缀的缓存
     * @param {string} pattern - 缓存键前缀模式
     */
    invalidateByPattern(pattern) {
      const keysToRemove = []
      const fullPattern = this.prefix + pattern

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(fullPattern)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach(key => sessionStorage.removeItem(key))
      logger.info(`[PageState] 按模式失效: ${pattern}, 清除 ${keysToRemove.length} 条`)
      return keysToRemove.length
    },

    /**
     * P1-16: 数据变更时失效相关缓存
     * @description 当特定类型数据变更时，自动失效相关缓存
     * @param {string} dataType - 数据类型（consumption/lottery/user/alert）
     * @param {string|number} [recordId] - 变更的记录ID（可选）
     * @param {string} [operation='update'] - 操作类型（create/update/delete）
     */
    invalidateOnDataChange(dataType, recordId = null, operation = 'update') {
      // 获取关联的缓存键
      const relatedKeys = CACHE_INVALIDATION_RULES[dataType] || []
      const operationKeys = typeof CACHE_INVALIDATION_RULES[operation] === 'function'
        ? CACHE_INVALIDATION_RULES[operation](dataType)
        : []

      // 合并所有需要失效的键
      const allKeys = [...new Set([...relatedKeys, ...operationKeys])]

      let totalCleared = 0
      allKeys.forEach(keyPattern => {
        totalCleared += this.invalidateByPattern(keyPattern)
      })

      logger.info(`[PageState] 数据变更失效: ${dataType}${recordId ? '#' + recordId : ''}, 操作: ${operation}, 清除 ${totalCleared} 条`)
      return totalCleared
    },

    /**
     * P1-16: 强制刷新缓存
     * @description 清除所有缓存并触发页面重新加载数据
     */
    forceRefresh() {
      this.clearAll()
      logger.info('[PageState] 强制刷新: 所有缓存已清除')
      
      // 触发全局事件，让页面组件重新加载数据
      window.dispatchEvent(new CustomEvent('cache-invalidated', {
        detail: { timestamp: Date.now() }
      }))
    },

    /**
     * P1-16: 获取缓存统计信息
     * @returns {Object} 缓存统计
     */
    getStats() {
      let totalCount = 0
      let expiredCount = 0
      let totalSize = 0
      const now = Date.now()

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          totalCount++
          const json = sessionStorage.getItem(key)
          if (json) {
            totalSize += json.length
            try {
              const data = JSON.parse(json)
              if (now > data.expireAt) {
                expiredCount++
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      return {
        total: totalCount,
        expired: expiredCount,
        active: totalCount - expiredCount,
        sizeBytes: totalSize,
        sizeKB: (totalSize / 1024).toFixed(2)
      }
    },

    /**
     * P1-16: 清理过期缓存
     * @description 自动清理已过期的缓存条目
     * @returns {number} 清理的条目数
     */
    cleanupExpired() {
      const keysToRemove = []
      const now = Date.now()

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          try {
            const json = sessionStorage.getItem(key)
            const data = JSON.parse(json)
            if (now > data.expireAt) {
              keysToRemove.push(key)
            }
          } catch {
            // 解析失败的也清理
            keysToRemove.push(key)
          }
        }
      }

      keysToRemove.forEach(key => sessionStorage.removeItem(key))
      logger.info(`[PageState] 清理过期缓存: ${keysToRemove.length} 条`)
      return keysToRemove.length
    }
  })

  // P1-16: 页面加载时自动清理过期缓存
  setTimeout(() => {
    const store = Alpine.store('pageState')
    if (store) {
      const cleaned = store.cleanupExpired()
      if (cleaned > 0) {
        logger.info(`[PageState] 自动清理了 ${cleaned} 条过期缓存`)
      }
    }
  }, 1000)

  logger.info('页面状态 Store 已注册')
})

logger.info('页面状态模块已加载')
