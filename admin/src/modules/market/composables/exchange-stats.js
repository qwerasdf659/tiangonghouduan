/**
 * 兑换统计分析模块
 *
 * @file admin/src/modules/market/composables/exchange-stats.js
 * @description 兑换数据统计和图表展示
 * @version 1.0.0
 * @date 2026-01-24
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { MARKET_ENDPOINTS } from '../../../api/market.js'
import { request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/index.js'

/**
 * 统计分析状态
 * @returns {Object} 状态对象
 */
export function useExchangeStatsState() {
  return {
    /** @type {Object} 兑换统计数据 */
    exchangeStats: {
      orders: { total: 0, pending: 0, completed: 0, shipped: 0, cancelled: 0 },
      revenue: { total_virtual_value: 0, total_points: 0 },
      items: { activeCount: 0, activeStock: 0, inactiveCount: 0, inactiveStock: 0 }
    },
    /** @type {Object|null} 订单状态分布图表实例 */
    orderStatusChart: null,
    /** @type {Object|null} 兑换趋势图表实例 */
    exchangeTrendChart: null,
    /** @type {Array} 趋势数据 */
    trendData: [],
    /** @type {string} 趋势时间范围 */
    trendRange: '7d'
  }
}

/**
 * 统计分析方法
 * @returns {Object} 方法对象
 */
export function useExchangeStatsMethods() {
  return {
    /**
     * 加载兑换统计数据
     */
    async loadExchangeStats() {
      try {
        this.loading = true
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_FULL_STATS,
          method: 'GET'
        })

        if (res.success && res.data) {
          this.exchangeStats = {
            orders: {
              total: res.data.orders?.total || 0,
              pending: res.data.orders?.pending || 0,
              completed: res.data.orders?.completed || 0,
              shipped: res.data.orders?.shipped || 0,
              cancelled: res.data.orders?.cancelled || 0
            },
            revenue: {
              total_virtual_value: res.data.revenue?.total_virtual_value || 0,
              total_points: res.data.revenue?.total_points || 0
            },
            items: {
              activeCount: res.data.items?.activeCount || res.data.items?.active_count || 0,
              activeStock: res.data.items?.activeStock || res.data.items?.active_stock || 0,
              inactiveCount: res.data.items?.inactiveCount || res.data.items?.inactive_count || 0,
              inactiveStock: res.data.items?.inactiveStock || res.data.items?.inactive_stock || 0
            }
          }
        }
      } catch (e) {
        logger.error('[ExchangeStats] 加载统计数据失败:', e)
        this.showError?.('加载统计数据失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载趋势数据
     */
    async loadTrendData() {
      try {
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_TREND,
          method: 'GET',
          params: { range: this.trendRange }
        })

        if (res.success && res.data) {
          this.trendData = res.data.list || res.data || []
          this.updateTrendChart()
        }
      } catch (e) {
        logger.error('[ExchangeStats] 加载趋势数据失败:', e)
      }
    },

    /**
     * 初始化图表
     */
    initCharts() {
      this.initOrderStatusChart()
      this.initTrendChart()
    },

    /**
     * 初始化订单状态分布图表
     */
    async initOrderStatusChart() {
      const container = document.getElementById('orderStatusChart')
      if (!container) return

      try {
        const echarts = await loadECharts()
        if (!echarts) {
          logger.warn('[ExchangeStats] ECharts 未加载')
          return
        }

        if (this.orderStatusChart) {
          this.orderStatusChart.dispose()
        }

        this.orderStatusChart = echarts.init(container)

        const { orders } = this.exchangeStats
        const option = {
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          legend: { orient: 'vertical', left: 'left', top: 'middle' },
          series: [
            {
              name: '订单状态',
              type: 'pie',
              radius: ['40%', '70%'],
              avoidLabelOverlap: false,
              itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
              label: { show: false },
              emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
              labelLine: { show: false },
              data: [
                { value: orders.pending, name: '待发货', itemStyle: { color: '#ffc107' } },
                { value: orders.shipped, name: '已发货', itemStyle: { color: '#17a2b8' } },
                { value: orders.completed, name: '已完成', itemStyle: { color: '#28a745' } },
                { value: orders.cancelled, name: '已取消', itemStyle: { color: '#dc3545' } }
              ].filter(item => item.value > 0)
            }
          ]
        }

        this.orderStatusChart.setOption(option)

        // 响应式
        window.addEventListener('resize', () => this.orderStatusChart?.resize())
      } catch (e) {
        logger.error('[ExchangeStats] 初始化订单状态图表失败:', e)
      }
    },

    /**
     * 初始化兑换趋势图表
     */
    async initTrendChart() {
      const container = document.getElementById('exchangeTrendChart')
      if (!container) return

      try {
        const echarts = await loadECharts()
        if (!echarts) return

        if (this.exchangeTrendChart) {
          this.exchangeTrendChart.dispose()
        }

        this.exchangeTrendChart = echarts.init(container)

        // 加载趋势数据
        await this.loadTrendData()
      } catch (e) {
        logger.error('[ExchangeStats] 初始化趋势图表失败:', e)
      }
    },

    /**
     * 更新趋势图表
     */
    updateTrendChart() {
      if (!this.exchangeTrendChart) return

      const dates = this.trendData.map(item => item.date)
      const orders = this.trendData.map(item => item.order_count || 0)
      const revenue = this.trendData.map(item => item.revenue || 0)

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' }
        },
        legend: { data: ['订单数', '兑换金额'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: dates
        },
        yAxis: [
          { type: 'value', name: '订单数', position: 'left' },
          { type: 'value', name: '金额', position: 'right' }
        ],
        series: [
          {
            name: '订单数',
            type: 'line',
            smooth: true,
            data: orders,
            itemStyle: { color: '#5470c6' },
            areaStyle: { opacity: 0.1 }
          },
          {
            name: '兑换金额',
            type: 'bar',
            yAxisIndex: 1,
            data: revenue,
            itemStyle: { color: '#91cc75' }
          }
        ]
      }

      this.exchangeTrendChart.setOption(option)
    },

    /**
     * 切换趋势时间范围
     * @param {string} range - 时间范围 ('7d'|'30d'|'90d')
     */
    changeTrendRange(range) {
      this.trendRange = range
      this.loadTrendData()
    },

    /**
     * 销毁图表实例
     */
    destroyCharts() {
      if (this.orderStatusChart) {
        this.orderStatusChart.dispose()
        this.orderStatusChart = null
      }
      if (this.exchangeTrendChart) {
        this.exchangeTrendChart.dispose()
        this.exchangeTrendChart = null
      }
    }
  }
}

export default { useExchangeStatsState, useExchangeStatsMethods }

