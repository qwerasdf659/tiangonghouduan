/**
 * 页面状态管理 Store
 * 解决：页面切换后状态丢失、无法保持筛选条件
 *
 * @file public/admin/js/alpine/stores/page-state.js
 * @description 提供页面状态的持久化和恢复
 * @version 1.0.0
 * @date 2026-01-23
 *
 * @example
 * // 保存页面状态
 * Alpine.store('pageState').save('users', {
 *   filters: this.filters,
 *   currentPage: this.currentPage,
 *   pageSize: this.pageSize
 * })
 *
 * // 恢复页面状态
 * const state = Alpine.store('pageState').restore('users')
 * if (state) {
 *   this.filters = state.filters
 *   this.currentPage = state.currentPage
 * }
 */

import { logger } from '../../utils/logger.js'
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
    }
  })

  logger.info('页面状态 Store 已注册')
})

logger.info('页面状态模块已加载')
