/**
 * 债务管理模块
 *
 * @file admin/src/modules/analytics/composables/debt-management.js
 * @description 用户/商户债务记录管理
 * @version 1.1.0
 * @date 2026-01-24
 *
 * 使用 ASSET_ENDPOINTS 端点
 */

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL } from '../../../api/base.js'

/**
 * 债务管理状态
 * @returns {Object} 状态对象
 */
export function useDebtManagementState() {
  return {
    /** @type {Array} 债务记录列表 */
    debts: [],
    /** @type {Object} 债务筛选条件 */
    debtFilters: {
      debtor_type: '',
      debtor_id: '',
      status: '',
      minAmount: '',
      maxAmount: ''
    },
    /** @type {Object} 债务统计 */
    debtStats: { totalDebts: 0, totalAmount: 0, pendingAmount: 0, overdueCount: 0 },
    /** @type {Object|null} 选中的债务记录 */
    selectedDebt: null,
    /** @type {Object} 债务还款表单 */
    debtRepayForm: {
      debt_id: '',
      amount: 0,
      payment_method: 'cash',
      note: ''
    }
  }
}

/**
 * 债务管理方法
 * @returns {Object} 方法对象
 */
export function useDebtManagementMethods() {
  return {
    /**
     * 加载债务列表
     */
    async loadDebts() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.debtFilters.debtor_type)
          params.append('debtor_type', this.debtFilters.debtor_type)
        if (this.debtFilters.debtor_id) params.append('debtor_id', this.debtFilters.debtor_id)
        if (this.debtFilters.status) params.append('status', this.debtFilters.status)
        if (this.debtFilters.minAmount) params.append('min_amount', this.debtFilters.minAmount)
        if (this.debtFilters.maxAmount) params.append('max_amount', this.debtFilters.maxAmount)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.debts = response.data?.debts || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载债务列表失败:', error)
        this.debts = []
      }
    },

    /**
     * 加载债务统计
     */
    async loadDebtStats() {
      try {
        const response = await this.apiGet(
          ASSET_ENDPOINTS.DEBT_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          this.debtStats = {
            totalDebts: response.data.total_debts ?? 0,
            totalAmount: response.data.total_amount ?? 0,
            pendingAmount: response.data.pending_amount ?? 0,
            overdueCount: response.data.overdue_count ?? 0
          }
        }
      } catch (error) {
        logger.error('加载债务统计失败:', error)
      }
    },

    /**
     * 搜索债务记录
     */
    searchDebts() {
      this.page = 1
      this.loadDebts()
    },

    /**
     * 重置债务筛选
     */
    resetDebtFilters() {
      this.debtFilters = {
        debtor_type: '',
        debtor_id: '',
        status: '',
        minAmount: '',
        maxAmount: ''
      }
      this.page = 1
      this.loadDebts()
    },

    /**
     * 查看债务详情
     * @param {Object} debt - 债务记录对象
     */
    async viewDebtDetail(debt) {
      try {
        const response = await this.apiGet(
          buildURL(ASSET_ENDPOINTS.DEBT_DETAIL, { id: debt.id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedDebt = response.data
          this.showModal('debtDetailModal')
        }
      } catch (error) {
        logger.error('加载债务详情失败:', error)
        this.showError('加载债务详情失败')
      }
    },

    /**
     * 打开还款模态框
     * @param {Object} debt - 债务记录对象
     */
    openRepayModal(debt) {
      this.debtRepayForm = {
        debt_id: debt.id,
        amount: debt.remaining_amount || debt.amount || 0,
        payment_method: 'cash',
        note: ''
      }
      this.showModal('debtRepayModal')
    },

    /**
     * 提交还款
     */
    async submitDebtRepay() {
      if (!this.debtRepayForm.debt_id) {
        this.showError('债务信息无效')
        return
      }
      if (!this.debtRepayForm.amount || this.debtRepayForm.amount <= 0) {
        this.showError('请输入有效的还款金额')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(ASSET_ENDPOINTS.DEBT_REPAY, { id: this.debtRepayForm.debt_id }),
          {
            method: 'POST',
            data: {
              amount: this.debtRepayForm.amount,
              payment_method: this.debtRepayForm.payment_method,
              note: this.debtRepayForm.note
            }
          }
        )

        if (response?.success) {
          this.showSuccess('还款成功')
          this.hideModal('debtRepayModal')
          await this.loadDebts()
          await this.loadDebtStats()
        }
      } catch (error) {
        this.showError('还款失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 核销债务
     * @param {Object} debt - 债务记录对象
     */
    async writeOffDebt(debt) {
      await this.confirmAndExecute(
        `确定核销此债务？金额: ¥${debt.amount}`,
        async () => {
          const response = await this.apiCall(
            buildURL(ASSET_ENDPOINTS.DEBT_WRITE_OFF, { id: debt.id }),
            { method: 'PUT' }
          )
          if (response?.success) {
            await this.loadDebts()
            await this.loadDebtStats()
          }
        },
        { successMessage: '债务已核销' }
      )
    },

    /**
     * 获取债务状态CSS类
     * @param {string} status - 债务状态
     * @returns {string} CSS类名
     */
    getDebtStatusClass(status) {
      const map = {
        pending: 'bg-warning',
        partial: 'bg-info',
        paid: 'bg-success',
        overdue: 'bg-danger',
        written_off: 'bg-secondary'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取债务状态文本
     * @param {string} status - 债务状态
     * @returns {string} 状态文本
     */
    getDebtStatusText(status) {
      const map = {
        pending: '待还款',
        partial: '部分还款',
        paid: '已结清',
        overdue: '已逾期',
        written_off: '已核销'
      }
      return map[status] || status
    }
  }
}

export default { useDebtManagementState, useDebtManagementMethods }
