/**
 * 用户解析 Mixin
 *
 * @description 提供手机号→用户解析能力，内置前端缓存和格式校验。
 * 与 createPageMixin 组合使用。
 *
 * @module alpine/mixins/user-resolver
 * @version 1.0.0
 * @since 2026-02-06（手机号主导搜索改造）
 *
 * @example
 * import { createPageMixin } from './index.js'
 *
 * function myPage() {
 *   return createPageMixin({
 *     userResolver: true
 *   }, {
 *     filters: { mobile: '' },
 *     async searchByMobile() {
 *       const user = await this.resolveUserByMobile(this.filters.mobile)
 *       if (!user) return
 *       await this.loadData({ user_id: user.user_id })
 *     }
 *   })
 * }
 */

import { UserAPI } from '../../api/user.js'
import { logger } from '../../utils/logger.js'

// 页面会话级缓存（刷新即失效）
const resolveCache = new Map()

/**
 * 用户解析 Mixin 工厂函数
 *
 * @returns {Object} mixin 对象，包含 resolvedUser、resolving、resolveError 状态
 *                   以及 resolveUserByMobile、isValidMobile、clearResolvedUser 方法
 */
export function userResolverMixin() {
  return {
    /** @type {Object|null} 解析后的用户信息 { user_id, mobile, nickname, status, avatar_url, user_level } */
    resolvedUser: null,
    /** @type {boolean} 是否正在解析中 */
    resolving: false,
    /** @type {string} 解析错误信息 */
    resolveError: '',

    /**
     * 手机号格式校验（11位数字，1开头）
     * @param {string} mobile - 手机号
     * @returns {boolean} 是否合法
     */
    isValidMobile(mobile) {
      return /^1\d{10}$/.test(mobile)
    },

    /**
     * 手机号精确解析 → 获取用户信息
     * @param {string} mobile - 手机号
     * @returns {Promise<Object|null>} 成功返回 { user_id, mobile, nickname, status, avatar_url, user_level }，失败返回 null
     */
    async resolveUserByMobile(mobile) {
      if (!mobile) {
        this.resolveError = '请输入手机号'
        return null
      }

      const trimmed = mobile.trim()
      if (!this.isValidMobile(trimmed)) {
        this.resolveError = '请输入11位手机号'
        return null
      }

      // 命中缓存
      if (resolveCache.has(trimmed)) {
        this.resolvedUser = resolveCache.get(trimmed)
        this.resolveError = ''
        logger.debug('[UserResolver] 缓存命中:', trimmed)
        return this.resolvedUser
      }

      this.resolving = true
      this.resolveError = ''

      try {
        const result = await UserAPI.resolveUser({ mobile: trimmed })
        if (result.success && result.data) {
          this.resolvedUser = result.data
          resolveCache.set(trimmed, result.data)
          logger.info('[UserResolver] 解析成功:', trimmed, '→', result.data.nickname)
          return result.data
        } else {
          this.resolveError = result.message || '未找到该手机号对应的用户'
          this.resolvedUser = null
          return null
        }
      } catch (error) {
        this.resolveError = error.message || '解析失败'
        this.resolvedUser = null
        logger.error('[UserResolver] 解析失败:', trimmed, error.message)
        return null
      } finally {
        this.resolving = false
      }
    },

    /**
     * 清空解析结果和错误
     */
    clearResolvedUser() {
      this.resolvedUser = null
      this.resolveError = ''
    }
  }
}

