/**
 * 预算管理模块
 *
 * @file admin/src/modules/lottery/composables/budget.js
 * @description 活动预算配置和管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 预算管理状态
 * @returns {Object} 状态对象
 */
export function useBudgetState() {
  return {
    /** @type {Array} 预算活动列表 */
    budgetCampaigns: [],
    /** @type {Object} 预算汇总 */
    budgetSummary: { total_budget: 0, total_used: 0, total_remaining: 0, total_campaigns: 0 },
    /** @type {Object} 预算筛选条件 */
    budgetFilters: { status: '', budgetType: '' },
    /** @type {Object} 预算表单 */
    budgetForm: {
      campaign_id: '',
      budget_mode: 'pool',
      pool_budget_total: 0,
      alert_threshold: 80,
      remark: ''
    },
    /** @type {number|string|null} 当前编辑的预算活动ID */
    editingBudgetCampaignId: null
  }
}

/**
 * 预算管理方法
 * @returns {Object} 方法对象
 */
export function useBudgetMethods() {
  return {
    /**
     * 加载预算数据
     */
    async loadBudgetData() {
      try {
        const params = new URLSearchParams()
        params.append('limit', 50)
        if (this.budgetFilters.status) {
          params.append('status', this.budgetFilters.status)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          const { campaigns, summary } = response.data || {}

          this.budgetSummary = {
            total_budget: summary?.total_budget || 0,
            total_used: summary?.total_used || 0,
            total_remaining: summary?.total_remaining || 0,
            total_campaigns: summary?.total_campaigns || 0
          }

          let filteredCampaigns = campaigns || []
          if (this.budgetFilters.status) {
            filteredCampaigns = filteredCampaigns.filter(
              c => c.status === this.budgetFilters.status
            )
          }
          if (this.budgetFilters.budgetType) {
            filteredCampaigns = filteredCampaigns.filter(
              c => c.budget_mode === this.budgetFilters.budgetType
            )
          }

          this.budgetCampaigns = filteredCampaigns
        }
      } catch (error) {
        logger.error('加载预算数据失败:', error)
        this.budgetCampaigns = []
      }
    },

    /**
     * 打开设置预算模态框
     * @param {number|string|null} campaignId - 活动ID
     */
    openSetBudgetModal(campaignId = null) {
      this.editingBudgetCampaignId = campaignId
      if (campaignId) {
        const campaign = this.budgetCampaigns.find(c => (c.campaign_id || c.id) === campaignId)
        if (campaign) {
          this.budgetForm = {
            campaign_id: campaignId,
            budget_mode: campaign.budget_mode || 'pool',
            pool_budget_total: campaign.pool_budget?.total || 0,
            alert_threshold: campaign.alert_threshold || 80,
            remark: campaign.remark || ''
          }
        }
      } else {
        this.budgetForm = {
          campaign_id: '',
          budget_mode: 'pool',
          pool_budget_total: 0,
          alert_threshold: 80,
          remark: ''
        }
      }
      this.showModal('budgetModal')
    },

    /**
     * 提交预算设置
     */
    async submitBudget() {
      const campaignId = this.budgetForm.campaign_id || this.editingBudgetCampaignId
      if (!campaignId) {
        this.showError('请选择活动')
        return
      }

      try {
        this.saving = true
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_UPDATE, { campaign_id: campaignId }),
          {
            method: 'PUT',
            data: {
              budget_mode: this.budgetForm.budget_mode,
              pool_budget_total: parseFloat(this.budgetForm.pool_budget_total) || 0,
              alert_threshold: parseInt(this.budgetForm.alert_threshold) || 80
            }
          }
        )

        if (response?.success) {
          this.showSuccess('预算设置成功')
          this.hideModal('budgetModal')
          await this.loadBudgetData()
        }
      } catch (error) {
        this.showError('预算设置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取预算使用率
     * @param {Object} campaign - 预算配置对象
     * @returns {number|string} 使用率百分比
     */
    getBudgetUsageRate(campaign) {
      const total = campaign.pool_budget?.total || 0
      const used = campaign.pool_budget?.used || 0
      return total > 0 ? ((used / total) * 100).toFixed(1) : 0
    },

    /**
     * 获取预算使用率样式类
     * @param {Object} campaign - 预算配置对象
     * @returns {string} CSS类名
     */
    getBudgetUsageClass(campaign) {
      const rate = this.getBudgetUsageRate(campaign)
      if (rate >= 90) return 'bg-danger'
      if (rate >= 70) return 'bg-warning'
      return 'bg-success'
    },

    /**
     * 获取预算模式文本
     * @param {string} mode - 预算模式代码
     * @returns {string} 预算模式文本
     */
    getBudgetModeText(mode) {
      const modeMap = { pool: '总预算', user: '用户预算', daily: '每日预算', none: '无预算' }
      return modeMap[mode] || mode || '未设置'
    }
  }
}

export default { useBudgetState, useBudgetMethods }

