/**
 * DIY 数据看板页面（拍板决议 11.6-4）
 *
 * @file admin/src/modules/diy/pages/diy-dashboard.js
 * @description 全局总览大屏，聚合 P0 数据完备度 + P1 经营漏斗/GMV/履约 + P2 素材热度/五行分布。
 *   每个指标可点击跳转对应管理页并带筛选参数（做成运营工作清单而非只读报表）。
 *   数据全部来自扩展后的 GET /api/v4/console/diy/stats 接口，大屏不建独立数据源。
 *
 * 后端数据结构（GET /api/v4/console/diy/stats）：
 * - completeness: { materials:{...}, templates:{...} }  P0 完备度
 * - funnel: { draft, frozen, completed, cancelled, confirm_rate, complete_rate }  P1 漏斗
 * - gmv: { by_asset:[{asset_code,total_amount}], daily:[{date,asset_code,amount}], exchange_cross_check_total }
 * - fulfillment: { pending_shipment_count, missing_address_count }  P1 履约
 * - material_ranking: [{ material_code, display_name, use_count, total_amount }]  P2 热度
 * - five_elements_distribution: { metal, wood, water, fire, earth, unset }  P2 五行
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin } from '@/alpine/index.js'
import { loadECharts } from '@/utils/echarts-lazy.js'
import { getDiyStats } from '@/api/diy.js'

/** 五行中文标签（图表展示） */
const FIVE_ELEMENT_LABELS = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
  unset: '未设置'
}

function diyDashboard() {
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DIY-Dashboard] Alpine 或 createPageMixin 未加载')
    return {}
  }

  return {
    ...createPageMixin({ pagination: false }),

    loading: false,
    completeness: null,
    funnel: null,
    gmv: null,
    fulfillment: null,
    materialRanking: [],
    fiveElementsDistribution: null,

    // ECharts 实例（resize / 重绘复用）
    funnelChart: null,
    gmvChart: null,
    fiveElementsChart: null,

    async init() {
      logger.info('[DIY-Dashboard] 数据看板初始化')
      await this.loadStats()
      window.addEventListener('resize', () => this.resizeCharts())
    },

    async refresh() {
      await this.loadStats()
    },

    async loadStats() {
      this.loading = true
      try {
        const res = await getDiyStats()
        if (res.success) {
          const d = res.data || {}
          this.completeness = d.completeness || null
          this.funnel = d.funnel || null
          this.gmv = d.gmv || null
          this.fulfillment = d.fulfillment || null
          this.materialRanking = d.material_ranking || []
          this.fiveElementsDistribution = d.five_elements_distribution || null
          logger.info('[DIY-Dashboard] 统计数据加载成功')
          await this.renderCharts()
        } else {
          Alpine.store('notification')?.show(res.message || '加载失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Dashboard] 加载统计数据异常', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // ==================== 图表渲染 ====================

    async renderCharts() {
      const echarts = await loadECharts()
      if (!echarts) {
        logger.warn('[DIY-Dashboard] ECharts 未加载，跳过图表渲染')
        return
      }
      this._renderFunnel(echarts)
      this._renderGmv(echarts)
      this._renderFiveElements(echarts)
    },

    /** 转化漏斗图（draft → frozen → completed） */
    _renderFunnel(echarts) {
      const el = this.$refs.funnelChart
      if (!el || !this.funnel) return
      if (!this.funnelChart) this.funnelChart = echarts.init(el)

      this.funnelChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        series: [
          {
            type: 'funnel',
            left: '10%',
            width: '80%',
            sort: 'none',
            label: { show: true, position: 'inside', formatter: '{b}: {c}' },
            data: [
              { value: this.funnel.draft, name: '草稿' },
              { value: this.funnel.frozen, name: '已冻结' },
              { value: this.funnel.completed, name: '已完成' },
              { value: this.funnel.cancelled, name: '已取消' }
            ]
          }
        ]
      })
    },

    /** GMV 每日趋势折线图（按 asset_code 分系列） */
    _renderGmv(echarts) {
      const el = this.$refs.gmvChart
      if (!el || !this.gmv) return
      if (!this.gmvChart) this.gmvChart = echarts.init(el)

      const daily = this.gmv.daily || []
      const dates = [...new Set(daily.map(d => d.date))].sort()
      const assets = [...new Set(daily.map(d => d.asset_code))]

      const series = assets.map(asset => ({
        name: asset,
        type: 'line',
        smooth: true,
        data: dates.map(date => {
          const hit = daily.find(d => d.date === date && d.asset_code === asset)
          return hit ? hit.amount : 0
        })
      }))

      this.gmvChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: assets, bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: { type: 'value', min: 0 },
        series: series.length ? series : [{ type: 'line', data: [] }]
      })
    },

    /** 五行分布饼图 */
    _renderFiveElements(echarts) {
      const el = this.$refs.fiveElementsChart
      if (!el || !this.fiveElementsDistribution) return
      if (!this.fiveElementsChart) this.fiveElementsChart = echarts.init(el)

      const data = Object.entries(this.fiveElementsDistribution)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ name: FIVE_ELEMENT_LABELS[key] || key, value: count }))

      this.fiveElementsChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0 },
        series: [
          {
            type: 'pie',
            radius: ['40%', '65%'],
            data: data.length ? data : [{ name: '暂无数据', value: 1 }]
          }
        ]
      })
    },

    resizeCharts() {
      this.funnelChart?.resize()
      this.gmvChart?.resize()
      this.fiveElementsChart?.resize()
    }
  }
}

Alpine.data('diyDashboard', diyDashboard)
logger.info('[DIY-Dashboard] 数据看板模块已加载')
