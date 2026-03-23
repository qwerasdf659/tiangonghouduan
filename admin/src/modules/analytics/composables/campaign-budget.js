/**
 * 活动预算模块（分区域展示：用户预算 / 活动池预算）
 *
 * @file admin/src/modules/analytics/composables/campaign-budget.js
 * @description 活动预算配置和监控，按 budget_mode 分组展示，
 *              让运营清晰区分「用户账户级别预算」和「活动账户级别预算」
 * @version 3.0.0
 * @date 2026-03-09
 *
 * 预算模式说明：
 * - user：用户账户级别预算 — 预算来源是用户的 BUDGET_POINTS 余额（按活动桶隔离）
 * - pool：活动账户级别预算 — 预算来源是活动自身的固定预算池（pool_budget_total/remaining）
 * - none：无预算控制
 *
 * 后端可用端点（以后端为准）：
 * - GET /batch-status - 批量获取活动预算状态（按 budget_mode 分组返回）
 * - GET /campaigns/:lottery_campaign_id - 获取单个活动预算详情
 * - PUT /campaigns/:lottery_campaign_id - 更新活动预算配置
 * - GET /campaigns/:lottery_campaign_id/budget-status - 获取活动预算状态
 * - POST /campaigns/:lottery_campaign_id/pool/add - 补充活动池预算
 * - GET /users/:user_id - 获取用户 BUDGET_POINTS 余额
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 活动预算状态（分区域）
 * @returns {Object} 状态对象
 */
export function useCampaignBudgetState() {
  return {
    /** @type {Array} 所有活动预算列表（兼容旧逻辑） */
    budgets: [],

    /** @type {string} 当前激活的预算区域 tab（user / pool） */
    budgetActiveTab: 'user',

    /** @type {Object} 按 budget_mode 分组的活动数据 */
    groupedBudgets: {
      user: { campaigns: [], summary: {} },
      pool: { campaigns: [], summary: {} },
      none: { campaigns: [], summary: {} }
    },

    /** @type {Object} 预算筛选条件 */
    budgetFilters: { lottery_campaign_id: '', status: '', keyword: '' },

    /** @type {Object} 总体预算统计 */
    budgetStats: {
      total_budget: 0,
      used_budget: 0,
      remaining_budget: 0,
      utilization_rate: 0,
      by_mode: null
    },

    /** @type {Object|null} 选中的预算 */
    selectedBudget: null,

    /** @type {Object} 预算表单 */
    budgetForm: {
      lottery_campaign_id: '',
      budget_mode: 'user',
      pool_budget_total: 0,
      allowed_campaign_ids: [],
      alert_threshold: 80
    },

    /** @type {boolean} 预算编辑模式 */
    budgetEditMode: false
  }
}

/**
 * 活动预算方法（分区域展示）
 * @returns {Object} 方法对象
 */
