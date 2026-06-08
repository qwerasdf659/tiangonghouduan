/**
 * 运营分析页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/analytics/pages/analytics.js
 * @description 运营数据分析页面，提供用户活跃度、抽奖趋势、积分流转、策略分析等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module Analytics
 *
 * @requires Alpine.js
 * @requires ECharts - 图表库
 * @requires createPageMixin - 页面基础混入
 * @requires ANALYTICS_ENDPOINTS - 分析API端点配置
 * @requires LOTTERY_ENDPOINTS - 抽奖API端点配置
 *
 * 功能模块：
 * 1. 今日统计 - 活跃用户、抽奖次数、积分流转等
 * 2. 趋势分析 - 用户趋势图、抽奖趋势图、积分流转图
 * 3. 决策分析 - 中奖决策统计、策略效果分析
 * 4. 等级分布 - 用户等级分布饼图
 * 5. 数据导出 - 导出CSV格式报告
 *
 * 后端API：
 * - GET /api/v4/console/analytics/today-stats (今日统计)
 * - GET /api/v4/console/analytics/decisions (决策分析)
 * - GET /api/v4/console/analytics/lottery-trends (抽奖趋势)
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { ANALYTICS_ENDPOINTS } from '../../../api/analytics.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL, request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

/**
 * 预算分层中文映射（与后端 tier-distribution 返回的 budget_tiers 键对应）
 * @description B0-B3 是后端预算分层监控指标：
 *   B0=预算不足 / B1=低预算 / B2=中预算 / B3=高预算（EffectiveBudget 由低到高）
 */
const BUDGET_TIER_NAME_MAP = {
  B0: 'B0 预算不足',
  B1: 'B1 低预算',
  B2: 'B2 中预算',
  B3: 'B3 高预算'
}

/** 预算分层饼图配色（与 BUDGET_TIER_NAME_MAP 一一对应） */
const BUDGET_TIER_COLOR_MAP = {
  B0: '#6c757d',
  B1: '#0d6efd',
  B2: '#ffc107',
  B3: '#dc3545'
}

/**
 * @typedef {Object} AnalyticsStats
 * @property {number} activeUsers - 活跃用户数
 * @property {number} totalUsers - 总用户数
 * @property {number} lotteryCount - 抽奖次数
 * @property {number} highTierDraws - 高级抽奖次数
 * @property {number} pointsIssued - 积分发放量
 * @property {number} pointsSpent - 积分消耗量
 * @property {number} exchangeOrders - 兑换订单数
 * @property {number} newItems - 新增物品数
 */

/**
 * @typedef {Object} DecisionSummary
 * @property {number} totalDecisions - 总决策数
 * @property {number} winDecisions - 中奖决策数
 * @property {number} loseDecisions - 未中奖决策数
 * @property {number} avgWinRate - 平均中奖率
 * @property {Array} topStrategies - 热门策略列表
 * @property {Array} tierDistribution - 等级分布
 */

/**
 * 创建运营分析页面组件
 *
 * @description 运营分析页面，展示关键业务指标和可视化图表
 * @returns {Object} Alpine.js组件配置对象
 *
 * @example
 * // HTML中使用
 * <div x-data="analyticsPage()">
 *   <span x-text="formatNumber(stats.activeUsers)"></span>
 * </div>
 */
function analyticsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面特有状态 ====================

    /**
     * 筛选条件
     * @type {{time_range: string, start_date: string, end_date: string}}
     */
    filters: {
      time_range: '30',
      start_date: '',
      end_date: '',
      // 档位分布按活动维度统计，需指定活动；空字符串表示尚未加载活动列表
      lottery_campaign_id: ''
    },

    /**
     * 活动列表（供档位分布图的活动选择器使用）
     * @type {Array<{lottery_campaign_id:number, campaign_name:string, status:string}>}
     */
    campaignOptions: [],

    /**
     * 统计数据
     * @type {AnalyticsStats}
     */
    stats: {
      active_users: 0,
      total_users: 0,
      lottery_count: 0,
      high_tier_draws: 0,
      points_issued: 0,
      points_spent: 0,
      exchange_orders: 0,
      new_items: 0,
      // 后端 overview 字段（直接使用后端字段名）
      total_draws: 0,
      points_consumed: 0
    },

    /**
     * 每日明细数据
     * @type {Array<Object>}
     */
    dailyStats: [],

    /**
     * 决策分析摘要
     * @type {DecisionSummary}
     */
    decisionSummary: {
      totalDecisions: 0,
      winDecisions: 0,
      loseDecisions: 0,
      avgWinRate: 0,
      topStrategies: [],
      tierDistribution: []
    },

    /**
     * 预算分层分布数据（后端 budget_tiers 对象 B0-B3）
     * @type {Object}
     */
    tierDistribution: {},

    /**
     * ECharts图表实例集合
     * @type {{userTrend: Object|null, lotteryTrend: Object|null, pointsFlow: Object|null, userSource: Object|null, tierDist: Object|null}}
     */
    charts: {
      userTrend: null,
      lotteryTrend: null,
      pointsFlow: null,
      userSource: null,
      tierDist: null
    },

    /** ECharts 核心模块引用 */
    _echarts: null,

    // ==================== 生命周期 ====================

    /**
     * 组件初始化
     * @async
     * @description 初始化运营分析页面：
     * 1. 检查用户认证
     * 2. 动态加载ECharts库
     * 3. 初始化图表实例
     * 4. 加载所有数据
     * 5. 注册窗口resize监听
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('运营分析页面初始化 (ES Module v3.1)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        this._echarts = await loadECharts()
        logger.info('[Analytics] ECharts 加载完成', { hasEcharts: !!this._echarts })
      } catch (error) {
        logger.error('[Analytics] ECharts 加载失败:', error)
        this.showError('图表组件加载失败，部分功能可能不可用')
      }

      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadAllData()

        // 监听窗口大小变化（命名引用以便清理）
        this._resizeHandler = () => {
          this.resizeCharts()
        }
        window.addEventListener('resize', this._resizeHandler)
      })
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化所有ECharts图表
     * @description 初始化用户趋势图、抽奖趋势图、积分流转图、用户类型分布图
     * @returns {void}
     */
    initCharts() {
      const echarts = this._echarts

      logger.info('[Analytics] 初始化图表', {
        hasEcharts: !!echarts,
        hasUserTrendChart: !!this.$refs.userTrendChart,
        hasLotteryTrendChart: !!this.$refs.lotteryTrendChart,
        hasPointsFlowChart: !!this.$refs.pointsFlowChart,
        hasUserSourceChart: !!this.$refs.userSourceChart,
        hasTierDistChart: !!this.$refs.tierDistChart
      })

      if (!echarts) {
        logger.warn('[Analytics] ECharts 未加载，跳过图表初始化')
        return
      }

      // 用户趋势图
      if (this.$refs.userTrendChart) {
        this.charts.userTrend = echarts.init(this.$refs.userTrendChart)
        this.charts.userTrend.setOption(this.getUserTrendOption([]))
        logger.info('[Analytics] 用户趋势图初始化完成')
      }

      // 抽奖趋势图
      if (this.$refs.lotteryTrendChart) {
        this.charts.lotteryTrend = echarts.init(this.$refs.lotteryTrendChart)
        this.charts.lotteryTrend.setOption(this.getLotteryTrendOption([]))
        logger.info('[Analytics] 抽奖趋势图初始化完成')
      }

      // 积分流转图
      if (this.$refs.pointsFlowChart) {
        this.charts.pointsFlow = echarts.init(this.$refs.pointsFlowChart)
        this.charts.pointsFlow.setOption(this.getPointsFlowOption([]))
        logger.info('[Analytics] 积分流转图初始化完成')
      }

      // 用户类型分布
      if (this.$refs.userSourceChart) {
        this.charts.userSource = echarts.init(this.$refs.userSourceChart)
        this.charts.userSource.setOption(this.getUserSourceOption([]))
        logger.info('[Analytics] 用户类型分布图初始化完成')
      }

      // 预算分层分布（按活动维度）
      if (this.$refs.tierDistChart) {
        this.charts.tierDist = echarts.init(this.$refs.tierDistChart)
        this.charts.tierDist.setOption(this.getTierDistOption([]))
        logger.info('[Analytics] 预算分层分布图初始化完成')
      }
    },

    /**
     * 获取用户趋势图配置
     * @param {Array<Object>} data - 趋势数据数组
     * @returns {Object} ECharts配置对象
     */
    getUserTrendOption(data) {
      const echarts = this._echarts
      const areaStyleColor = echarts
        ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(13, 110, 253, 0.3)' },
            { offset: 1, color: 'rgba(13, 110, 253, 0.05)' }
          ])
        : 'rgba(13, 110, 253, 0.2)'

      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '活跃用户',
            type: 'line',
            smooth: true,
            areaStyle: { color: areaStyleColor },
            lineStyle: { color: '#0d6efd', width: 2 },
            itemStyle: { color: '#0d6efd' },
            data: data.map(d => d.active_users || d.count || 0)
          }
        ]
      }
    },

    /**
     * 获取抽奖趋势图配置
     * @param {Array<Object>} data - 抽奖趋势数据
     * @returns {Object} ECharts配置对象
     */
    getLotteryTrendOption(data) {
      const echarts = this._echarts
      const barColor = echarts
        ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#198754' },
            { offset: 1, color: 'rgba(25, 135, 84, 0.6)' }
          ])
        : '#198754'

      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { show: false },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '回馈次数',
            type: 'bar',
            barWidth: '60%',
            itemStyle: { color: barColor },
            data: data.map(d => d.draws || d.total_draws || 0)
          }
        ]
      }
    },

    /**
     * 获取积分流转图配置
     * @param {Array<Object>} data - 积分流转数据
     * @returns {Object} ECharts配置对象
     */
    getPointsFlowOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['积分发放', '积分消耗'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: data.map(d => d.date || d.time) },
        yAxis: { type: 'value', min: 0 },
        series: [
          {
            name: '积分发放',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#ffc107', width: 2 },
            itemStyle: { color: '#ffc107' },
            data: data.map(d => d.earned || d.issued || 0)
          },
          {
            name: '积分消耗',
            type: 'line',
            smooth: true,
            lineStyle: { color: '#dc3545', width: 2 },
            itemStyle: { color: '#dc3545' },
            data: data.map(d => d.spent || d.consumed || 0)
          }
        ]
      }
    },

    /**
     * 获取用户类型分布配置
     * @param {Array<Object>} data - 用户类型分布数据
     * @returns {Object} ECharts饼图配置对象
     */
    getUserSourceOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, data: data.map(d => d.name) },
        series: [
          {
            name: '用户类型',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}\n{c} ({d}%)',
              fontSize: 12,
              color: '#333'
            },
            labelLine: {
              show: true,
              length: 10,
              length2: 15
            },
            emphasis: {
              label: { show: true, fontSize: 14, fontWeight: 'bold' }
            },
            data: data
          }
        ]
      }
    },

    /**
     * 获取预算分层分布饼图配置（按活动维度的 B0-B3 预算分层分布）
     * @param {Array<{name:string, value:number, code:string}>} data - 预算分层分布数据
     * @returns {Object} ECharts饼图配置对象
     */
    getTierDistOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, data: data.map(d => d.name) },
        series: [
          {
            name: '预算分层',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}\n{c} ({d}%)',
              fontSize: 12,
              color: '#333'
            },
            labelLine: { show: true, length: 10, length2: 15 },
            emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
            data
          }
        ]
      }
    },

    /**
     * 调整所有图表大小
     * @description 响应窗口resize事件，重新调整图表尺寸
     * @returns {void}
     */
    resizeCharts() {
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.resize()
      })
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有分析数据
     * @async
     * @description 并行加载今日统计、决策分析、图表统计、档位分布数据
     * @returns {Promise<void>}
     */
    async loadAllData() {
      await this.withLoading(async () => {
        // 活动列表只需加载一次，用于档位分布的活动选择器
        if (this.campaignOptions.length === 0) {
          await this.loadCampaignOptions()
        }
        await Promise.all([
          this.loadTodayStats(),
          this.loadDecisionAnalytics(),
          this.loadTierDistribution(),
          this.loadChartsData()
        ])
      })
    },

    /**
     * 加载活动列表（用于档位分布图的活动选择器）
     * @async
     * @description 调用 /console/lottery-campaigns 获取活动列表，默认选中第一个有效活动
     * @returns {Promise<void>}
     */
    async loadCampaignOptions() {
      try {
        const response = await apiRequest(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}?status=active&page_size=100`
        )
        if (response && response.success) {
          this.campaignOptions = response.data?.campaigns || []
          // 默认选中第一个活动（若用户尚未手动选择）
          if (!this.filters.lottery_campaign_id && this.campaignOptions.length > 0) {
            this.filters.lottery_campaign_id = this.campaignOptions[0].lottery_campaign_id
          }
          logger.info('[Analytics] 活动列表加载完成', { count: this.campaignOptions.length })
        }
      } catch (error) {
        logger.error('加载活动列表失败:', error)
      }
    },

    /**
     * 加载图表统计数据（积分流转、用户类型分布）
     * @async
     * @description 调用后端 /system/statistics/charts 获取真实的积分流水与用户类型分布，
     *              替代原先用抽奖数据估算积分、用 peak_users 比例估算用户分布的做法。
     * @returns {Promise<void>}
     */
    async loadChartsData() {
      try {
        const days = parseInt(this.filters.time_range, 10) || 30
        const response = await apiRequest(`${ANALYTICS_ENDPOINTS.CHARTS}?days=${days}`)

        if (response && response.success) {
          const data = response.data
          logger.info('[Analytics] CHARTS 数据:', data)
          this.renderPointsFlowChart(data.points_flow || [])
          this.renderUserSourceChart(data.user_types || {})
        }
      } catch (error) {
        logger.error('加载图表统计数据失败:', error)
      }
    },

    /**
     * 渲染积分流转图（真实后端 points_flow 数据）
     * @param {Array<Object>} pointsFlow - [{date, earned, spent, balance_change}]
     * @returns {void}
     */
    renderPointsFlowChart(pointsFlow) {
      if (!this.charts.pointsFlow || pointsFlow.length === 0) return
      const dates = pointsFlow.map(item => item.date)
      const earned = pointsFlow.map(item => item.earned || 0)
      const spent = pointsFlow.map(item => item.spent || 0)
      this.charts.pointsFlow.setOption({
        xAxis: { data: dates },
        series: [{ data: earned }, { data: spent }]
      })
    },

    /**
     * 渲染用户类型分布图（真实后端 user_types 数据）
     * @param {Object} userTypes - {regular:{count}, admin:{count}, merchant:{count}, total}
     * @returns {void}
     */
    renderUserSourceChart(userTypes) {
      if (!this.charts.userSource || !userTypes) return
      const data = [
        { value: userTypes.regular?.count || 0, name: '普通用户', itemStyle: { color: '#0d6efd' } },
        { value: userTypes.admin?.count || 0, name: '管理员', itemStyle: { color: '#198754' } },
        { value: userTypes.merchant?.count || 0, name: '商家', itemStyle: { color: '#ffc107' } }
      ].filter(item => item.value > 0)
      this.charts.userSource.setOption({ series: [{ data }] })
    },

    /**
     * 加载今日统计数据
     * @async
     * @description 从API获取今日用户、抽奖、积分等统计数据
     * @returns {Promise<void>}
     */
    async loadTodayStats() {
      try {
        const response = await apiRequest(ANALYTICS_ENDPOINTS.TODAY_STATS)

        if (response && response.success) {
          const data = response.data
          logger.info('[Analytics] TODAY_STATS 数据:', data)

          this.stats.active_users = data.user_stats?.active_users_today || 0
          this.stats.total_users = data.user_stats?.total_users || 0
          this.stats.lottery_count = data.lottery_stats?.draws_today || 0
          this.stats.high_tier_draws = data.lottery_stats?.high_tier_draws_today || 0
          this.stats.points_issued = data.points_stats?.points_earned_today || 0
          this.stats.points_spent = data.points_stats?.points_spent_today || 0
          this.stats.exchange_orders = data.inventory_stats?.used_items_today || 0
          this.stats.new_items = data.inventory_stats?.new_items_today || 0

          // 注意：这里先设置今日数据，loadDecisionAnalytics 会用总数据覆盖
          this.stats.points_consumed = this.stats.points_spent
        }
      } catch (error) {
        logger.error('加载今日统计数据失败:', error)
      }
    },

    /**
     * 加载决策分析数据
     * @async
     * @description 获取抽奖决策统计、趋势数据并更新图表
     * @returns {Promise<void>}
     */
    async loadDecisionAnalytics() {
      const days = this.filters.time_range

      try {
        // 构建查询参数（支持自定义日期范围）
        let queryParams = `days=${days}`
        if (this.filters.start_date && this.filters.end_date) {
          queryParams += `&start_time=${this.filters.start_date}&end_time=${this.filters.end_date}`
          logger.info('[Analytics] 使用自定义日期范围', {
            start: this.filters.start_date,
            end: this.filters.end_date
          })
        }

        const response = await apiRequest(`${ANALYTICS_ENDPOINTS.DECISIONS}?${queryParams}`)

        if (response && response.success) {
          const data = response.data
          logger.info('[Analytics] DECISIONS 数据:', data)

          this.dailyStats = data.trends?.daily_stats || data.daily_stats || []

          // 处理决策分析摘要 - 使用 overview 字段（后端实际返回的结构）
          const overview = data.overview || {}
          this.decisionSummary = {
            totalDecisions: overview.total_draws || data.summary?.total_decisions || 0,
            winDecisions: overview.high_tier_draws || data.summary?.win_decisions || 0,
            loseDecisions: (overview.total_draws || 0) - (overview.high_tier_draws || 0),
            avgWinRate: overview.high_tier_rate || data.summary?.avg_win_rate || 0,
            topStrategies: data.users?.top_users || data.top_strategies || [],
            tierDistribution: data.tier_distribution || []
          }

          // 更新统计卡片数据 - 直接使用后端字段名
          this.stats.total_draws = overview.total_draws || 0
          this.stats.high_tier_draws = overview.high_tier_draws || 0

          logger.info('[Analytics] 更新统计卡片:', {
            total_draws: this.stats.total_draws,
            high_tier_draws: this.stats.high_tier_draws,
            active_users: this.stats.active_users,
            points_consumed: this.stats.points_consumed
          })

          // 更新图表
          this.updateChartsWithData(data)

          // 加载更多趋势数据
          await this.loadLotteryTrends(days)
        }
      } catch (error) {
        logger.error('加载决策分析数据失败:', error)
      }
    },

    /**
     * 加载预算分层分布数据（按选中的活动维度）
     * @async
     * @description 调用 /console/lottery-strategy-stats/tier-distribution/:lottery_campaign_id，
     *              将后端 budget_tiers(B0-B3) 预算分层转中文后渲染到独立的「预算分层分布」饼图。
     *              注意：此前误把分布写进「用户类型分布」容器、且写死活动ID=1，已修正。
     * @returns {Promise<void>}
     */
    async loadTierDistribution() {
      const campaignId = this.filters.lottery_campaign_id
      // 没有可用活动时，清空分布图，不再静默走活动1
      if (!campaignId) {
        logger.warn('[Analytics] 暂无可用活动，跳过预算分层分布加载')
        this.tierDistribution = {}
        if (this.charts.tierDist) {
          this.charts.tierDist.setOption(this.getTierDistOption([]), true)
        }
        return
      }

      try {
        let url = buildURL(LOTTERY_ENDPOINTS.STRATEGY_STATS_TIER, { campaign_id: campaignId })
        if (this.filters.start_date && this.filters.end_date) {
          url += `?start_time=${this.filters.start_date}&end_time=${this.filters.end_date}`
        }

        const response = await apiRequest(url)

        if (response && response.success) {
          // 后端返回 { budget_tiers: { B0:{count,percentage}, B1:..., B2:..., B3:... }, total }
          this.tierDistribution = response.data?.budget_tiers || {}
          this.renderTierDistChart(this.tierDistribution)
        }
      } catch (error) {
        logger.error('加载预算分层分布失败:', error)
      }
    },

    /**
     * 渲染预算分层分布饼图（后端真实 budget_tiers 数据，分层码转中文）
     * @param {Object} budgetTiers - {B0:{count,percentage}, B1:..., B2:..., B3:...}
     * @returns {void}
     */
    renderTierDistChart(budgetTiers) {
      if (!this.charts.tierDist) return
      const data = Object.entries(budgetTiers || {})
        .map(([tier, stat]) => ({
          value: stat?.count || 0,
          name: BUDGET_TIER_NAME_MAP[tier] || tier,
          code: tier,
          itemStyle: { color: BUDGET_TIER_COLOR_MAP[tier] || '#909399' }
        }))
        .filter(item => item.value > 0)
      this.charts.tierDist.setOption(this.getTierDistOption(data), true)
    },

    /**
     * 活动选择器变更处理
     * @description 切换活动后仅重新加载该活动的预算分层分布，避免整页刷新
     * @returns {Promise<void>}
     */
    async onCampaignChange() {
      logger.info('[Analytics] 切换活动', { lottery_campaign_id: this.filters.lottery_campaign_id })
      await this.loadTierDistribution()
    },

    /**
     * 使用数据更新图表
     * @param {Object} data - 决策分析数据
     * @description 更新抽奖趋势图和用户趋势图
     * @returns {void}
     */
    updateChartsWithData(_data) {
      const dates = this.dailyStats.map(item => item.date)
      const draws = this.dailyStats.map(item => item.draws)

      // 抽奖趋势图先用决策分析的每日数据填充，随后 loadLotteryTrends 会用趋势接口数据覆盖
      if (this.charts.lotteryTrend) {
        this.charts.lotteryTrend.setOption({
          xAxis: { data: dates },
          series: [{ data: draws }]
        })
      }
      // 用户趋势图统一由 loadLotteryTrends() 使用后端 user_activity.active_users 真实数据渲染
    },

    /**
     * 加载抽奖趋势数据
     * @async
     * @param {number} days - 天数范围
     * @description 根据天数范围加载相应周期的趋势数据并更新所有图表
     * @returns {Promise<void>}
     */
    async loadLotteryTrends(days) {
      try {
        let period = 'week'
        if (days >= 30) period = 'month'
        if (days >= 90) period = 'quarter'

        // 构建查询参数（支持自定义日期范围）
        let queryParams = `period=${period}&granularity=daily`
        if (this.filters.start_date && this.filters.end_date) {
          queryParams += `&start_time=${this.filters.start_date}&end_time=${this.filters.end_date}`
        }

        const response = await apiRequest(`${ANALYTICS_ENDPOINTS.LOTTERY_TRENDS}?${queryParams}`)

        if (response && response.success) {
          const data = response.data
          logger.info('[Analytics] LOTTERY_TRENDS 数据:', data)

          // 更新用户活跃趋势图
          if (data.user_activity && data.user_activity.length > 0 && this.charts.userTrend) {
            const userDates = data.user_activity.map(item => item.period)
            const activeUsers = data.user_activity.map(item => item.active_users)
            logger.info('[Analytics] 更新用户趋势图:', { dates: userDates, users: activeUsers })
            this.charts.userTrend.setOption({
              xAxis: { data: userDates },
              series: [{ data: activeUsers }]
            })
          } else {
            logger.warn('[Analytics] 用户活跃趋势数据为空或图表未初始化')
          }

          // 更新抽奖趋势
          if (
            data.lottery_activity &&
            data.lottery_activity.length > 0 &&
            this.charts.lotteryTrend
          ) {
            const lotteryDates = data.lottery_activity.map(item => item.period)
            const totalDraws = data.lottery_activity.map(item => item.total_draws)
            logger.info('[Analytics] 更新抽奖趋势图:', { dates: lotteryDates, draws: totalDraws })
            this.charts.lotteryTrend.setOption({
              xAxis: { data: lotteryDates },
              series: [{ data: totalDraws }]
            })
          } else {
            logger.warn('[Analytics] 抽奖趋势数据为空或图表未初始化')
          }

          // 积分流转图与用户类型分布改由 loadChartsData() 使用后端真实数据渲染
          // （此前用抽奖数据估算积分、用 peak_users 比例估算用户分布，已移除避免造假）
        }
      } catch (error) {
        logger.error('加载抽奖趋势数据失败:', error)
      }
    },

    // ==================== 事件处理 ====================

    /**
     * 设置日期范围
     * @param {string} range - 日期范围 ('today'|'week'|'month')
     * @description 设置预设的日期范围并重新加载数据
     * @returns {void}
     */
    setDateRange(range) {
      const rangeMapping = {
        today: '1',
        week: '7',
        month: '30'
      }
      this.filters.time_range = rangeMapping[range] || '30'
      logger.info('[Analytics] 设置日期范围', { range, time_range: this.filters.time_range })
      this.loadAllData()
    },

    /**
     * 处理时间范围变更
     * @description 当用户选择新的时间范围时重新加载数据
     * @returns {void}
     */
    handleTimeRangeChange() {
      if (this.filters.time_range !== 'custom') {
        this.loadAllData()
      }
    },

    /**
     * 导出运营分析报告
     * @description 将运营数据导出为CSV格式文件，支持中文Excel打开
     * @returns {void}
     */
    exportReport() {
      try {
        // 构建导出数据
        const exportData = []

        // 添加汇总统计行
        exportData.push(['====== 运营数据汇总 ======'])
        exportData.push(['指标', '数值'])
        exportData.push(['活跃用户数', this.stats.active_users || 0])
        exportData.push(['总用户数', this.stats.total_users || 0])
        exportData.push(['回馈次数', this.stats.lottery_count || 0])
        exportData.push(['高级回馈次数', this.stats.high_tier_draws || 0])
        exportData.push(['积分发放', this.stats.points_issued || 0])
        exportData.push(['积分消耗', this.stats.points_spent || 0])
        exportData.push(['兑换订单数', this.stats.exchange_orders || 0])
        exportData.push(['新增物品数', this.stats.new_items || 0])
        exportData.push([''])

        // 如果有每日明细数据，也导出
        if (this.dailyStats && this.dailyStats.length > 0) {
          exportData.push(['====== 每日明细数据 ======'])
          exportData.push(['日期', '活跃用户', '回馈次数', '积分发放', '积分消耗'])
          this.dailyStats.forEach(day => {
            exportData.push([
              day.date || day.time || '-',
              day.active_users || day.activeUsers || 0,
              day.lottery_count || day.lotteryCount || 0,
              day.points_issued || day.pointsIssued || 0,
              day.points_spent || day.pointsSpent || 0
            ])
          })
        }

        // 生成CSV内容
        const csvContent = exportData.map(row => row.join(',')).join('\n')

        // 添加BOM以支持中文Excel打开
        const BOM = '\uFEFF'
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

        // 生成下载链接
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        const now = new Date()
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

        link.setAttribute('href', url)
        link.setAttribute('download', `运营分析报告_${dateStr}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        this.showSuccess('导出成功')
      } catch (error) {
        logger.error('导出失败:', error)
        this.showError('导出失败: ' + error.message)
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化数字为千分位
     * @param {number|null|undefined} num - 数字
     * @returns {string} 格式化后的字符串
     */
    formatNumber(num) {
      if (num === undefined || num === null) return '-'
      return num.toLocaleString()
    },

    /**
     * 组件销毁时清理资源
     */
    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler)
      }
      // 销毁 ECharts 实例（图表实例统一存放在 this.charts 中）
      Object.values(this.charts).forEach(chart => {
        if (chart) chart.dispose()
      })
      logger.info('[Analytics] 资源已清理')
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('analyticsPage', analyticsPage)
  logger.info('[AnalyticsPage] Alpine 组件已注册 (Mixin v3.0)')
})
