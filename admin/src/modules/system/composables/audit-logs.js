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
      operation_type: '',
      target_type: '',
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
    /**
     * @type {Array} 操作类型选项（运行时从后端权威字典 /admin-audit-logs/operation-types 加载，
     * 不硬编码——避免与后端 AUDIT_OPERATION_TYPES 漂移）
     */
    actionTypes: [],
    /**
     * @type {Array} 操作目标类型选项（运行时从后端权威字典 /admin-audit-logs/target-types 加载，
     * 不硬编码——后端 AUDIT_TARGET_TYPES 为唯一真相源，含 media_file 等全部标准码）
     */
    targetTypes: []
  }
}

/**
 * 审计日志方法
 * @returns {Object} 方法对象
 */
export function useAuditLogsMethods() {
  return {
    /**
     * 加载审计筛选字典（操作类型 + 目标类型），运行时从后端权威字典端点拉取。
     *
     * 后端返回结构：{ operation_types:[{code,name,key}] } / { target_types:[{code,name,key}] }
     * 前端筛选器统一用 {value,label}：value=后端 code（snake_case 标准码），label=后端中文名。
     * 各列表头部补一个空 value 的「全部」项，对应"不筛选"。
     *
     * @returns {Promise<void>}
     */
    async loadAuditDictionaries() {
      try {
        const [opRes, ttRes] = await Promise.all([
          this.apiGet(SYSTEM_ENDPOINTS.AUDIT_LOG_OPERATION_TYPES, {}, { showLoading: false }),
          this.apiGet(SYSTEM_ENDPOINTS.AUDIT_LOG_TARGET_TYPES, {}, { showLoading: false })
        ])
        if (opRes?.success) {
          const list = (opRes.data?.operation_types || []).map(t => ({
            value: t.code,
            label: t.name || t.code
          }))
          this.actionTypes = [{ value: '', label: '全部类型' }, ...list]
        }
        if (ttRes?.success) {
          const list = (ttRes.data?.target_types || []).map(t => ({
            value: t.code,
            label: t.name || t.code
          }))
          this.targetTypes = [{ value: '', label: '全部目标' }, ...list]
        }
      } catch (error) {
        logger.error('加载审计筛选字典失败:', error)
      }
    },

    /**
     * 加载审计日志
     */
    async loadAuditLogs() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.logPage)
        params.append('page_size', this.logPageSize)
        if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id)
        if (this.logFilters.operation_type)
          params.append('operation_type', this.logFilters.operation_type)
        if (this.logFilters.target_type) params.append('target_type', this.logFilters.target_type)
        if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date)
        if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date)

        const response = await this.apiGet(
          `${SYSTEM_ENDPOINTS.AUDIT_LOG_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.auditLogs = response.data?.logs || []
          logger.debug('[AuditLogs] 加载到日志数量:', this.auditLogs.length)
          this.logPagination.total = response.data?.pagination?.total || 0
          this.logPagination.total_pages = response.data?.pagination?.total_pages || 1
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
        operation_type: '',
        target_type: '',
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
          buildURL(SYSTEM_ENDPOINTS.AUDIT_LOG_DETAIL, { id: log.operation_log_id }),
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
      if (this.logFilters.operation_type)
        params.append('operation_type', this.logFilters.operation_type)
      if (this.logFilters.target_type) params.append('target_type', this.logFilters.target_type)
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
     * 获取操作类型文本（使用后端返回的 display 字段）
     * @param {Object} log - 日志对象
     * @returns {string} 操作类型文本
     */
    // ✅ 已删除 getOperationTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取操作类型样式（使用后端返回的 color 字段）
     * @param {Object} log - 日志对象
     * @returns {string} CSS类名
     */
    getOperationTypeClass(log) {
      const colorMap = {
        blue: 'bg-blue-100 text-blue-800',
        green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        gray: 'bg-gray-100 text-gray-800',
        purple: 'bg-purple-100 text-purple-800',
        orange: 'bg-orange-100 text-orange-800'
      }
      return colorMap[log.operation_type_color] || 'bg-gray-100 text-gray-800'
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
