/**
 * 数据驾驶舱 - 运营大盘 Composable (Tab 1)
 *
 * @file admin/src/modules/analytics/composables/dashboard-overview.js
 * @description 从 dashboard-panel.js 提取的 Tab 1 运营大盘状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { API_PREFIX, request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { DashboardAPI } from '../../../api/dashboard.js'

/**
 * 运营大盘状态 (Tab 1)
 * @returns {Object} 状态对象
 */
export function useDashboardOverviewState() {
  return {
    // 页面状态
    loading: false,
    timeRange: 'today',
    trendType: 'lottery',
    lastUpdateTime: '--:--:--',
    activeTab: 'overview',

    // 核心统计
    stats: {
      lottery_count: 0, lottery_trend: 0,
      new_users: 0, user_trend: 0,
      win_rate: 0, win_rate_trend: 0,
      pending_consumption: 0, pending_sessions: 0,
      lottery_alerts: 0, risk_alerts: 0,
      budget_usage: 0
    },

    // 资产发放/消耗比
    assetRatio: { issued: 0, consumed: 0, ratio: 1.0 },

    // 业务健康度
    healthScore: {
      score: 0, status: 'loading', status_text: '加载中...',
      components: {}, alerts: [], updated_at: null
    },

    // 时间对比
    comparison: {
      day_comparison: {
        lottery_draws: { current: 0, previous: 0, change: 0, trend: 'stable' },
        consumption: { current: 0, previous: 0, change: 0, trend: 'stable' },
        users: { current: 0, previous: 0, change: 0, trend: 'stable' },
        win_rate: { current: 0, previous: 0, change: 0, trend: 'stable' }
      },
      week_comparison: {
        lottery_draws: { current: 0, previous: 0, change: 0, trend: 'stable' },
        consumption: { current: 0, previous: 0, change: 0, trend: 'stable' },
        users: { current: 0, previous: 0, change: 0, trend: 'stable' },
        win_rate: { current: 0, previous: 0, change: 0, trend: 'stable' }
      }
    },

    // 趋势数据
    trendData: { dates: [], lottery: [], users: [], prizes: [] },

    // 预警列表
    alerts: [],

    // 预算
    budgetList: [],
    budgetForecast: {
      total_budget: 0, used_budget: 0, remaining_budget: 0, usage_rate: 0,
      daily_average: 0, estimated_days: null, estimated_exhaustion_date: null,
      trend_data: [], forecast_data: [], warning_level: 'normal'
    },

    // 🆕 今日待办摘要（P0-4）
    todoPending: {
      consumption: 0,
      redemption: 0,
      customer_service: 0,
      risk_alert: 0,
      lottery_alert: 0,
      feedback: 0,
      total: 0
    },

    // 系统健康
    systemHealth: {
      api: { status: 'loading', response_time: 0, last_check: null },
      database: { status: 'loading', host: '', database: '' },
      redis: { status: 'loading', connected: false },
      slow_apis: []
    },

    // 图表实例
    trendChart: null,
    budgetTrendChart: null,

    // 今日核心事件
    todayEvents: [],

    // ==================== P1-6: 新增运营指标 ====================
    // 兑换履约率（后端 ExchangeRecord 状态: pending/completed/shipped/cancelled）
    redemptionFulfillment: {
      total: 0,
      pending: 0,
      fulfilled: 0,
      cancelled: 0,
      fulfillment_rate: 0
    },
    // 市场活跃度
    marketActivity: {
      active_listings: 0,
      total_trades: 0,
      completed_trades: 0,
      trade_completion_rate: 0
    },
    // 用户留存/活跃度
    userRetention: {
      total_users: 0,
      dau: 0,
      wau: 0,
      mau: 0,
      dau_rate: 0,
      wau_rate: 0,
      mau_rate: 0
    }
  }
}

/**
 * 运营大盘方法 (Tab 1)
 * @returns {Object} 方法对象
 */
