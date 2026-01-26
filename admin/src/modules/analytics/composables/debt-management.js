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
    /** @type {Object} 债务筛选条件 - 适配后端 debt-management API */
    debtFilters: {
      debt_type: '', // 欠账类型: inventory|budget
      campaign_id: '' // 活动ID（可选）
    },
    /** @type {Object} 债务统计 - 来自 /dashboard 接口 */
    debtStats: {
      total_inventory_debt: 0, // 库存欠账总数
      total_budget_debt: 0, // 预算欠账总额
      pending_count: 0, // 待处理数量
      cleared_today: 0 // 今日清偿数量
    },
    /** @type {Object|null} 选中的债务记录 */
    selectedDebt: null,
    /** @type {Object} 债务清偿表单 - 适配 /clear 接口 */
    debtRepayForm: {
      debt_type: 'inventory', // 欠账类型: inventory|budget
      debt_id: '',
      amount: 0,
      remark: ''
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
     * 加载债务列表 - 适配后端 /pending 接口
     */
    async loadDebts() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.debtFilters.debt_type) params.append('debt_type', this.debtFilters.debt_type)
        if (this.debtFilters.campaign_id) params.append('campaign_id', this.debtFilters.campaign_id)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 后端返回的是 items (最新) 或 pending_debts 或 list
          this.debts =
            response.data?.items ||
            response.data?.pending_debts ||
            response.data?.list ||
            response.data?.rows ||
            []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          } else if (response.data?.count !== undefined) {
            this.total = response.data.count
            this.totalPages = Math.ceil(response.data.count / this.pageSize) || 1
          }
        }
      } catch (error) {
        logger.error('加载债务列表失败:', error)
        this.debts = []
      }
    },

    /**
     * 加载债务统计 - 适配后端 /dashboard 接口
     */
    async loadDebtStats() {
      try {
        const response = await this.apiGet(
          ASSET_ENDPOINTS.DEBT_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          // 适配后端返回的字段 - 后端返回 inventory_debt/budget_debt 对象结构
          const invDebt = response.data.inventory_debt || {}
          const budDebt = response.data.budget_debt || {}
          this.debtStats = {
            total_inventory_debt:
              invDebt.remaining_quantity ??
              invDebt.total_quantity ??
              response.data.total_inventory_debt ??
              0,
            total_budget_debt:
              budDebt.remaining_amount ??
              budDebt.total_amount ??
              response.data.total_budget_debt ??
              0,
            pending_count:
              (invDebt.pending_count || 0) + (budDebt.pending_count || 0) ||
              response.data.pending_count ||
              0,
            cleared_today: response.data.cleared_today ?? 0
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
        debt_type: '',
        campaign_id: ''
      }
      this.page = 1
      this.loadDebts()
    },

    /**
     * 查看债务详情 - 直接使用选中的债务对象
     * @param {Object} debt - 债务记录对象
     */
    viewDebtDetail(debt) {
      this.selectedDebt = debt
      this.showModal('debtDetailModal')
    },

    /**
     * 打开清偿模态框 - 适配后端 /clear 接口
     * @param {Object} debt - 债务记录对象
     */
    openRepayModal(debt) {
      this.debtRepayForm = {
        debt_type: debt.debt_type || 'inventory',
        debt_id: debt.debt_id || debt.id,
        amount: debt.remaining_amount || debt.owed_quantity || debt.amount || 0,
        remark: ''
      }
      this.selectedDebt = debt
      this.showModal('debtRepayModal')
    },

    /**
     * 提交清偿 - 适配后端 /clear 接口
     */
    async submitDebtRepay() {
      if (!this.debtRepayForm.debt_id) {
        this.showError('债务信息无效')
        return
      }
      if (!this.debtRepayForm.amount || this.debtRepayForm.amount <= 0) {
        this.showError('请输入有效的清偿数量/金额')
        return
      }

      try {
        this.saving = true
        // 后端 /clear 接口使用 POST 方法
        const response = await this.apiPost(ASSET_ENDPOINTS.DEBT_REPAY, {
          debt_type: this.debtRepayForm.debt_type,
          debt_id: this.debtRepayForm.debt_id,
          amount: this.debtRepayForm.amount,
          remark: this.debtRepayForm.remark
        })

        if (response?.success) {
          const message = response.data?.is_fully_cleared ? '欠账已完全清偿' : '欠账部分清偿成功'
          this.showSuccess(message)
          this.hideModal('debtRepayModal')
          await this.loadDebts()
          await this.loadDebtStats()
        }
      } catch (error) {
        this.showError('清偿失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 核销债务 - 适配后端 /clear 接口
     * @param {Object} debt - 债务记录对象
     */
    async writeOffDebt(debt) {
      const amount = debt.owed_quantity || debt.remaining_amount || debt.amount
      await this.confirmAndExecute(
        `确定全额清偿此欠账？数量/金额: ${amount}`,
        async () => {
          const response = await this.apiPost(ASSET_ENDPOINTS.DEBT_WRITE_OFF, {
            debt_type: debt.debt_type || 'inventory',
            debt_id: debt.debt_id || debt.id,
            amount: amount,
            remark: '管理员核销'
          })
          if (response?.success) {
            await this.loadDebts()
            await this.loadDebtStats()
          }
        },
        { successMessage: '欠账已清偿' }
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
