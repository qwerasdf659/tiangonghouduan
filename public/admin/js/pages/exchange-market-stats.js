/**
 * 兑换市场统计分析页面 - Alpine.js 版本
 * 使用 ECharts 本地引用
 *
 * @description 显示兑换市场的订单和收入统计
 * @version 2.0.0
 */

function exchangeMarketStatsPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,

    // 统计数据
    stats: {
      orders: {
        total: 0,
        pending: 0,
        completed: 0,
        shipped: 0,
        cancelled: 0
      },
      revenue: {
        total_virtual_value: 0,
        total_points: 0
      },
      items: {
        activeCount: 0,
        activeStock: 0,
        inactiveCount: 0,
        inactiveStock: 0
      }
    },

    // ECharts 实例
    orderStatusChart: null,
    revenueChart: null,

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      // 检查认证
      if (!getToken()) {
        window.location.href = '/admin/login.html'
        return
      }

      // 获取用户信息
      this.userInfo = getCurrentUser() || {}

      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadStatistics()
      })

      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        this.orderStatusChart && this.orderStatusChart.resize()
        this.revenueChart && this.revenueChart.resize()
      })
    },

    /**
     * 初始化 ECharts 图表实例
     */
    initCharts() {
      if (typeof echarts !== 'undefined') {
        this.orderStatusChart = echarts.init(this.$refs.orderStatusChart)
        this.revenueChart = echarts.init(this.$refs.revenueChart)
      } else {
        console.warn('ECharts 未加载')
      }
    },

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载统计数据
     */
    async loadStatistics() {
      this.loading = true

      try {
        const response = await apiRequest(API_ENDPOINTS.BUSINESS_RECORDS.EXCHANGE_STATS)

        if (response && response.success) {
          this.renderStatistics(response.data)
        } else {
          this.showError(response?.message || '加载统计数据失败')
        }
      } catch (error) {
        console.error('加载统计数据失败', error)
        this.showError('加载失败，请稍后重试')
      } finally {
        this.loading = false
      }
    },

    /**
     * 渲染统计数据
     */
    renderStatistics(data) {
      // 订单统计
      this.stats.orders = {
        total: data.orders?.total || 0,
        pending: data.orders?.pending || 0,
        completed: data.orders?.completed || 0,
        shipped: data.orders?.shipped || 0,
        cancelled: data.orders?.cancelled || 0
      }

      // 收入统计
      this.stats.revenue = {
        total_virtual_value: data.revenue?.total_virtual_value || 0,
        total_points: data.revenue?.total_points || 0
      }

      // 商品库存统计
      const activeItems = data.items?.find(item => item.status === 'active')
      const inactiveItems = data.items?.find(item => item.status === 'inactive')

      this.stats.items = {
        activeCount: activeItems?.count || 0,
        activeStock: activeItems?.total_stock || 0,
        inactiveCount: inactiveItems?.count || 0,
        inactiveStock: inactiveItems?.total_stock || 0
      }

      // 渲染图表
      this.renderOrderStatusChart()
      this.renderRevenueChart()
    },

    // ============================================================
    // 图表渲染 (ECharts)
    // ============================================================

    /**
     * 渲染订单状态分布图 (环形图)
     */
    renderOrderStatusChart() {
      if (!this.orderStatusChart) return

      const orders = this.stats.orders
      const option = {
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            const total = orders.pending + orders.completed + orders.shipped + orders.cancelled
            const percentage = total > 0 ? Math.round((params.value / total) * 100) : 0
            return `${params.name}: ${params.value} (${percentage}%)`
          }
        },
        legend: {
          orient: 'horizontal',
          bottom: 0,
          data: ['待处理', '已完成', '已发货', '已取消']
        },
        series: [
          {
            name: '订单状态',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data: [
              { value: orders.pending, name: '待处理', itemStyle: { color: 'rgba(255, 193, 7, 0.8)' } },
              { value: orders.completed, name: '已完成', itemStyle: { color: 'rgba(13, 202, 240, 0.8)' } },
              { value: orders.shipped, name: '已发货', itemStyle: { color: 'rgba(25, 135, 84, 0.8)' } },
              { value: orders.cancelled, name: '已取消', itemStyle: { color: 'rgba(108, 117, 125, 0.8)' } }
            ]
          }
        ]
      }

      this.orderStatusChart.setOption(option)
    },

    /**
     * 渲染收入来源分布图 (柱状图)
     */
    renderRevenueChart() {
      if (!this.revenueChart) return

      const revenue = this.stats.revenue
      const option = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const p = params[0]
            return `${p.name}: ${p.value.toLocaleString()}`
          }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: ['虚拟价值', '积分']
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            formatter: (value) => value.toLocaleString()
          }
        },
        series: [
          {
            name: '收入总额',
            type: 'bar',
            barWidth: '50%',
            data: [
              {
                value: revenue.total_virtual_value,
                itemStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(13, 202, 240, 1)' },
                    { offset: 1, color: 'rgba(13, 202, 240, 0.6)' }
                  ])
                }
              },
              {
                value: revenue.total_points,
                itemStyle: {
                  color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(13, 110, 253, 1)' },
                    { offset: 1, color: 'rgba(13, 110, 253, 0.6)' }
                  ])
                }
              }
            ]
          }
        ]
      }

      this.revenueChart.setOption(option)
    },

    // ============================================================
    // 计算属性
    // ============================================================

    /**
     * 计算完成率
     */
    get completionRate() {
      const { total, completed, shipped } = this.stats.orders
      return total > 0 ? Math.round(((completed + shipped) / total) * 100) : 0
    },

    // ============================================================
    // 工具方法
    // ============================================================

    /**
     * 显示错误消息
     */
    showError(message) {
      alert(message)
    },

    /**
     * 退出登录
     */
    handleLogout() {
      logout()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('exchangeMarketStatsPage', exchangeMarketStatsPage)
  console.log('✅ [ExchangeMarketStatsPage] Alpine 组件已注册')
})
