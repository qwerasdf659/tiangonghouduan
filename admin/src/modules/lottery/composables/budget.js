/**
 * 预算管理模块
 *
 * @file admin/src/modules/lottery/composables/budget.js
 * @description 活动预算配置和管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

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
    budgetFilters: { status: '', budget_type: '' },
    /** @type {Object} 预算表单 */
    budgetForm: {
      campaign_id: '',
      budget_mode: 'pool',
      pool_budget_total: 0,
      alert_threshold: 80,
      remark: ''
    },
    /** @type {number|string|null} 当前编辑的预算活动ID */
    editingBudgetCampaignId: null,

    // ========== P1新增: 消耗趋势图相关状态 ==========
    /** @type {Array} 7天预算消耗趋势数据 */
    budgetTrendData: [],
    /** @type {Object|null} 消耗趋势图表实例 */
    budgetTrendChart: null,
    /** @type {number|null} 选中的活动ID（用于查看趋势） */
    selectedBudgetCampaignId: null
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
     * @description apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
     */
    async loadBudgetData() {
      try {
        logger.debug('📊 [Budget] loadBudgetData 开始执行')
        const params = new URLSearchParams()
        params.append('page_size', 50)
        if (this.budgetFilters.status) {
          params.append('status', this.budgetFilters.status)
        }

        const apiUrl = `${LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_BATCH_STATUS}?${params}`

        const response = await this.apiGet(apiUrl, {}, { showLoading: false })

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response

        if (data) {
          const { campaigns, summary } = data

          // 使用后端返回的汇总数据
          this.budgetSummary = {
            total_budget: summary?.total_budget || 0,
            total_used: summary?.total_used || 0,
            total_remaining: summary?.total_remaining || 0,
            total_campaigns: summary?.total_campaigns || campaigns?.length || 0
          }

          // 仅前端筛选 budget_mode（活动状态已由后端 API 筛选）
          let filteredCampaigns = campaigns || []
          if (this.budgetFilters.budget_type) {
            filteredCampaigns = filteredCampaigns.filter(
              c => c.budget_mode === this.budgetFilters.budget_type
            )
          }

          this.budgetCampaigns = filteredCampaigns
          logger.debug('✅ [Budget] 数据加载完成, campaigns:', filteredCampaigns.length)
        }
      } catch (error) {
        logger.error('❌ [Budget] loadBudgetData 失败:', error)
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
        const campaign = this.budgetCampaigns.find(c => c.lottery_campaign_id === campaignId)
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
     * @description apiCall 成功时返回 response.data，失败时抛出错误
     */
    async submitBudget() {
      const campaignId = this.budgetForm.campaign_id || this.editingBudgetCampaignId
      if (!campaignId) {
        this.showError('请选择活动')
        return
      }

      try {
        this.saving = true
        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(
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

        // 如果没有抛出错误，则表示成功
        this.showSuccess('预算设置成功')
        this.hideModal('budgetModal')
        await this.loadBudgetData()
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

    // ✅ 已删除 getBudgetModeText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 budget_mode_display 字段

    // ========== P1新增: 消耗趋势图方法 ==========

    /**
     * 加载预算消耗趋势数据
     * 调用后端 lottery-strategy-stats/daily API 获取 lottery_daily_metrics 真实数据
     * @param {number} campaignId - 活动ID
     */
    async loadBudgetTrendData(campaignId = null) {
      try {
        const targetCampaignId = campaignId || this.selectedBudgetCampaignId
        if (!targetCampaignId) {
          logger.warn('[Budget] 未指定活动ID，无法加载趋势数据')
          return
        }

        logger.info('[Budget] 加载预算消耗趋势（真实数据）', { campaign_id: targetCampaignId })

        const url = buildURL(LOTTERY_ENDPOINTS.STRATEGY_STATS_DAILY, {
          campaign_id: targetCampaignId
        })
        const result = await this.apiCall(url)

        /* 后端返回 { lottery_campaign_id, start_date, end_date, data: [...] } */
        const dailyMetrics = result?.data || []

        /* 查找活动预算配置用于计算 remaining */
        const campaign = this.budgetCampaigns.find(c => c.lottery_campaign_id === targetCampaignId)
        const totalBudget = campaign?.pool_budget?.total || 0

        /* 将后端 daily_metrics 转换为图表所需格式 */
        let cumulative = 0
        this.budgetTrendData = dailyMetrics.map(m => {
          const daily = Number(m.total_budget_consumed) || 0
          cumulative += daily
          const dateStr = new Date(m.metric_date).toLocaleDateString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            timeZone: 'Asia/Shanghai'
          })
          return {
            date: dateStr,
            daily,
            cumulative,
            remaining: totalBudget - cumulative
          }
        })

        this.updateBudgetTrendChart()
      } catch (error) {
        logger.error('[Budget] 加载趋势数据失败:', error)
        this.budgetTrendData = []
      }
    },

    /**
     * 初始化预算趋势图表
     */
    async initBudgetTrendChart() {
      try {
        const echarts = await loadECharts()
        if (!echarts) {
          logger.warn('[Budget] ECharts 加载失败')
          return
        }

        const container = document.getElementById('budget-trend-chart')
        if (!container) {
          logger.warn('[Budget] 找不到图表容器 #budget-trend-chart')
          return
        }

        // 销毁旧实例
        if (this.budgetTrendChart) {
          this.budgetTrendChart.dispose()
        }

        this.budgetTrendChart = echarts.init(container)
        this.updateBudgetTrendChart()

        // 监听窗口大小变化（命名引用以便清理）
        this._budgetResizeHandler = () => {
          this.budgetTrendChart?.resize()
        }
        window.addEventListener('resize', this._budgetResizeHandler)

        logger.info('[Budget] 趋势图表初始化完成')
      } catch (error) {
        logger.error('[Budget] 初始化趋势图表失败:', error)
      }
    },

    /**
     * 更新预算趋势图表
     */
    updateBudgetTrendChart() {
      if (!this.budgetTrendChart) return

      const data = this.budgetTrendData
      if (!data || data.length === 0) {
        this.budgetTrendChart.setOption({
          title: {
            text: '暂无趋势数据',
            left: 'center',
            top: 'center',
            textStyle: { color: '#999', fontSize: 14 }
          }
        })
        return
      }

      const option = {
        title: {
          text: '7天预算消耗趋势',
          left: 'center',
          textStyle: { fontSize: 14, fontWeight: 'normal' }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: params => {
            const date = params[0].axisValue
            let html = `<div class="text-sm font-medium mb-1">${date}</div>`
            params.forEach(item => {
              html += `<div>${item.marker} ${item.seriesName}: ¥${item.value.toLocaleString()}</div>`
            })
            return html
          }
        },
        legend: {
          data: ['每日消耗', '累计消耗', '剩余预算'],
          bottom: 0
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: data.map(d => d.date),
          axisLabel: { fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          name: '金额(¥)',
          axisLabel: {
            formatter: value => {
              if (value >= 10000) return (value / 10000).toFixed(1) + 'w'
              if (value >= 1000) return (value / 1000).toFixed(1) + 'k'
              return value
            }
          }
        },
        series: [
          {
            name: '每日消耗',
            type: 'bar',
            data: data.map(d => d.daily),
            itemStyle: { color: '#3b82f6' },
            barMaxWidth: 30
          },
          {
            name: '累计消耗',
            type: 'line',
            data: data.map(d => d.cumulative),
            smooth: true,
            itemStyle: { color: '#ef4444' },
            lineStyle: { width: 2 }
          },
          {
            name: '剩余预算',
            type: 'line',
            data: data.map(d => d.remaining),
            smooth: true,
            itemStyle: { color: '#22c55e' },
            lineStyle: { width: 2, type: 'dashed' }
          }
        ]
      }

      this.budgetTrendChart.setOption(option)
    },

    /**
     * 查看活动预算趋势
     * @param {Object} campaign - 活动对象
     */
    async viewBudgetTrend(campaign) {
      const campaignId = campaign.lottery_campaign_id
      this.selectedBudgetCampaignId = campaignId

      // 加载趋势数据
      await this.loadBudgetTrendData(campaignId)

      // 初始化或更新图表
      ;(await this.$nextTick?.()) || (await new Promise(resolve => setTimeout(resolve, 100)))
      this.initBudgetTrendChart()

      // 显示趋势模态框
      this.showModal('budgetTrendModal')
    }
  }
}

export default { useBudgetState, useBudgetMethods }
