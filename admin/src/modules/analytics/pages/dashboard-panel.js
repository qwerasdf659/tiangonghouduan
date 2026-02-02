/**
 * @fileoverview 运营仪表盘页面 - Alpine.js Mixin 版本
 * @module modules/analytics/pages/dashboard-panel
 * @description 实时监控核心业务指标，包括：
 * - 核心指标卡片（抽奖次数、新增用户、中奖率、待处理事项、预算使用）
 * - 趋势图表（抽奖趋势、用户趋势、奖品发放趋势）
 * - 实时预警列表
 * - 预算消耗状态
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

import { logger } from '../../../utils/logger.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { DashboardAPI } from '../../../api/dashboard.js'

/**
 * 创建运营仪表盘页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function dashboardPanelPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面状态 ====================
    loading: false,
    timeRange: 'today',
    trendType: 'lottery',
    lastUpdateTime: '--:--:--',

    // 核心统计数据
    stats: {
      lottery_count: 0,
      lottery_trend: 0,
      new_users: 0,
      user_trend: 0,
      win_rate: 0,
      win_rate_trend: 0,
      pending_consumption: 0,
      pending_sessions: 0,
      lottery_alerts: 0,
      risk_alerts: 0,
      budget_usage: 0
    },

    // 趋势数据
    trendData: {
      dates: [],
      lottery: [],
      users: [],
      prizes: []
    },

    // 预警列表
    alerts: [],

    // 预算列表
    budgetList: [],

    // 图表实例
    trendChart: null,

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[DashboardPanel] 初始化运营仪表盘')

      await this.loadDashboardData()

      // 监听趋势类型变化
      this.$watch('trendType', () => {
        this.renderTrendChart()
      })

      // 5分钟自动刷新
      setInterval(
        () => {
          this.loadDashboardData()
        },
        5 * 60 * 1000
      )

      logger.info('[DashboardPanel] 初始化完成')
    },

    /**
     * 加载仪表盘所有数据
     */
    async loadDashboardData() {
      this.loading = true
      try {
        // 并行加载所有数据
        const [statsRes, trendRes, alertsRes, budgetRes] = await Promise.allSettled([
          this.fetchTodayStats(),
          this.fetchTrendData(),
          this.fetchAlerts(),
          this.fetchBudgetStatus()
        ])

        if (statsRes.status === 'fulfilled' && statsRes.value) {
          this.stats = { ...this.stats, ...statsRes.value }
        }

        if (trendRes.status === 'fulfilled' && trendRes.value) {
          this.trendData = trendRes.value
          this.renderTrendChart()
        }

        if (alertsRes.status === 'fulfilled' && alertsRes.value) {
          this.alerts = alertsRes.value
        }

        if (budgetRes.status === 'fulfilled' && budgetRes.value) {
          this.budgetList = budgetRes.value
        }

        this.lastUpdateTime = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          timeZone: 'Asia/Shanghai'
        })
      } catch (error) {
        logger.error('[DashboardPanel] 加载仪表盘数据失败:', error)
      } finally {
        this.loading = false
      }
    },

    /**
     * 获取今日统计数据
     */
    async fetchTodayStats() {
      try {
        const result = await DashboardAPI.getTodayStats({ range: this.timeRange })
        if (result.success) {
          return result.data
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchTodayStats 失败:', e.message)
        return null
      }
    },

    /**
     * 获取趋势数据
     */
    async fetchTrendData() {
      try {
        const result = await DashboardAPI.getDecisionsAnalytics({ range: this.timeRange })
        if (result.success) {
          return result.data
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchTrendData 失败:', e.message)
        return null
      }
    },

    /**
     * 获取预警列表
     */
    async fetchAlerts() {
      try {
        const result = await DashboardAPI.getRealtimeAlerts({ page_size: 10 })
        if (result.success) {
          return result.data?.items || result.data || []
        }
        return []
      } catch (e) {
        logger.warn('[DashboardPanel] fetchAlerts 失败:', e.message)
        return []
      }
    },

    /**
     * 获取预算状态
     * @description 转换后端数据格式为前端展示格式
     */
    async fetchBudgetStatus() {
      try {
        const result = await DashboardAPI.getBudgetStatus()
        if (result.success) {
          // 后端返回格式: { campaigns: [{ lottery_campaign_id, campaign_name, pool_budget: { total, remaining, used, usage_rate } }] }
          const campaigns = result.data?.campaigns || result.data?.items || []
          // 转换为前端展示格式
          return campaigns.map(item => ({
            lottery_campaign_id: item.lottery_campaign_id,
            campaign_name: item.campaign_name || item.name || '-',
            // 扁平化 pool_budget 字段
            total: item.pool_budget?.total ?? item.total ?? 0,
            used: item.pool_budget?.used ?? item.used ?? 0,
            remaining: item.pool_budget?.remaining ?? item.remaining ?? 0,
            // 解析 usage_rate 为数字（后端返回 "0.00%" 格式）
            usage: parseFloat(item.pool_budget?.usage_rate) || 
                   (item.pool_budget?.total > 0 
                     ? (item.pool_budget.used / item.pool_budget.total * 100) 
                     : 0)
          }))
        }
        return []
      } catch (e) {
        logger.warn('[DashboardPanel] fetchBudgetStatus 失败:', e.message)
        return []
      }
    },

    /**
     * 渲染趋势图表
     */
    async renderTrendChart() {
      const chartDom = document.getElementById('trend-chart')
      if (!chartDom) return

      // 动态加载 ECharts
      const echarts = await loadECharts()
      if (!echarts) {
        logger.warn('[DashboardPanel] ECharts 加载失败')
        return
      }

      if (!this.trendChart) {
        this.trendChart = echarts.init(chartDom)
      }

      const seriesName =
        this.trendType === 'lottery'
          ? '抽奖次数'
          : this.trendType === 'users'
            ? '活跃用户'
            : '奖品发放'
      const seriesData = this.trendData[this.trendType] || []
      const color =
        this.trendType === 'lottery'
          ? '#3b82f6'
          : this.trendType === 'users'
            ? '#10b981'
            : '#f59e0b'

      const option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          textStyle: { color: '#334155' }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: this.trendData.dates || [],
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#64748b' }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
          axisLabel: { color: '#64748b' }
        },
        series: [
          {
            name: seriesName,
            type: 'line',
            smooth: true,
            data: seriesData,
            lineStyle: { color: color, width: 3 },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: color + '40' },
                  { offset: 1, color: color + '05' }
                ]
              }
            },
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: { color: color }
          }
        ]
      }

      this.trendChart.setOption(option)

      // 响应式
      const resizeHandler = () => {
        this.trendChart && this.trendChart.resize()
      }
      window.removeEventListener('resize', resizeHandler)
      window.addEventListener('resize', resizeHandler)
    },

    /**
     * 切换时间范围
     */
    switchTimeRange(range) {
      this.timeRange = range
      this.loadDashboardData()
    },

    /**
     * 刷新仪表盘
     */
    async refreshDashboard() {
      await this.loadDashboardData()
    },

    /**
     * 快捷操作 - 跳转到对应页面
     */
    quickAction(action) {
      const actionMap = {
        'consumption-review': '/admin/finance-management.html',
        'customer-service': '/admin/customer-service.html',
        'lottery-alerts': '/admin/lottery-alerts.html',
        'risk-alerts': '/admin/risk-alerts.html',
        'campaign-create': '/admin/lottery-management.html',
        statistics: '/admin/statistics.html'
      }

      const url = actionMap[action]
      if (url) {
        // 通知父窗口打开Tab
        if (window.parent && window.parent !== window) {
          window.parent.dispatchEvent(
            new CustomEvent('open-tab', {
              detail: {
                id: action,
                title: this.getActionTitle(action),
                icon: this.getActionIcon(action),
                url: url
              }
            })
          )
        } else {
          window.location.href = url
        }
      }
    },

    /**
     * 获取操作标题
     */
    getActionTitle(action) {
      const titles = {
        'consumption-review': '消耗审核',
        'customer-service': '客服会话',
        'lottery-alerts': '抽奖告警',
        'risk-alerts': '风控告警',
        'campaign-create': '抽奖活动',
        statistics: '数据统计'
      }
      return titles[action] || action
    },

    /**
     * 获取操作图标
     */
    getActionIcon(action) {
      const icons = {
        'consumption-review': '📋',
        'customer-service': '💬',
        'lottery-alerts': '🚨',
        'risk-alerts': '⚠️',
        'campaign-create': '🎯',
        statistics: '📊'
      }
      return icons[action] || '📄'
    },

    /**
     * 处理预警项
     */
    handleAlert(alert) {
      // 根据预警类型跳转到相应页面
      if (
        alert.type === 'lottery' ||
        alert.title?.includes('抽奖') ||
        alert.title?.includes('中奖')
      ) {
        this.quickAction('lottery-alerts')
      } else if (alert.type === 'risk' || alert.title?.includes('风控')) {
        this.quickAction('risk-alerts')
      } else if (alert.type === 'budget' || alert.title?.includes('预算')) {
        this.quickAction('campaign-create')
      }
    },

    /**
     * 格式化数字
     */
    formatNumber(num) {
      if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万'
      }
      return num?.toLocaleString() || '0'
    },

    /**
     * 格式化时间
     */
    formatTime(dateStr) {
      if (!dateStr) return '--'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'

      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Shanghai'
      })
    }
  }
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    window.Alpine.data('dashboardPanelPage', dashboardPanelPage)
    logger.info('[DashboardPanel] Alpine 组件注册完成')
  }
})

// 导出
export { dashboardPanelPage }
export default dashboardPanelPage
