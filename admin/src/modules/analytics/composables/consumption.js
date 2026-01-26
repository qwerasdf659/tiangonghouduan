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
      userId: '', // 兼容HTML模板
      status: '',
      payment_method: '',
      startDate: '',
      endDate: ''
    },
    /** @type {Object} 消费统计 */
    consumptionStats: { total: 0, totalAmount: 0, pendingCount: 0, todayCount: 0 },
    /** @type {Object|null} 选中的消费记录详情 */
    selectedConsumption: null,
    /** @type {Object} 财务汇总统计（用于财务统计页面） */
    financeStats: { todayRevenue: 0, monthRevenue: 0, pendingCount: 0, totalDebt: 0 },
    /** @type {Object} 拒绝表单 */
    rejectForm: { reason: '' }
  }
}

/**
 * 消费记录方法
 * @returns {Object} 方法对象
 */
export function useConsumptionMethods() {
  return {
    /**
     * 加载消费记录（兼容HTML中的loadConsumption调用）
     */
    async loadConsumption() {
      return this.loadConsumptions()
    },

    /**
     * 加载消费记录
     * 后端接口: GET /api/v4/console/consumption/records
     * 返回: { records: [...], pagination: {...}, statistics: {...} }
     */
    async loadConsumptions() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page || 1)
        params.append('page_size', this.pageSize || 20)
        // 支持两种筛选条件命名（HTML 用 userId，后端用 user_id）
        const userId = this.consumptionFilters.userId || this.consumptionFilters.user_id
        if (userId) params.append('search', userId) // 后端使用 search 参数
        if (this.consumptionFilters.status) params.append('status', this.consumptionFilters.status)
        if (this.consumptionFilters.startDate) {
          params.append('start_date', this.consumptionFilters.startDate)
        }
        if (this.consumptionFilters.endDate) {
          params.append('end_date', this.consumptionFilters.endDate)
        }

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.CONSUMPTION_RECORDS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回 records 数组，字段: record_id, consumption_amount, status, created_at, user, merchant
          const rawRecords = response.data?.records || response.data?.list || []
          // 映射字段以兼容 HTML 模板
          this.consumptions = rawRecords.map(r => ({
            ...r,
            id: r.record_id,
            amount: r.consumption_amount, // 后端返回分，HTML 会 /100
            user_name: r.user?.nickname || r.user?.mobile || r.user_id,
            store_name: r.merchant?.nickname || r.merchant?.mobile || `商户${r.merchant_id || '-'}`
          }))
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
          // 同时获取统计数据（后端在同一接口返回）
          if (response.data?.statistics) {
            this.consumptionStats = {
              total: this.total,
              totalAmount: 0,
              pendingCount: response.data.statistics.pending ?? 0,
              todayCount: response.data.statistics.today ?? 0
            }
          }
        }
      } catch (error) {
        logger.error('加载消费记录失败:', error)
        this.consumptions = []
      }
    },

    /**
     * 加载消费统计（从 records 接口获取，后端不单独提供 stats 接口）
     */
    async loadConsumptionStats() {
      // 统计数据已在 loadConsumptions 中获取，这里只做空实现避免报错
      logger.debug('loadConsumptionStats: 统计数据已在 loadConsumptions 中获取')
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
     * 通过消费记录审核
     * 后端接口: POST /api/v4/console/consumption/approve/:id
     * @param {Object} record - 消费记录对象
     */
    async approveConsumption(record) {
      const recordId = record.record_id || record.id
      await this.confirmAndExecute(
        '确定通过此消费记录？',
        async () => {
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.CONSUMPTION_APPROVE, { id: recordId }),
            { method: 'POST', data: {} }
          )
          if (response?.success) {
            await this.loadConsumptions()
          }
        },
        { successMessage: '消费记录已通过' }
      )
    },

    /**
     * 拒绝消费记录审核（打开弹窗）
     * @param {Object} record - 消费记录对象
     */
    async rejectConsumption(record) {
      this.selectedConsumption = record
      this.rejectForm = { reason: '' }
      this.showModal('rejectModal')
    },

    /**
     * 显示拒绝模态框
     * @param {Object} record - 消费记录对象
     */
    showRejectModal(record) {
      this.selectedConsumption = record
      this.rejectForm = { reason: '' }
      this.showModal('rejectModal')
    },

    /**
     * 确认拒绝
     * 后端接口: POST /api/v4/console/consumption/reject/:id
     */
    async confirmReject() {
      if (!this.rejectForm.reason || this.rejectForm.reason.trim().length < 5) {
        this.showError('请输入拒绝原因（至少5个字符）')
        return
      }

      try {
        this.saving = true
        const recordId = this.selectedConsumption.record_id || this.selectedConsumption.id
        const response = await this.apiCall(
          buildURL(STORE_ENDPOINTS.CONSUMPTION_REJECT, { id: recordId }),
          {
            method: 'POST',
            data: { admin_notes: this.rejectForm.reason }
          }
        )

        if (response?.success) {
          this.showSuccess('消费记录已拒绝')
          this.hideModal('rejectModal')
          await this.loadConsumptions()
        }
      } catch (error) {
        this.showError('操作失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
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
