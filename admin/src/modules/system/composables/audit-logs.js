/**
 * 审计日志模块
 *
 * @file admin/src/modules/system/composables/audit-logs.js
 * @description 系统操作日志查询和详情查看
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 审计日志状态
 * @returns {Object} 状态对象
 */
export function useAuditLogsState() {
  return {
    /** @type {Array} 审计日志列表 */
    auditLogs: [],
    /** @type {Object} 审计日志筛选条件 */
    logFilters: {
      operator_id: '',
      action: '',
      target: '',
      start_date: '',
      end_date: ''
    },
    /** @type {number} 审计日志页码 */
    logPage: 1,
    /** @type {number} 审计日志每页数量 */
    logPageSize: 20,
    /** @type {Object} 审计日志分页 */
    logPagination: { total: 0, total_pages: 1 },
    /** @type {Object|null} 选中的日志详情 */
    selectedLog: null,
    /** @type {Array} 操作类型选项 */
    actionTypes: [
      { value: 'create', label: '创建' },
      { value: 'update', label: '更新' },
      { value: 'delete', label: '删除' },
      { value: 'login', label: '登录' },
      { value: 'logout', label: '登出' }
    ]
  }
}

/**
 * 审计日志方法
 * @returns {Object} 方法对象
 */
export function useAuditLogsMethods() {
  return {
    /**
     * 加载审计日志
     */
    async loadAuditLogs() {
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
          `${SYSTEM_ENDPOINTS.AUDIT_LOG_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 items 数组，需要适配多种格式
          this.auditLogs = response.data?.items || response.data?.logs || response.data?.list || []
          logger.debug('[AuditLogs] 加载到日志数量:', this.auditLogs.length)
          if (response.data?.pagination) {
            this.logPagination.total = response.data.pagination.total || 0
            this.logPagination.total_pages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载审计日志失败:', error)
        this.auditLogs = []
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
     * 重置日志筛选
     */
    resetLogFilters() {
      this.logFilters = {
        operator_id: '',
        action: '',
        target: '',
        start_date: '',
        end_date: ''
      }
      this.logPage = 1
      this.loadAuditLogs()
    },

    /**
     * 查看日志详情
     * @param {Object} log - 日志对象
     */
    async viewLogDetail(log) {
      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.AUDIT_LOG_DETAIL, { id: log.log_id || log.id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedLog = response.data
          this.showModal('logDetailModal')
        }
      } catch (error) {
        logger.error('加载日志详情失败:', error)
        this.showError('加载日志详情失败')
      }
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

      const exportUrl = SYSTEM_ENDPOINTS.AUDIT_LOG_EXPORT + '?' + params.toString()
      window.open(exportUrl, '_blank')
    },

    /**
     * 分页跳转
     * @param {number} pageNum - 目标页码
     */
    goToLogPage(pageNum) {
      this.logPage = pageNum
      this.loadAuditLogs()
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
        import: '导入'
      }
      return map[action] || action || '-'
    },

    /**
     * 获取操作类型样式
     * @param {string} action - 操作类型代码
     * @returns {string} CSS类名
     */
    getActionClass(action) {
      const map = {
        create: 'bg-success',
        update: 'bg-info',
        delete: 'bg-danger',
        login: 'bg-primary',
        logout: 'bg-secondary',
        export: 'bg-warning',
        import: 'bg-warning'
      }
      return map[action] || 'bg-secondary'
    },

    /**
     * 格式化日志详情
     * @param {Object} details - 详情对象
     * @returns {string} 格式化的JSON字符串
     */
    formatLogDetails(details) {
      if (!details) return '-'
      try {
        return JSON.stringify(details, null, 2)
      } catch {
        return String(details)
      }
    }
  }
}

export default { useAuditLogsState, useAuditLogsMethods }
