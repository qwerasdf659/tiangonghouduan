/**
 * 会话管理页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/system/pages/sessions.js
 * @module SessionsPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 用户会话管理页面，提供以下功能：
 * - 会话列表展示和筛选（按状态/用户类型/用户ID）
 * - 查看会话详情
 * - 撤销单个会话
 * - 批量撤销选中会话
 * - 清理过期会话
 * - 强制下线其他设备
 * - 会话统计数据展示
 *
 * @requires createBatchOperationMixin - 批量操作混入
 * @requires USER_ENDPOINTS - 用户相关API端点
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用
 * <div x-data="sessionsPage">
 *   <table>
 *     <template x-for="session in sessions" :key="session.user_session_id">...</template>
 *   </table>
 * </div>
 */


import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { buildURL, request } from '../../../api/base.js'
import { createBatchOperationMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}
/**
 * 会话对象类型
 * @typedef {Object} UserSession
 * @property {number} user_session_id - 会话ID
 * @property {string} [session_id] - 会话ID别名
 * @property {number} user_id - 用户ID
 * @property {string} user_type - 用户类型 ('user'|'admin')
 * @property {boolean} is_active - 是否活跃
 * @property {boolean} [is_expired] - 是否已过期
 * @property {string} [status] - 状态
 * @property {string} created_at - 创建时间
 * @property {string} last_activity - 最后活跃时间
 * @property {string} [device_info] - 设备信息
 * @property {string} [ip_address] - IP地址
 */

/**
 * 会话统计数据类型
 * @typedef {Object} SessionStatistics
 * @property {number|string} onlineUsers - 在线用户数
 * @property {number|string} activeSessions - 活跃会话数
 * @property {number|string} userSessions - 普通用户会话数
 * @property {number|string} adminSessions - 管理员会话数
 */

/**
 * 会话管理页面Alpine.js组件工厂函数
 * @function sessionsPage
 * @returns {Object} Alpine.js组件配置对象
 */
function sessionsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createBatchOperationMixin({
      pageSize: 20,
      primaryKey: 'user_session_id'
    }),

    // ==================== 页面特有状态 ====================

    /** @type {UserSession[]} 会话列表 */
    sessions: [],

    /** @type {number[]} 选中的会话ID列表 */
    selectedSessions: [],

    /** @type {UserSession|null} 当前选中查看的会话 */
    selectedSession: null,

    /** @type {string|null} 当前登录用户的会话ID */
    currentSessionId: null,

    /** @type {boolean} 全局加载状态 */
    globalLoading: false,

    /**
     * 筛选条件
     * @type {Object}
     * @property {string} status - 状态筛选 ('active'|'expired'|'')
     * @property {string} userType - 用户类型筛选 ('user'|'admin'|'')
     * @property {string} userId - 用户ID筛选
     * @property {string} sortBy - 排序字段
     */
    filters: {
      status: '',
      userType: '',
      userId: '',
      sortBy: 'last_activity'
    },

    /**
     * 会话统计数据
     * @type {SessionStatistics}
     */
    statistics: {
      onlineUsers: '-',
      activeSessions: '-',
      userSessions: '-',
      adminSessions: '-'
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     * @method init
     * @description
     * 组件挂载时自动调用，执行以下初始化流程：
     * 1. 验证登录状态
     * 2. 从JWT Token中解析当前会话ID
     * 3. 加载会话列表
     * @returns {void}
     */
    init() {
      logger.info('会话管理页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 获取当前会话ID
      const token = localStorage.getItem('admin_token')
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          this.currentSessionId = payload.session_id
        } catch (e) {
          logger.error('解析token失败:', e)
        }
      }

      // 加载会话列表
      this.loadData()
    },

    // ==================== 数据加载方法 ====================

    /**
     * 加载会话列表
     * @async
     * @method loadData
     * @param {number|null} [page=null] - 指定页码，null则使用当前页
     * @description 根据筛选条件和分页参数加载会话数据，同时加载统计数据
     * @returns {Promise<void>}
     */
    async loadData(page = null) {
      if (page !== null) {
        this.currentPage = page
      }
      this.selectedSessions = []

      await this.withLoading(async () => {
        const params = new URLSearchParams()
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)
        params.append('sort_by', this.filters.sortBy)
        params.append('sort_order', 'desc')

        if (this.filters.status === 'active') {
          params.append('is_active', 'true')
        } else if (this.filters.status === 'expired') {
          params.append('is_active', 'false')
        }

        if (this.filters.userType) {
          params.append('user_type', this.filters.userType)
        }

        if (this.filters.userId) {
          params.append('user_id', this.filters.userId)
        }

        const url = USER_ENDPOINTS.SESSIONS_LIST + '?' + params.toString()
        const response = await apiRequest(url)

        if (response && response.success) {
          const sessionData = response.data?.sessions || response.data
          this.sessions = Array.isArray(sessionData) ? sessionData : []
          this.total = response.data.pagination?.total || this.sessions.length
          this.loadStats()
        } else {
          this.showError(response?.message || '获取会话列表失败')
        }
      }, '加载会话列表...')
    },

    /**
     * 加载会话统计数据
     * @async
     * @method loadStats
     * @description 获取在线用户数、活跃会话数等统计信息
     * @returns {Promise<void>}
     */
    async loadStats() {
      try {
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_STATS)
        if (response && response.success) {
          const stats = response.data
          const userStats = stats.by_user_type?.user || { active_sessions: 0, unique_users: 0 }
          const adminStats = stats.by_user_type?.admin || { active_sessions: 0, unique_users: 0 }

          this.statistics = {
            onlineUsers: (userStats.unique_users || 0) + (adminStats.unique_users || 0),
            activeSessions: stats.total_active_sessions || 0,
            userSessions: userStats.active_sessions || 0,
            adminSessions: adminStats.active_sessions || 0
          }
        }
      } catch (error) {
        logger.error('加载统计数据失败:', error)
      }
    },

    // ==================== 会话操作方法 ====================

    /**
     * 查看会话详情
     * @method viewSessionDetail
     * @param {UserSession} session - 会话对象
     * @description 设置选中会话并显示详情弹窗
     * @returns {void}
     */
    viewSessionDetail(session) {
      this.selectedSession = session
      this.showModal('sessionDetailModal')
    },

    /**
     * 从详情弹窗撤销会话
     * @method revokeSessionFromModal
     * @description 关闭详情弹窗后撤销当前选中的会话
     * @returns {void}
     */
    revokeSessionFromModal() {
      if (this.selectedSession) {
        const sessionId = this.selectedSession.user_session_id || this.selectedSession.session_id
        this.hideModal('sessionDetailModal')
        this.revokeSession(sessionId)
      }
    },

    /**
     * 撤销单个会话
     * @async
     * @method revokeSession
     * @param {number|string} sessionId - 要撤销的会话ID
     * @description 显示确认对话框后撤销指定会话，强制用户下线
     * @returns {Promise<void>}
     */
    async revokeSession(sessionId) {
      if (String(sessionId) === String(this.currentSessionId)) {
        this.showError('无法撤销当前会话')
        return
      }

      const confirmed = await this.confirmDanger('确定要撤销此会话吗？用户将被强制下线。')
      if (!confirmed) return

      this.globalLoading = true

      try {
        const url = buildURL(USER_ENDPOINTS.SESSIONS_DEACTIVATE, {
          id: sessionId
        })
        const response = await apiRequest(url, { method: 'POST' })

        if (response && response.success) {
          this.showSuccess('会话已撤销')
          this.loadData()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('撤销会话失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },

    /**
     * 批量撤销选中的会话
     * @async
     * @method revokeSelected
     * @description 显示确认对话框后批量撤销选中的会话（排除当前会话）
     * @returns {Promise<void>}
     */
    async revokeSelected() {
      const selected = this.selectedSessions.filter(
        id => String(id) !== String(this.currentSessionId)
      )

      if (selected.length === 0) {
        this.showError('请选择要撤销的会话')
        return
      }

      const confirmed = await this.confirmDanger(`确定要撤销选中的 ${selected.length} 个会话吗？`)
      if (!confirmed) return

      this.globalLoading = true

      try {
        let successCount = 0
        for (const sessionId of selected) {
          try {
            const url = buildURL(USER_ENDPOINTS.SESSIONS_DEACTIVATE, {
              id: sessionId
            })
            const response = await apiRequest(url, { method: 'POST' })
            if (response && response.success) successCount++
          } catch (e) {
            logger.error(`撤销会话 ${sessionId} 失败:`, e)
          }
        }

        this.showSuccess(`批量撤销完成：成功 ${successCount}/${selected.length} 个`)
        this.loadData()
      } catch (error) {
        logger.error('批量撤销失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },

    /**
     * 清理所有过期会话
     * @async
     * @method revokeExpired
     * @description 显示确认对话框后批量清理所有已过期的会话
     * @returns {Promise<void>}
     */
    async revokeExpired() {
      const confirmed = await this.confirmDanger('确定要清理所有已过期的会话吗？')
      if (!confirmed) return

      this.globalLoading = true

      try {
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_CLEANUP, { method: 'POST' })

        if (response && response.success) {
          const count = response.data.deleted_count || response.data.count || 0
          this.showSuccess(`已清理 ${count} 个过期会话`)
          this.loadData()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('清理过期会话失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },

    /**
     * 强制下线所有其他设备
     * @async
     * @method revokeAllExceptCurrent
     * @description 撤销当前用户在其他设备上的所有会话
     * @returns {Promise<void>}
     */
    async revokeAllExceptCurrent() {
      const confirmed = await this.confirmDanger('确定要强制下线所有其他设备吗？')
      if (!confirmed) return

      if (!this.userInfo || !this.userInfo.user_id) {
        this.showError('无法获取当前用户信息')
        return
      }

      this.globalLoading = true

      try {
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_DEACTIVATE_USER, {
          method: 'POST',
          body: JSON.stringify({
            user_type: this.userInfo.is_admin ? 'admin' : 'user',
            user_id: this.userInfo.user_id,
            reason: '用户主动下线其他设备'
          })
        })

        if (response && response.success) {
          const count = response.data.affected_count || response.data.count || 0
          this.showSuccess(`已撤销 ${count} 个会话`)
          this.loadData()
        } else {
          this.showError(response?.message || '撤销失败')
        }
      } catch (error) {
        logger.error('撤销其他会话失败:', error)
        this.showError(error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 判断会话是否为当前登录会话
     * @method isCurrentSession
     * @param {UserSession|null} session - 会话对象
     * @returns {boolean} 是否为当前会话
     */
    isCurrentSession(session) {
      if (!session) return false
      const sessionId = session.user_session_id || session.session_id
      return String(sessionId) === String(this.currentSessionId)
    },

    /**
     * 获取会话状态
     * @method getSessionStatus
     * @param {UserSession|null} session - 会话对象
     * @returns {string} 状态代码 ('active'|'expired'|'revoked')
     */
    getSessionStatus(session) {
      if (!session) return 'active'
      if (session.is_expired === true) return 'expired'
      if (session.is_active === false) return 'revoked'
      if (session.is_active === true) return 'active'
      return session.status || 'active'
    },

    /**
     * 获取状态对应的Bootstrap徽章CSS类
     * @method getStatusBadgeClass
     * @param {string} status - 状态代码
     * @returns {string} Bootstrap徽章CSS类名
     */
    getStatusBadgeClass(status) {
      const classes = {
        active: 'bg-success',
        expired: 'bg-warning text-dark',
        revoked: 'bg-danger'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取状态中文标签
     * @method getStatusLabel
     * @param {string} status - 状态代码
     * @returns {string} 状态中文文本
     */
    getStatusLabel(status) {
      const labels = {
        active: '活跃',
        expired: '已过期',
        revoked: '已撤销'
      }
      return labels[status] || status
    },

    /**
     * 格式化日期时间为中文显示格式
     * @method formatDateTime
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 格式化后的日期时间字符串
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },

    /**
     * 格式化时间为相对时间显示
     * @method formatRelativeTime
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 相对时间文本，如 '5分钟前'、'2小时前'、'3天前'
     */
    formatRelativeTime(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      return Math.floor(diff / 86400000) + '天前'
    },

    /**
     * 显示危险操作确认对话框
     * @async
     * @method confirmDanger
     * @param {string} message - 确认消息内容
     * @returns {Promise<boolean>} 用户是否确认
     */
    async confirmDanger(message) {
      if (Alpine.store('confirm')) {
        return await Alpine.store('confirm').danger({
          title: '确认操作',
          message: message,
          confirmText: '确认',
          cancelText: '取消'
        })
      }
      return confirm(message)
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

/**
 * 注册Alpine.js组件
 * @description 监听alpine:init事件，注册sessionsPage组件到Alpine
 * @listens alpine:init
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('sessionsPage', sessionsPage)
  logger.info('[SessionsPage] Alpine 组件已注册 (Mixin v3.0)')
})
