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
import { MARKET_ENDPOINTS } from '../../../api/market/index.js'
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
    trendRange: '7d',
    // ========== P1-8: 履约追踪看板 ==========
    /**
     * 履约追踪数据
     * 后端 ExchangeRecord 状态枚举：pending / completed / shipped / cancelled
     * 注意：exchange_records 表没有 expired 状态（expired 是 redemption_orders 表的）
     * @type {Object}
     */
    fulfillmentTracking: {
      total_orders: 0,
      pending_count: 0,
      shipped_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      fulfillment_rate: 0,
      avg_fulfillment_time: 0 // 平均履约时间（小时）
    }
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
        // 并行请求统计数据和订单数据
        const [statsRes, ordersRes] = await Promise.all([
          request({ url: MARKET_ENDPOINTS.EXCHANGE_FULL_STATS, method: 'GET' }),
          request({
            url: MARKET_ENDPOINTS.EXCHANGE_ORDERS,
            method: 'GET',
            params: { page: 1, page_size: 100 }
          })
        ])

        // 后端统计接口返回：total_items, active_items, low_stock_items, total_exchanges
        const stats = statsRes.success ? statsRes.data : {}

        // 从订单列表计算订单统计
        const orders = ordersRes.success ? ordersRes.data?.orders || [] : []
        const orderStats = {
          total: ordersRes.data?.pagination?.total || orders.length,
          pending: orders.filter(o => o.status === 'pending').length,
          completed: orders.filter(o => o.status === 'completed').length,
          shipped: orders.filter(o => o.status === 'shipped').length,
          cancelled: orders.filter(o => o.status === 'cancelled').length
        }

        // 计算总消耗（从订单中累计，确保转换为数字）
        const totalConsumed = orders.reduce((sum, o) => {
          const amount = parseInt(o.cost_amount) || parseInt(o.pay_amount) || 0
          return sum + amount
        }, 0)

        this.exchangeStats = {
          orders: orderStats,
          revenue: {
            total_virtual_value: totalConsumed,
            total_points: stats.total_exchanges || 0
          },
          items: {
            activeCount: stats.active_items || 0,
            activeStock: 0, // 后端暂无此数据
            inactiveCount: (stats.total_items || 0) - (stats.active_items || 0),
            inactiveStock: 0,
            lowStockCount: stats.low_stock_items || 0
          }
        }

        // P1-8: 缓存订单数据并计算履约追踪
        this.orders = orders
        this.calculateFulfillmentTracking()
      } catch (e) {
        logger.error('[ExchangeStats] 加载统计数据失败:', e)
        this.showError?.('加载统计数据失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载趋势数据
     * 基于现有订单数据计算趋势（前端聚合）
     */
    async loadTrendData() {
      try {
        // 计算日期范围
        const now = new Date()
        let days = 7
        if (this.trendRange === '30d') days = 30
        else if (this.trendRange === '90d') days = 90

        // 获取订单数据（如果还没有订单数据，先加载）
        if (!this.orders || this.orders.length === 0) {
          const ordersRes = await request({
            url: MARKET_ENDPOINTS.EXCHANGE_ORDERS,
            method: 'GET',
            params: { page: 1, page_size: 100 }
          })
          this.orders = ordersRes.success ? ordersRes.data?.orders || [] : []
        }

        // 生成日期数组
        const dateMap = new Map()
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now)
          date.setDate(date.getDate() - i)
          const dateStr = date.toISOString().split('T')[0]
          dateMap.set(dateStr, { date: dateStr, order_count: 0, revenue: 0 })
        }

        // 按日期聚合订单数据
        this.orders.forEach(order => {
          if (!order.created_at) return
          const orderDate = new Date(order.created_at).toISOString().split('T')[0]
          if (dateMap.has(orderDate)) {
            const data = dateMap.get(orderDate)
            data.order_count++
            data.revenue += parseInt(order.cost_amount) || parseInt(order.pay_amount) || 0
          }
        })

        // 转换为数组
        this.trendData = Array.from(dateMap.values())
        logger.info('[ExchangeStats] 趋势数据计算完成', {
          days,
          dataPoints: this.trendData.length,
          totalOrders: this.trendData.reduce((sum, d) => sum + d.order_count, 0)
        })

        this.updateTrendChart()
      } catch (e) {
        logger.error('[ExchangeStats] 加载趋势数据失败:', e)
        this.trendData = []
        this.updateTrendChart()
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
              // 默认显示标签（不需要悬停）
              label: {
                show: true,
                position: 'outside',
                formatter: '{b}: {c}',
                fontSize: 12
              },
              emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
              labelLine: { show: true },
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

        // 响应式（命名引用以便清理）
        this._orderStatusResizeHandler = () => this.orderStatusChart?.resize()
        window.addEventListener('resize', this._orderStatusResizeHandler)
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

      // 格式化日期为 "MM-DD" 格式
      const dates = this.trendData.map(item => {
        const [, month, day] = item.date.split('-')
        return `${month}-${day}`
      })
      const orders = this.trendData.map(item => item.order_count || 0)
      const revenue = this.trendData.map(item => item.revenue || 0)

      // 计算最大值用于Y轴
      const maxOrders = Math.max(...orders, 1)
      const maxRevenue = Math.max(...revenue, 1)

      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: function (params) {
            let result = params[0].axisValue + '<br/>'
            params.forEach(p => {
              const unit = p.seriesName === '兑换金额' ? ' 积分' : ' 单'
              result += `${p.marker} ${p.seriesName}: ${p.value}${unit}<br/>`
            })
            return result
          }
        },
        legend: { data: ['订单数', '兑换金额'], top: 5 },
        grid: { left: '3%', right: '4%', bottom: '3%', top: 50, containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: true,
          data: dates,
          axisLabel: {
            interval: this.trendRange === '7d' ? 0 : 'auto',
            fontSize: 11
          }
        },
        yAxis: [
          {
            type: 'value',
            name: '订单数',
            position: 'left',
            minInterval: 1,
            max: maxOrders < 5 ? 5 : null
          },
          {
            type: 'value',
            name: '金额',
            position: 'right',
            max: maxRevenue < 100 ? 100 : null
          }
        ],
        series: [
          {
            name: '订单数',
            type: 'line',
            smooth: true,
            data: orders,
            itemStyle: { color: '#5470c6' },
            areaStyle: { opacity: 0.2 },
            label: {
              show: orders.some(v => v > 0),
              position: 'top',
              fontSize: 10
            }
          },
          {
            name: '兑换金额',
            type: 'bar',
            yAxisIndex: 1,
            data: revenue,
            itemStyle: { color: '#91cc75' },
            barMaxWidth: 30,
            label: {
              show: revenue.some(v => v > 0),
              position: 'top',
              fontSize: 10
            }
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

    // ==================== P1-8: 履约追踪看板 ====================
    /**
     * 计算履约追踪数据
     * 从订单列表中聚合各状态的数量和履约率
     */
    calculateFulfillmentTracking() {
      const orders = this.orders || []
      const total = orders.length

      // 后端 ExchangeRecord 状态枚举：pending / completed / shipped / cancelled
      const pending = orders.filter(o => o.status === 'pending').length
      const shipped = orders.filter(o => o.status === 'shipped').length
      const completed = orders.filter(o => o.status === 'completed').length
      const cancelled = orders.filter(o => o.status === 'cancelled').length

      // 履约率 = (已完成 + 已发货) / (总数 - 已取消)
      const validOrders = total - cancelled
      const fulfilledOrders = completed + shipped
      const fulfillment_rate = validOrders > 0 ? Math.round((fulfilledOrders / validOrders) * 10000) / 100 : 0

      // 计算平均履约时间（从创建到完成/发货）
      let totalFulfillmentHours = 0
      let fulfilledCount = 0
      orders.forEach(order => {
        if ((order.status === 'completed' || order.status === 'shipped') && order.created_at && order.updated_at) {
          const created = new Date(order.created_at)
          const updated = new Date(order.updated_at)
          const hours = (updated - created) / (1000 * 60 * 60)
          if (hours > 0 && hours < 720) { // 排除异常数据（超过30天）
            totalFulfillmentHours += hours
            fulfilledCount++
          }
        }
      })

      this.fulfillmentTracking = {
        total_orders: total,
        pending_count: pending,
        shipped_count: shipped,
        completed_count: completed,
        cancelled_count: cancelled,
        fulfillment_rate,
        avg_fulfillment_time: fulfilledCount > 0 ? Math.round(totalFulfillmentHours / fulfilledCount * 10) / 10 : 0
      }

      logger.info('[ExchangeStats] 履约追踪数据计算完成', this.fulfillmentTracking)
    },

    /**
     * 获取履约率状态颜色
     * @param {number} rate - 履约率百分比
     * @returns {string} CSS类
     */
    getFulfillmentRateClass(rate) {
      if (rate >= 80) return 'text-green-600'
      if (rate >= 50) return 'text-yellow-600'
      return 'text-red-600'
    },

    /**
     * 获取履约率状态标签
     * @param {number} rate - 履约率百分比
     * @returns {string} 状态标签
     */
    getFulfillmentRateLabel(rate) {
      if (rate >= 80) return '✅ 优秀'
      if (rate >= 50) return '⚠️ 一般'
      return '🔴 需关注'
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
