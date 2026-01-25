/**
 * 活动预算模块
 *
 * @file admin/src/modules/analytics/composables/campaign-budget.js
 * @description 活动预算配置和监控（基于后端实际提供的端点）
 * @version 2.0.0
 * @date 2026-01-24
 *
 * 后端可用端点（以后端为准）：
 * - GET /batch-status - 批量获取活动预算状态
 * - GET /campaigns/:campaign_id - 获取单个活动预算详情
 * - PUT /campaigns/:campaign_id - 更新活动预算配置
 * - GET /campaigns/:campaign_id/budget-status - 获取活动预算状态
 * - POST /campaigns/:campaign_id/pool/add - 补充活动池预算
 *
 * 注意：后端没有提供 LIST、CREATE、DELETE、TOGGLE 端点
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 活动预算状态
 * @returns {Object} 状态对象
 */
export function useCampaignBudgetState() {
  return {
    /** @type {Array} 活动预算列表（来自 batch-status） */
    budgets: [],
    /** @type {Object} 预算筛选条件 */
    budgetFilters: { campaign_id: '', status: '', keyword: '' },
    /** @type {Object} 预算统计（从 batch-status 数据计算） */
    budgetStats: { totalBudget: 0, usedBudget: 0, remainingBudget: 0, utilizationRate: 0 },
    /** @type {Object|null} 选中的预算 */
    selectedBudget: null,
    /** @type {Object} 预算表单 */
    budgetForm: {
      campaign_id: '',
      budget_mode: 'UNLIMITED',
      pool_budget_remaining: 0,
      allowed_campaign_ids: [],
      // HTML模板需要的字段
      type: 'daily',
      amount: 0,
      alertThreshold: 80
    },
    /** @type {boolean} 预算编辑模式 */
    budgetEditMode: false
  }
}

/**
 * 活动预算方法
 * @returns {Object} 方法对象
 */
