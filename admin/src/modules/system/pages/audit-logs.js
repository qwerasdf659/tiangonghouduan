/**
 * @fileoverview 操作审计日志页面 - Alpine.js 组件
 * @module modules/system/pages/audit-logs
 * @description 系统操作审计日志查询和详情查看
 * @version 1.0.0
 * @date 2026-02-04
 */

import Alpine from 'alpinejs'
import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { useAuditLogsState, useAuditLogsMethods } from '../composables/audit-logs.js'

/**
 * 创建操作审计日志页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function auditLogsPage() {
  const pageMixin = createPageMixin({
    pageTitle: '操作审计',
    loadDataOnInit: false
  })

  return {
    // ==================== Mixin 组合 ====================
    ...pageMixin,
    ...useAuditLogsState(),
    ...useAuditLogsMethods(),

    // ==================== 页面状态 ====================
    loading: false,

    // 统计数据
    stats: {
      create: 0,
      update: 0,
      delete: 0,
      login: 0,
      logout: 0
    },

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[AuditLogs] 初始化操作审计日志页面')

      // 调用 mixin 的 init
      if (typeof pageMixin.init === 'function') {
        await pageMixin.init.call(this)
      }

      // 设置默认日期范围（最近7天）
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      this.logFilters.end_date = today.toISOString().split('T')[0]
      this.logFilters.start_date = weekAgo.toISOString().split('T')[0]

      // 加载数据
      await this.loadAuditLogs()
      await this.loadStats()

      logger.info('[AuditLogs] 初始化完成')
    },

    /**
     * 加载审计日志（覆盖 composable 方法以添加 loading 状态）
     */
    async loadAuditLogs() {
      this.loading = true
      try {
        const params = new URLSearchParams()
        params.append('page', this.logPage)
        params.append('page_size', this.logPageSize)
        if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id)
        if (this.logFilters.action) params.append('action', this.logFilters.action)
        if (this.logFilters.target) params.append('target', this.logFilters.target)
        if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date)
        if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date)

        const response = await this.apiGet(
          `/api/v4/console/system/audit-logs?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 适配多种后端返回格式
          this.auditLogs = response.data?.items || response.data?.logs || response.data?.list || []
          logger.debug('[AuditLogs] 加载到日志数量:', this.auditLogs.length)
          
          if (response.data?.pagination) {
            this.logPagination.total = response.data.pagination.total || 0
            this.logPagination.total_pages = response.data.pagination.total_pages || 1
          } else if (response.data?.total) {
            this.logPagination.total = response.data.total
            this.logPagination.total_pages = Math.ceil(response.data.total / this.logPageSize)
          }
        }
      } catch (error) {
        logger.error('[AuditLogs] 加载审计日志失败:', error)
        this.auditLogs = []
        this.showError('加载审计日志失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载统计数据
     */
    async loadStats() {
      try {
        const response = await this.apiGet(
          '/api/v4/console/system/audit-logs/stats',
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          this.stats = {
            create: response.data.create || 0,
            update: response.data.update || 0,
            delete: response.data.delete || 0,
            login: response.data.login || 0,
            logout: response.data.logout || 0
          }
        }
      } catch (error) {
        logger.warn('[AuditLogs] 加载统计数据失败:', error.message)
        // 统计数据加载失败不影响主功能，静默处理
      }
    },

    /**
     * 搜索审计日志
     */
    searchAuditLogs() {
      this.logPage = 1
      this.loadAuditLogs()
    },

    /**
     * 重置筛选条件
     */
    resetLogFilters() {
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      this.logFilters = {
        operator_id: '',
        action: '',
        target: '',
        start_date: weekAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0]
      }
      this.logPage = 1
      this.loadAuditLogs()
    },

    /**
     * 查看日志详情
     * @param {Object} log - 日志对象
     */
    viewLogDetail(log) {
      this.selectedLog = log
      logger.debug('[AuditLogs] 查看日志详情:', log.log_id || log.id)
    },

    /**
     * 导出审计日志
     */
    exportAuditLogs() {
      const params = new URLSearchParams()
      if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id)
      if (this.logFilters.action) params.append('action', this.logFilters.action)
      if (this.logFilters.target) params.append('target', this.logFilters.target)
      if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date)
      if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date)
      params.append('format', 'csv')

      const exportUrl = `/api/v4/console/system/audit-logs/export?${params.toString()}`
      window.open(exportUrl, '_blank')
      
      this.showSuccess('正在导出审计日志...')
      logger.info('[AuditLogs] 导出审计日志')
    },

    /**
     * 分页跳转
     * @param {number} pageNum - 目标页码
     */
    goToLogPage(pageNum) {
      if (pageNum < 1 || pageNum > this.logPagination.total_pages) return
      this.logPage = pageNum
      this.loadAuditLogs()
    },

    /**
     * 格式化日期时间（北京时间）
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 获取操作类型文本
     * @param {string} action - 操作类型代码
     * @returns {string} 操作类型文本
     */
    getActionText(action) {
      const map = {
        create: '创建',
        update: '更新',
        delete: '删除',
        login: '登录',
        logout: '登出',
        export: '导出',
        import: '导入',
        approve: '审批',
        reject: '拒绝'
      }
      return map[action] || action || '-'
    },

    /**
     * 获取操作类型样式类
     * @param {string} action - 操作类型代码
     * @returns {string} CSS类名
     */
    getActionClass(action) {
      const map = {
        create: 'action-create',
        update: 'action-update',
        delete: 'action-delete',
        login: 'action-login',
        logout: 'action-logout',
        export: 'bg-yellow-100 text-yellow-800',
        import: 'bg-yellow-100 text-yellow-800',
        approve: 'bg-green-100 text-green-800',
        reject: 'bg-red-100 text-red-800'
      }
      return map[action] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 格式化日志详情
     * @param {Object} details - 详情对象
     * @returns {string} 格式化的JSON字符串
     */
    formatLogDetails(details) {
      if (!details) return '无详细信息'
      try {
        return JSON.stringify(details, null, 2)
      } catch {
        return String(details)
      }
    }
  }
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  logger.info('[AuditLogs] 注册 Alpine 组件...')
  Alpine.data('auditLogsPage', auditLogsPage)
})

export { auditLogsPage }
export default auditLogsPage