export function useCampaignBudgetMethods() {
  return {
    /**
     * 加载活动预算列表（后端按 budget_mode 分组返回）
     */
    async loadBudgets() {
      try {
        const params = new URLSearchParams()
        params.append('page_size', 50)
        if (this.budgetFilters.lottery_campaign_id) {
          params.append('lottery_campaign_ids', this.budgetFilters.lottery_campaign_id)
        }
        if (this.budgetFilters.status) {
          params.append('status', this.budgetFilters.status)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          const data = response.data

          // 存储分组数据（后端 V3 返回 grouped 字段）
          if (data.grouped) {
            this.groupedBudgets = {
              user: data.grouped.user || { campaigns: [], summary: {} },
              pool: data.grouped.pool || { campaigns: [], summary: {} },
              none: data.grouped.none || { campaigns: [], summary: {} }
            }
          }

          // 兼容：保留扁平列表
          this.budgets = data.campaigns || []

          // 应用前端关键词筛选
          if (this.budgetFilters.keyword) {
            const keyword = this.budgetFilters.keyword.toLowerCase()
            const filterFn = c => {
              const name = (c.campaign_name || '').toLowerCase()
              return name.includes(keyword)
            }
            this.groupedBudgets.user.campaigns = this.groupedBudgets.user.campaigns.filter(filterFn)
            this.groupedBudgets.pool.campaigns = this.groupedBudgets.pool.campaigns.filter(filterFn)
            this.groupedBudgets.none.campaigns = this.groupedBudgets.none.campaigns.filter(filterFn)
          }

          // 使用后端返回的汇总
          if (data.summary) {
            this.budgetStats = {
              total_budget: data.summary.total_budget || 0,
              used_budget: data.summary.total_used || 0,
              remaining_budget: data.summary.total_remaining || 0,
              utilization_rate:
                data.summary.total_budget > 0
                  ? Math.round((data.summary.total_used / data.summary.total_budget) * 100)
                  : 0,
              by_mode: data.summary.by_mode || null
            }
          }

          this.financePagination.total = this.budgets.length
        }
      } catch (error) {
        logger.error('加载活动预算失败:', error)
        this.budgets = []
        this.groupedBudgets = {
          user: { campaigns: [], summary: {} },
          pool: { campaigns: [], summary: {} },
          none: { campaigns: [], summary: {} }
        }
      }
    },

    /**
     * 加载预算统计（loadBudgets 时已自动计算）
     */
    async loadBudgetStats() {
      if (this.budgets.length > 0) return
      await this.loadBudgets()
    },

    /**
     * 切换预算区域 tab
     * @param {string} tab - user / pool
     */
    switchBudgetTab(tab) {
      this.budgetActiveTab = tab
    },

    /**
     * 搜索预算
     */
    searchBudgets() {
      this.financePagination.page = 1
      this.loadBudgets()
    },

    /**
     * 获取活动状态中文显示
     * @param {string} status - 活动状态
     * @returns {string} 中文状态和样式类
     */
    getStatusDisplay(status) {
      const map = {
        active: { label: '运行中', class: 'bg-green-100 text-green-800' },
        draft: { label: '草稿', class: 'bg-gray-100 text-gray-800' },
        paused: { label: '暂停', class: 'bg-yellow-100 text-yellow-800' },
        ended: { label: '已结束', class: 'bg-blue-100 text-blue-800' },
        cancelled: { label: '已取消', class: 'bg-red-100 text-red-800' }
      }
      return map[status] || { label: status || '-', class: 'bg-gray-100 text-gray-600' }
    },

    /**
     * 打开编辑预算模态框
     * @param {Object} budget - 预算对象
     */
    openEditBudgetModal(budget) {
      this.budgetForm = {
        lottery_campaign_id: budget.lottery_campaign_id,
        budget_mode: budget.budget_mode || 'user',
        pool_budget_total: budget.pool_budget?.total || 0,
        allowed_campaign_ids: budget.allowed_campaign_ids || []
      }
      this.selectedBudget = budget
      this.budgetEditMode = true
      this.showModal('budgetFormModal')
    },

    /**
     * 保存预算配置
     */
    async saveBudget() {
      if (!this.budgetForm.lottery_campaign_id) {
        this.showError('请选择活动')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_UPDATE, {
            lottery_campaign_id: this.budgetForm.lottery_campaign_id
          }),
          {
            method: 'PUT',
            data: {
              budget_mode: this.budgetForm.budget_mode,
              pool_budget_total: parseFloat(this.budgetForm.pool_budget_total) || 0,
              allowed_campaign_ids: this.budgetForm.allowed_campaign_ids
            }
          }
        )

        if (response?.success) {
          this.showSuccess('预算配置更新成功')
          this.hideModal('budgetFormModal')
          await this.loadBudgets()
        }
      } catch (error) {
        this.showError('保存预算失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 补充活动池预算
     * @param {Object} budget - 预算对象
     * @param {number} amount - 补充金额
     */
    async addBudgetPool(budget, amount) {
      if (!amount || amount <= 0) {
        this.showError('请输入有效的补充金额')
        return
      }

      await this.confirmAndExecute(
        `确定为活动「${budget.campaign_name}」补充 ${amount} 预算积分？`,
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_POOL_ADD, {
              lottery_campaign_id: budget.lottery_campaign_id
            }),
            {
              method: 'POST',
              data: { amount, reason: '管理员手动补充' }
            }
          )
          if (response?.success) {
            await this.loadBudgets()
          }
        },
        { successMessage: '预算补充成功' }
      )
    },

    /**
     * 查看预算详情
     * @param {Object} budget - 预算对象
     */
    async viewBudgetDetail(budget) {
      try {
        const response = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_DETAIL, {
            lottery_campaign_id: budget.lottery_campaign_id
          }),
          {},
          { showLoading: true }
        )

        if (response?.success) {
          this.selectedBudget = response.data
          this.showModal('budgetDetailModal')
        }
      } catch (error) {
        this.showError('获取预算详情失败: ' + (error.message || '未知错误'))
      }
    },

    /**
     * 获取预算使用率颜色
     * @param {number} rate - 使用率百分比
     * @returns {string} 颜色类名
     */
    getBudgetRateColor(rate) {
      if (rate >= 90) return 'text-red-600'
      if (rate >= 70) return 'text-yellow-600'
      return 'text-green-600'
    },

    /**
     * 获取预算状态CSS类
     * @param {string} status - 预算状态
     * @returns {string} CSS类名
     */
    getBudgetStatusClass(status) {
      const map = {
        active: 'bg-green-100 text-green-800',
        paused: 'bg-yellow-100 text-yellow-800',
        ended: 'bg-blue-100 text-blue-800',
        cancelled: 'bg-red-100 text-red-800',
        exhausted: 'bg-red-100 text-red-800'
      }
      return map[status] || 'bg-gray-100 text-gray-600'
    }
  }
}

export default { useCampaignBudgetState, useCampaignBudgetMethods }
