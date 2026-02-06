/**
 * 系统垫付看板模块 - P1-10
 *
 * @file admin/src/modules/lottery/composables/system-advance.js
 * @description 系统垫付汇总，展示库存/预算垫付情况
 * @version 1.0.0
 * @date 2026-02-03
 *
 * 使用 ASSET_ENDPOINTS 欠账管理相关端点
 */

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'

/**
 * 系统垫付状态
 * @returns {Object} 状态对象
 */
export function useSystemAdvanceState() {
  return {
    /** @type {Object} 垫付看板汇总数据 */
    advanceDashboard: {
      total_inventory_debt: 0, // 库存欠账总数
      total_budget_debt: 0, // 预算欠账总额
      pending_count: 0, // 待处理欠账数
      cleared_today: 0, // 今日已清偿
      inventory_debt_details: {}, // 库存欠账详情
      budget_debt_details: {} // 预算欠账详情
    },
    /** @type {Array} 按活动分组的垫付列表 */
    advanceByCampaign: [],
    /** @type {Array} 按奖品分组的库存垫付列表 */
    advanceByPrize: [],
    /** @type {Array} 按责任人分组的垫付列表 */
    advanceByCreator: [],
    /** @type {Object} 垫付趋势数据 */
    advanceTrend: {
      period: 'day',
      days: 30,
      data: []
    },
    /** @type {Object} 垫付筛选条件 */
    advanceFilters: {
      debt_type: '', // inventory | budget
      campaign_id: '',
      period: 'day',
      days: 30
    },
    /** @type {Object} 垫付分页 */
    advancePagination: {
      page: 1,
      page_size: 20,
      total: 0
    },
    /** @type {string} 当前垫付视图 Tab */
    advanceViewTab: 'overview' // overview | by-campaign | by-prize | by-creator | trend
  }
}

/**
 * 系统垫付方法
 * @returns {Object} 方法对象
 */
