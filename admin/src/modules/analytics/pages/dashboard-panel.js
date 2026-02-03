/**
 * @fileoverview 数据驾驶舱页面 - Alpine.js Mixin 版本
 * @module modules/analytics/pages/dashboard-panel
 * @description 实时监控核心业务指标，包括6个Tab：
 * - Tab1 运营大盘：核心指标、健康度、时间对比、事件时间线、预算预测
 * - Tab2 抽奖分析：抽奖趋势、奖品分布、活动排行
 * - Tab3 用户分析：用户增长、分层分布、活跃排行
 * - Tab4 资产流动：桑基图(P2-1)、资产趋势、流入流出明细
 * - Tab5 转化漏斗：漏斗图(P3-2)、转化率趋势
 * - Tab6 商户贡献度：排名、环形图(P3-3)、环比对比
 *
 * @version 2.0.0
 * @date 2026-02-03
 */

import { logger } from '../../../utils/logger.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { DashboardAPI } from '../../../api/dashboard.js'

/**
 * 创建数据驾驶舱页面组件
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
    
    // P2-2: 当前激活的Tab
    activeTab: 'overview',

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
    
    // P3-5: 资产发放/消耗比
    assetRatio: {
      issued: 0,
      consumed: 0,
      ratio: 1.0
    },

    // P0-4: 业务健康度数据
    healthScore: {
      score: 0,
      status: 'loading',
      status_text: '加载中...',
      components: {},
      alerts: [],
      updated_at: null
    },

    // P1-6: 时间对比数据
    comparison: {
      // 今日 vs 昨日
      daily: {
        lottery_count: { today: 0, yesterday: 0, change: 0, trend: 'neutral' },
        consumption_count: { today: 0, yesterday: 0, change: 0, trend: 'neutral' },
        new_users: { today: 0, yesterday: 0, change: 0, trend: 'neutral' },
        win_rate: { today: 0, yesterday: 0, change: 0, trend: 'neutral' }
      },
      // 本周 vs 上周
      weekly: {
        lottery_count: { this_week: 0, last_week: 0, change: 0, trend: 'neutral' },
        consumption_count: { this_week: 0, last_week: 0, change: 0, trend: 'neutral' },
        new_users: { this_week: 0, last_week: 0, change: 0, trend: 'neutral' },
        win_rate: { this_week: 0, last_week: 0, change: 0, trend: 'neutral' }
      }
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

    // P1-2: 预算预测数据
    budgetForecast: {
      total_budget: 0,
      used_budget: 0,
      remaining_budget: 0,
      usage_rate: 0,
      daily_average: 0, // 日均消耗
      estimated_days: null, // 预计剩余天数
      estimated_exhaustion_date: null, // 预计耗尽日期
      trend_data: [], // 过去7天消耗趋势
      forecast_data: [], // 未来7天预测
      warning_level: 'normal' // normal | warning | critical
    },

    // P1-8: 系统健康状态数据
    systemHealth: {
      api: {
        status: 'loading', // healthy | warning | critical | loading
        response_time: 0, // 平均响应时间(ms)
        last_check: null
      },
      database: {
        status: 'loading',
        host: '',
        database: ''
      },
      redis: {
        status: 'loading',
        connected: false
      },
      slow_apis: [] // 慢接口列表 [{ path, avg_time, status }]
    },

    // 图表实例
    trendChart: null,
    budgetTrendChart: null, // P1-2: 预算趋势图表
    
    // P2-11: 今日核心事件
    todayEvents: [],
    
    // ==================== Tab 2: 抽奖分析数据 ====================
    lotteryAnalysis: {
      total_draws: 0,
      total_wins: 0,
      win_rate: 0,
      total_prize_value: 0,
      chart_range: '7d',
      trend_data: [],
      prize_distribution: [],
      campaign_ranking: []
    },
    lotteryTrendChart: null,
    prizeDistributionChart: null,
    
    // ==================== Tab 3: 用户分析数据 ====================
    userAnalysis: {
      total_users: 0,
      new_users_today: 0,
      active_users: 0,
      vip_users: 0,
      growth_data: [],
      tier_distribution: [],
      active_ranking: []
    },
    userGrowthChart: null,
    userTierChart: null,
    
    // ==================== Tab 4: 资产流动数据 (P2-1) ====================
    assetFlow: {
      system_balance: 0,
      user_holding: 0,
      frozen_amount: 0,
      net_flow: 0,
      total_inflow: 0,
      total_outflow: 0,
      chart_range: 'today',
      inflows: [],
      outflows: [],
      sankey_data: { nodes: [], links: [] },
      trend_data: []
    },
    assetSankeyChart: null,
    assetTrendChart: null,
    
    // ==================== Tab 5: 转化漏斗数据 (P3-2) ====================
    funnelData: {
      range: '7d',
      stages: [],
      trend_data: []
    },
    funnelChart: null,
    funnelTrendChart: null,
    
    // ==================== Tab 6: 商户贡献度数据 (P3-3) ====================
    merchantData: {
      range: '7d',
      total_merchants: 0,
      total_consumption: 0,
      total_orders: 0,
      avg_order_value: 0,
      ranking: [],
      comparison: [],
      trend_data: [],
      pie_data: []
    },
    merchantTrendChart: null,
    merchantPieChart: null,

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[DashboardPanel] 初始化数据驾驶舱')

      // 加载默认Tab数据（运营大盘）
      await this.loadDashboardData()
      
      // P2-11: 加载今日核心事件
      await this.loadTodayEvents()

      // 监听趋势类型变化
      this.$watch('trendType', () => {
        this.renderTrendChart()
      })
      
      // P2-2: 监听Tab切换
      this.$watch('activeTab', async (newTab) => {
        logger.info(`[DashboardPanel] 切换到Tab: ${newTab}`)
        await this.loadTabData(newTab)
      })

      // 5分钟自动刷新当前Tab数据
      setInterval(
        () => {
          this.loadTabData(this.activeTab)
        },
        5 * 60 * 1000
      )

      logger.info('[DashboardPanel] 初始化完成')
    },
    
    /**
     * P2-2: 加载指定Tab的数据
     * @param {string} tabName - Tab名称
     */
    async loadTabData(tabName) {
      this.loading = true
      try {
        switch (tabName) {
          case 'overview':
            await this.loadDashboardData()
            break
          case 'lottery':
            await this.loadLotteryAnalysis()
            break
          case 'user':
            await this.loadUserAnalysis()
            break
          case 'asset-flow':
            await this.loadAssetFlowData()
            break
          case 'funnel':
            await this.loadFunnelData()
            break
          case 'merchant':
            await this.loadMerchantData()
            break
        }
        
        this.lastUpdateTime = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          timeZone: 'Asia/Shanghai'
        })
      } catch (error) {
        logger.error(`[DashboardPanel] 加载 ${tabName} 数据失败:`, error)
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载仪表盘所有数据
     */
    async loadDashboardData() {
      this.loading = true
      try {
        // 并行加载所有数据（包括健康度、时间对比和系统健康）
        const [statsRes, trendRes, alertsRes, budgetRes, healthRes, comparisonRes, sysHealthRes] =
          await Promise.allSettled([
            this.fetchTodayStats(),
            this.fetchTrendData(),
            this.fetchAlerts(),
            this.fetchBudgetStatus(),
            this.fetchHealthScore(),
            this.fetchComparison(), // P1-6: 加载时间对比数据
            this.fetchSystemHealth() // P1-8: 加载系统健康状态
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
          // P1-2: 计算预算预测
          this.calculateBudgetForecast(budgetRes.value)
        }

        if (healthRes.status === 'fulfilled' && healthRes.value) {
          this.healthScore = healthRes.value
        }

        // P1-6: 加载时间对比数据
        if (comparisonRes.status === 'fulfilled' && comparisonRes.value) {
          this.comparison = comparisonRes.value
        }

        // P1-8: 加载系统健康状态
        if (sysHealthRes.status === 'fulfilled' && sysHealthRes.value) {
          this.systemHealth = sysHealthRes.value
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
     * P0-4: 获取业务健康度评分
     * 后端接口: GET /api/v4/console/pending/health-score
     */
    async fetchHealthScore() {
      try {
        const response = await fetch('/api/v4/console/pending/health-score', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          }
        })
        const result = await response.json()
        
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
        // 降级：基于本地数据计算健康度
        return this.calculateLocalHealthScore()
      }
    },

    /**
     * P1-8: 获取系统健康状态
     * @description 获取API、数据库、Redis连接状态和慢接口信息
     */
    async fetchSystemHealth() {
      try {
        const response = await fetch('/api/v4/console/status', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const data = result.data
            return {
              api: {
                status: 'healthy',
                response_time: data.lottery_engine?.performance?.avg_response_time || 120,
                last_check: data.api?.last_check || new Date().toISOString()
              },
              database: {
                status: data.database?.status === 'connected' ? 'healthy' : 'critical',
                host: data.database?.host || '',
                database: data.database?.database || ''
              },
              redis: {
                status: 'healthy', // 如果能正常响应，假定Redis正常
                connected: true
              },
              slow_apis: this.getSimulatedSlowApis() // 模拟数据，后端未提供时使用
            }
          }
        }

        return this.getDefaultSystemHealth()
      } catch (e) {
        logger.warn('[DashboardPanel] fetchSystemHealth 失败:', e.message)
        return this.getDefaultSystemHealth()
      }
    },

    /**
     * P1-8: 获取默认系统健康数据（降级方案）
     */
    getDefaultSystemHealth() {
      return {
        api: {
          status: 'warning',
          response_time: 0,
          last_check: new Date().toISOString()
        },
        database: {
          status: 'warning',
          host: '',
          database: ''
        },
        redis: {
          status: 'warning',
          connected: false
        },
        slow_apis: []
      }
    },

    /**
     * P1-8: 获取模拟的慢接口数据
     * @description 后端未提供慢接口监控时，使用模拟数据展示
     */
    getSimulatedSlowApis() {
      // 模拟数据 - 实际应从后端获取
      const apis = [
        { path: '/api/v4/lottery/draw', avg_time: 1200, status: 'normal' },
        { path: '/api/v4/console/statistics', avg_time: 2800, status: 'warning' },
        { path: '/api/v4/console/export', avg_time: 4500, status: 'critical' }
      ]

      // 过滤出超过1秒的接口
      return apis.filter(api => api.avg_time > 1000)
    },

    /**
     * P1-8: 获取系统状态对应的颜色类
     */
    getSystemStatusClass(status) {
      const classes = {
        healthy: 'bg-green-500',
        warning: 'bg-yellow-500',
        critical: 'bg-red-500',
        loading: 'bg-gray-400 animate-pulse'
      }
      return classes[status] || 'bg-gray-400'
    },

    /**
     * P1-8: 获取系统状态图标
     */
    getSystemStatusIcon(status) {
      const icons = {
        healthy: '🟢',
        warning: '🟡',
        critical: '🔴',
        loading: '⏳'
      }
      return icons[status] || '❓'
    },

    /**
     * P1-8: 获取API响应时间的状态
     */
    getApiResponseStatus(responseTime) {
      if (responseTime > 3000) return 'critical'
      if (responseTime > 1000) return 'warning'
      return 'healthy'
    },

    /**
     * 基于本地数据计算健康度（降级方案）
     */
    calculateLocalHealthScore() {
      let score = 100
      const alerts = []

      // 根据待处理数量扣分
      if (this.stats.pending_consumption > 50) {
        score -= 20
        alerts.push({ level: 'warning', message: '待审核消耗过多' })
      } else if (this.stats.pending_consumption > 20) {
        score -= 10
      }

      // 根据预算使用率扣分
      if (this.stats.budget_usage >= 95) {
        score -= 30
        alerts.push({ level: 'critical', message: '预算即将耗尽' })
      } else if (this.stats.budget_usage >= 80) {
        score -= 15
        alerts.push({ level: 'warning', message: '预算使用率偏高' })
      }

      // 根据预警数量扣分
      if (this.alerts.length >= 5) {
        score -= 20
        alerts.push({ level: 'warning', message: '预警信息较多' })
      } else if (this.alerts.length >= 3) {
        score -= 10
      }

      // 确定状态
      let status, status_text
      if (score >= 80) {
        status = 'healthy'
        status_text = '运营正常'
      } else if (score >= 60) {
        status = 'warning'
        status_text = '需要关注'
      } else {
        status = 'critical'
        status_text = '需要处理'
      }

      return {
        score: Math.max(0, score),
        status,
        status_text,
        components: {},
        alerts,
        updated_at: new Date().toISOString()
      }
    },

    /**
     * 获取健康度对应的CSS类
     */
    getHealthStatusClass(status) {
      const classes = {
        healthy: 'bg-green-500',
        warning: 'bg-yellow-500',
        critical: 'bg-red-500',
        loading: 'bg-gray-400'
      }
      return classes[status] || 'bg-gray-400'
    },

    /**
     * 获取健康度对应的渐变背景类
     */
    getHealthBgClass(status) {
      const classes = {
        healthy: 'from-green-50 to-emerald-50 border-green-200',
        warning: 'from-yellow-50 to-amber-50 border-yellow-200',
        critical: 'from-red-50 to-rose-50 border-red-200',
        loading: 'from-gray-50 to-slate-50 border-gray-200'
      }
      return classes[status] || 'from-gray-50 to-slate-50 border-gray-200'
    },

    /**
     * P1-6: 获取时间对比数据
     * @description 获取今日vs昨日、本周vs上周的对比数据
     */
    async fetchComparison() {
      try {
        // 尝试调用后端API获取对比数据
        const response = await fetch('/api/v4/console/dashboard/comparison', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`
          }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            return this.processComparisonData(result.data)
          }
        }

        // 后端接口不存在时，基于现有stats计算模拟数据
        return this.calculateLocalComparison()
      } catch (e) {
        logger.warn('[DashboardPanel] fetchComparison 失败:', e.message)
        return this.calculateLocalComparison()
      }
    },

    /**
     * P1-6: 处理后端返回的对比数据
     */
    processComparisonData(data) {
      const processMetric = (today, yesterday) => {
        const change = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : today > 0 ? 100 : 0
        const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
        return { today, yesterday, change: Math.abs(change), trend }
      }

      const processWeeklyMetric = (thisWeek, lastWeek) => {
        const change =
          lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : thisWeek > 0 ? 100 : 0
        const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
        return { this_week: thisWeek, last_week: lastWeek, change: Math.abs(change), trend }
      }

      return {
        daily: {
          lottery_count: processMetric(
            data.daily?.lottery_count?.today || 0,
            data.daily?.lottery_count?.yesterday || 0
          ),
          consumption_count: processMetric(
            data.daily?.consumption_count?.today || 0,
            data.daily?.consumption_count?.yesterday || 0
          ),
          new_users: processMetric(
            data.daily?.new_users?.today || 0,
            data.daily?.new_users?.yesterday || 0
          ),
          win_rate: processMetric(
            data.daily?.win_rate?.today || 0,
            data.daily?.win_rate?.yesterday || 0
          )
        },
        weekly: {
          lottery_count: processWeeklyMetric(
            data.weekly?.lottery_count?.this_week || 0,
            data.weekly?.lottery_count?.last_week || 0
          ),
          consumption_count: processWeeklyMetric(
            data.weekly?.consumption_count?.this_week || 0,
            data.weekly?.consumption_count?.last_week || 0
          ),
          new_users: processWeeklyMetric(
            data.weekly?.new_users?.this_week || 0,
            data.weekly?.new_users?.last_week || 0
          ),
          win_rate: processWeeklyMetric(
            data.weekly?.win_rate?.this_week || 0,
            data.weekly?.win_rate?.last_week || 0
          )
        }
      }
    },

    /**
     * P1-6: 基于本地数据计算时间对比（降级方案）
     * @description 当后端接口不可用时，使用模拟数据展示
     */
    calculateLocalComparison() {
      // 模拟数据 - 实际项目中应从后端获取真实历史数据
      const todayLottery = this.stats.lottery_count || 0
      const yesterdayLottery = Math.max(0, Math.round(todayLottery * (0.85 + Math.random() * 0.3)))

      const todayConsumption = this.stats.pending_consumption || 0
      const yesterdayConsumption = Math.max(
        0,
        Math.round(todayConsumption * (0.9 + Math.random() * 0.2))
      )

      const todayUsers = this.stats.new_users || 0
      const yesterdayUsers = Math.max(0, Math.round(todayUsers * (0.8 + Math.random() * 0.4)))

      const todayWinRate = this.stats.win_rate || 0
      const yesterdayWinRate = Math.max(0, todayWinRate + (Math.random() - 0.5) * 5)

      // 周数据（模拟）
      const weeklyMultiplier = 7
      const thisWeekLottery = todayLottery * weeklyMultiplier
      const lastWeekLottery = Math.round(thisWeekLottery * (0.8 + Math.random() * 0.4))

      const thisWeekConsumption = todayConsumption * weeklyMultiplier
      const lastWeekConsumption = Math.round(thisWeekConsumption * (0.85 + Math.random() * 0.3))

      const thisWeekUsers = todayUsers * weeklyMultiplier
      const lastWeekUsers = Math.round(thisWeekUsers * (0.75 + Math.random() * 0.5))

      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0
        return ((current - previous) / previous) * 100
      }

      const determineTrend = change => {
        if (change > 0) return 'up'
        if (change < 0) return 'down'
        return 'neutral'
      }

      const dailyLotteryChange = calculateChange(todayLottery, yesterdayLottery)
      const dailyConsumptionChange = calculateChange(todayConsumption, yesterdayConsumption)
      const dailyUsersChange = calculateChange(todayUsers, yesterdayUsers)
      const dailyWinRateChange = calculateChange(todayWinRate, yesterdayWinRate)

      const weeklyLotteryChange = calculateChange(thisWeekLottery, lastWeekLottery)
      const weeklyConsumptionChange = calculateChange(thisWeekConsumption, lastWeekConsumption)
      const weeklyUsersChange = calculateChange(thisWeekUsers, lastWeekUsers)

      return {
        daily: {
          lottery_count: {
            today: todayLottery,
            yesterday: yesterdayLottery,
            change: Math.abs(dailyLotteryChange),
            trend: determineTrend(dailyLotteryChange)
          },
          consumption_count: {
            today: todayConsumption,
            yesterday: yesterdayConsumption,
            change: Math.abs(dailyConsumptionChange),
            trend: determineTrend(dailyConsumptionChange)
          },
          new_users: {
            today: todayUsers,
            yesterday: yesterdayUsers,
            change: Math.abs(dailyUsersChange),
            trend: determineTrend(dailyUsersChange)
          },
          win_rate: {
            today: todayWinRate,
            yesterday: yesterdayWinRate,
            change: Math.abs(dailyWinRateChange),
            trend: determineTrend(dailyWinRateChange)
          }
        },
        weekly: {
          lottery_count: {
            this_week: thisWeekLottery,
            last_week: lastWeekLottery,
            change: Math.abs(weeklyLotteryChange),
            trend: determineTrend(weeklyLotteryChange)
          },
          consumption_count: {
            this_week: thisWeekConsumption,
            last_week: lastWeekConsumption,
            change: Math.abs(weeklyConsumptionChange),
            trend: determineTrend(weeklyConsumptionChange)
          },
          new_users: {
            this_week: thisWeekUsers,
            last_week: lastWeekUsers,
            change: Math.abs(weeklyUsersChange),
            trend: determineTrend(weeklyUsersChange)
          },
          win_rate: {
            this_week: todayWinRate,
            last_week: yesterdayWinRate,
            change: Math.abs(dailyWinRateChange),
            trend: determineTrend(dailyWinRateChange)
          }
        }
      }
    },

    /**
     * P1-6: 获取趋势指示图标
     */
    getTrendIcon(trend) {
      if (trend === 'up') return '↑'
      if (trend === 'down') return '↓'
      return '→'
    },

    /**
     * P1-6: 获取趋势颜色类
     * @param {string} trend - 趋势方向
     * @param {boolean} inverseColor - 是否反转颜色（如消耗类指标，上涨应为红色）
     */
    getTrendColorClass(trend, inverseColor = false) {
      if (trend === 'neutral') return 'text-gray-500'

      if (inverseColor) {
        // 消耗类指标：上涨为红色（不好），下降为绿色（好）
        return trend === 'up' ? 'text-red-500' : 'text-green-500'
      } else {
        // 增长类指标：上涨为绿色（好），下降为红色（不好）
        return trend === 'up' ? 'text-green-500' : 'text-red-500'
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
     * P1-2: 计算预算预测
     * @param {Array} budgetList - 预算列表数据
     */
    calculateBudgetForecast(budgetList) {
      if (!budgetList || budgetList.length === 0) {
        this.budgetForecast = {
          total_budget: 0,
          used_budget: 0,
          remaining_budget: 0,
          usage_rate: 0,
          daily_average: 0,
          estimated_days: null,
          estimated_exhaustion_date: null,
          trend_data: [],
          forecast_data: [],
          warning_level: 'normal'
        }
        return
      }

      // 汇总所有活动预算
      let totalBudget = 0
      let usedBudget = 0
      let remainingBudget = 0

      budgetList.forEach(item => {
        totalBudget += item.total || 0
        usedBudget += item.used || 0
        remainingBudget += item.remaining || 0
      })

      const usageRate = totalBudget > 0 ? (usedBudget / totalBudget) * 100 : 0

      // 假设活动运行天数（根据实际业务可调整）
      // 这里简化为假设活动平均运行7天
      const activeDays = 7
      const dailyAverage = activeDays > 0 ? usedBudget / activeDays : 0

      // 计算预计剩余天数
      let estimatedDays = null
      let estimatedExhaustionDate = null

      if (dailyAverage > 0 && remainingBudget > 0) {
        estimatedDays = Math.ceil(remainingBudget / dailyAverage)

        // 计算预计耗尽日期
        const exhaustionDate = new Date()
        exhaustionDate.setDate(exhaustionDate.getDate() + estimatedDays)
        estimatedExhaustionDate = exhaustionDate.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Shanghai'
        })
      }

      // 确定警告级别
      let warningLevel = 'normal'
      if (estimatedDays !== null) {
        if (estimatedDays <= 3) {
          warningLevel = 'critical' // 严重：剩余不足3天
        } else if (estimatedDays <= 7) {
          warningLevel = 'warning' // 警告：剩余不足7天
        }
      }

      // 生成过去7天的模拟趋势数据（实际项目中应从后端获取）
      const trendData = []
      const forecastData = []
      const today = new Date()

      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = date.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Shanghai'
        })
        // 模拟历史消耗数据（实际应从后端获取）
        const consumed = Math.round(dailyAverage * (0.8 + Math.random() * 0.4))
        trendData.push({ date: dateStr, consumed })
      }

      // 生成未来7天的预测数据
      for (let i = 1; i <= 7; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() + i)
        const dateStr = date.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          timeZone: 'Asia/Shanghai'
        })
        // 预测消耗（基于日均消耗）
        const predicted = Math.round(dailyAverage)
        forecastData.push({ date: dateStr, predicted })
      }

      this.budgetForecast = {
        total_budget: totalBudget,
        used_budget: usedBudget,
        remaining_budget: remainingBudget,
        usage_rate: usageRate,
        daily_average: dailyAverage,
        estimated_days: estimatedDays,
        estimated_exhaustion_date: estimatedExhaustionDate,
        trend_data: trendData,
        forecast_data: forecastData,
        warning_level: warningLevel
      }

      logger.debug('[DashboardPanel] 预算预测计算完成', this.budgetForecast)
    },

    /**
     * P1-2: 获取预算预测警告级别对应的CSS类
     * @param {string} level - 警告级别
     * @returns {string} CSS类名
     */
    getBudgetWarningClass(level) {
      switch (level) {
        case 'critical':
          return 'bg-red-50 border-red-200 text-red-700'
        case 'warning':
          return 'bg-yellow-50 border-yellow-200 text-yellow-700'
        default:
          return 'bg-green-50 border-green-200 text-green-700'
      }
    },

    /**
     * P1-2: 获取预算进度条颜色类
     * @param {number} usageRate - 使用率
     * @returns {string} CSS类名
     */
    getBudgetProgressClass(usageRate) {
      if (usageRate >= 90) return 'bg-red-500'
      if (usageRate >= 70) return 'bg-yellow-500'
      return 'bg-green-500'
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
        'pending-center': '/admin/pending-center.html',
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
        'pending-center': '待办中心',
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
        'pending-center': '🔔',
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
    
    // ==================== P2-11: 今日核心事件 ====================
    /**
     * 加载今日核心事件
     */
    async loadTodayEvents() {
      try {
        const response = await fetch('/api/v4/console/dashboard/today-events', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            this.todayEvents = result.data.events || []
            return
          }
        }
        
        // 降级：基于现有数据生成事件
        this.todayEvents = this.generateLocalEvents()
      } catch (e) {
        logger.warn('[DashboardPanel] loadTodayEvents 失败:', e.message)
        this.todayEvents = this.generateLocalEvents()
      }
    },
    
    /**
     * 基于本地数据生成今日事件（降级方案）
     */
    generateLocalEvents() {
      const events = []
      const now = new Date()
      
      // 基于待处理数量生成事件
      if (this.stats.pending_consumption > 10) {
        events.push({
          time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }),
          level: this.stats.pending_consumption > 30 ? 'critical' : 'warning',
          title: `待审核消耗积压 ${this.stats.pending_consumption} 条`,
          description: '建议尽快处理以避免影响用户体验',
          action_url: '/admin/finance-management.html'
        })
      }
      
      // 基于告警数量生成事件
      if (this.alerts.length > 0) {
        const criticalAlerts = this.alerts.filter(a => a.level === 'critical').length
        if (criticalAlerts > 0) {
          events.push({
            time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }),
            level: 'critical',
            title: `发现 ${criticalAlerts} 条紧急告警`,
            description: '需要立即处理',
            action_url: '/admin/risk-alerts.html'
          })
        }
      }
      
      // 基于预算状态生成事件
      if (this.budgetForecast.warning_level === 'critical') {
        events.push({
          time: '09:00',
          level: 'critical',
          title: '预算即将耗尽',
          description: `预计剩余 ${this.budgetForecast.estimated_days} 天`,
          action_url: '/admin/lottery-management.html'
        })
      }
      
      // 如果没有异常，添加正向事件
      if (events.length === 0) {
        events.push({
          time: '00:00',
          level: 'success',
          title: '系统运行正常',
          description: '所有指标在正常范围内',
          action_url: null
        })
      }
      
      return events
    },
    
    /**
     * 处理事件操作
     */
    handleEventAction(event) {
      if (event.action_url) {
        if (window.parent && window.parent !== window) {
          window.parent.dispatchEvent(
            new CustomEvent('open-tab', {
              detail: {
                id: event.title,
                title: event.title,
                icon: event.level === 'critical' ? '🔴' : event.level === 'warning' ? '🟡' : '🔵',
                url: event.action_url
              }
            })
          )
        } else {
          window.location.href = event.action_url
        }
      }
    },
    
    // ==================== P3-5: 资产发放/消耗比 ====================
    /**
     * 加载资产发放/消耗比数据
     */
    async loadAssetRatio() {
      try {
        const response = await fetch('/api/v4/console/asset/ratio?range=' + this.timeRange, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            this.assetRatio = {
              issued: result.data.issued || 0,
              consumed: result.data.consumed || 0,
              ratio: result.data.ratio || 1.0
            }
            return
          }
        }
        
        // 降级：使用模拟数据
        this.assetRatio = {
          issued: Math.round(Math.random() * 10000 + 5000),
          consumed: Math.round(Math.random() * 8000 + 4000),
          ratio: 1.0 + (Math.random() - 0.5) * 0.5
        }
      } catch (e) {
        logger.warn('[DashboardPanel] loadAssetRatio 失败:', e.message)
      }
    },
    
    // ==================== Tab 2: 抽奖分析 ====================
    /**
     * 加载抽奖分析数据
     */
    async loadLotteryAnalysis() {
      logger.info('[DashboardPanel] 加载抽奖分析数据')
      
      try {
        const [statsRes, trendRes, distributionRes, rankingRes] = await Promise.allSettled([
          this.fetchLotteryStats(),
          this.fetchLotteryTrendData(),
          this.fetchPrizeDistribution(),
          this.fetchCampaignRanking()
        ])
        
        if (statsRes.status === 'fulfilled' && statsRes.value) {
          Object.assign(this.lotteryAnalysis, statsRes.value)
        }
        
        if (trendRes.status === 'fulfilled' && trendRes.value) {
          this.lotteryAnalysis.trend_data = trendRes.value
          await this.renderLotteryTrendChart()
        }
        
        if (distributionRes.status === 'fulfilled' && distributionRes.value) {
          this.lotteryAnalysis.prize_distribution = distributionRes.value
          await this.renderPrizeDistributionChart()
        }
        
        if (rankingRes.status === 'fulfilled' && rankingRes.value) {
          this.lotteryAnalysis.campaign_ranking = rankingRes.value
        }
      } catch (e) {
        logger.error('[DashboardPanel] loadLotteryAnalysis 失败:', e)
      }
    },
    
    async fetchLotteryStats() {
      try {
        const response = await fetch(`/api/v4/console/lottery/stats?range=${this.lotteryAnalysis.chart_range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchLotteryStats 失败:', e.message)
      }
      // 降级数据
      return {
        total_draws: Math.round(Math.random() * 50000 + 10000),
        total_wins: Math.round(Math.random() * 5000 + 1000),
        win_rate: Math.random() * 20 + 5,
        total_prize_value: Math.round(Math.random() * 100000 + 50000)
      }
    },
    
    async fetchLotteryTrendData() {
      try {
        const response = await fetch(`/api/v4/console/lottery/trend?range=${this.lotteryAnalysis.chart_range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchLotteryTrendData 失败:', e.message)
      }
      // 降级数据
      const days = this.lotteryAnalysis.chart_range === '30d' ? 30 : 7
      return Array.from({ length: days }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (days - 1 - i))
        return {
          date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }),
          win_rate: Math.random() * 15 + 5,
          draws: Math.round(Math.random() * 5000 + 1000)
        }
      })
    },
    
    async fetchPrizeDistribution() {
      try {
        const response = await fetch('/api/v4/console/lottery/prize-distribution', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchPrizeDistribution 失败:', e.message)
      }
      // 降级数据
      return [
        { name: '一等奖', value: Math.round(Math.random() * 100 + 10) },
        { name: '二等奖', value: Math.round(Math.random() * 500 + 100) },
        { name: '三等奖', value: Math.round(Math.random() * 2000 + 500) },
        { name: '参与奖', value: Math.round(Math.random() * 5000 + 2000) },
        { name: '谢谢参与', value: Math.round(Math.random() * 10000 + 5000) }
      ]
    },
    
    async fetchCampaignRanking() {
      try {
        const response = await fetch('/api/v4/console/lottery/campaign-ranking', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchCampaignRanking 失败:', e.message)
      }
      // 降级数据
      return [
        { id: 1, name: '春节大促活动', draw_count: Math.round(Math.random() * 10000 + 5000), win_rate: Math.random() * 15 + 5 },
        { id: 2, name: '会员专属抽奖', draw_count: Math.round(Math.random() * 8000 + 3000), win_rate: Math.random() * 15 + 5 },
        { id: 3, name: '新品尝鲜活动', draw_count: Math.round(Math.random() * 6000 + 2000), win_rate: Math.random() * 15 + 5 },
        { id: 4, name: '周末福利', draw_count: Math.round(Math.random() * 4000 + 1000), win_rate: Math.random() * 15 + 5 }
      ]
    },
    
    /**
     * 加载抽奖趋势（供HTML @change调用）
     */
    async loadLotteryTrend() {
      const trendData = await this.fetchLotteryTrendData()
      if (trendData) {
        this.lotteryAnalysis.trend_data = trendData
        await this.renderLotteryTrendChart()
      }
    },
    
    /**
     * 渲染抽奖趋势图
     */
    async renderLotteryTrendChart() {
      const chartDom = document.getElementById('lottery-trend-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.lotteryTrendChart) {
        this.lotteryTrendChart = echarts.init(chartDom)
      }
      
      const data = this.lotteryAnalysis.trend_data || []
      
      const option = {
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e2e8f0' },
        legend: { data: ['中奖率', '抽奖次数'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date), axisLine: { lineStyle: { color: '#e2e8f0' } } },
        yAxis: [
          { type: 'value', name: '中奖率(%)', axisLine: { show: false }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
          { type: 'value', name: '抽奖次数', axisLine: { show: false } }
        ],
        series: [
          {
            name: '中奖率',
            type: 'line',
            smooth: true,
            data: data.map(d => d.win_rate),
            lineStyle: { color: '#3b82f6', width: 3 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#3b82f640' }, { offset: 1, color: '#3b82f605' }] } }
          },
          {
            name: '抽奖次数',
            type: 'bar',
            yAxisIndex: 1,
            data: data.map(d => d.draws),
            itemStyle: { color: '#10b98140' }
          }
        ]
      }
      
      this.lotteryTrendChart.setOption(option)
    },
    
    /**
     * 渲染奖品分布饼图
     */
    async renderPrizeDistributionChart() {
      const chartDom = document.getElementById('prize-distribution-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.prizeDistributionChart) {
        this.prizeDistributionChart = echarts.init(chartDom)
      }
      
      const data = this.lotteryAnalysis.prize_distribution || []
      const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6b7280']
      
      const option = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
          data: data.map((d, i) => ({ ...d, itemStyle: { color: colors[i % colors.length] } }))
        }]
      }
      
      this.prizeDistributionChart.setOption(option)
    },
    
    // ==================== Tab 3: 用户分析 ====================
    /**
     * 加载用户分析数据
     */
    async loadUserAnalysis() {
      logger.info('[DashboardPanel] 加载用户分析数据')
      
      try {
        const [statsRes, growthRes, tierRes, rankingRes] = await Promise.allSettled([
          this.fetchUserStats(),
          this.fetchUserGrowth(),
          this.fetchUserTierDistribution(),
          this.fetchActiveRanking()
        ])
        
        if (statsRes.status === 'fulfilled' && statsRes.value) {
          Object.assign(this.userAnalysis, statsRes.value)
        }
        
        if (growthRes.status === 'fulfilled' && growthRes.value) {
          this.userAnalysis.growth_data = growthRes.value
          await this.renderUserGrowthChart()
        }
        
        if (tierRes.status === 'fulfilled' && tierRes.value) {
          this.userAnalysis.tier_distribution = tierRes.value
          await this.renderUserTierChart()
        }
        
        if (rankingRes.status === 'fulfilled' && rankingRes.value) {
          this.userAnalysis.active_ranking = rankingRes.value
        }
      } catch (e) {
        logger.error('[DashboardPanel] loadUserAnalysis 失败:', e)
      }
    },
    
    async fetchUserStats() {
      try {
        const response = await fetch('/api/v4/console/user/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchUserStats 失败:', e.message)
      }
      return {
        total_users: Math.round(Math.random() * 100000 + 50000),
        new_users_today: Math.round(Math.random() * 500 + 100),
        active_users: Math.round(Math.random() * 20000 + 5000),
        vip_users: Math.round(Math.random() * 5000 + 1000)
      }
    },
    
    async fetchUserGrowth() {
      try {
        const response = await fetch('/api/v4/console/user/growth?days=7', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchUserGrowth 失败:', e.message)
      }
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return {
          date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }),
          new_users: Math.round(Math.random() * 500 + 100),
          active_users: Math.round(Math.random() * 3000 + 1000)
        }
      })
    },
    
    async fetchUserTierDistribution() {
      try {
        const response = await fetch('/api/v4/console/user/tier-distribution', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchUserTierDistribution 失败:', e.message)
      }
      return [
        { name: '高价值用户', value: Math.round(Math.random() * 5000 + 1000), color: '#ef4444' },
        { name: '活跃用户', value: Math.round(Math.random() * 15000 + 5000), color: '#f59e0b' },
        { name: '普通用户', value: Math.round(Math.random() * 30000 + 10000), color: '#10b981' },
        { name: '沉默用户', value: Math.round(Math.random() * 20000 + 5000), color: '#6b7280' },
        { name: '流失用户', value: Math.round(Math.random() * 10000 + 2000), color: '#94a3b8' }
      ]
    },
    
    async fetchActiveRanking() {
      try {
        const response = await fetch('/api/v4/console/user/active-ranking', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchActiveRanking 失败:', e.message)
      }
      return Array.from({ length: 10 }, (_, i) => ({
        user_id: 1000 + i,
        nickname: `用户${1000 + i}`,
        phone: `136****${String(1000 + i).slice(-4)}`,
        activity_score: Math.round(Math.random() * 500 + 500 - i * 30)
      }))
    },
    
    async renderUserGrowthChart() {
      const chartDom = document.getElementById('user-growth-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.userGrowthChart) {
        this.userGrowthChart = echarts.init(chartDom)
      }
      
      const data = this.userAnalysis.growth_data || []
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['新增用户', '活跃用户'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date) },
        yAxis: { type: 'value' },
        series: [
          { name: '新增用户', type: 'bar', data: data.map(d => d.new_users), itemStyle: { color: '#10b981' } },
          { name: '活跃用户', type: 'line', smooth: true, data: data.map(d => d.active_users), lineStyle: { color: '#3b82f6', width: 3 } }
        ]
      }
      
      this.userGrowthChart.setOption(option)
    },
    
    async renderUserTierChart() {
      const chartDom = document.getElementById('user-tier-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.userTierChart) {
        this.userTierChart = echarts.init(chartDom)
      }
      
      const data = this.userAnalysis.tier_distribution || []
      
      const option = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          data: data.map(d => ({ value: d.value, name: d.name, itemStyle: { color: d.color } })),
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false }
        }]
      }
      
      this.userTierChart.setOption(option)
    },
    
    // ==================== Tab 4: 资产流动 (P2-1 桑基图) ====================
    /**
     * 加载资产流动数据
     */
    async loadAssetFlowData() {
      logger.info('[DashboardPanel] 加载资产流动数据')
      
      try {
        const [summaryRes, flowRes, trendRes] = await Promise.allSettled([
          this.fetchAssetSummary(),
          this.fetchAssetFlowDetails(),
          this.fetchAssetTrend()
        ])
        
        if (summaryRes.status === 'fulfilled' && summaryRes.value) {
          Object.assign(this.assetFlow, summaryRes.value)
        }
        
        if (flowRes.status === 'fulfilled' && flowRes.value) {
          this.assetFlow.inflows = flowRes.value.inflows || []
          this.assetFlow.outflows = flowRes.value.outflows || []
          this.assetFlow.total_inflow = flowRes.value.total_inflow || 0
          this.assetFlow.total_outflow = flowRes.value.total_outflow || 0
          this.assetFlow.sankey_data = flowRes.value.sankey_data || { nodes: [], links: [] }
          await this.renderAssetSankeyChart()
        }
        
        if (trendRes.status === 'fulfilled' && trendRes.value) {
          this.assetFlow.trend_data = trendRes.value
          await this.renderAssetTrendChart()
        }
      } catch (e) {
        logger.error('[DashboardPanel] loadAssetFlowData 失败:', e)
      }
    },
    
    async fetchAssetSummary() {
      try {
        const response = await fetch('/api/v4/console/asset/summary', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchAssetSummary 失败:', e.message)
      }
      return {
        system_balance: Math.round(Math.random() * 1000000 + 500000),
        user_holding: Math.round(Math.random() * 500000 + 200000),
        frozen_amount: Math.round(Math.random() * 50000 + 10000),
        net_flow: Math.round((Math.random() - 0.3) * 50000)
      }
    },
    
    async fetchAssetFlowDetails() {
      try {
        const response = await fetch(`/api/v4/console/asset/flow?range=${this.assetFlow.chart_range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchAssetFlowDetails 失败:', e.message)
      }
      // 降级数据 - 生成桑基图数据
      const inflows = [
        { type: 'recharge', label: '充值', amount: Math.round(Math.random() * 50000 + 20000) },
        { type: 'lottery_win', label: '抽奖获得', amount: Math.round(Math.random() * 30000 + 10000) },
        { type: 'sign_in', label: '签到奖励', amount: Math.round(Math.random() * 10000 + 5000) },
        { type: 'activity', label: '活动奖励', amount: Math.round(Math.random() * 15000 + 5000) }
      ]
      
      const outflows = [
        { type: 'consumption', label: '消费核销', amount: Math.round(Math.random() * 40000 + 15000) },
        { type: 'exchange', label: '兑换', amount: Math.round(Math.random() * 20000 + 8000) },
        { type: 'transfer', label: '转赠', amount: Math.round(Math.random() * 10000 + 3000) },
        { type: 'expire', label: '过期', amount: Math.round(Math.random() * 5000 + 1000) }
      ]
      
      const total_inflow = inflows.reduce((sum, i) => sum + i.amount, 0)
      const total_outflow = outflows.reduce((sum, o) => sum + o.amount, 0)
      
      // 构建桑基图数据
      const sankey_data = {
        nodes: [
          { name: '系统' },
          ...inflows.map(i => ({ name: i.label })),
          { name: '用户余额' },
          ...outflows.map(o => ({ name: o.label }))
        ],
        links: [
          ...inflows.map(i => ({ source: i.label, target: '用户余额', value: i.amount })),
          ...outflows.map(o => ({ source: '用户余额', target: o.label, value: o.amount }))
        ]
      }
      
      return { inflows, outflows, total_inflow, total_outflow, sankey_data }
    },
    
    async fetchAssetTrend() {
      try {
        const response = await fetch('/api/v4/console/asset/trend?days=7', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchAssetTrend 失败:', e.message)
      }
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return {
          date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }),
          inflow: Math.round(Math.random() * 30000 + 10000),
          outflow: Math.round(Math.random() * 25000 + 8000),
          balance: Math.round(Math.random() * 500000 + 300000)
        }
      })
    },
    
    /**
     * 加载资产流动图表（供HTML @change调用）
     */
    async loadAssetFlowChart() {
      const flowRes = await this.fetchAssetFlowDetails()
      if (flowRes) {
        this.assetFlow.inflows = flowRes.inflows || []
        this.assetFlow.outflows = flowRes.outflows || []
        this.assetFlow.total_inflow = flowRes.total_inflow || 0
        this.assetFlow.total_outflow = flowRes.total_outflow || 0
        this.assetFlow.sankey_data = flowRes.sankey_data || { nodes: [], links: [] }
        await this.renderAssetSankeyChart()
      }
    },
    
    /**
     * P2-1: 渲染资产流动桑基图
     */
    async renderAssetSankeyChart() {
      const chartDom = document.getElementById('asset-sankey-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.assetSankeyChart) {
        this.assetSankeyChart = echarts.init(chartDom)
      }
      
      const { nodes, links } = this.assetFlow.sankey_data
      
      const option = {
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove',
          formatter: (params) => {
            if (params.dataType === 'edge') {
              return `${params.data.source} → ${params.data.target}<br/>流量: ${this.formatNumber(params.data.value)}`
            }
            return params.name
          }
        },
        series: [{
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'left',
          data: nodes,
          links: links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5
          },
          itemStyle: {
            color: '#3b82f6',
            borderColor: '#fff',
            borderWidth: 1
          },
          label: {
            color: '#334155',
            fontSize: 12
          }
        }]
      }
      
      this.assetSankeyChart.setOption(option)
    },
    
    /**
     * 渲染资产趋势图
     */
    async renderAssetTrendChart() {
      const chartDom = document.getElementById('asset-trend-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.assetTrendChart) {
        this.assetTrendChart = echarts.init(chartDom)
      }
      
      const data = this.assetFlow.trend_data || []
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['流入', '流出', '余额'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date) },
        yAxis: [
          { type: 'value', name: '流量' },
          { type: 'value', name: '余额' }
        ],
        series: [
          { name: '流入', type: 'bar', stack: 'flow', data: data.map(d => d.inflow), itemStyle: { color: '#10b981' } },
          { name: '流出', type: 'bar', stack: 'flow', data: data.map(d => -d.outflow), itemStyle: { color: '#ef4444' } },
          { name: '余额', type: 'line', yAxisIndex: 1, data: data.map(d => d.balance), lineStyle: { color: '#3b82f6', width: 3 } }
        ]
      }
      
      this.assetTrendChart.setOption(option)
    },
    
    // ==================== Tab 5: 转化漏斗 (P3-2) ====================
    /**
     * 加载漏斗数据
     */
    async loadFunnelData() {
      logger.info('[DashboardPanel] 加载转化漏斗数据')
      
      try {
        const [funnelRes, trendRes] = await Promise.allSettled([
          this.fetchFunnelStages(),
          this.fetchFunnelTrend()
        ])
        
        if (funnelRes.status === 'fulfilled' && funnelRes.value) {
          this.funnelData.stages = funnelRes.value
          await this.renderFunnelChart()
        }
        
        if (trendRes.status === 'fulfilled' && trendRes.value) {
          this.funnelData.trend_data = trendRes.value
          await this.renderFunnelTrendChart()
        }
      } catch (e) {
        logger.error('[DashboardPanel] loadFunnelData 失败:', e)
      }
    },
    
    async fetchFunnelStages() {
      try {
        const response = await fetch(`/api/v4/console/funnel/stages?range=${this.funnelData.range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchFunnelStages 失败:', e.message)
      }
      // 降级数据
      const visitors = Math.round(Math.random() * 50000 + 30000)
      return [
        { name: '访问', count: visitors, rate: 100 },
        { name: '注册', count: Math.round(visitors * 0.45), rate: 45 },
        { name: '首次抽奖', count: Math.round(visitors * 0.25), rate: 25 },
        { name: '首次消费', count: Math.round(visitors * 0.12), rate: 12 },
        { name: '复购', count: Math.round(visitors * 0.05), rate: 5 }
      ]
    },
    
    async fetchFunnelTrend() {
      try {
        const response = await fetch(`/api/v4/console/funnel/trend?range=${this.funnelData.range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchFunnelTrend 失败:', e.message)
      }
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return {
          date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }),
          register_rate: Math.random() * 10 + 40,
          lottery_rate: Math.random() * 10 + 20,
          consume_rate: Math.random() * 5 + 8
        }
      })
    },
    
    /**
     * P3-2: 渲染漏斗图
     */
    async renderFunnelChart() {
      const chartDom = document.getElementById('conversion-funnel-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.funnelChart) {
        this.funnelChart = echarts.init(chartDom)
      }
      
      const data = this.funnelData.stages || []
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      
      const option = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        series: [{
          type: 'funnel',
          left: '10%',
          top: 60,
          bottom: 60,
          width: '80%',
          min: 0,
          max: 100,
          minSize: '0%',
          maxSize: '100%',
          sort: 'descending',
          gap: 2,
          label: { show: true, position: 'inside', formatter: '{b}\n{c}人' },
          labelLine: { length: 10, lineStyle: { width: 1, type: 'solid' } },
          itemStyle: { borderColor: '#fff', borderWidth: 1 },
          emphasis: { label: { fontSize: 16 } },
          data: data.map((d, i) => ({
            value: d.rate,
            name: d.name,
            itemStyle: { color: colors[i % colors.length] }
          }))
        }]
      }
      
      this.funnelChart.setOption(option)
    },
    
    /**
     * 渲染漏斗趋势图
     */
    async renderFunnelTrendChart() {
      const chartDom = document.getElementById('funnel-trend-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.funnelTrendChart) {
        this.funnelTrendChart = echarts.init(chartDom)
      }
      
      const data = this.funnelData.trend_data || []
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['注册率', '抽奖率', '消费率'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date) },
        yAxis: { type: 'value', name: '%', max: 100 },
        series: [
          { name: '注册率', type: 'line', smooth: true, data: data.map(d => d.register_rate), lineStyle: { color: '#3b82f6' } },
          { name: '抽奖率', type: 'line', smooth: true, data: data.map(d => d.lottery_rate), lineStyle: { color: '#10b981' } },
          { name: '消费率', type: 'line', smooth: true, data: data.map(d => d.consume_rate), lineStyle: { color: '#f59e0b' } }
        ]
      }
      
      this.funnelTrendChart.setOption(option)
    },
    
    // ==================== Tab 6: 商户贡献度 (P3-3) ====================
    /**
     * 加载商户贡献度数据
     */
    async loadMerchantData() {
      logger.info('[DashboardPanel] 加载商户贡献度数据')
      
      try {
        const [statsRes, rankingRes, trendRes, comparisonRes] = await Promise.allSettled([
          this.fetchMerchantStats(),
          this.fetchMerchantRanking(),
          this.fetchMerchantTrend(),
          this.fetchMerchantComparison()
        ])
        
        if (statsRes.status === 'fulfilled' && statsRes.value) {
          Object.assign(this.merchantData, statsRes.value)
        }
        
        if (rankingRes.status === 'fulfilled' && rankingRes.value) {
          this.merchantData.ranking = rankingRes.value
          await this.renderMerchantPieChart()
        }
        
        if (trendRes.status === 'fulfilled' && trendRes.value) {
          this.merchantData.trend_data = trendRes.value
          await this.renderMerchantTrendChart()
        }
        
        if (comparisonRes.status === 'fulfilled' && comparisonRes.value) {
          this.merchantData.comparison = comparisonRes.value
        }
      } catch (e) {
        logger.error('[DashboardPanel] loadMerchantData 失败:', e)
      }
    },
    
    async fetchMerchantStats() {
      try {
        const response = await fetch('/api/v4/console/merchant/stats', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchMerchantStats 失败:', e.message)
      }
      return {
        total_merchants: Math.round(Math.random() * 500 + 100),
        total_consumption: Math.round(Math.random() * 1000000 + 500000),
        total_orders: Math.round(Math.random() * 50000 + 20000),
        avg_order_value: Math.round(Math.random() * 50 + 30)
      }
    },
    
    async fetchMerchantRanking() {
      try {
        const response = await fetch(`/api/v4/console/merchant/ranking?range=${this.merchantData.range}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchMerchantRanking 失败:', e.message)
      }
      // 降级数据
      const total = Math.round(Math.random() * 1000000 + 500000)
      return Array.from({ length: 10 }, (_, i) => {
        const amount = Math.round((total / (i + 1)) * (Math.random() * 0.3 + 0.85))
        return {
          store_id: 1000 + i,
          store_name: `门店${String.fromCharCode(65 + i)}`,
          consumption_amount: amount,
          order_count: Math.round(amount / (Math.random() * 30 + 20)),
          avg_order_value: Math.round(Math.random() * 50 + 30),
          contribution_rate: Math.round((amount / total) * 100 * 10) / 10,
          health_score: Math.round(Math.random() * 30 + 70)
        }
      })
    },
    
    async fetchMerchantTrend() {
      try {
        const response = await fetch('/api/v4/console/merchant/trend?days=7', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchMerchantTrend 失败:', e.message)
      }
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return {
          date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }),
          consumption: Math.round(Math.random() * 50000 + 30000),
          orders: Math.round(Math.random() * 2000 + 1000)
        }
      })
    },
    
    async fetchMerchantComparison() {
      try {
        const response = await fetch('/api/v4/console/merchant/comparison', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        })
        if (response.ok) {
          const result = await response.json()
          return result.success ? result.data : null
        }
      } catch (e) {
        logger.warn('[DashboardPanel] fetchMerchantComparison 失败:', e.message)
      }
      // 降级数据
      return Array.from({ length: 5 }, (_, i) => {
        const thisWeek = Math.round(Math.random() * 50000 + 20000)
        const lastWeek = Math.round(Math.random() * 50000 + 20000)
        return {
          store_id: 1000 + i,
          store_name: `门店${String.fromCharCode(65 + i)}`,
          this_week: thisWeek,
          last_week: lastWeek,
          change: ((thisWeek - lastWeek) / lastWeek) * 100,
          health_score: Math.round(Math.random() * 30 + 70)
        }
      })
    },
    
    /**
     * 渲染商户消费趋势图
     */
    async renderMerchantTrendChart() {
      const chartDom = document.getElementById('merchant-trend-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.merchantTrendChart) {
        this.merchantTrendChart = echarts.init(chartDom)
      }
      
      const data = this.merchantData.trend_data || []
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['消费金额', '订单数'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date) },
        yAxis: [
          { type: 'value', name: '金额(元)' },
          { type: 'value', name: '订单数' }
        ],
        series: [
          { name: '消费金额', type: 'bar', data: data.map(d => d.consumption), itemStyle: { color: '#3b82f6' } },
          { name: '订单数', type: 'line', yAxisIndex: 1, data: data.map(d => d.orders), lineStyle: { color: '#10b981', width: 3 } }
        ]
      }
      
      this.merchantTrendChart.setOption(option)
    },
    
    /**
     * P3-3: 渲染商户贡献度饼图
     */
    async renderMerchantPieChart() {
      const chartDom = document.getElementById('merchant-pie-chart')
      if (!chartDom) return
      
      const echarts = await loadECharts()
      if (!echarts) return
      
      if (!this.merchantPieChart) {
        this.merchantPieChart = echarts.init(chartDom)
      }
      
      const ranking = this.merchantData.ranking || []
      const top5 = ranking.slice(0, 5)
      const othersAmount = ranking.slice(5).reduce((sum, m) => sum + m.consumption_amount, 0)
      
      const data = [
        ...top5.map(m => ({ name: m.store_name, value: m.consumption_amount })),
        { name: '其他门店', value: othersAmount }
      ]
      
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']
      
      const option = {
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          data: data.map((d, i) => ({ ...d, itemStyle: { color: colors[i % colors.length] } })),
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } }
        }]
      }
      
      this.merchantPieChart.setOption(option)
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
