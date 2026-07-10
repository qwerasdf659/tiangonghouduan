/**
 * 成长等级看板页面（P0-3 分布 + P1-4 成本，拍板⑫）
 *
 * @file admin/src/modules/analytics/pages/growth-level-dashboard.js
 * @description 会员成长等级运营看板：
 *              - 分布看板（P0-3）：各档人数分布、本月升级人数、各档累计消费贡献（等级阈值调整依据）；
 *              - 成本看板（P1-4）：等级加成发放量（按日/按档）、预算注入量、加成成本占营收比、
 *                积分负债余额监控（拍板⑰积分永不过期口径下负债只增不销，此为唯一财务闸口）。
 * @version 1.0.0
 * @date 2026-07-10
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { AnalyticsAPI } from '../../../api/analytics.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

/**
 * 成长等级看板组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function growthLevelDashboard() {
  return {
    ...createPageMixin(),

    /** @type {Object|null} 分布数据 { levels, total_users } */
    distribution: null,
    /** @type {Object|null} 成本数据 { period_days, daily, by_level, summary } */
    cost: null,
    /** @type {number} 成本看板统计天数 */
    costDays: 30,
    /** @type {boolean} 加载中 */
    loading: false,
    /** @type {Object} ECharts 实例引用 */
    _charts: { dist: null, dailyCost: null },
    /** @type {Object|null} 惰性加载的 echarts 命名空间 */
    _echarts: null,

    /**
     * 初始化：认证检查 + 加载 ECharts + 拉取数据
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('[GrowthLevelDashboard] 成长等级看板初始化')
      if (!this.checkAuth()) return
      try {
        this._echarts = await loadECharts()
      } catch (e) {
        logger.error('[GrowthLevelDashboard] ECharts 加载失败:', e)
      }
      await this.loadAll()
    },

    /**
     * 并行加载分布与成本数据，渲染图表
     * @async
     * @returns {Promise<void>}
     */
    async loadAll() {
      this.loading = true
      try {
        const [distResp, costResp] = await Promise.all([
          AnalyticsAPI.getGrowthLevelDistribution(),
          AnalyticsAPI.getGrowthLevelCost({ days: this.costDays })
        ])
        this.distribution = distResp?.data || null
        this.cost = costResp?.data || null
        // 图表需等 DOM 渲染出容器后再初始化
        this.$nextTick(() => this.renderCharts())
      } catch (e) {
        logger.error('[GrowthLevelDashboard] 加载看板数据失败:', e)
        this.showError('加载看板数据失败: ' + (e.message || '未知错误'))
      } finally {
        this.loading = false
      }
    },

    /**
     * 仅重新加载成本看板（切换天数时）
     * @async
     * @returns {Promise<void>}
     */
    async reloadCost() {
      try {
        const costResp = await AnalyticsAPI.getGrowthLevelCost({ days: this.costDays })
        this.cost = costResp?.data || null
        this.$nextTick(() => this.renderDailyCostChart())
      } catch (e) {
        logger.error('[GrowthLevelDashboard] 重新加载成本失败:', e)
        this.showError('加载成本数据失败: ' + (e.message || '未知错误'))
      }
    },

    /**
     * 渲染全部图表（分布柱状 + 成本趋势）
     * @returns {void}
     */
    renderCharts() {
      this.renderDistributionChart()
      this.renderDailyCostChart()
    },

    /**
     * 等级人数分布柱状图
     * @returns {void}
     */
    renderDistributionChart() {
      const echarts = this._echarts
      const el = this.$refs.distChart
      if (!echarts || !el || !this.distribution) return
      if (!this._charts.dist) this._charts.dist = echarts.init(el)
      const levels = this.distribution.levels || []
      this._charts.dist.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['人数', '本月升级'] },
        grid: { left: 40, right: 20, top: 40, bottom: 40 },
        xAxis: { type: 'category', data: levels.map(l => l.level_name) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          { name: '人数', type: 'bar', data: levels.map(l => l.user_count), itemStyle: { color: '#8b5cf6' } },
          { name: '本月升级', type: 'bar', data: levels.map(l => l.upgraded_this_month), itemStyle: { color: '#10b981' } }
        ]
      })
    },

    /**
     * 成本趋势折线图（加成发放量 + 预算注入量按日）
     * @returns {void}
     */
    renderDailyCostChart() {
      const echarts = this._echarts
      const el = this.$refs.dailyCostChart
      if (!echarts || !el || !this.cost) return
      if (!this._charts.dailyCost) this._charts.dailyCost = echarts.init(el)
      const daily = this.cost.daily || []
      this._charts.dailyCost.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['等级加成发放', '预算注入'] },
        grid: { left: 50, right: 20, top: 40, bottom: 40 },
        xAxis: { type: 'category', data: daily.map(d => d.stat_date) },
        yAxis: { type: 'value' },
        series: [
          { name: '等级加成发放', type: 'line', smooth: true, data: daily.map(d => d.level_bonus_points), itemStyle: { color: '#f59e0b' } },
          { name: '预算注入', type: 'line', smooth: true, data: daily.map(d => d.budget_points_injected), itemStyle: { color: '#3b82f6' } }
        ]
      })
    },

    /**
     * 加成成本占营收比展示（百分比，null=营收为 0）
     * @returns {string} 展示文案
     */
    get bonusCostRatioText() {
      const ratio = this.cost?.summary?.bonus_cost_ratio
      if (ratio === null || ratio === undefined) return '—'
      return (Number(ratio) * 100).toFixed(2) + '%'
    }
  }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('growthLevelDashboard', growthLevelDashboard)
  logger.info('[GrowthLevelDashboard] Alpine 组件已注册')
})

export { growthLevelDashboard }
export default growthLevelDashboard