export function useSystemAdvanceMethods() {
  return {
    /**
     * 加载垫付看板汇总
     */
    async loadAdvanceDashboard() {
      try {
        const response = await this.apiGet(
          ASSET_ENDPOINTS.DEBT_STATS,
          {},
          { showLoading: false, showError: false }
        )

        if (response?.success && response.data) {
          const data = response.data
          this.advanceDashboard = {
            total_inventory_debt:
              data.inventory_debt?.remaining_quantity ??
              data.inventory_debt?.total_quantity ??
              data.total_inventory_debt ??
              0,
            total_budget_debt:
              data.budget_debt?.remaining_amount ??
              data.budget_debt?.total_amount ??
              data.total_budget_debt ??
              0,
            pending_count:
              (data.inventory_debt?.pending_count || 0) +
                (data.budget_debt?.pending_count || 0) ||
              data.pending_count ||
              0,
            cleared_today: data.cleared_today ?? 0,
            inventory_debt_details: data.inventory_debt || {},
            budget_debt_details: data.budget_debt || {}
          }
          logger.debug('[SystemAdvance] 加载垫付看板成功:', this.advanceDashboard)
        }
      } catch (error) {
        logger.error('[SystemAdvance] 加载垫付看板失败:', error)
      }
    },

    /**
     * 加载按活动分组的垫付数据
     */
    async loadAdvanceByCampaign() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.advancePagination?.page || 1)
        params.append('page_size', this.advancePagination?.page_size || 20)
        if (this.advanceFilters.debt_type) params.append('debt_type', this.advanceFilters.debt_type)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_DETAIL}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.advanceByCampaign =
            response.data?.list || response.data?.items || response.data?.campaigns || []
          if (response.data?.pagination) {
            this.advancePagination.total = response.data.pagination.total || 0
          }
          logger.debug(
            '[SystemAdvance] 加载按活动分组垫付成功:',
            this.advanceByCampaign.length,
            '条'
          )
        }
      } catch (error) {
        logger.error('[SystemAdvance] 加载按活动分组垫付失败:', error)
        this.advanceByCampaign = []
      }
    },

    /**
     * 加载按奖品分组的库存垫付
     */
    async loadAdvanceByPrize() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.advancePagination?.page || 1)
        params.append('page_size', this.advancePagination?.page_size || 20)
        if (this.advanceFilters.campaign_id)
          params.append('lottery_campaign_id', this.advanceFilters.campaign_id)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_BY_PRIZE}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.advanceByPrize =
            response.data?.list || response.data?.items || response.data?.prizes || []
          if (response.data?.pagination) {
            this.advancePagination.total = response.data.pagination.total || 0
          }
          logger.debug('[SystemAdvance] 加载按奖品分组垫付成功:', this.advanceByPrize.length, '条')
        }
      } catch (error) {
        logger.error('[SystemAdvance] 加载按奖品分组垫付失败:', error)
        this.advanceByPrize = []
      }
    },

    /**
     * 加载按责任人分组的垫付
     */
    async loadAdvanceByCreator() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.advancePagination?.page || 1)
        params.append('page_size', this.advancePagination?.page_size || 20)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_BY_CREATOR}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.advanceByCreator =
            response.data?.list || response.data?.items || response.data?.creators || []
          if (response.data?.pagination) {
            this.advancePagination.total = response.data.pagination.total || 0
          }
          logger.debug(
            '[SystemAdvance] 加载按责任人分组垫付成功:',
            this.advanceByCreator.length,
            '条'
          )
        }
      } catch (error) {
        logger.error('[SystemAdvance] 加载按责任人分组垫付失败:', error)
        this.advanceByCreator = []
      }
    },

    /**
     * 加载垫付趋势数据
     */
    async loadAdvanceTrend() {
      try {
        const params = new URLSearchParams()
        params.append('period', this.advanceFilters.period || 'day')
        params.append('days', this.advanceFilters.days || 30)
        if (this.advanceFilters.debt_type) params.append('debt_type', this.advanceFilters.debt_type)

        const response = await this.apiGet(
          `${ASSET_ENDPOINTS.DEBT_TREND}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.advanceTrend = {
            period: response.data?.period || 'day',
            days: response.data?.days || 30,
            data: response.data?.trend || response.data?.data || []
          }
          logger.debug('[SystemAdvance] 加载垫付趋势成功:', this.advanceTrend.data.length, '条')

          // 初始化趋势图表
          this.$nextTick(() => {
            this.initAdvanceTrendChart()
          })
        }
      } catch (error) {
        logger.error('[SystemAdvance] 加载垫付趋势失败:', error)
        this.advanceTrend.data = []
      }
    },

    /**
     * 初始化垫付趋势图表
     */
    initAdvanceTrendChart() {
      const chartDom = document.getElementById('advanceTrendChart')
      if (!chartDom || !window.echarts) {
        logger.warn('[SystemAdvance] 图表容器或 ECharts 不可用')
        return
      }

      const chart = window.echarts.init(chartDom)
      const trendData = this.advanceTrend.data || []

      const option = {
        title: {
          text: '垫付趋势',
          left: 'center',
          textStyle: { fontSize: 14 }
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            let result = params[0]?.axisValue || ''
            params.forEach((item) => {
              result += `<br/>${item.marker}${item.seriesName}: ${item.value}`
            })
            return result
          }
        },
        legend: {
          data: ['库存垫付', '预算垫付'],
          bottom: 10
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: trendData.map((item) => item.date || item.period)
        },
        yAxis: {
          type: 'value'
        },
        series: [
          {
            name: '库存垫付',
            type: 'line',
            smooth: true,
            data: trendData.map((item) => item.inventory_debt || item.inventory || 0),
            itemStyle: { color: '#f59e0b' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
                  { offset: 1, color: 'rgba(245, 158, 11, 0.05)' }
                ]
              }
            }
          },
          {
            name: '预算垫付',
            type: 'line',
            smooth: true,
            data: trendData.map((item) => item.budget_debt || item.budget || 0),
            itemStyle: { color: '#3b82f6' },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                  { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                ]
              }
            }
          }
        ]
      }

      chart.setOption(option)

      // 响应式调整
      window.addEventListener('resize', () => chart.resize())
    },

    /**
     * 切换垫付视图 Tab
     * @param {string} tab - Tab 名称
     */
    async switchAdvanceTab(tab) {
      this.advanceViewTab = tab
      this.advancePagination.page = 1

      switch (tab) {
        case 'overview':
          await this.loadAdvanceDashboard()
          break
        case 'by-campaign':
          await this.loadAdvanceByCampaign()
          break
        case 'by-prize':
          await this.loadAdvanceByPrize()
          break
        case 'by-creator':
          await this.loadAdvanceByCreator()
          break
        case 'trend':
          await this.loadAdvanceTrend()
          break
      }
    },

    /**
     * 刷新垫付数据
     */
    async refreshAdvanceData() {
      await this.loadAdvanceDashboard()
      if (this.advanceViewTab === 'by-campaign') {
        await this.loadAdvanceByCampaign()
      } else if (this.advanceViewTab === 'by-prize') {
        await this.loadAdvanceByPrize()
      } else if (this.advanceViewTab === 'by-creator') {
        await this.loadAdvanceByCreator()
      } else if (this.advanceViewTab === 'trend') {
        await this.loadAdvanceTrend()
      }
    },

    /**
     * 垫付分页切换
     * @param {number} page - 页码
     */
    changeAdvancePage(page) {
      this.advancePagination.page = page
      switch (this.advanceViewTab) {
        case 'by-campaign':
          this.loadAdvanceByCampaign()
          break
        case 'by-prize':
          this.loadAdvanceByPrize()
          break
        case 'by-creator':
          this.loadAdvanceByCreator()
          break
      }
    },

    /**
     * 获取垫付总页数
     * 注意：改为普通方法避免在对象展开时触发 getter
     * @returns {number} 总页数
     */
    getAdvanceTotalPages() {
      const pagination = this.advancePagination || { total: 0, page_size: 20 }
      return Math.ceil(pagination.total / pagination.page_size) || 1
    },

    /**
     * 格式化金额
     * @param {number} amount - 金额
     * @returns {string} 格式化后的金额
     */
    formatAdvanceAmount(amount) {
      if (amount === null || amount === undefined) return '¥0.00'
      return `¥${parseFloat(amount).toFixed(2)}`
    },

    /**
     * 获取垫付类型文本
     * @param {string} type - 类型
     * @returns {string} 文本
     */
    // ✅ 已删除 getAdvanceTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 获取垫付类型CSS类
     * @param {string} type - 类型
     * @returns {string} CSS类
     */
    getAdvanceTypeClass(type) {
      const map = {
        inventory: 'bg-yellow-100 text-yellow-800',
        budget: 'bg-blue-100 text-blue-800'
      }
      return map[type] || 'bg-gray-100 text-gray-800'
    }
  }
}

export default { useSystemAdvanceState, useSystemAdvanceMethods }

