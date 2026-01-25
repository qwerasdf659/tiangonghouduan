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

/**
 * API请求封装 - 带错误处理
 * @param {string} url - API URL
 * @param {Object} options - 请求配置
 * @returns {Promise<Object>} API响应
 */
const apiRequest = async (url, options = {}) => {
  try {
    const response = await request({ url, ...options })
    logger.debug('[Sessions] API响应:', url, response?.success)
    return response
  } catch (error) {
    logger.error('[Sessions] API请求失败:', url, error.message)
    throw error
  }
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

    /** @type {number} 会话总数 */
    total: 0,

    /** @type {number[]} 选中的会话ID列表 */
    selectedSessions: [],

    /** @type {UserSession|null} 当前选中查看的会话 */
    selectedSession: null,

    /** @type {string|null} 当前登录用户的会话ID */
    currentSessionId: null,

    /** @type {boolean} 全局加载状态 */
    globalLoading: false,

    /** @type {boolean} 显示详情模态框 */
    showDetailModal: false,

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
      adminSessions: '-',
      expiredCount: '-'
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
      logger.info('[Sessions] 页面初始化开始 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        logger.warn('[Sessions] 认证检查失败，跳转登录')
        return
      }

      // 获取当前会话ID
      const token = localStorage.getItem('admin_token')
      if (token) {
        try {
          const parts = token.split('.')
          if (parts.length >= 2) {
            const payload = JSON.parse(atob(parts[1]))
            this.currentSessionId = payload.session_id
            logger.debug('[Sessions] 当前会话ID:', this.currentSessionId)
          }
        } catch (e) {
          logger.error('[Sessions] 解析token失败:', e.message)
        }
      }

      // 确保用户信息已加载
      if (!this.userInfo) {
        this._loadUserInfo?.()
      }
      
      logger.info('[Sessions] 用户信息:', {
        user_id: this.userInfo?.user_id,
        is_admin: this.userInfo?.is_admin
      })

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
      logger.info('[Sessions] loadData 开始', { page, currentPage: this.currentPage })
      
      if (page !== null) {
        this.currentPage = page
      }
      this.selectedSessions = []
      this.loading = true

      try {
        const params = new URLSearchParams()
        params.append('page', this.currentPage || 1)
        params.append('page_size', this.pageSize || 20)
        params.append('sort_by', this.filters.sortBy || 'last_activity')
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
        logger.debug('[Sessions] 请求URL:', url)
        
        const response = await apiRequest(url)

        if (response && response.success) {
          const sessionData = response.data?.sessions || response.data
          this.sessions = Array.isArray(sessionData) ? sessionData : []
          this.total = response.data?.pagination?.total || this.sessions.length
          logger.info('[Sessions] 加载成功', { count: this.sessions.length, total: this.total })
          
          // 异步加载统计数据
          this.loadStats()
        } else {
          const errorMsg = response?.message || '获取会话列表失败'
          logger.error('[Sessions] 加载失败:', errorMsg)
          this.showError(errorMsg)
        }
      } catch (error) {
        logger.error('[Sessions] loadData 异常:', error.message)
        this.showError(error.message || '加载会话列表失败')
      } finally {
        this.loading = false
      }
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
        logger.debug('[Sessions] 加载统计数据...')
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_STATS)
        
        if (response && response.success) {
          const stats = response.data || {}
          const userStats = stats.by_user_type?.user || { active_sessions: 0, unique_users: 0 }
          const adminStats = stats.by_user_type?.admin || { active_sessions: 0, unique_users: 0 }

          this.statistics = {
            onlineUsers: (userStats.unique_users || 0) + (adminStats.unique_users || 0),
            activeSessions: stats.total_active_sessions || 0,
            userSessions: userStats.active_sessions || 0,
            adminSessions: adminStats.active_sessions || 0,
            expiredCount: stats.expired_pending_cleanup || 0
          }
          
          logger.info('[Sessions] 统计数据加载成功', this.statistics)
        } else {
          logger.warn('[Sessions] 统计数据响应异常:', response)
        }
      } catch (error) {
        logger.error('[Sessions] 加载统计数据失败:', error.message)
        // 保持默认值，不影响页面显示
      }
    },

    // ==================== 会话操作方法 ====================

    /**
     * 查看会话详情
     * @method viewSessionDetail
     * @param {UserSession} session - 会话对象
     * @description 设置选中会话并显示详情模态框
     * @returns {void}
     */
    viewSessionDetail(session) {
      logger.debug('[Sessions] 查看会话详情:', session.user_session_id || session.session_id)
      this.selectedSession = session
      this.showDetailModal = true
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
      logger.info('[Sessions] revokeSession 开始:', sessionId)
      
      if (String(sessionId) === String(this.currentSessionId)) {
        this.showError('无法撤销当前会话')
        return
      }

      const confirmed = await this.confirmDanger('确定要撤销此会话吗？用户将被强制下线。')
      if (!confirmed) {
        logger.debug('[Sessions] 用户取消撤销')
        return
      }

      this.globalLoading = true

      try {
        const url = buildURL(USER_ENDPOINTS.SESSIONS_DEACTIVATE, { id: sessionId })
        logger.debug('[Sessions] 撤销URL:', url)
        
        const response = await apiRequest(url, { method: 'POST' })

        if (response && response.success) {
          this.showSuccess('会话已撤销，用户已被下线')
          logger.info('[Sessions] 撤销成功:', sessionId)
          await this.loadData()
        } else {
          const errorMsg = response?.message || '撤销操作失败'
          logger.error('[Sessions] 撤销失败:', errorMsg)
          this.showError(errorMsg)
        }
      } catch (error) {
        logger.error('[Sessions] 撤销会话异常:', error.message)
        this.showError(error.message || '撤销会话失败')
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
      logger.info('[Sessions] revokeSelected 开始', { selected: this.selectedSessions })
      
      const selected = this.selectedSessions.filter(
        id => String(id) !== String(this.currentSessionId)
      )

      if (selected.length === 0) {
        this.showError('请选择要撤销的会话（当前会话无法撤销）')
        return
      }

      const confirmed = await this.confirmDanger(`确定要撤销选中的 ${selected.length} 个会话吗？用户将被强制下线。`)
      if (!confirmed) {
        logger.debug('[Sessions] 用户取消撤销操作')
        return
      }

      this.globalLoading = true

      try {
        let successCount = 0
        let failCount = 0
        
        for (const sessionId of selected) {
          try {
            const url = buildURL(USER_ENDPOINTS.SESSIONS_DEACTIVATE, { id: sessionId })
            logger.debug('[Sessions] 撤销会话:', sessionId)
            const response = await apiRequest(url, { method: 'POST' })
            if (response && response.success) {
              successCount++
            } else {
              failCount++
              logger.warn('[Sessions] 撤销失败:', sessionId, response?.message)
            }
          } catch (e) {
            failCount++
            logger.error(`[Sessions] 撤销会话 ${sessionId} 异常:`, e.message)
          }
        }

        if (successCount > 0) {
          this.showSuccess(`批量撤销完成：成功 ${successCount}/${selected.length} 个`)
        } else {
          this.showError('批量撤销失败，请重试')
        }
        
        // 清空选择并刷新
        this.selectedSessions = []
        await this.loadData()
      } catch (error) {
        logger.error('[Sessions] 批量撤销异常:', error.message)
        this.showError(error.message || '批量撤销失败')
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
      logger.info('[Sessions] revokeExpired 开始')
      
      const confirmed = await this.confirmDanger('确定要清理所有已过期的会话吗？这将从数据库中删除过期的会话记录。')
      if (!confirmed) {
        logger.debug('[Sessions] 用户取消清理操作')
        return
      }

      this.globalLoading = true

      try {
        logger.debug('[Sessions] 发送清理请求...')
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_CLEANUP, { method: 'POST' })

        if (response && response.success) {
          const count = response.data?.deleted_count || response.data?.count || 0
          this.showSuccess(`已清理 ${count} 个过期会话`)
          logger.info('[Sessions] 清理成功:', count)
          await this.loadData()
        } else {
          const errorMsg = response?.message || '清理操作失败'
          logger.error('[Sessions] 清理失败:', errorMsg)
          this.showError(errorMsg)
        }
      } catch (error) {
        logger.error('[Sessions] 清理过期会话异常:', error.message)
        this.showError(error.message || '清理过期会话失败')
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
      logger.info('[Sessions] revokeAllExceptCurrent 开始', { userInfo: this.userInfo })
      
      const confirmed = await this.confirmDanger('确定要强制下线所有其他设备吗？其他设备上的会话将被立即终止。')
      if (!confirmed) {
        logger.debug('[Sessions] 用户取消强制下线操作')
        return
      }

      // 获取用户信息
      const userInfo = this.userInfo || this.currentUser
      if (!userInfo || !userInfo.user_id) {
        logger.error('[Sessions] 无法获取当前用户信息')
        this.showError('无法获取当前用户信息，请刷新页面后重试')
        return
      }

      this.globalLoading = true

      try {
        logger.debug('[Sessions] 发送强制下线请求...', { 
          user_id: userInfo.user_id,
          is_admin: userInfo.is_admin 
        })
        
        const response = await apiRequest(USER_ENDPOINTS.SESSIONS_DEACTIVATE_USER, {
          method: 'POST',
          data: {
            user_type: userInfo.is_admin ? 'admin' : 'user',
            user_id: userInfo.user_id,
            reason: '用户主动下线其他设备'
          }
        })

        if (response && response.success) {
          const count = response.data?.affected_count || response.data?.count || 0
          this.showSuccess(`已撤销 ${count} 个其他会话`)
          logger.info('[Sessions] 强制下线成功:', count)
          await this.loadData()
        } else {
          const errorMsg = response?.message || '撤销失败'
          logger.error('[Sessions] 强制下线失败:', errorMsg)
          this.showError(errorMsg)
        }
      } catch (error) {
        logger.error('[Sessions] 撤销其他会话异常:', error.message)
        this.showError(error.message || '强制下线失败')
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
      logger.debug('[Sessions] confirmDanger 调用:', message)
      
      // 检查 Alpine.store('confirm') 是否可用
      if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('confirm')) {
        logger.debug('[Sessions] 使用 Alpine confirm store')
        // 使用 show() 方法，它接受对象参数
        return await Alpine.store('confirm').show({
          title: '确认操作',
          message: message,
          type: 'danger',
          confirmText: '确认',
          cancelText: '取消'
        })
      }
      
      // 降级到原生 confirm
      logger.warn('[Sessions] Alpine confirm store 不可用，使用原生 confirm')
      return confirm(message)
    },

    /**
     * 刷新数据并显示结果提示
     * @async
     * @method refreshData
     * @description 刷新会话列表并显示成功/失败提示
     * @returns {Promise<void>}
     */
    async refreshData() {
      logger.info('[Sessions] 用户点击刷新')
      
      // 保存刷新前的会话数量
      const prevCount = this.sessions?.length || 0
      
      try {
        await this.loadData()
        
        // 刷新成功，显示提示
        const newCount = this.sessions?.length || 0
        const message = `刷新成功，共 ${newCount} 个会话`
        
        logger.info('[Sessions] 刷新成功:', message)
        
        // 直接调用 Alpine store 显示 Toast
        if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
          logger.debug('[Sessions] 调用 notification store 显示成功提示')
          Alpine.store('notification').success(message)
        } else {
          logger.warn('[Sessions] notification store 不可用，使用 alert')
          alert(message)
        }
      } catch (error) {
        const errorMsg = '刷新失败: ' + (error.message || '未知错误')
        logger.error('[Sessions] 刷新失败:', error.message)
        
        if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('notification')) {
          Alpine.store('notification').error(errorMsg)
        } else {
          alert(errorMsg)
        }
      }
    },

    /**
     * 获取分页页码数组（HTML模板兼容方法）
     * @method getPaginationPages
     * @description 将 getter 包装为方法供 HTML 模板中 x-for 调用
     * @returns {Array<number|string>} 可见页码数组
     */
    getPaginationPages() {
      // 使用 mixin 中的 visiblePages getter
      return this.visiblePages || this.paginationPages || []
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
