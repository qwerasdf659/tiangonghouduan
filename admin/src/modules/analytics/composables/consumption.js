/**
 * 消费记录模块
 *
 * @file admin/src/modules/analytics/composables/consumption.js
 * @description 用户消费流水查询和统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 消费记录状态
 * @returns {Object} 状态对象
 */
export function useConsumptionState() {
  return {
    /** @type {Array} 消费记录列表 */
    consumptions: [],
    /** @type {Object} 消费记录筛选条件 */
    consumptionFilters: {
      user_id: '',
      status: '',
      payment_method: '',
      startDate: '',
      endDate: ''
    },
    /** @type {Object} 消费统计 */
    consumptionStats: { total: 0, totalAmount: 0, pendingCount: 0, todayCount: 0 },
    /** @type {Object|null} 选中的消费记录详情 */
    selectedConsumption: null
  }
}

/**
 * 消费记录方法
 * @returns {Object} 方法对象
 */
export function useConsumptionMethods() {
  return {
    /**
     * 加载消费记录
     */
    async loadConsumptions() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.consumptionFilters.user_id)
          params.append('user_id', this.consumptionFilters.user_id)
        if (this.consumptionFilters.status) params.append('status', this.consumptionFilters.status)
        if (this.consumptionFilters.payment_method)
          params.append('payment_method', this.consumptionFilters.payment_method)
        if (this.consumptionFilters.startDate)
          params.append('start_date', this.consumptionFilters.startDate)
        if (this.consumptionFilters.endDate)
          params.append('end_date', this.consumptionFilters.endDate)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.CONSUMPTION_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.consumptions = response.data?.records || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载消费记录失败:', error)
        this.consumptions = []
      }
    },

    /**
     * 加载消费统计
     */
    async loadConsumptionStats() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.CONSUMPTION_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          this.consumptionStats = {
            total: response.data.total ?? 0,
            totalAmount: response.data.total_amount ?? 0,
            pendingCount: response.data.pending_count ?? 0,
            todayCount: response.data.today_count ?? 0
          }
        }
      } catch (error) {
        logger.error('加载消费统计失败:', error)
      }
    },

    /**
     * 搜索消费记录
     */
    searchConsumptions() {
      this.page = 1
      this.loadConsumptions()
    },

    /**
     * 重置消费筛选
     */
    resetConsumptionFilters() {
      this.consumptionFilters = {
        user_id: '',
        status: '',
        payment_method: '',
        startDate: '',
        endDate: ''
      }
      this.page = 1
      this.loadConsumptions()
    },

    /**
     * 查看消费详情
     * @param {Object} record - 消费记录对象
     */
    async viewConsumptionDetail(record) {
      try {
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.CONSUMPTION_DETAIL, { id: record.id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedConsumption = response.data
          this.showModal('consumptionDetailModal')
        }
      } catch (error) {
        logger.error('加载消费详情失败:', error)
        this.showError('加载消费详情失败')
      }
    },

    /**
     * 审核消费记录
     * @param {Object} record - 消费记录对象
     * @param {string} action - 审核动作 ('approve'|'reject')
     */
    async auditConsumption(record, action) {
      const actionText = action === 'approve' ? '通过' : '拒绝'
      await this.confirmAndExecute(
        `确定${actionText}此消费记录？`,
        async () => {
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.CONSUMPTION_AUDIT, { id: record.id }),
            { method: 'PUT', data: { action } }
          )
          if (response?.success) {
            await this.loadConsumptions()
            await this.loadConsumptionStats()
          }
        },
        { successMessage: `消费记录已${actionText}` }
      )
    },

    /**
     * 获取支付方式文本
     * @param {string} method - 支付方式代码
     * @returns {string} 支付方式文本
     */
    getPaymentMethodText(method) {
      const map = {
        wechat: '微信',
        alipay: '支付宝',
        cash: '现金',
        card: '银行卡',
        points: '积分'
      }
      return map[method] || method || '-'
    },

    /**
     * 获取消费状态CSS类
     * @param {string} status - 消费状态
     * @returns {string} CSS类名
     */
    getConsumptionStatusClass(status) {
      const map = { pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-danger' }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取消费状态文本
     * @param {string} status - 消费状态
     * @returns {string} 状态文本
     */
    getConsumptionStatusText(status) {
      const map = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
      return map[status] || status
    }
  }
}

export default { useConsumptionState, useConsumptionMethods }

