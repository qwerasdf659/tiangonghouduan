/**
 * 抽奖告警中心页面 - Alpine.js Mixin 版本
 *
 * @file admin/src/modules/lottery/pages/lottery-alerts.js
 * @module LotteryAlertsPage
 * @version 1.0.0
 * @date 2026-01-30
 *
 * @description
 * 抽奖告警监控页面，提供以下功能：
 * - 实时告警列表展示和筛选（按级别/类型/状态/活动）
 * - 告警详情查看和处理（确认/解决）
 * - 批量处理告警
 * - 统计分析和可视化图表（级别分布/类型分布）
 * - 自动刷新机制（60秒间隔）
 *
 * @requires createPageMixin - 页面基础混入
 * @requires ECharts - 图表库（延迟加载）
 * @requires LOTTERY_ENDPOINTS - 抽奖API端点配置
 * @requires apiRequest - API请求函数
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { LOTTERY_ADVANCED_ENDPOINTS } from '../../../api/lottery/advanced.js'
import { LOTTERY_CORE_ENDPOINTS } from '../../../api/lottery/core.js'
import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

/** 获取认证Token */
const getToken = () => localStorage.getItem('admin_token')

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

/**
 * 抽奖告警页面Alpine.js组件工厂函数
 * @function lotteryAlertsPage
 * @returns {Object} Alpine.js组件配置对象
 */
function lotteryAlertsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({ pagination: { page_size: 20 } }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 表单提交状态 */
    submitting: false,

    /** @type {Array} 告警列表 */
    alerts: [],

    /** @type {Object|null} 当前选中的告警 */
    selectedAlert: null,

    /** @type {number[]} 批量选择的告警ID列表 */
    selectedAlerts: [],

    /** @type {number} 当前页码 */
    current_page: 1,

    /** @type {number} 每页条数 */
    page_size: 20,

    /** @type {number} 总条数 */
    totalCount: 0,

    /** @type {number} 总页数 */
    total_pages: 0,

    /** @type {boolean} 是否开启自动刷新 */
    autoRefresh: true,

    /** @type {number|null} 自动刷新定时器ID */
    refreshTimer: null,

    /** @type {Array} 活动列表（用于筛选） */
    campaigns: [],

    /**
     * 告警统计数据
     */
    stats: {
      danger: 0,
      warning: 0,
      info: 0,
      acknowledged: 0,
      resolved: 0
    },

    /**
     * 筛选条件
     */
    filters: {
      level: '',
      type: '',
      status: '',
      campaign_id: ''
    },

    /**
     * 解决告警表单
     */
    resolveForm: {
      alert_id: '',
      resolve_notes: ''
    },

    /** @type {Object|null} ECharts级别分布图实例 */
    severityDistChart: null,

    /** @type {Object|null} ECharts类型分布图实例 */
    typeDistChart: null,

    /** ECharts 核心模块引用 */
    _echarts: null,

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[LotteryAlerts] 抽奖告警中心页面初始化')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts
      try {
        this._echarts = await loadECharts()
        logger.info('[LotteryAlerts] ECharts 加载完成')
      } catch (error) {
        logger.error('[LotteryAlerts] ECharts 加载失败:', error)
        this.showError('图表组件加载失败，部分功能可能不可用')
      }

      // 初始化 ECharts
      this.initCharts()

      // 加载活动列表（用于筛选）
      await this.loadCampaigns()

      // 加载告警
      await this.loadAlerts()

      // 自动刷新（60秒）
      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
      }

      // 窗口大小改变时重绘图表
      window.addEventListener('resize', () => {
        if (this.severityDistChart) this.severityDistChart.resize()
        if (this.typeDistChart) this.typeDistChart.resize()
      })
    },

    /**
     * 组件销毁时清理资源
     */
    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
      }
      if (this.severityDistChart) {
        this.severityDistChart.dispose()
      }
      if (this.typeDistChart) {
        this.typeDistChart.dispose()
      }
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化ECharts图表实例
     */
    initCharts() {
      this.$nextTick(() => {
        const echarts = this._echarts

        logger.info('[LotteryAlerts] 初始化图表', { hasEcharts: !!echarts })

        if (!echarts) {
          logger.warn('[LotteryAlerts] ECharts 未加载，跳过图表初始化')
          return
        }

        const severityContainer = document.getElementById('severityDistChart')
        const typeContainer = document.getElementById('typeDistChart')

        if (severityContainer) {
          this.severityDistChart = echarts.init(severityContainer)
          this.severityDistChart.setOption(this.getSeverityChartOption([]))
          logger.info('[LotteryAlerts] 级别分布图初始化完成')
        }

        if (typeContainer) {
          this.typeDistChart = echarts.init(typeContainer)
          this.typeDistChart.setOption(this.getTypeChartOption([], []))
          logger.info('[LotteryAlerts] 类型分布图初始化完成')
        }
      })
    },

    /**
     * 获取告警级别分布饼图配置
     */
    getSeverityChartOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [
          {
            name: '告警级别',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: {
              show: true,
              position: 'outside',
              formatter: '{b}: {c}',
              fontSize: 12
            },
            labelLine: { show: true, length: 10, length2: 10 },
            emphasis: { label: { fontSize: 14, fontWeight: 'bold' } },
            data: data
          }
        ]
      }
    },

    /**
     * 获取告警类型分布柱状图配置
     */
    getTypeChartOption(types, counts) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: types, axisLabel: { interval: 0, rotate: 30 } },
        yAxis: { type: 'value', name: '告警数' },
        series: [
          {
            name: '告警数量',
            type: 'bar',
            data: counts,
            itemStyle: {
              color: function (params) {
                const colors = ['#ee6666', '#fac858', '#5470c6', '#91cc75', '#73c0de']
                return colors[params.dataIndex % colors.length]
              },
              borderRadius: [4, 4, 0, 0]
            },
            label: { show: true, position: 'top' }
          }
        ]
      }
    },

    /**
     * 更新图表数据
     */
    updateCharts() {
      // 统计告警级别分布
      const severityStats = { danger: 0, warning: 0, info: 0 }
      // 统计告警类型分布
      const typeStats = {
        win_rate: 0,
        budget_exhaust: 0,
        budget_warning: 0,
        stock_low: 0,
        stock_warning: 0,
        high_frequency_user: 0,
        empty_streak_high: 0
      }

      this.alerts.forEach(alert => {
        // 直接使用后端API字段: level
        if (alert.level && severityStats.hasOwnProperty(alert.level)) {
          severityStats[alert.level]++
        }
        // 直接使用后端API字段: type
        if (alert.type && typeStats.hasOwnProperty(alert.type)) {
          typeStats[alert.type]++
        }
      })

      // 更新级别分布饼图
      if (this.severityDistChart) {
        const severityData = [
          { value: severityStats.danger, name: '危险', itemStyle: { color: '#ee6666' } },
          { value: severityStats.warning, name: '警告', itemStyle: { color: '#fac858' } },
          { value: severityStats.info, name: '提示', itemStyle: { color: '#5470c6' } }
        ].filter(item => item.value > 0)

        this.severityDistChart.setOption(this.getSeverityChartOption(severityData))
      }

      // 更新类型分布柱状图
      if (this.typeDistChart) {
        // 根据实际API返回的告警类型
        const typeLabels = ['预算告急', '预算预警', '库存告急', '库存预警', '高频用户', '连空用户']
        const typeCounts = [
          typeStats.budget_exhaust || 0,
          typeStats.budget_warning || 0,
          typeStats.stock_low || 0,
          typeStats.stock_warning || 0,
          typeStats.high_frequency_user || 0,
          typeStats.empty_streak_high || 0
        ]

        this.typeDistChart.setOption(this.getTypeChartOption(typeLabels, typeCounts))
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载活动列表
     */
    async loadCampaigns() {
      try {
        const response = await apiRequest(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_LIST)
        if (response && response.success) {
          this.campaigns = response.data?.campaigns || response.data?.items || response.data || []
        }
      } catch (error) {
        logger.warn('[LotteryAlerts] 加载活动列表失败:', error.message)
      }
    },

    /**
     * 加载告警列表
     */
    async loadAlerts() {
      const result = await this.withLoading(async () => {
        const params = {
          page: this.current_page,
          page_size: this.page_size
        }

        // 筛选条件
        if (this.filters.level) params.level = this.filters.level
        if (this.filters.type) params.type = this.filters.type
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.campaign_id) params.campaign_id = this.filters.campaign_id

        const url = LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERTS + buildQueryString(params)
        const response = await apiRequest(url)

        if (response && response.success) {
          return response.data
        }
        throw new Error(response?.message || '获取告警列表失败')
      })

      if (result.success) {
        // 适配后端返回数据结构
        this.alerts = result.data.alerts || result.data.items || result.data.list || []
        if (!Array.isArray(this.alerts)) {
          this.alerts = []
        }

        // 更新分页信息
        const summary = result.data.summary || {}
        this.totalCount = summary.total || result.data.total || this.alerts.length
        this.total_pages = Math.ceil(this.totalCount / this.page_size) || 1

        // 更新统计数据
        this.updateStats(result.data)
        this.updateCharts()
      }
    },

    /**
     * 更新统计数据
     */
    updateStats(data) {
      const summary = data.summary || {}
      
      // 从 summary 获取统计数据
      this.stats.danger = summary.danger || 0
      this.stats.warning = summary.warning || 0
      this.stats.info = summary.info || 0
      
      // 计算已确认和已解决数量
      const alerts = data.alerts || data.items || []
      this.stats.acknowledged = alerts.filter(a => a.status === 'acknowledged').length
      this.stats.resolved = data.resolved_count || alerts.filter(a => a.status === 'resolved').length
    },

    // ==================== 分页操作 ====================

    prevPage() {
      if (this.current_page > 1) {
        this.current_page--
        this.loadAlerts()
      }
    },

    nextPage() {
      if (this.current_page < this.total_pages) {
        this.current_page++
        this.loadAlerts()
      }
    },

    // ==================== 自动刷新控制 ====================

    toggleAutoRefresh() {
      this.autoRefresh = !this.autoRefresh

      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
        this.showSuccess('已开启自动刷新')
      } else {
        if (this.refreshTimer) {
          clearInterval(this.refreshTimer)
          this.refreshTimer = null
        }
        this.showSuccess('已关闭自动刷新')
      }
    },

    // ==================== 批量操作 ====================

    toggleAllAlerts(checked) {
      if (checked) {
        this.selectedAlerts = this.alerts.map(a => a.alert_id)
      } else {
        this.selectedAlerts = []
      }
    },

    /**
     * 批量确认告警
     */
    async batchAcknowledge() {
      if (this.selectedAlerts.length === 0) {
        this.showError('请先选择要确认的告警')
        return
      }

      const result = await this.confirmAndExecute(
        `确定要批量确认选中的 ${this.selectedAlerts.length} 条告警吗？`,
        async () => {
          const promises = this.selectedAlerts.map(alertId =>
            apiRequest(buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_ACKNOWLEDGE, { id: alertId }), {
              method: 'POST'
            })
          )
          await Promise.all(promises)
          return { count: this.selectedAlerts.length }
        },
        { showSuccess: true, successMessage: `已成功确认 ${this.selectedAlerts.length} 条告警` }
      )

      if (result.success) {
        this.selectedAlerts = []
        await this.loadAlerts()
      }
    },

    /**
     * 批量解决告警
     */
    async batchResolve() {
      if (this.selectedAlerts.length === 0) {
        this.showError('请先选择要解决的告警')
        return
      }

      const result = await this.confirmAndExecute(
        `确定要批量解决选中的 ${this.selectedAlerts.length} 条告警吗？`,
        async () => {
          const promises = this.selectedAlerts.map(alertId =>
            apiRequest(buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_RESOLVE, { id: alertId }), {
              method: 'POST',
              data: { resolve_notes: '批量解决' }
            })
          )
          await Promise.all(promises)
          return { count: this.selectedAlerts.length }
        },
        { showSuccess: true, successMessage: `已成功解决 ${this.selectedAlerts.length} 条告警` }
      )

      if (result.success) {
        this.selectedAlerts = []
        await this.loadAlerts()
      }
    },

    // ==================== 告警操作 ====================

    /**
     * 查看告警详情
     */
    viewAlertDetail(alert) {
      this.selectedAlert = alert
    },

    /**
     * 确认告警
     */
    async acknowledgeAlert(alert) {
      const alertId = alert.alert_id
      
      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_ACKNOWLEDGE, { id: alertId }),
          { method: 'POST' }
        )

        if (response && response.success) {
          this.showSuccess('告警已确认')
          await this.loadAlerts()
        } else {
          this.showError(response?.message || '确认失败')
        }
      } catch (error) {
        logger.error('[LotteryAlerts] 确认告警失败:', error)
        this.showError(error.message)
      }
    },

    /**
     * 打开解决告警弹窗
     */
    openResolveModal(alert) {
      this.resolveForm = {
        alert_id: alert.alert_id,
        resolve_notes: ''
      }
      this.showModal('resolveModal')
    },

    /**
     * 提交解决告警
     */
    async submitResolve() {
      if (!this.resolveForm.alert_id) return

      this.submitting = true
      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_RESOLVE, { id: this.resolveForm.alert_id }),
          {
            method: 'POST',
            data: { resolve_notes: this.resolveForm.resolve_notes }
          }
        )

        if (response && response.success) {
          this.hideModal('resolveModal')
          this.showSuccess('告警已解决')
          await this.loadAlerts()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('[LotteryAlerts] 解决告警失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    },

    // ==================== 辅助方法 ====================

    /**
     * 获取告警级别中文文本
     */
    getSeverityText(severity) {
      const labels = {
        danger: '危险',
        warning: '警告',
        info: '提示'
      }
      return labels[severity] || severity || '-'
    },

    /**
     * 获取告警类型中文文本
     */
    getTypeText(type) {
      const labels = {
        // 后端 LotteryAnalyticsService 实时告警类型
        budget_exhaust: '预算告急',
        budget_warning: '预算预警',
        stock_low: '库存告急',
        stock_warning: '库存预警',
        win_rate_high: '中奖率偏高',
        win_rate_low: '中奖率偏低',
        high_frequency_user: '高频用户',
        empty_streak_high: '连空用户',
        // 后端 LotteryAlertService 持久化告警类型
        win_rate: '中奖率异常',
        budget: '预算告警',
        inventory: '库存告警',
        user: '用户异常',
        system: '系统告警'
      }
      return labels[type] || type || '-'
    },

    /**
     * 获取告警状态中文文本
     */
    getStatusText(status) {
      const labels = {
        active: '活跃',
        acknowledged: '已确认',
        resolved: '已解决'
      }
      return labels[status] || status || '-'
    },

    /**
     * 格式化阈值/实际值显示
     * 直接使用后端API字段: threshold, current_value
     */
    formatThreshold(alert) {
      if (!alert.threshold && !alert.current_value) return '-'
      
      const threshold = alert.threshold !== null && alert.threshold !== undefined
        ? parseFloat(alert.threshold).toFixed(2)
        : '-'
      const actual = alert.current_value !== null && alert.current_value !== undefined
        ? parseFloat(alert.current_value).toFixed(2)
        : '-'
      return `${threshold} / ${actual}`
    },

    /**
     * 格式化日期为中文显示格式（北京时间）
     */
    formatDate(dateValue) {
      if (!dateValue) return '-'
      try {
        // 如果是后端返回的时间对象格式
        if (typeof dateValue === 'object' && dateValue !== null) {
          if (dateValue.beijing) return dateValue.beijing
          if (dateValue.iso) return new Date(dateValue.iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        }
        // 如果是字符串格式
        return new Date(dateValue).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return typeof dateValue === 'string' ? dateValue : '-'
      }
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

document.addEventListener('alpine:init', () => {
  Alpine.data('lotteryAlertsPage', lotteryAlertsPage)
  logger.info('[LotteryAlertsPage] Alpine 组件已注册')
})