export function useCampaignBudgetMethods() {
  return {
    /**
     * 加载活动预算列表（使用 batch-status 端点）
     * @description 后端没有专门的 LIST 端点，使用 batch-status 获取所有活动预算状态
     */
    async loadBudgets() {
      try {
        const params = new URLSearchParams()
        params.append('limit', this.pageSize || 50)
        if (this.budgetFilters.campaign_id) {
          params.append('campaign_ids', this.budgetFilters.campaign_id)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          // batch-status 返回的数据结构：campaigns 数组
          let rawBudgets = response.data.campaigns || response.data.budgets || response.data || []

          // 如果是对象格式（按 campaign_id 索引），转换为数组
          if (!Array.isArray(rawBudgets) && typeof rawBudgets === 'object') {
            rawBudgets = Object.values(rawBudgets)
          }

          // 转换后端返回的嵌套结构为扁平结构（供前端使用）
          rawBudgets = rawBudgets.map(budget => ({
            ...budget,
            // 扁平化 pool_budget 字段
            pool_budget_remaining: budget.pool_budget?.remaining ?? budget.pool_budget_remaining ?? 0,
            pool_budget_total: budget.pool_budget?.total ?? budget.pool_budget_total ?? 0,
            pool_budget_used: budget.pool_budget?.used ?? 0,
            usage_rate: budget.pool_budget?.usage_rate ?? '0%'
          }))

          // 应用筛选
          this.budgets = rawBudgets.filter(budget => {
            // 状态筛选
            if (this.budgetFilters.status) {
              const budgetStatus = this.getBudgetStatusFromData(budget)
              if (budgetStatus !== this.budgetFilters.status) return false
            }
            // 关键词筛选
            if (this.budgetFilters.keyword) {
              const keyword = this.budgetFilters.keyword.toLowerCase()
              const name = (budget.campaign_name || budget.name || '').toLowerCase()
              if (!name.includes(keyword)) return false
            }
            return true
          })

          this.total = this.budgets.length
          this.totalPages = Math.ceil(this.budgets.length / (this.pageSize || 20))

          // 使用后端返回的 summary 或从数据计算统计
          if (response.data.summary) {
            this.budgetStats = {
              totalBudget: response.data.summary.total_budget || 0,
              usedBudget: response.data.summary.total_used || 0,
              remainingBudget: response.data.summary.total_remaining || 0,
              utilizationRate: response.data.summary.total_budget > 0 
                ? Math.round((response.data.summary.total_used / response.data.summary.total_budget) * 100) 
                : 0
            }
          } else {
            // 从数据计算统计
            this.calculateBudgetStats(rawBudgets)
          }
        }
      } catch (error) {
        logger.error('加载活动预算失败:', error)
        this.budgets = []
      }
    },

    /**
     * 从 batch-status 数据计算预算统计
     * @param {Array} budgets - 预算数据数组
     */
    calculateBudgetStats(budgets) {
      if (!Array.isArray(budgets) || budgets.length === 0) {
        this.budgetStats = { totalBudget: 0, usedBudget: 0, remainingBudget: 0, utilizationRate: 0 }
        return
      }

      let totalBudget = 0
      let remainingBudget = 0

      budgets.forEach(budget => {
        // 根据后端返回的字段名提取数据
        const poolRemaining = budget.pool_budget_remaining ?? budget.remaining ?? 0
        const poolTotal = budget.pool_budget_total ?? budget.total_budget ?? poolRemaining

        totalBudget += poolTotal
        remainingBudget += poolRemaining
      })

      const usedBudget = totalBudget - remainingBudget
      const utilizationRate = totalBudget > 0 ? Math.round((usedBudget / totalBudget) * 100) : 0

      this.budgetStats = {
        totalBudget,
        usedBudget,
        remainingBudget,
        utilizationRate
      }
    },

    /**
     * 从预算数据推断状态
     * @param {Object} budget - 预算对象
     * @returns {string} 状态字符串
     */
    getBudgetStatusFromData(budget) {
      if (budget.status) return budget.status
      if (budget.budget_mode === 'UNLIMITED') return 'active'
      if ((budget.pool_budget_remaining ?? 0) <= 0) return 'exhausted'
      return 'active'
    },

    /**
     * 加载预算统计（调用 loadBudgets 时会自动计算）
     * @description 后端没有专门的 STATS 端点，统计从 batch-status 数据计算
     */
    async loadBudgetStats() {
      // 如果已有预算数据，直接从缓存计算
      if (this.budgets.length > 0) {
        this.calculateBudgetStats(this.budgets)
        return
      }
      // 否则先加载预算列表（会自动计算统计）
      await this.loadBudgets()
    },

    /**
     * 搜索预算
     */
    searchBudgets() {
      this.page = 1
      this.loadBudgets()
    },

    /**
     * 打开编辑预算模态框
     * @param {Object} budget - 预算对象
     * @description 后端只支持更新现有活动的预算配置，不支持创建新预算
     */
    openEditBudgetModal(budget) {
      this.budgetForm = {
        campaign_id: budget.campaign_id,
        budget_mode: budget.budget_mode || 'UNLIMITED',
        pool_budget_remaining: budget.pool_budget_remaining || 0,
        allowed_campaign_ids: budget.allowed_campaign_ids || []
      }
      this.selectedBudget = budget
      this.budgetEditMode = true
      this.showModal('budgetFormModal')
    },

    /**
     * 提交预算（别名，供HTML模板使用）
     */
    async submitBudget() {
      return this.saveBudget()
    },

    /**
     * 保存预算配置
     * @description 只支持更新现有活动预算，后端没有 CREATE 端点
     */
    async saveBudget() {
      if (!this.budgetForm.campaign_id) {
        this.showError('请选择活动')
        return
      }

      try {
        this.saving = true

        // 只支持更新模式
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_UPDATE, { campaign_id: this.budgetForm.campaign_id }),
          {
            method: 'PUT',
            body: JSON.stringify({
              budget_mode: this.budgetForm.budget_mode,
              pool_budget_remaining: this.budgetForm.pool_budget_remaining,
              allowed_campaign_ids: this.budgetForm.allowed_campaign_ids
            })
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
     * 补充预算池
     * @param {Object} budget - 预算对象
     * @param {number} amount - 补充金额
     */
    async addBudgetPool(budget, amount) {
      if (!amount || amount <= 0) {
        this.showError('请输入有效的补充金额')
        return
      }

      await this.confirmAndExecute(
        `确定为该活动补充 ${amount} 预算积分？`,
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_POOL_ADD, { campaign_id: budget.campaign_id }),
            {
              method: 'POST',
              body: JSON.stringify({ amount })
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
          buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_DETAIL, { campaign_id: budget.campaign_id }),
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
      if (rate >= 90) return 'text-danger'
      if (rate >= 70) return 'text-warning'
      return 'text-success'
    },

    /**
     * 获取预算状态CSS类
     * @param {string} status - 预算状态
     * @returns {string} CSS类名
     */
    getBudgetStatusClass(status) {
      const map = {
        active: 'bg-success',
        paused: 'bg-warning',
        exhausted: 'bg-danger',
        expired: 'bg-secondary',
        UNLIMITED: 'bg-info',
        BUDGET_POINTS: 'bg-primary'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取预算状态文本
     * @param {string} status - 预算状态
     * @returns {string} 状态文本
     */
    getBudgetStatusText(status) {
      const map = {
        active: '运行中',
        paused: '已暂停',
        exhausted: '已耗尽',
        expired: '已过期',
        UNLIMITED: '无限制',
        BUDGET_POINTS: '预算积分'
      }
      return map[status] || status
    },

    /**
     * 获取预算模式文本
     * @param {string} mode - 预算模式
     * @returns {string} 模式文本
     */
    getBudgetModeText(mode) {
      const map = {
        UNLIMITED: '无限制模式',
        BUDGET_POINTS: '预算积分模式'
      }
      return map[mode] || mode
    }
  }
}

export default { useCampaignBudgetState, useCampaignBudgetMethods }
