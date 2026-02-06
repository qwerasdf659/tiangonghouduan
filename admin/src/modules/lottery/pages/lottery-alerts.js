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
import { LotteryHealthAPI } from '../../../api/lottery-health.js'
import { SYSTEM_CORE_ENDPOINTS } from '../../../api/system/core.js'
import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { loadECharts } from '../../../utils/index.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

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

    /** @type {string} 当前激活的Tab */
    activeTab: 'all',

    /** @type {boolean} 表单提交状态 */
    submitting: false,

    /** @type {Array} 告警列表 */
    alerts: [],

    // ========== data-table 列配置 ==========
    alertsTableColumns: [
      { key: 'alert_id', label: '告警ID', sortable: true, type: 'code' },
      {
        key: 'level',
        label: '级别',
        type: 'status',
        statusMap: {
          danger: { class: 'red', label: '危险' },
          warning: { class: 'yellow', label: '警告' },
          info: { class: 'blue', label: '提示' }
        }
      },
      { key: 'type', label: '类型', render: (val, row) => row.type_display || val || '-' },
      { key: 'campaign_name', label: '关联活动', render: (val, row) => val || row.related_entity?.name || '-' },
      { key: 'message', label: '告警描述', type: 'truncate', maxLength: 40 },
      {
        key: 'threshold_actual',
        label: '阈值/实际',
        render: (_val, row) => {
          if (row.threshold_value !== undefined && row.actual_value !== undefined) {
            return `<span class="text-gray-500">${row.threshold_value} / ${row.actual_value}</span>`
          }
          return '-'
        }
      },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          active: { class: 'red', label: '活跃' },
          acknowledged: { class: 'yellow', label: '已确认' },
          resolved: { class: 'green', label: '已解决' }
        }
      },
      { key: 'created_at', label: '时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '150px',
        actions: [
          { name: 'detail', label: '详情', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'acknowledge',
            label: '确认',
            class: 'text-orange-500 hover:text-orange-700',
            condition: (row) => row.status === 'active'
          },
          {
            name: 'resolve',
            label: '解决',
            class: 'text-green-500 hover:text-green-700',
            condition: (row) => row.status !== 'resolved'
          }
        ]
      }
    ],

    /** @type {number|string} 选中的活动ID（用于健康度分析） */
    selectedCampaignId: '',

    /** @type {Object} 健康度数据 */
    healthData: {
      overall_score: 0,
      budget_health: 0,
      win_rate_health: 0,
      prize_distribution_health: 0,
      budget_remaining_days: 0,
      current_win_rate: 0,
      high_tier_ratio: 0,
      issues: [],
      tier_distribution: [],
      trend: []
    },

    /** @type {Object|null} 档位分布图表实例 */
    tierDistributionChart: null,

    /** @type {Object|null} 健康度趋势图表实例 */
    healthTrendChart: null,

    // P1-21: 系统健康状态数据
    systemHealth: {
      api: { status: 'loading', response_time: 0, last_check: null },
      db: { status: 'loading', host: '', database: '' },
      redis: { status: 'loading', connected: false },
      overall_score: 0,
      alert_count: 0,
      slow_apis: [],
      recent_alerts: []
    },

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

    /** @type {string|null} 上次数据更新时间（#2 数据刷新状态透明） */
    lastUpdateTime: null,

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
     * @property {number|string} alert_id - 告警ID（对应后端 lottery_alert_id）
     * @property {string} resolution - 解决方案描述（对应后端 resolution 字段）
     */
    resolveForm: {
      alert_id: '',
      resolution: ''
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

      // 加载告警（默认加载全部）
      this.filters.level = ''
      await this.loadAlerts()

      // 自动刷新（60秒）
      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
      }

      // 窗口大小改变时重绘图表（命名引用以便清理）
      this._resizeHandler = () => {
        if (this.severityDistChart) this.severityDistChart.resize()
        if (this.typeDistChart) this.typeDistChart.resize()
      }
      window.addEventListener('resize', this._resizeHandler)
    },

    /**
     * 组件销毁时清理资源
     */
    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler)
      }
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
      // 统计告警类型分布（以后端实际返回的 type 值为准）
      const typeStats = {
        budget: 0,
        inventory: 0,
        win_rate: 0,
        user: 0,
        system: 0
      }

      this.alerts.forEach(alert => {
        // 直接使用后端API字段: level
        if (alert.level && Object.hasOwn(severityStats, alert.level)) {
          severityStats[alert.level]++
        }
        // 直接使用后端API字段: type
        if (alert.type && Object.hasOwn(typeStats, alert.type)) {
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

      // 更新类型分布柱状图（以后端实际返回的 type 值为准）
      if (this.typeDistChart) {
        const typeLabels = ['预算告警', '库存告警', '中奖率告警', '用户告警', '系统告警']
        const typeCounts = [
          typeStats.budget || 0,
          typeStats.inventory || 0,
          typeStats.win_rate || 0,
          typeStats.user || 0,
          typeStats.system || 0
        ]

        this.typeDistChart.setOption(this.getTypeChartOption(typeLabels, typeCounts))
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载活动列表
     * @description 后端返回字段为 lottery_campaign_id 和 campaign_name
     */
    async loadCampaigns() {
      try {
        const response = await apiRequest(LOTTERY_CORE_ENDPOINTS.CAMPAIGN_LIST)
        if (response && response.success) {
          // 后端返回 data.campaigns 数组，每个元素包含 lottery_campaign_id 和 campaign_name
          this.campaigns = response.data?.campaigns || response.data?.items || response.data || []
          logger.info('[LotteryAlerts] 加载活动列表成功:', this.campaigns.length)
        }
      } catch (error) {
        logger.warn('[LotteryAlerts] 加载活动列表失败:', error.message)
        this.campaigns = []
      }
    },

    /**
     * data-table 数据源：抽奖告警
     */
    async fetchAlertsTableData(params) {
      const queryParams = { limit: params.page_size || 20 }
      if (params.level) queryParams.level = params.level
      if (params.type) queryParams.type = params.type
      if (params.status) queryParams.status = params.status

      const url = LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERTS + buildQueryString(queryParams)
      const response = await apiRequest(url)

      if (response?.success) {
        const items = response.data.alerts || response.data.items || response.data.list || []
        this.alerts = items
        this.totalCount = items.length
        this.updateStats(response.data)
        this.updateCharts()
        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        return { items, total: items.length }
      }
      throw new Error(response?.message || '获取告警列表失败')
    },

    /**
     * 处理告警表格操作
     */
    handleAlertsTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'detail':
          this.viewAlertDetail(row)
          break
        case 'acknowledge':
          this.acknowledgeAlert(row)
          break
        case 'resolve':
          this.openResolveModal(row)
          break
        default:
          logger.warn('[LotteryAlerts] 未知操作:', action)
      }
    },

    /**
     * 加载告警列表（旧方法保留用于刷新）
     */
    async loadAlerts() {
      const result = await this.withLoading(async () => {
        const params = {
          limit: this.page_size
        }

        // 筛选条件（参数名以后端为准）
        if (this.filters.level) params.level = this.filters.level
        if (this.filters.type) params.type = this.filters.type
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.campaign_id) params.lottery_campaign_id = this.filters.campaign_id

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

        // 更新分页信息（以实际返回的过滤结果数量为准）
        this.totalCount = this.alerts.length
        this.total_pages = Math.ceil(this.totalCount / this.page_size) || 1

        // 更新统计数据
        this.updateStats(result.data)
        this.updateCharts()

        // #2 更新上次刷新时间
        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
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
      this.stats.resolved =
        data.resolved_count || alerts.filter(a => a.status === 'resolved').length
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
            apiRequest(
              buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_ACKNOWLEDGE, { id: alertId }),
              {
                method: 'POST'
              }
            )
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
            apiRequest(
              buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_RESOLVE, { id: alertId }),
              {
                method: 'POST',
                data: { resolve_notes: '批量解决' }
              }
            )
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
     * 后端 API: POST /alerts/:id/acknowledge
     * body: { note?: string }
     * @param {Object} alert - 告警对象（包含 alert_id 或 lottery_alert_id）
     */
    async acknowledgeAlert(alert) {
      // 优先使用 alert_id，兼容 lottery_alert_id
      const alertId = alert.alert_id || alert.lottery_alert_id

      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_ACKNOWLEDGE, { id: alertId }),
          {
            method: 'POST',
            data: {} // 后端接受可选的 note 字段
          }
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
     * @param {Object} alert - 告警对象（包含 alert_id 或 lottery_alert_id）
     */
    openResolveModal(alert) {
      // 优先使用 alert_id，兼容 lottery_alert_id
      this.resolveForm = {
        alert_id: alert.alert_id || alert.lottery_alert_id,
        resolution: ''
      }
      this.showModal('resolveModal')
    },

    /**
     * 提交解决告警
     * 后端 API: POST /alerts/:id/resolve
     * body: { resolution: string }
     */
    async submitResolve() {
      if (!this.resolveForm.alert_id) return

      this.submitting = true
      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ADVANCED_ENDPOINTS.REALTIME_ALERT_RESOLVE, {
            id: this.resolveForm.alert_id
          }),
          {
            method: 'POST',
            // 后端期望字段名为 resolution
            data: { resolution: this.resolveForm.resolution }
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

    // ✅ 已删除 getSeverityText / getTypeText / getStatusText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 xxx_display 字段
    // HTML 模板直接使用 alert.severity_display / alert.type_display / alert.status_display

    /**
     * 格式化阈值/实际值显示
     * 直接使用后端API字段: threshold, current_value
     */
    formatThreshold(alert) {
      if (!alert.threshold && !alert.current_value) return '-'

      const threshold =
        alert.threshold !== null && alert.threshold !== undefined
          ? parseFloat(alert.threshold).toFixed(2)
          : '-'
      const actual =
        alert.current_value !== null && alert.current_value !== undefined
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
          if (dateValue.iso)
            return new Date(dateValue.iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        }
        // 如果是字符串格式
        return new Date(dateValue).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return typeof dateValue === 'string' ? dateValue : '-'
      }
    },

    // ==================== 健康度分析方法（P1-1） ====================

    /**
     * 获取健康等级文本
     */
    getHealthLevel(score) {
      if (score >= 90) return '🟢 优秀'
      if (score >= 80) return '🟢 良好'
      if (score >= 70) return '🟡 一般'
      if (score >= 60) return '🟡 需关注'
      return '🔴 危险'
    },

    /**
     * 加载健康度数据
     * @description 后端要求必须指定 campaign_id，无汇总端点
     */
    async loadHealthData() {
      if (this.activeTab !== 'health') return

      // 后端要求必须指定 campaign_id，未选择时页面已有 UI 提示，静默返回
      if (!this.selectedCampaignId) {
        logger.debug('健康度分析：等待用户选择活动')
        return
      }

      const result = await this.withLoading(async () => {
        return await LotteryHealthAPI.getCampaignHealth(this.selectedCampaignId)
      })

      if (result.success && result.data) {
        const data = result.data.data || result.data
        const dims = data.dimensions || {}

        // 直接使用后端 dimensions 结构，不做复杂映射
        this.healthData = {
          overall_score: data.overall_score || 0,
          // 从 dimensions.{name}.score 提取各维度得分
          budget_health: dims.budget?.score || 0,
          win_rate_health: dims.win_rate?.score || 0,
          prize_distribution_health: dims.inventory?.score || 0,
          // 从 dimensions.{name}.details 提取明细数据
          budget_remaining_days: dims.budget?.details?.estimated_remaining_days || '-',
          current_win_rate: dims.win_rate?.details?.actual_win_rate || 0,
          high_tier_ratio: dims.win_rate?.details?.tier_distribution?.percentages?.high || 0,
          // issues 和 suggestions 直接使用后端字段
          issues: data.issues || [],
          suggestions: data.suggestions || [],
          // 档位分布数据（从 win_rate.details.tier_distribution 提取）
          tier_distribution: dims.win_rate?.details?.tier_distribution || {},
          // 后端暂无趋势数据
          trend: data.trend || [],
          // 保留完整 dimensions 供详细展示
          dimensions: dims
        }

        // 更新图表
        this.$nextTick(() => {
          this.initHealthCharts()
          this.updateHealthCharts()
        })
      }
    },

    /**
     * 初始化健康度图表
     */
    initHealthCharts() {
      const echarts = this._echarts
      if (!echarts) return

      // 档位分布饼图
      const tierContainer = document.getElementById('tierDistributionChart')
      if (tierContainer && !this.tierDistributionChart) {
        this.tierDistributionChart = echarts.init(tierContainer)
      }

      // 健康度趋势图
      const trendContainer = document.getElementById('healthTrendChart')
      if (trendContainer && !this.healthTrendChart) {
        this.healthTrendChart = echarts.init(trendContainer)
      }
    },

    /**
     * 更新健康度图表
     */
    updateHealthCharts() {
      // 更新档位分布饼图 — 后端字段: tier_distribution.counts.{high,mid,low,empty}
      if (this.tierDistributionChart) {
        const tierData = this.healthData.tier_distribution
        const counts = tierData.counts || {}
        const pieData = [
          {
            value: counts.high || 0,
            name: '高档位',
            itemStyle: { color: '#ee6666' }
          },
          {
            value: counts.mid || 0,
            name: '中档位',
            itemStyle: { color: '#fac858' }
          },
          {
            value: counts.low || counts.fallback || 0,
            name: '保底',
            itemStyle: { color: '#91cc75' }
          },
          {
            value: counts.empty || 0,
            name: '未中奖',
            itemStyle: { color: '#999' }
          }
        ].filter(item => item.value > 0)

        this.tierDistributionChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          legend: { orient: 'vertical', left: 'left', top: 'center' },
          series: [
            {
              name: '档位分布',
              type: 'pie',
              radius: ['40%', '70%'],
              avoidLabelOverlap: true,
              itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
              label: { show: true, formatter: '{b}: {d}%' },
              data: pieData
            }
          ]
        })
      }

      // 更新健康度趋势图
      if (this.healthTrendChart) {
        const trend = this.healthData.trend || []
        const dates = trend.map(item => item.date || item.snapshot_date)
        const scores = trend.map(item => item.score || item.health_score || item.overall_score)

        this.healthTrendChart.setOption({
          tooltip: { trigger: 'axis' },
          grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
          xAxis: { type: 'category', data: dates },
          yAxis: { type: 'value', min: 0, max: 100, name: '健康度' },
          series: [
            {
              name: '健康度',
              type: 'line',
              smooth: true,
              data: scores,
              lineStyle: { color: '#5470c6', width: 3 },
              areaStyle: {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(84, 112, 198, 0.5)' },
                    { offset: 1, color: 'rgba(84, 112, 198, 0.1)' }
                  ]
                }
              },
              markLine: {
                data: [
                  { yAxis: 80, name: '良好', lineStyle: { color: '#91cc75' } },
                  { yAxis: 60, name: '警戒', lineStyle: { color: '#fac858' } }
                ]
              }
            }
          ]
        })
      }
    },

    // ==================== P1-21: 系统告警方法 ====================

    /**
     * P1-21: 加载系统健康状态
     * @description 并行请求后端系统状态和健康检查，获取API、数据库、Redis连接状态
     * 后端端点：
     * - GET /api/v4/console/system/status → database/api/lottery_engine 状态
     * - GET /health → database + redis 状态（无需认证）
     */
    async loadSystemHealth() {
      try {
        logger.info('[LotteryAlerts] 加载系统健康状态')

        const startTime = Date.now()

        // 并行请求：系统状态（需认证）+ 健康检查（公开）
        const [statusResult, healthResult] = await Promise.allSettled([
          apiRequest(SYSTEM_CORE_ENDPOINTS.STATUS),
          request({ url: '/health' }).catch(() => null)
        ])

        const responseTime = Date.now() - startTime

        // 解析系统状态（后端字段：database.status, database.host, database.database, api.last_check）
        const statusData = statusResult.status === 'fulfilled' && statusResult.value?.success
          ? statusResult.value.data
          : null

        // 解析健康检查（后端字段：data.systems.database, data.systems.redis）
        const healthData = healthResult.status === 'fulfilled' ? healthResult.value : null

        // 映射后端字段到前端显示
        const dbStatus = statusData?.database?.status || healthData?.data?.systems?.database
        const redisConnected = healthData?.data?.systems?.redis === 'connected'

        this.systemHealth = {
          api: {
            status: statusData ? 'healthy' : 'critical',
            response_time: responseTime,
            last_check: statusData?.api?.last_check || new Date().toISOString()
          },
          db: {
            status: dbStatus === 'connected' ? 'healthy' : 'critical',
            host: statusData?.database?.host || '',
            database: statusData?.database?.database || ''
          },
          redis: {
            status: redisConnected ? 'healthy' : 'critical',
            connected: redisConnected
          },
          overall_score: this.calculateSystemScore({
            api_ok: !!statusData,
            db_connected: dbStatus === 'connected',
            redis_connected: redisConnected,
            response_time: responseTime
          }),
          alert_count: 0,
          slow_apis: [],
          recent_alerts: []
        }

        logger.info('[LotteryAlerts] 系统健康状态加载成功', {
          overall_score: this.systemHealth.overall_score,
          api_status: this.systemHealth.api.status,
          db_status: this.systemHealth.db.status,
          redis_connected: redisConnected
        })
      } catch (error) {
        logger.warn('[LotteryAlerts] loadSystemHealth 失败:', error.message)
        this.systemHealth.api.status = 'critical'
        this.systemHealth.db.status = 'critical'
        this.systemHealth.redis.status = 'critical'
      }
    },

    /**
     * 计算系统综合健康分数
     * @param {Object} checks - 检查结果
     * @param {boolean} checks.api_ok - API 是否正常
     * @param {boolean} checks.db_connected - 数据库是否连接
     * @param {boolean} checks.redis_connected - Redis 是否连接
     * @param {number} checks.response_time - API 响应时间(ms)
     * @returns {number} 0-100的健康分数
     */
    calculateSystemScore(checks) {
      let score = 100

      // API 状态扣分
      if (!checks.api_ok) score -= 30
      else if (checks.response_time > 1000) score -= 15
      else if (checks.response_time > 500) score -= 5

      // 数据库状态扣分
      if (!checks.db_connected) score -= 40

      // Redis 状态扣分
      if (!checks.redis_connected) score -= 20

      return Math.max(0, Math.min(100, score))
    },

    /**
     * P1-9: 按级别筛选告警
     * @param {string} level - 告警级别（'all' | 'danger' | ''）
     */
    filterAlerts(level) {
      if (level === 'all') {
        this.filters.level = ''
      } else if (level === 'danger') {
        this.filters.level = 'danger'
      } else {
        this.filters.level = level
      }
      this.loadAlerts()
    },

    /**
     * 格式化相对时间（如：1分钟前）
     * @param {string} dateStr - ISO日期字符串
     * @returns {string} 相对时间文本
     */
    formatRelativeTime(dateStr) {
      if (!dateStr) return '--'
      try {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now - date
        const diffSec = Math.floor(diffMs / 1000)
        const diffMin = Math.floor(diffSec / 60)
        const diffHour = Math.floor(diffMin / 60)

        if (diffSec < 60) return '刚刚'
        if (diffMin < 60) return `${diffMin}分钟前`
        if (diffHour < 24) return `${diffHour}小时前`
        return this.formatDate(dateStr)
      } catch {
        return '--'
      }
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

document.addEventListener('alpine:init', () => {
  Alpine.data('lotteryAlertsPage', lotteryAlertsPage)
  logger.info('[LotteryAlertsPage] Alpine 组件已注册')
})
