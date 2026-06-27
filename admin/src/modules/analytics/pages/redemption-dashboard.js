/**
 * 门店核销概况看板（门店专属兑换券业务线 §10.12-B/C）
 *
 * @module modules/analytics/pages/redemption-dashboard
 * @description 运营级门店核销看板：按门店聚合 待核销/已核销/核销率 + 临期未核销 + 通用券落地分布，
 *   支持下钻到核销明细（接口5）与全量导出（接口6）。
 *   对接后端：
 *   - GET  /console/business-records/redemption-orders/store-overview   （接口4 看板聚合）
 *   - GET  /console/business-records/redemption-orders                   （接口5 明细分页，扩展 store_id/scope_type）
 *   - GET  /console/business-records/redemption-orders/export            （接口6 全量导出 CSV）
 *
 * 技术栈：Alpine.js 3 + ECharts 6（懒加载）+ 统一 request 封装；全部时间显示北京时间。
 */

import { logger } from '../../../utils/logger.js'
import { API_PREFIX, request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

const REDEMPTION_BASE = `${API_PREFIX}/console/business-records/redemption-orders`

/**
 * 门店核销看板页面 Alpine 组件
 * @returns {Object} Alpine 组件定义
 */
export function redemptionDashboardPage() {
  return {
    ...createPageMixin(),

    /** @type {Object} 顶部汇总卡 */
    summary: { pending_count: 0, fulfilled_count: 0, fulfill_rate: 0, expiring_soon_count: 0 },
    /** @type {Array<Object>} 按门店聚合行 */
    byStore: [],
    /** @type {Object} 通用券落地分布 */
    generalVoucher: { fulfilled_count: 0, by_store_distribution: [] },
    /** @type {Object} 筛选条件 */
    filters: { store_id: '', start_date: '', end_date: '' },
    /** @type {boolean} 加载中 */
    loading: false,

    /** @type {boolean} 明细抽屉是否显示 */
    showDetail: false,
    /** @type {number|string} 当前下钻门店 */
    detailStoreId: '',
    /** @type {Array<Object>} 明细列表 */
    detailRows: [],
    /** @type {Object} 明细分页 */
    detailPagination: { total: 0, page: 1, page_size: 20 },
    /** @type {string} 明细券类型筛选（''/specified/general） */
    detailScopeType: '',

    /** @type {Object|null} ECharts 实例容器 */
    _echarts: null,
    charts: { byStore: null, trend: null },
    _resizeHandler: null,

    /** @type {Array<Object>} 核销趋势（按日 生成/核销/过期），来自 getRedemptionTrend */
    trend: [],
    /** @type {Object} 趋势汇总 + 转化率 */
    trendSummary: { generated: 0, fulfilled: 0, expired: 0, conversion_rate: 0 },

    /** 初始化 */
    async init() {
      if (!this.checkAuth?.()) return
      try {
        this._echarts = await loadECharts()
      } catch (e) {
        logger.error('[RedemptionDashboard] ECharts 加载失败:', e)
        this.showError?.('图表组件加载失败')
      }
      this.$nextTick(() => {
        this.loadOverview()
        this.loadTrend()
        this._resizeHandler = () => {
          this.charts.byStore?.resize()
          this.charts.trend?.resize()
        }
        window.addEventListener('resize', this._resizeHandler)
      })
    },

    /** 时间快捷档 */
    setRange(type) {
      const fmt = d => d.toISOString().slice(0, 10)
      const now = new Date()
      if (type === 'today') {
        this.filters.start_date = fmt(now)
        this.filters.end_date = fmt(now)
      } else if (type === '7d') {
        const s = new Date(now.getTime() - 6 * 86400000)
        this.filters.start_date = fmt(s)
        this.filters.end_date = fmt(now)
      } else if (type === '30d') {
        const s = new Date(now.getTime() - 29 * 86400000)
        this.filters.start_date = fmt(s)
        this.filters.end_date = fmt(now)
      } else {
        this.filters.start_date = ''
        this.filters.end_date = ''
      }
      this.loadOverview()
      this.loadTrend()
    },

    /**
     * 加载核销趋势（看板三：getRedemptionTrend，接 DataScope 范围过滤）
     * 天数由当前时间档推导：今日=1，否则按 start~end 天数，默认 30。
     */
    async loadTrend() {
      try {
        let days = 30
        if (this.filters.start_date && this.filters.end_date) {
          const s = new Date(this.filters.start_date)
          const e = new Date(this.filters.end_date)
          const diff = Math.round((e - s) / 86400000) + 1
          if (diff > 0 && diff <= 365) days = diff
        }
        const res = await request({ url: `${REDEMPTION_BASE}/trend?days=${days}` })
        const data = res?.data || {}
        this.trend = Array.isArray(data.trend) ? data.trend : []
        const totals = data.totals || {}
        this.trendSummary = {
          generated: totals.generated || 0,
          fulfilled: totals.fulfilled || 0,
          expired: totals.expired || 0,
          conversion_rate: data.conversion_rate || 0
        }
        this.$nextTick(() => this.renderTrendChart())
      } catch (e) {
        logger.error('[RedemptionDashboard] 加载核销趋势失败:', e)
        this.showError?.('加载核销趋势失败')
      }
    },

    /** 渲染核销趋势折线（生成/核销/过期 按日） */
    renderTrendChart() {
      if (!this._echarts || !this.$refs.trendChart) return
      if (!this.charts.trend) {
        this.charts.trend = this._echarts.init(this.$refs.trendChart)
      }
      const dates = this.trend.map(r => r.date)
      this.charts.trend.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['生成', '核销', '过期'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: dates },
        yAxis: { type: 'value' },
        series: [
          { name: '生成', type: 'line', smooth: true, data: this.trend.map(r => r.generated), itemStyle: { color: '#3b82f6' } },
          { name: '核销', type: 'line', smooth: true, data: this.trend.map(r => r.fulfilled), itemStyle: { color: '#22c55e' } },
          { name: '过期', type: 'line', smooth: true, data: this.trend.map(r => r.expired), itemStyle: { color: '#ef4444' } }
        ]
      })
    },

    /** 加载看板聚合数据（接口4） */
    async loadOverview() {
      this.loading = true
      try {
        const params = new URLSearchParams()
        if (this.filters.store_id) params.append('store_id', this.filters.store_id)
        if (this.filters.start_date) params.append('start_date', this.filters.start_date)
        if (this.filters.end_date) params.append('end_date', this.filters.end_date)
        const url = `${REDEMPTION_BASE}/store-overview${params.toString() ? '?' + params : ''}`
        const res = await request({ url })
        const data = res?.data || {}
        this.summary = data.summary || this.summary
        this.byStore = Array.isArray(data.by_store) ? data.by_store : []
        this.generalVoucher = data.general_voucher || this.generalVoucher
        this.$nextTick(() => this.renderByStoreChart())
      } catch (e) {
        logger.error('[RedemptionDashboard] 加载看板失败:', e)
        this.showError?.('加载门店核销看板失败')
      } finally {
        this.loading = false
      }
    },

    /** 渲染门店维度柱状图 */
    renderByStoreChart() {
      if (!this._echarts || !this.$refs.byStoreChart) return
      if (!this.charts.byStore) {
        this.charts.byStore = this._echarts.init(this.$refs.byStoreChart)
      }
      const names = this.byStore.map(r => r.store_name || `#${r.store_id}`)
      this.charts.byStore.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['待核销', '已核销'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: names },
        yAxis: { type: 'value' },
        series: [
          { name: '待核销', type: 'bar', data: this.byStore.map(r => r.pending_count), itemStyle: { color: '#f59e0b' } },
          { name: '已核销', type: 'bar', data: this.byStore.map(r => r.fulfilled_count), itemStyle: { color: '#22c55e' } }
        ]
      })
    },

    /** 下钻到某门店核销明细（接口5） */
    async openDetail(storeId) {
      this.detailStoreId = storeId || ''
      this.detailPagination.page = 1
      this.showDetail = true
      await this.loadDetail()
    },

    /** 加载明细列表（接口5，扩展 store_id + scope_type 筛选；web 后台不脱敏，运营可见兑换用户字段） */
    async loadDetail() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.detailPagination.page)
        params.append('page_size', this.detailPagination.page_size)
        if (this.detailStoreId) params.append('store_id', this.detailStoreId)
        if (this.detailScopeType) params.append('scope_type', this.detailScopeType)
        if (this.filters.start_date) params.append('start_date', this.filters.start_date)
        if (this.filters.end_date) params.append('end_date', this.filters.end_date)
        const res = await request({ url: `${REDEMPTION_BASE}?${params}` })
        const data = res?.data || {}
        this.detailRows = Array.isArray(data.orders) ? data.orders : []
        this.detailPagination.total = data.pagination?.total || 0
      } catch (e) {
        logger.error('[RedemptionDashboard] 加载明细失败:', e)
        this.showError?.('加载核销明细失败')
      }
    },

    /** 明细翻页 */
    detailGoPage(page) {
      if (page < 1) return
      this.detailPagination.page = page
      this.loadDetail()
    },

    get detailTotalPages() {
      return Math.max(1, Math.ceil(this.detailPagination.total / this.detailPagination.page_size))
    },

    /**
     * 全量导出（接口6，后端 csv/xlsx 双格式，默认脱敏不含 PII）
     * 走统一 request({responseType:'blob'})——因本项目 token 经 Authorization 头传递，
     * 不能用 window.open（不带头会 401）。复用 merchant-logs/statistics 的 blob 下载模式。
     * @param {string} [format='xlsx'] - 导出格式 csv 或 xlsx
     */
    async exportDetail(format = 'xlsx') {
      try {
        const params = new URLSearchParams()
        params.append('format', format)
        if (this.detailStoreId) params.append('store_id', this.detailStoreId)
        if (this.detailScopeType) params.append('scope_type', this.detailScopeType)
        if (this.filters.start_date) params.append('start_date', this.filters.start_date)
        if (this.filters.end_date) params.append('end_date', this.filters.end_date)
        const blob = await request({
          url: `${REDEMPTION_BASE}/export?${params}`,
          responseType: 'blob'
        })
        const ext = format === 'csv' ? 'csv' : 'xlsx'
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `核销订单导出_${new Date().toISOString().slice(0, 10)}.${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        this.showSuccess?.('导出成功')
      } catch (e) {
        logger.error('[RedemptionDashboard] 导出失败:', e)
        this.showError?.('导出核销明细失败')
      }
    },

    /** 状态中文映射（展示用） */
    statusLabel(status) {
      return { pending: '待核销', fulfilled: '已核销', cancelled: '已取消', expired: '已过期' }[status] || status
    },

    /**
     * 时间展示：后端统一 UTC ISO（...Z），强制按北京时区渲染（B-2 时间统一）
     * @param {string} iso - UTC ISO 时间串
     * @returns {string} 北京时间展示串
     */
    fmtTime(iso) {
      if (!iso) return '-'
      const d = new Date(iso)
      if (isNaN(d.getTime())) return '-'
      return d.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      })
    }
  }
}

document.addEventListener('alpine:init', () => {
  window.Alpine.data('redemptionDashboardPage', redemptionDashboardPage)
})