export function useDashboardOverviewMethods() {
  return {
    // ==================== 数据加载 ====================

    async loadDashboardData() {
      this.loading = true
      try {
        const [statsRes, trendRes, alertsRes, budgetRes, healthRes, comparisonRes, sysHealthRes, redemptionRes, marketRes, retentionRes, todoPendingRes] =
          await Promise.allSettled([
            this.fetchTodayStats(),
            this.fetchTrendData(),
            this.fetchAlerts(),
            this.fetchBudgetStatus(),
            this.fetchHealthScore(),
            this.fetchComparison(),
            this.fetchSystemHealth(),
            this.fetchRedemptionFulfillment(),
            this.fetchMarketActivity(),
            this.fetchUserRetention(),
            this.fetchTodoPending()
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
          this.calculateBudgetForecast(budgetRes.value)
        }
        if (healthRes.status === 'fulfilled' && healthRes.value) {
          this.healthScore = healthRes.value
        }
        if (comparisonRes.status === 'fulfilled' && comparisonRes.value) {
          Object.assign(this.comparison, comparisonRes.value)
        }
        if (sysHealthRes.status === 'fulfilled' && sysHealthRes.value) {
          this.systemHealth = sysHealthRes.value
        }
        // P1-6: 新增指标数据赋值
        if (redemptionRes.status === 'fulfilled' && redemptionRes.value) {
          this.redemptionFulfillment = redemptionRes.value
        }
        if (marketRes.status === 'fulfilled' && marketRes.value) {
          this.marketActivity = marketRes.value
        }
        if (retentionRes.status === 'fulfilled' && retentionRes.value) {
          this.userRetention = retentionRes.value
        }
        // P0-4: 今日待办摘要
        if (todoPendingRes.status === 'fulfilled' && todoPendingRes.value) {
          this.todoPending = todoPendingRes.value
        }

        this.lastUpdateTime = new Date().toLocaleTimeString('zh-CN', {
          hour12: false, timeZone: 'Asia/Shanghai'
        })
      } catch (error) {
        logger.error('[DashboardPanel] 加载仪表盘数据失败:', error)
      } finally {
        this.loading = false
      }
    },

    async fetchTodayStats() {
      try {
        const result = await DashboardAPI.getTodayStats({ range: this.timeRange })
        return result.success ? result.data : null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchTodayStats 失败:', e.message)
        return null
      }
    },

    async fetchHealthScore() {
      try {
        const result = await request({ url: `${API_PREFIX}/console/dashboard/business-health` })
        if (result.success && result.data) {
          return {
            score: result.data.score || 0,
            status: result.data.status || 'normal',
            status_text: result.data.status_text || '正常',
            components: result.data.components || {},
            alerts: result.data.alerts || [],
            updated_at: new Date().toISOString()
          }
        }
        return this.calculateLocalHealthScore()
      } catch (e) {
        logger.warn('[DashboardPanel] fetchHealthScore 失败:', e.message)
        return this.calculateLocalHealthScore()
      }
    },

    async fetchSystemHealth() {
      logger.debug('[DashboardPanel] 系统健康状态使用本地评估（后端暂无此API）')
      return {
        api: { status: 'warning', response_time: 0, last_check: new Date().toISOString() },
        database: { status: 'warning', host: '', database: '' },
        redis: { status: 'warning', connected: false },
        slow_apis: []
      }
    },

    calculateLocalHealthScore() {
      let score = 100
      const alerts = []

      if (this.stats.pending_consumption > 50) {
        score -= 20
        alerts.push({ level: 'warning', message: '待审核消耗过多' })
      } else if (this.stats.pending_consumption > 20) {
        score -= 10
      }

      if (this.stats.budget_usage >= 95) {
        score -= 30
        alerts.push({ level: 'critical', message: '预算即将耗尽' })
      } else if (this.stats.budget_usage >= 80) {
        score -= 15
        alerts.push({ level: 'warning', message: '预算使用率偏高' })
      }

      if (this.alerts.length >= 5) {
        score -= 20
        alerts.push({ level: 'warning', message: '预警信息较多' })
      } else if (this.alerts.length >= 3) {
        score -= 10
      }

      let status, status_text
      if (score >= 80) { status = 'healthy'; status_text = '运营正常' }
      else if (score >= 60) { status = 'warning'; status_text = '需要关注' }
      else { status = 'critical'; status_text = '需要处理' }

      return { score: Math.max(0, score), status, status_text, components: {}, alerts, updated_at: new Date().toISOString() }
    },

    // ==================== 健康度/状态 CSS ====================

    getHealthStatusClass(status) {
      return { healthy: 'bg-green-500', warning: 'bg-yellow-500', critical: 'bg-red-500', loading: 'bg-gray-400' }[status] || 'bg-gray-400'
    },

    getHealthBgClass(status) {
      return {
        healthy: 'from-green-50 to-emerald-50 border-green-200',
        warning: 'from-yellow-50 to-amber-50 border-yellow-200',
        critical: 'from-red-50 to-rose-50 border-red-200',
        loading: 'from-gray-50 to-slate-50 border-gray-200'
      }[status] || 'from-gray-50 to-slate-50 border-gray-200'
    },

    getSystemStatusClass(status) {
      return { healthy: 'bg-green-500', warning: 'bg-yellow-500', critical: 'bg-red-500', loading: 'bg-gray-400 animate-pulse' }[status] || 'bg-gray-400'
    },
    getSystemStatusIcon(status) {
      return { healthy: '🟢', warning: '🟡', critical: '🔴', loading: '⏳' }[status] || '❓'
    },
    getApiResponseStatus(responseTime) {
      if (responseTime > 3000) return 'critical'
      if (responseTime > 1000) return 'warning'
      return 'healthy'
    },

    // ==================== 时间对比 ====================

    async fetchComparison() {
      try {
        const result = await request({ url: `${API_PREFIX}/console/dashboard/time-comparison` })
        if (result.success && result.data) {
          return {
            day_comparison: result.data.day_comparison || {},
            week_comparison: result.data.week_comparison || {},
            highlights: result.data.highlights || [],
            updated_at: result.data.updated_at
          }
        }
        return null
      } catch (e) {
        logger.error('[DashboardPanel] fetchComparison 失败:', e.message)
        return null
      }
    },

    getTrendIcon(trend) {
      return trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
    },

    getTrendColorClass(trend, inverseColor = false) {
      if (trend === 'stable' || trend === 'neutral') return 'text-gray-500'
      if (inverseColor) return trend === 'up' ? 'text-red-500' : 'text-green-500'
      return trend === 'up' ? 'text-green-500' : 'text-red-500'
    },

    // ==================== 趋势/预警/预算 ====================

    async fetchTrendData() {
      try {
        const result = await DashboardAPI.getDecisionsAnalytics({ days: 7 })
        if (result.success && result.data) {
          const dailyStats = result.data.trends?.daily_stats || []
          dailyStats.sort((a, b) => new Date(a.date) - new Date(b.date))
          return {
            dates: dailyStats.map(item => item.date),
            lottery: dailyStats.map(item => item.draws || 0),
            users: dailyStats.map(item => item.unique_users || 0),
            prizes: dailyStats.map(item => item.high_tier_wins || 0)
          }
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchTrendData 失败:', e.message)
        return null
      }
    },

    async fetchAlerts() {
      try {
        const result = await DashboardAPI.getRealtimeAlerts({ page_size: 10 })
        return (result.success && result.data) ? (result.data.alerts || result.data.items || []) : []
      } catch (e) {
        logger.warn('[DashboardPanel] fetchAlerts 失败:', e.message)
        return []
      }
    },

    async fetchBudgetStatus() {
      try {
        const result = await DashboardAPI.getBudgetStatus()
        if (result.success) {
          const campaigns = result.data?.campaigns || result.data?.items || []
          return campaigns.map(item => ({
            lottery_campaign_id: item.lottery_campaign_id,
            campaign_name: item.campaign_name || item.name || '-',
            total: item.pool_budget?.total ?? item.total ?? 0,
            used: item.pool_budget?.used ?? item.used ?? 0,
            remaining: item.pool_budget?.remaining ?? item.remaining ?? 0,
            usage: parseFloat(item.pool_budget?.usage_rate) ||
              (item.pool_budget?.total > 0 ? (item.pool_budget.used / item.pool_budget.total * 100) : 0)
          }))
        }
        return []
      } catch (e) {
        logger.warn('[DashboardPanel] fetchBudgetStatus 失败:', e.message)
        return []
      }
    },

    calculateBudgetForecast(budgetList) {
      if (!budgetList || budgetList.length === 0) {
        this.budgetForecast = { total_budget: 0, used_budget: 0, remaining_budget: 0, usage_rate: 0, daily_average: 0, estimated_days: null, estimated_exhaustion_date: null, trend_data: [], forecast_data: [], warning_level: 'normal' }
        return
      }

      let totalBudget = 0, usedBudget = 0, remainingBudget = 0
      budgetList.forEach(item => { totalBudget += item.total || 0; usedBudget += item.used || 0; remainingBudget += item.remaining || 0 })

      const usageRate = totalBudget > 0 ? (usedBudget / totalBudget) * 100 : 0
      const activeDays = 7
      const dailyAverage = activeDays > 0 ? usedBudget / activeDays : 0

      let estimatedDays = null, estimatedExhaustionDate = null
      if (dailyAverage > 0 && remainingBudget > 0) {
        estimatedDays = Math.ceil(remainingBudget / dailyAverage)
        const exhaustionDate = new Date()
        exhaustionDate.setDate(exhaustionDate.getDate() + estimatedDays)
        estimatedExhaustionDate = exhaustionDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' })
      }

      let warningLevel = 'normal'
      if (estimatedDays !== null) {
        if (estimatedDays <= 3) warningLevel = 'critical'
        else if (estimatedDays <= 7) warningLevel = 'warning'
      }

      const trendData = [], forecastData = [], today = new Date()
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today); date.setDate(date.getDate() - i)
        trendData.push({ date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }), consumed: Math.round(dailyAverage) })
      }
      for (let i = 1; i <= 7; i++) {
        const date = new Date(today); date.setDate(date.getDate() + i)
        forecastData.push({ date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }), predicted: Math.round(dailyAverage) })
      }

      this.budgetForecast = { total_budget: totalBudget, used_budget: usedBudget, remaining_budget: remainingBudget, usage_rate: usageRate, daily_average: dailyAverage, estimated_days: estimatedDays, estimated_exhaustion_date: estimatedExhaustionDate, trend_data: trendData, forecast_data: forecastData, warning_level: warningLevel }
    },

    getBudgetWarningClass(level) {
      return { critical: 'bg-red-50 border-red-200 text-red-700', warning: 'bg-yellow-50 border-yellow-200 text-yellow-700' }[level] || 'bg-green-50 border-green-200 text-green-700'
    },
    getBudgetProgressClass(usageRate) {
      if (usageRate >= 90) return 'bg-red-500'
      if (usageRate >= 70) return 'bg-yellow-500'
      return 'bg-green-500'
    },

    // ==================== 快捷操作/事件 ====================

    // ==================== 趋势图渲染 ====================

    async renderTrendChart() {
      const chartDom = document.getElementById('trend-chart')
      if (!chartDom) return

      const echarts = await loadECharts()
      if (!echarts) { logger.warn('[DashboardPanel] ECharts 加载失败'); return }

      if (!this.trendChart) {
        this.trendChart = echarts.init(chartDom)
      }

      const seriesName = this.trendType === 'lottery' ? '抽奖次数' : this.trendType === 'users' ? '活跃用户' : '奖品发放'
      const seriesData = this.trendData[this.trendType] || []
      const color = this.trendType === 'lottery' ? '#3b82f6' : this.trendType === 'users' ? '#10b981' : '#f59e0b'

      const option = {
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e2e8f0', borderWidth: 1, textStyle: { color: '#334155' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: this.trendData.dates || [], axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b' } },
        yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } }, axisLabel: { color: '#64748b' } },
        series: [{
          name: seriesName, type: 'line', smooth: true, data: seriesData,
          lineStyle: { color: color, width: 3 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '05' }] } },
          symbol: 'circle', symbolSize: 8, itemStyle: { color: color }
        }]
      }
      this.trendChart.setOption(option)

      const resizeHandler = () => { this.trendChart && this.trendChart.resize() }
      window.removeEventListener('resize', resizeHandler)
      window.addEventListener('resize', resizeHandler)
    },

    switchTimeRange(range) { this.timeRange = range; this.loadDashboardData() },
    async refreshDashboard() { await this.loadDashboardData() },

    quickAction(action) {
      const actionMap = {
        'consumption-review': '/admin/finance-management.html', 'customer-service': '/admin/customer-service.html',
        'lottery-alerts': '/admin/lottery-alerts.html', 'risk-alerts': '/admin/risk-alerts.html',
        'campaign-create': '/admin/lottery-management.html', 'pending-center': '/admin/pending-center.html',
        statistics: '/admin/statistics.html'
      }
      const url = actionMap[action]
      if (url) {
        if (window.parent && window.parent !== window) {
          window.parent.dispatchEvent(new CustomEvent('open-tab', { detail: { id: action, title: this.getActionTitle(action), icon: this.getActionIcon(action), url } }))
        } else { window.location.href = url }
      }
    },
    getActionTitle(action) {
      return { 'consumption-review': '消耗审核', 'customer-service': '客服会话', 'lottery-alerts': '抽奖告警', 'risk-alerts': '风控告警', 'campaign-create': '抽奖活动', 'pending-center': '待办中心', statistics: '数据统计' }[action] || action
    },
    getActionIcon(action) {
      return { 'consumption-review': '📋', 'customer-service': '💬', 'lottery-alerts': '🚨', 'risk-alerts': '⚠️', 'campaign-create': '🎯', 'pending-center': '🔔', statistics: '📊' }[action] || '📄'
    },
    handleAlert(alert) {
      if (alert.type === 'lottery' || alert.title?.includes('抽奖') || alert.title?.includes('中奖')) this.quickAction('lottery-alerts')
      else if (alert.type === 'risk' || alert.title?.includes('风控')) this.quickAction('risk-alerts')
      else if (alert.type === 'budget' || alert.title?.includes('预算')) this.quickAction('campaign-create')
    },

    // ==================== 今日核心事件 ====================

    async loadTodayEvents() {
      this.todayEvents = this.generateLocalEvents()
    },

    generateLocalEvents() {
      const events = []
      const now = new Date()
      const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' })

      if (this.stats.pending_consumption > 10) {
        events.push({ time: timeStr, level: this.stats.pending_consumption > 30 ? 'critical' : 'warning', title: `待审核消耗积压 ${this.stats.pending_consumption} 条`, description: '建议尽快处理以避免影响用户体验', action_url: '/admin/finance-management.html' })
      }
      if (this.alerts.length > 0) {
        const criticalAlerts = this.alerts.filter(a => a.level === 'critical').length
        if (criticalAlerts > 0) {
          events.push({ time: timeStr, level: 'critical', title: `发现 ${criticalAlerts} 条紧急告警`, description: '需要立即处理', action_url: '/admin/risk-alerts.html' })
        }
      }
      if (this.budgetForecast.warning_level === 'critical') {
        events.push({ time: '09:00', level: 'critical', title: '预算即将耗尽', description: `预计剩余 ${this.budgetForecast.estimated_days} 天`, action_url: '/admin/lottery-management.html' })
      }
      if (events.length === 0) {
        events.push({ time: '00:00', level: 'success', title: '系统运行正常', description: '所有指标在正常范围内', action_url: null })
      }
      return events
    },

    handleEventAction(event) {
      if (event.action_url) {
        if (window.parent && window.parent !== window) {
          window.parent.dispatchEvent(new CustomEvent('open-tab', { detail: { id: event.title, title: event.title, icon: event.level === 'critical' ? '🔴' : event.level === 'warning' ? '🟡' : '🔵', url: event.action_url } }))
        } else { window.location.href = event.action_url }
      }
    },

    // ==================== 资产发放/消耗比 ====================

    async loadAssetRatio() {
      try {
        const result = await request({ url: `${API_PREFIX}/console/analytics/stats/today` })
        if (result.success && result.data) {
          const { points_stats } = result.data
          const issued = points_stats?.points_earned_today || 0
          const consumed = points_stats?.points_spent_today || 0
          const ratio = consumed > 0 ? (issued / consumed) : (issued > 0 ? 999 : 1.0)
          this.assetRatio = { issued, consumed, ratio: Math.round(ratio * 100) / 100 }
          return
        }
        this.assetRatio = { issued: 0, consumed: 0, ratio: 1.0 }
      } catch (e) {
        logger.warn('[DashboardPanel] loadAssetRatio 失败:', e.message)
        this.assetRatio = { issued: 0, consumed: 0, ratio: 1.0 }
      }
    },

    // ==================== P1-6: 兑换履约率 ====================
    /**
     * 获取兑换订单履约率数据
     * 使用兑换市场统计和订单列表API计算
     */
    async fetchRedemptionFulfillment() {
      try {
        const result = await request({
          url: `${API_PREFIX}/console/exchange/orders`,
          params: { page: 1, page_size: 1000 }
        })
        if (result.success && result.data) {
          const orders = result.data.orders || []
          const total = result.data.pagination?.total || orders.length
          // 后端 ExchangeRecord 状态枚举: pending / completed / shipped / cancelled
          const pending = orders.filter(o => o.status === 'pending').length
          const fulfilled = orders.filter(o => o.status === 'completed' || o.status === 'shipped').length
          const cancelled = orders.filter(o => o.status === 'cancelled').length
          const fulfillment_rate = total > 0 ? Math.round((fulfilled / total) * 10000) / 100 : 0

          return { total, pending, fulfilled, cancelled, fulfillment_rate }
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchRedemptionFulfillment 失败:', e.message)
        return null
      }
    },

    // ==================== P1-6: 市场活跃度 ====================
    /**
     * 获取市场活跃度数据
     * 使用市场概览统计API（后端实际端点: /marketplace/stats/overview）
     */
    async fetchMarketActivity() {
      try {
        const result = await request({
          url: `${API_PREFIX}/console/marketplace/stats/overview`
        })
        if (result.success && result.data) {
          const data = result.data
          const totals = data.totals || {}
          return {
            active_listings: (data.on_sale_summary || []).reduce((sum, s) => sum + (s.count || 0), 0),
            total_trades: totals.total_trades || 0,
            completed_trades: totals.total_trades || 0,
            trade_completion_rate: totals.total_trades > 0 ? 100 : 0
          }
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchMarketActivity 失败:', e.message)
        return null
      }
    },

    // ==================== P1-6: 用户留存/活跃度 ====================
    /**
     * 获取用户活跃度数据
     * 使用今日统计API中的用户数据
     */
    async fetchUserRetention() {
      try {
        const result = await request({
          url: `${API_PREFIX}/console/analytics/stats/today`
        })
        if (result.success && result.data) {
          const userStats = result.data.user_stats || {}
          const totalUsers = userStats.total_users || 0
          // 后端 StatsService.getTodayStats 返回字段：
          // total_users, new_users_today, active_users_today, active_rate, total_logins_today
          // 注意：后端暂无 active_users_week / active_users_month，WAU/MAU 暂用 DAU 替代
          const dau = userStats.active_users_today || 0

          return {
            total_users: totalUsers,
            dau,
            wau: dau, // 后端暂无 WAU 字段，待后端扩展后对接
            mau: dau, // 后端暂无 MAU 字段，待后端扩展后对接
            dau_rate: totalUsers > 0 ? Math.round((dau / totalUsers) * 10000) / 100 : 0,
            wau_rate: totalUsers > 0 ? Math.round((dau / totalUsers) * 10000) / 100 : 0,
            mau_rate: totalUsers > 0 ? Math.round((dau / totalUsers) * 10000) / 100 : 0
          }
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchUserRetention 失败:', e.message)
        return null
      }
    },

    // ==================== P0-4: 今日待办摘要 ====================
    /**
     * 获取今日待办摘要数据
     * 复用 nav/badges API 获取各分类待处理数量
     */
    async fetchTodoPending() {
      try {
        const result = await request({
          url: `${API_PREFIX}/console/nav/badges`
        })
        if (result.success && result.data) {
          const badges = result.data.badges || {}
          return {
            consumption: badges.consumption || 0,
            redemption: badges.redemption || 0,
            customer_service: badges.customer_service || 0,
            risk_alert: badges.risk_alert || 0,
            lottery_alert: badges.lottery_alert || 0,
            feedback: badges.feedback || 0,
            total: result.data.total || 0
          }
        }
        return null
      } catch (e) {
        logger.warn('[DashboardPanel] fetchTodoPending 失败:', e.message)
        return null
      }
    }
  }
}

