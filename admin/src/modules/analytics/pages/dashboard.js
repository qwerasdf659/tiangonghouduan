/**
 * @fileoverview 仪表盘页面 - Alpine.js Mixin 重构版
 * @module modules/analytics/pages/dashboard
 * @description 系统仪表盘，展示关键统计数据和趋势图表，包括：
 * - 用户统计（总用户数、今日新增）
 * - 抽奖统计（抽奖次数、中奖次数、中奖率）
 * - 积分统计（今日消耗积分）
 * - 客服统计（会话数、消息数）
 * - 抽奖趋势图表（ECharts折线图）
 * - 今日数据分布图表（ECharts饼图）
 *
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 *
 * @requires ../../../api/index - API模块入口
 * @requires ../../../alpine/mixins/index - createPageMixin
 * @requires ../../../utils/logger - 统一日志工具
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { SYSTEM_ENDPOINTS } from '../../../api/index.js'
import { http } from '../../../api/base.js'

/**
 * @typedef {Object} DashboardStats
 * @property {number} totalUsers - 总用户数
 * @property {number} todayNewUsers - 今日新增用户数
 * @property {number} todayDraws - 今日抽奖次数
 * @property {number} todayWins - 今日中奖次数
 * @property {number} winRate - 中奖率（百分比）
 * @property {number} pointsConsumed - 今日消耗积分
 * @property {number} sessions - 今日客服会话数
 * @property {number} messages - 今日客服消息数
 */

/**
 * @typedef {Object} DashboardApiResponse
 * @property {boolean} success - 请求是否成功
 * @property {Object} data - 响应数据
 * @property {Object} data.overview - 概览数据
 * @property {number} data.overview.total_users - 总用户数
 * @property {Object} data.today - 今日数据
 * @property {number} data.today.new_users - 今日新增用户
 * @property {number} data.today.lottery_draws - 今日抽奖次数
 * @property {number} data.today.high_tier_wins - 今日高级中奖次数
 * @property {number} data.today.high_tier_rate - 高级中奖率
 * @property {number} data.today.points_consumed - 今日消耗积分
 * @property {Object} data.customer_service - 客服数据
 * @property {number} data.customer_service.today_sessions - 今日会话数
 * @property {number} data.customer_service.today_messages - 今日消息数
 */

/**
 * 创建仪表盘页面组件
 *
 * @description 系统仪表盘页面，展示关键业务指标和数据可视化图表。
 * 包含自动刷新机制（每分钟刷新一次），支持响应式图表resize。
 *
 * @returns {Object} Alpine.js组件配置对象
 *
 * @property {number|null} refreshInterval - 自动刷新定时器ID
 * @property {DashboardStats} stats - 统计数据对象
 * @property {Object|null} trendChart - ECharts趋势图实例
 * @property {Object|null} distributionChart - ECharts分布饼图实例
 *
 * @method init - 初始化页面，加载数据和图表
 * @method formatNumber - 格式化数字显示
 * @method logout - 退出登录
 * @method initCharts - 初始化ECharts图表
 * @method loadDashboardData - 加载仪表盘统计数据
 * @method loadTrendData - 加载趋势图表数据
 *
 * @example
 * // 在HTML中使用
 * <div x-data="dashboardPage()">
 *   <span x-text="formatNumber(stats.totalUsers)"></span>
 * </div>
 */
function dashboardPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面特有状态 ====================

    /**
     * 自动刷新定时器ID
     * @type {number|null}
     */
    refreshInterval: null,

    /**
     * 统计数据对象
     * @type {DashboardStats}
     */
    stats: {
      total_users: 0,
      today_new_users: 0,
      today_draws: 0,
      today_wins: 0,
      win_rate: 0,
      points_consumed: 0,
      sessions: 0,
      messages: 0
    },

    /**
     * ECharts趋势图实例
     * @type {Object|null}
     */
    trendChart: null,

    /**
     * ECharts分布饼图实例
     * @type {Object|null}
     */
    distributionChart: null,

    /** ECharts 核心模块引用 */
    _echarts: null,

    // ==================== 生命周期 ====================

    /**
     * 初始化仪表盘页面
     *
     * @async
     * @description 执行以下初始化流程：
     * 1. 检查用户认证状态
     * 2. 动态加载ECharts库（懒加载优化）
     * 3. 初始化图表实例
     * 4. 加载仪表盘数据和趋势数据
     * 5. 设置自动刷新定时器（每60秒）
     * 6. 注册窗口resize事件监听器
     *
     * @returns {Promise<void>}
     *
     * @fires checkAuth - 调用Mixin的认证检查
     * @fires loadDashboardData - 加载仪表盘数据
     * @fires loadTrendData - 加载趋势数据
     */
    async init() {
      logger.info('✅ 仪表盘页面初始化 (ES Module v3.1)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        this._echarts = await loadECharts()
        logger.info('[Dashboard] ECharts 加载完成', { hasEcharts: !!this._echarts })
      } catch (error) {
        logger.error('[Dashboard] ECharts 加载失败:', error)
        this.showError('图表组件加载失败，部分功能可能不可用')
      }

      // 初始化图表
      this.$nextTick(() => {
        this.initCharts()
        this.loadDashboardData()
        this.loadTrendData()

        // 每分钟刷新一次数据
        this.refreshInterval = setInterval(() => {
          this.loadDashboardData()
          this.loadTrendData()
        }, 60000)
      })

      // 监听窗口大小变化
      window.addEventListener('resize', () => {
        this.trendChart?.resize()
        this.distributionChart?.resize()
      })
    },

    // ==================== 辅助方法 ====================

    /**
     * 格式化数字为千分位显示
     *
     * @param {number|string|null|undefined} num - 要格式化的数字
     * @returns {string} 格式化后的字符串，无效输入返回'-'
     *
     * @example
     * formatNumber(12345)      // '12,345'
     * formatNumber('1000000')  // '1,000,000'
     * formatNumber(null)       // '-'
     * formatNumber(undefined)  // '-'
     * formatNumber('-')        // '-'
     */
    formatNumber(num) {
      if (num === null || num === undefined || num === '-') return '-'
      return Number(num).toLocaleString()
    },

    /**
     * 退出登录
     *
     * @description 执行登出操作：
     * 1. 清除自动刷新定时器
     * 2. 移除本地存储的认证信息
     * 3. 重定向到登录页面
     *
     * @returns {void}
     */
    logout() {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval)
      }
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },

    // ==================== ECharts 初始化 ====================

    /**
     * 初始化ECharts图表
     *
     * @description 初始化两个图表：
     * 1. 抽奖趋势折线图（trendChart）- 展示抽奖次数和中奖次数的7天趋势
     * 2. 今日数据分布饼图（distributionChart）- 展示今日抽奖、中奖、积分消耗占比
     *
     * @returns {void}
     *
     * @requires echarts - 全局ECharts库需已加载
     */
    initCharts() {
      const echarts = this._echarts

      logger.info('[Dashboard] 初始化图表', { hasEcharts: !!echarts })

      if (!echarts) {
        logger.warn('[Dashboard] ECharts 未加载，跳过图表初始化')
        return
      }

      // 抽奖趋势图
      const trendContainer = this.$refs.trendChart || document.getElementById('lotteryTrendChart')
      if (trendContainer) {
        this.trendChart = echarts.init(trendContainer)
        this.trendChart.setOption({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
          },
          legend: {
            data: ['抽奖次数', '中奖次数'],
            bottom: 0
          },
          grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: []
          },
          yAxis: {
            type: 'value',
            min: 0
          },
          series: [
            {
              name: '抽奖次数',
              type: 'line',
              smooth: true,
              areaStyle: {
                color: echarts.graphic
                  ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: 'rgba(13, 110, 253, 0.3)' },
                      { offset: 1, color: 'rgba(13, 110, 253, 0.05)' }
                    ])
                  : 'rgba(13, 110, 253, 0.2)'
              },
              lineStyle: { color: '#0d6efd', width: 2 },
              itemStyle: { color: '#0d6efd' },
              data: []
            },
            {
              name: '中奖次数',
              type: 'line',
              smooth: true,
              areaStyle: {
                color: echarts.graphic
                  ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                      { offset: 0, color: 'rgba(25, 135, 84, 0.3)' },
                      { offset: 1, color: 'rgba(25, 135, 84, 0.05)' }
                    ])
                  : 'rgba(25, 135, 84, 0.2)'
              },
              lineStyle: { color: '#198754', width: 2 },
              itemStyle: { color: '#198754' },
              data: []
            }
          ]
        })
        logger.info('[Dashboard] 趋势图初始化完成')
      }

      // 今日数据分布饼图
      const distContainer =
        this.$refs.distributionChart || document.getElementById('todayDistributionChart')
      if (distContainer) {
        this.distributionChart = echarts.init(distContainer)
        this.distributionChart.setOption({
          tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)'
          },
          legend: {
            orient: 'horizontal',
            bottom: 0,
            data: ['抽奖', '中奖', '积分消耗']
          },
          series: [
            {
              name: '今日数据',
              type: 'pie',
              radius: ['35%', '65%'],
              avoidLabelOverlap: false,
              label: { show: false, position: 'center' },
              emphasis: {
                label: { show: true, fontSize: 14, fontWeight: 'bold' }
              },
              labelLine: { show: false },
              data: [
                { value: 0, name: '抽奖', itemStyle: { color: '#0d6efd' } },
                { value: 0, name: '中奖', itemStyle: { color: '#198754' } },
                { value: 0, name: '积分消耗', itemStyle: { color: '#ffc107' } }
              ]
            }
          ]
        })
        logger.info('[Dashboard] 分布饼图初始化完成')
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载仪表盘统计数据
     *
     * @async
     * @description 从后端API获取仪表盘数据，包括：
     * - 用户概览数据（总用户数）
     * - 今日统计数据（新增用户、抽奖次数、中奖次数、消耗积分）
     * - 客服数据（会话数、消息数）
     *
     * 数据加载成功后会自动更新stats状态和分布饼图。
     *
     * @returns {Promise<void>}
     *
     * @throws {Error} 当API请求失败时抛出错误
     *
     * @example
     * // 手动刷新数据
     * await this.loadDashboardData()
     */
    async loadDashboardData() {
      const result = await this.withLoading(async () => {
        const response = await http.get(SYSTEM_ENDPOINTS.DASHBOARD)

        if (response?.success && response.data) {
          return response.data
        }
        throw new Error(response?.message || '获取仪表盘数据失败')
      })

      if (result.success && result.data) {
        const data = result.data

        // 适配后端V4数据结构 - 总用户数据
        if (data.overview) {
          this.stats.total_users = data.overview.total_users || 0
        }

        // 适配后端V4.0数据结构 - 今日数据
        if (data.today) {
          this.stats.today_new_users = data.today.new_users || 0
          this.stats.today_draws = data.today.lottery_draws || 0
          this.stats.today_wins = data.today.high_tier_wins || data.today.wins || 0
          this.stats.win_rate = data.today.high_tier_rate || data.today.win_rate || 0
          this.stats.points_consumed = data.today.points_consumed || 0

          // 更新今日分布饼图
          if (this.distributionChart) {
            this.distributionChart.setOption({
              series: [
                {
                  data: [
                    {
                      value: data.today.lottery_draws || 0,
                      name: '抽奖',
                      itemStyle: { color: '#0d6efd' }
                    },
                    {
                      value: data.today.high_tier_wins || data.today.wins || 0,
                      name: '中奖',
                      itemStyle: { color: '#198754' }
                    },
                    {
                      value: Math.floor((data.today.points_consumed || 0) / 10),
                      name: '积分消耗',
                      itemStyle: { color: '#ffc107' }
                    }
                  ]
                }
              ]
            })
          }
        }

        // 适配后端V4数据结构 - 客服会话数据
        if (data.customer_service) {
          this.stats.sessions = data.customer_service.today_sessions || 0
          this.stats.messages = data.customer_service.today_messages || 0
        }

        logger.info('仪表盘数据加载成功', data)
      } else {
        logger.warn('仪表盘数据加载失败或为空')
      }
    },

    /**
     * 加载趋势图表数据
     *
     * @async
     * @description 从后端API获取最近7天的抽奖趋势数据，
     * 包括每日抽奖次数和高级中奖次数，用于更新趋势折线图。
     *
     * @returns {Promise<void>}
     *
     * @example
     * // 刷新趋势图表
     * await this.loadTrendData()
     */
    async loadTrendData() {
      try {
        const response = await http.get(SYSTEM_ENDPOINTS.DASHBOARD_TRENDS, { days: 7 })

        if (response?.success && response.data) {
          const dailyStats = response.data.trends?.daily_stats || []

          if (dailyStats.length > 0 && this.trendChart) {
            const dates = dailyStats.map(item => item.date)
            const draws = dailyStats.map(item => item.draws || 0)
            const wins = dailyStats.map(item => item.high_tier_wins || 0)

            this.trendChart.setOption({
              xAxis: { data: dates },
              series: [{ data: draws }, { data: wins }]
            })

            logger.info('趋势数据加载成功')
          }
        }
      } catch (error) {
        logger.error('加载趋势数据失败', error)
      }
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('dashboardPage', dashboardPage)
  logger.debug('[DashboardPage] Alpine 组件已注册 (Mixin v3.0)')
})
