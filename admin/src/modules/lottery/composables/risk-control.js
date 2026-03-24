/**
 * 异常用户风控模块
 *
 * @file admin/src/modules/lottery/composables/risk-control.js
 * @description P1优先级 - 异常用户风控面板，显示高频用户、异常中奖、风险等级
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'

/**
 * 风控状态
 * @returns {Object} 状态对象
 */
export function useRiskControlState() {
  return {
    /** @type {Array} 异常用户列表 */
    abnormalUsers: [],
    /** @type {Object} 异常用户统计 */
    abnormalUserStats: {
      total: 0,
      high_frequency: 0,
      high_win_rate: 0,
      high_tier_abnormal: 0,
      rapid_wins: 0
    },
    /** @type {Object} 异常用户筛选条件 */
    abnormalUserFilters: {
      type: 'all',
      page: 1,
      page_size: 20
    },
    /** @type {Object} 异常用户分页 */
    abnormalUserPagination: {
      current_page: 1,
      page_size: 20,
      total_count: 0,
      total_pages: 0
    },
    /** @type {boolean} 加载状态 */
    loadingAbnormalUsers: false,
    /** @type {Object|null} 当前选中的异常用户 */
    selectedAbnormalUser: null,
    /** @type {boolean} 显示用户详情弹窗 */
    showAbnormalUserDetailModal: false
  }
}

/**
 * 风控方法
 * @returns {Object} 方法对象
 */
export function useRiskControlMethods() {
  return {
    /**
     * 加载异常用户列表
     */
    async loadAbnormalUsers() {
      logger.info('[RiskControl] 加载异常用户列表...')
      this.loadingAbnormalUsers = true

      try {
        const params = new URLSearchParams()
        params.append('type', this.abnormalUserFilters.type)
        params.append('page', this.abnormalUserFilters.page)
        params.append('page_size', this.abnormalUserFilters.page_size)

        const url = `${LOTTERY_ENDPOINTS.ABNORMAL_USERS}?${params}`
        const response = await this.apiGet(url, {}, { showLoading: false, showError: true })

        if (response?.success) {
          const data = response.data || {}
          const users = data.users || []
          this.abnormalUsers = users

          // 后端返回 summary（按风险等级统计），前端从 users 计算按类型统计
          const typeCounts = {
            high_frequency: 0,
            high_win_rate: 0,
            high_tier_abnormal: 0,
            rapid_wins: 0
          }
          for (const u of users) {
            const types = u.abnormal_types || [u.abnormal_type]
            for (const t of types) {
              if (typeCounts[t] !== undefined) typeCounts[t]++
            }
          }
          this.abnormalUserStats = {
            total: data.pagination?.total || users.length,
            ...typeCounts
          }

          // 后端分页字段：total, page, page_size, total_pages
          const pg = data.pagination || {}
          this.abnormalUserPagination = {
            current_page: pg.page || 1,
            page_size: pg.page_size || 20,
            total_count: pg.total || 0,
            total_pages: pg.total_pages || 0
          }

          logger.info('[RiskControl] 异常用户加载成功', {
            total: this.abnormalUserStats.total,
            type: this.abnormalUserFilters.type
          })
        } else {
          logger.warn('[RiskControl] 异常用户加载失败:', response?.message)
          this.abnormalUsers = []
        }
      } catch (error) {
        logger.error('[RiskControl] 加载异常用户失败:', error)
        this.abnormalUsers = []
      } finally {
        this.loadingAbnormalUsers = false
      }
    },

    /**
     * 刷新异常用户列表
     */
    async refreshAbnormalUsers() {
      await this.loadAbnormalUsers()
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success('异常用户列表已刷新')
      }
    },

    /**
     * 切换异常用户类型筛选
     * @param {string} type - 异常类型
     */
    async filterAbnormalUsersByType(type) {
      this.abnormalUserFilters.type = type
      this.abnormalUserFilters.page = 1
      await this.loadAbnormalUsers()
    },

    /**
     * 切换异常用户页码
     * @param {number} page - 页码
     */
    async changeAbnormalUsersPage(page) {
      this.abnormalUserFilters.page = page
      await this.loadAbnormalUsers()
    },

    /**
     * 查看异常用户详情
     * @param {Object} user - 用户对象
     */
    viewAbnormalUserDetail(user) {
      this.selectedAbnormalUser = user
      this.showAbnormalUserDetailModal = true
    },

    /**
     * 关闭异常用户详情弹窗
     */
    closeAbnormalUserDetailModal() {
      this.showAbnormalUserDetailModal = false
      this.selectedAbnormalUser = null
    },

    /**
     * 获取异常类型样式
     * @param {string} type - 异常类型
     * @returns {string} CSS 类名
     */
    getAbnormalTypeStyle(type) {
      const styles = {
        high_frequency: 'bg-red-100 text-red-700 border-red-500',
        high_win_rate: 'bg-orange-100 text-orange-700 border-orange-500',
        high_tier_abnormal: 'bg-purple-100 text-purple-700 border-purple-500',
        rapid_wins: 'bg-yellow-100 text-yellow-700 border-yellow-500'
      }
      return styles[type] || 'bg-gray-100 text-gray-700 border-gray-500'
    },

    /**
     * 获取异常类型图标
     * @param {string} type - 异常类型
     * @returns {string} 图标
     */
    getAbnormalTypeIcon(type) {
      const icons = {
        high_frequency: '🔥',
        high_win_rate: '📈',
        high_tier_abnormal: '👑',
        rapid_wins: '⚡'
      }
      return icons[type] || '⚠️'
    },

    /**
     * 获取异常类型文本
     * @param {string} type - 异常类型
     * @returns {string} 中文名称
     */
    // ✅ 已删除 getAbnormalTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取风险等级样式
     * @param {string} level - 风险等级
     * @returns {string} CSS 类名
     */
    getRiskLevelStyle(level) {
      const styles = {
        critical: 'bg-red-500 text-white',
        high: 'bg-orange-500 text-white',
        medium: 'bg-yellow-500 text-white',
        low: 'bg-green-500 text-white'
      }
      return styles[level] || 'bg-gray-500 text-white'
    },

    // ✅ 已删除 getRiskLevelText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 risk_level_display 字段

    /**
     * 格式化时间
     * @param {string} isoString - ISO时间字符串
     * @returns {string} 格式化后的时间
     */
    formatRiskTime(isoString) {
      if (!isoString) return '-'
      try {
        const date = new Date(isoString)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch {
        return isoString
      }
    },

    /**
     * 跳转到用户档案页面
     * @param {number} userId - 用户ID
     */
    async goToUserProfile(userId) {
      if (!userId) return
      this.closeAbnormalUserDetailModal()
      // 加载用户档案并显示模态框
      if (typeof this.openUserProfileModal === 'function') {
        await this.openUserProfileModal(userId)
      } else if (typeof this.loadUserProfile === 'function') {
        await this.loadUserProfile(userId)
        this.showUserProfileModal = true
      }
    }
  }
}

export default { useRiskControlState, useRiskControlMethods }
