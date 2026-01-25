/**
 * 商户操作日志模块
 *
 * @file admin/src/modules/analytics/composables/merchant-logs.js
 * @description 商户操作审计日志查询
 * @version 1.1.0
 * @date 2026-01-24
 *
 * 使用 STORE_ENDPOINTS 端点
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'

/**
 * 商户操作日志状态
 * @returns {Object} 状态对象
 */
export function useMerchantLogsState() {
  return {
    /** @type {Array} 商户日志列表 */
    merchantLogs: [],
    /** @type {Object} 日志筛选条件 */
    logFilters: {
      merchant_id: '',
      action_type: '',
      operator_id: '',
      startDate: '',
      endDate: ''
    },
    /** @type {Object} 日志统计 */
    logStats: { totalLogs: 0, todayLogs: 0, warningLogs: 0, errorLogs: 0 },
    /** @type {Object|null} 选中的日志详情 */
    selectedLog: null,
    /** @type {Array} 操作类型选项 */
    actionTypeOptions: [
      { value: 'login', label: '登录' },
      { value: 'logout', label: '登出' },
      { value: 'points_adjust', label: '积分调整' },
      { value: 'order_create', label: '创建订单' },
      { value: 'order_complete', label: '完成订单' },
      { value: 'order_cancel', label: '取消订单' },
      { value: 'prize_claim', label: '奖品领取' },
      { value: 'config_change', label: '配置修改' },
      { value: 'password_change', label: '密码修改' },
      { value: 'other', label: '其他' }
    ]
  }
}

/**
 * 商户操作日志方法
 * @returns {Object} 方法对象
 */
export function useMerchantLogsMethods() {
  return {
    /**
     * 加载商户日志列表
     */
    async loadMerchantLogs() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.logFilters.merchant_id)
          params.append('merchant_id', this.logFilters.merchant_id)
        if (this.logFilters.action_type)
          params.append('action_type', this.logFilters.action_type)
        if (this.logFilters.operator_id)
          params.append('operator_id', this.logFilters.operator_id)
        if (this.logFilters.startDate) params.append('start_date', this.logFilters.startDate)
        if (this.logFilters.endDate) params.append('end_date', this.logFilters.endDate)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.MERCHANT_LOGS_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 items 字段
          this.merchantLogs = response.data?.items || response.data?.logs || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
            // 从分页信息更新统计
            this.updateStatsFromList(response.data.pagination)
          }
        }
      } catch (error) {
        logger.error('加载商户日志失败:', error)
        this.merchantLogs = []
      }
    },

    /**
     * 加载日志统计
     * 注：后端无通用stats接口，统计数据从列表分页信息中获取
     */
    async loadLogStats() {
      // 后端只有 /stats/store/:store_id 和 /stats/operator/:operator_id
      // 没有通用的 stats 接口，统计数据通过 loadMerchantLogs 的分页信息更新
      // 此方法保留为空实现，避免调用不存在的API
      logger.info('日志统计：使用列表分页数据')
    },

    /**
     * 更新统计信息（从列表响应中提取）
     * @param {Object} paginationData - 分页数据
     */
    updateStatsFromList(paginationData) {
      if (paginationData) {
        this.logStats.totalLogs = paginationData.total || 0
      }
    },

    /**
     * 搜索日志
     */
    searchLogs() {
      this.page = 1
      this.loadMerchantLogs()
    },

    /**
     * 重置日志筛选
     */
    resetLogFilters() {
      this.logFilters = {
        merchant_id: '',
        action_type: '',
        operator_id: '',
        startDate: '',
        endDate: ''
      }
      this.page = 1
      this.loadMerchantLogs()
    },

    /**
     * 查看日志详情
     * @param {Object} log - 日志对象
     */
    viewLogDetail(log) {
      this.selectedLog = log
      this.showModal('logDetailModal')
    },

    /**
     * 导出日志
     */
    async exportLogs() {
      try {
        const params = new URLSearchParams()
        if (this.logFilters.merchant_id)
          params.append('merchant_id', this.logFilters.merchant_id)
        if (this.logFilters.action_type)
          params.append('action_type', this.logFilters.action_type)
        if (this.logFilters.startDate) params.append('start_date', this.logFilters.startDate)
        if (this.logFilters.endDate) params.append('end_date', this.logFilters.endDate)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.MERCHANT_LOGS_EXPORT}?${params}`,
          {},
          { showLoading: true, responseType: 'blob' }
        )

        if (response) {
          const blob = new Blob([response], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          })
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `merchant_logs_${new Date().toISOString().split('T')[0]}.xlsx`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
          this.showSuccess('日志导出成功')
        }
      } catch (error) {
        logger.error('导出日志失败:', error)
        this.showError('导出日志失败')
      }
    },

    /**
     * 获取操作类型文本
     * @param {string} actionType - 操作类型代码
     * @returns {string} 操作类型文本
     */
    getActionTypeText(actionType) {
      const option = this.actionTypeOptions.find((opt) => opt.value === actionType)
      return option?.label || actionType || '-'
    },

    /**
     * 获取日志级别CSS类
     * @param {string} level - 日志级别
     * @returns {string} CSS类名
     */
    getLogLevelClass(level) {
      const map = {
        info: 'bg-info',
        warning: 'bg-warning',
        error: 'bg-danger',
        success: 'bg-success'
      }
      return map[level] || 'bg-secondary'
    },

    /**
     * 获取日志级别图标
     * @param {string} level - 日志级别
     * @returns {string} 图标类名
     */
    getLogLevelIcon(level) {
      const map = {
        info: 'bi-info-circle',
        warning: 'bi-exclamation-triangle',
        error: 'bi-x-circle',
        success: 'bi-check-circle'
      }
      return map[level] || 'bi-circle'
    }
  }
}

export default { useMerchantLogsState, useMerchantLogsMethods }
