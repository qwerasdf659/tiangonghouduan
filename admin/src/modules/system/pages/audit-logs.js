/**
 * @fileoverview 操作审计日志页面 - Alpine.js 组件
 * @module modules/system/pages/audit-logs
 * @description 系统操作审计日志查询和详情查看，包含趋势图和目标类型分布图
 * @version 1.1.0
 * @date 2026-02-05
 */

import Alpine from 'alpinejs'
import { logger } from '../../../utils/logger.js'
import { API_PREFIX } from '../../../api/base.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { useAuditLogsState, useAuditLogsMethods } from '../composables/audit-logs.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { SystemAdminAPI } from '../../../api/system/admin.js'

/**
 * 创建操作审计日志页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function auditLogsPage() {
  const pageMixin = createPageMixin({
    pageTitle: '操作审计',
    loadDataOnInit: false
  })

  return {
    // ==================== Mixin 组合 ====================
    ...pageMixin,
    ...useAuditLogsState(),
    ...useAuditLogsMethods(),

    // ==================== 页面状态 ====================
    loading: false,
    /** @type {'logs'|'report'} 当前激活的 Tab */
    activeTab: 'logs',

    // 统计数据
    stats: {
      create: 0,
      update: 0,
      delete: 0,
      login: 0,
      logout: 0
    },

    // ==================== 审计报告相关状态 ====================
    /** @type {boolean} 报告加载状态 */
    reportLoading: false,
    /** @type {string} 报告时间范围 */
    reportTimeRange: '7d',
    /** @type {string} 报告开始日期 */
    reportStartDate: '',
    /** @type {string} 报告结束日期 */
    reportEndDate: '',
    /** @type {number|null} 报告操作员ID筛选 */
    reportOperatorId: null,
    /** @type {Object} 审计报告数据 */
    reportData: {
      summary: {
        total_operations: 0,
        high_risk_count: 0,
        rollback_count: 0,
        unique_operators: 0,
        affected_users_total: 0,
        affected_amount_total: 0
      },
      by_operation_type: [],
      by_target_type: [],
      by_risk_level: [],
      by_operator: [],
      trend: [],
      report_meta: {}
    },
    /** @type {Array} 操作员下拉选项列表 */
    operatorOptions: [],
    /** @type {Object|null} 报告操作类型图表实例 */
    reportOperationChart: null,
    /** @type {Object|null} 报告目标类型图表实例 */
    reportTargetChart: null,
    /** @type {Object|null} 报告趋势图表实例 */
    reportTrendChart: null,
    /** @type {Object|null} 报告风险级别图表实例 */
    reportRiskLevelChart: null,

    // ==================== 图表相关状态 ====================
    /** @type {Object|null} 趋势图表实例 */
    trendChart: null,
    /** @type {Object|null} 目标类型图表实例 */
    targetTypeChart: null,
    /** @type {Object} 趋势统计数据 */
    trendStats: {
      total: 0,
      days: 7,
      items: [],
      average_per_day: 0,
      max_day: null,
      min_day: null
    },
    /** @type {Object} 目标类型统计数据 */
    targetTypeStats: {
      total: 0,
      items: []
    },
    /** @type {number} 趋势图天数 */
    trendDays: 7,
    /** @type {boolean} 图表加载状态 */
    chartsLoading: false,

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[AuditLogs] 初始化操作审计日志页面')

      // 调用 mixin 的 init
      if (typeof pageMixin.init === 'function') {
        await pageMixin.init.call(this)
      }

      // 设置默认日期范围（最近7天）
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      this.logFilters.end_date = today.toISOString().split('T')[0]
      this.logFilters.start_date = weekAgo.toISOString().split('T')[0]
      // 设置报告默认日期范围
      this.reportStartDate = weekAgo.toISOString().split('T')[0]
      this.reportEndDate = today.toISOString().split('T')[0]

      // 根据 activeTab 加载数据
      if (this.activeTab === 'logs') {
        await this.loadAuditLogs()
        await this.loadStats()
        // 加载图表数据（异步，不阻塞页面）
        this.loadChartData()
      } else {
        await this.loadAuditReport()
      }

      logger.info('[AuditLogs] 初始化完成')
    },

    /**
     * 切换 Tab
     * @param {string} tab - 目标 Tab（'logs' 或 'report'）
     */
    async switchTab(tab) {
      if (this.activeTab === tab) return
      this.activeTab = tab
      logger.info('[AuditLogs] 切换到 Tab:', tab)

      if (tab === 'logs') {
        await this.loadAuditLogs()
        await this.loadStats()
        this.loadChartData()
      } else {
        await this.loadAuditReport()
      }
    },

    /**
     * 加载图表数据
     */
    async loadChartData() {
      this.chartsLoading = true
      try {
        // 并行加载趋势数据和目标类型数据
        await Promise.all([
          this.loadTrendStats(),
          this.loadTargetTypeStats()
        ])
        // 初始化图表
        await this.initCharts()
      } catch (error) {
        logger.error('[AuditLogs] 加载图表数据失败:', error)
      } finally {
        this.chartsLoading = false
      }
    },

    /**
     * 加载操作趋势统计数据
     */
    async loadTrendStats() {
      try {
        const response = await this.apiGet(
          `${API_PREFIX}/console/audit-rollback/stats/trend?days=${this.trendDays}`,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          this.trendStats = {
            total: response.data.total || 0,
            days: response.data.days || this.trendDays,
            items: response.data.items || [],
            average_per_day: response.data.average_per_day || 0,
            max_day: response.data.max_day || null,
            min_day: response.data.min_day || null
          }
          logger.debug('[AuditLogs] 趋势数据加载成功:', this.trendStats)
        }
      } catch (error) {
        logger.warn('[AuditLogs] 加载趋势数据失败:', error.message)
      }
    },

    /**
     * 加载目标类型统计数据
     */
    async loadTargetTypeStats() {
      try {
        const params = new URLSearchParams()
        if (this.logFilters.start_date) params.append('start_time', this.logFilters.start_date)
        if (this.logFilters.end_date) params.append('end_time', this.logFilters.end_date)

        const response = await this.apiGet(
          `${API_PREFIX}/console/audit-rollback/stats/by-target-type?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success && response.data) {
          this.targetTypeStats = {
            total: response.data.total || 0,
            items: response.data.items || []
          }
          logger.debug('[AuditLogs] 目标类型数据加载成功:', this.targetTypeStats)
        }
      } catch (error) {
        logger.warn('[AuditLogs] 加载目标类型数据失败:', error.message)
      }
    },

    /**
     * 初始化 ECharts 图表
     */
    async initCharts() {
      try {
        const echarts = await loadECharts()

        // 初始化趋势图
        const trendContainer = document.getElementById('trendChart')
        if (trendContainer) {
          if (this.trendChart) {
            this.trendChart.dispose()
          }
          this.trendChart = echarts.init(trendContainer)
          this.renderTrendChart()
        }

        // 初始化目标类型图
        const targetTypeContainer = document.getElementById('targetTypeChart')
        if (targetTypeContainer) {
          if (this.targetTypeChart) {
            this.targetTypeChart.dispose()
          }
          this.targetTypeChart = echarts.init(targetTypeContainer)
          this.renderTargetTypeChart()
        }

        // 窗口大小变化时自适应（使用命名引用以便清理）
        this._chartResizeHandler = () => {
          this.trendChart?.resize()
          this.targetTypeChart?.resize()
        }
        window.addEventListener('resize', this._chartResizeHandler)

        logger.info('[AuditLogs] 图表初始化完成')
      } catch (error) {
        logger.error('[AuditLogs] 图表初始化失败:', error)
      }
    },

    /**
     * 渲染操作趋势折线图
     */
    renderTrendChart() {
      if (!this.trendChart || !this.trendStats.items.length) {
        return
      }

      const dates = this.trendStats.items.map(item => item.date)
      const counts = this.trendStats.items.map(item => item.count)

      const option = {
        title: {
          text: `最近 ${this.trendStats.days} 天操作趋势`,
          left: 'center',
          textStyle: {
            fontSize: 14,
            fontWeight: 'normal',
            color: '#666'
          }
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const data = params[0]
            const item = this.trendStats.items[data.dataIndex]
            return `${item.date} (${item.day_of_week})<br/>操作数: <b>${item.count}</b>`
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
          boundaryGap: false,
          data: dates,
          axisLabel: {
            formatter: (value) => {
              // 只显示月-日
              return value.substring(5)
            }
          }
        },
        yAxis: {
          type: 'value',
          minInterval: 1
        },
        series: [{
          name: '操作数',
          type: 'line',
          smooth: true,
          data: counts,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
              ]
            }
          },
          lineStyle: {
            color: '#3b82f6',
            width: 2
          },
          itemStyle: {
            color: '#3b82f6'
          },
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' }
            ]
          },
          markLine: {
            data: [
              { type: 'average', name: '平均值' }
            ]
          }
        }]
      }

      this.trendChart.setOption(option)
    },

    /**
     * 渲染目标类型饼图
     */
    renderTargetTypeChart() {
      if (!this.targetTypeChart || !this.targetTypeStats.items.length) {
        return
      }

      // 直接使用后端返回的 target_type，不做映射
      const pieData = this.targetTypeStats.items.map(item => ({
        name: item.target_type || 'unknown',
        value: item.count,
        percentage: item.percentage
      }))

      const option = {
        title: {
          text: '操作目标类型分布',
          left: 'center',
          textStyle: {
            fontSize: 14,
            fontWeight: 'normal',
            color: '#666'
          }
        },
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            return `${params.name}<br/>数量: <b>${params.value}</b> (${params.data.percentage}%)`
          }
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'middle'
        },
        series: [{
          name: '目标类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '55%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold',
              formatter: '{b}\n{c}'
            }
          },
          labelLine: {
            show: false
          },
          data: pieData
        }]
      }

      this.targetTypeChart.setOption(option)
    },

    /**
     * 切换趋势图天数
     * @param {number} days - 天数
     */
    async changeTrendDays(days) {
      this.trendDays = days
      await this.loadTrendStats()
      this.renderTrendChart()
    },

    // ==================== 审计报告方法 ====================

    /**
     * 加载审计报告数据
     */
    async loadAuditReport() {
      this.reportLoading = true
      logger.info('[AuditLogs] 加载审计报告', {
        time_range: this.reportTimeRange,
        start_date: this.reportStartDate,
        end_date: this.reportEndDate,
        operator_id: this.reportOperatorId
      })

      try {
        const params = { time_range: this.reportTimeRange }
        if (this.reportTimeRange === 'custom') {
          params.start_date = this.reportStartDate
          params.end_date = this.reportEndDate
        }
        if (this.reportOperatorId) {
          params.operator_id = this.reportOperatorId
        }

        const response = await SystemAdminAPI.getAuditReport(params)

        if (response?.success && response.data) {
          this.reportData = response.data
          logger.info('[AuditLogs] 审计报告加载成功', { 
            summary: this.reportData.summary,
            by_risk_level: this.reportData.by_risk_level,
            by_operator: this.reportData.by_operator
          })

          // 从 by_operator 数据中提取操作员选项列表
          if (this.reportData.by_operator?.length) {
            this.operatorOptions = this.reportData.by_operator.map(item => ({
              operator_id: item.operator_id,
              operator_name: item.operator_name || `操作员${item.operator_id}`,
              count: parseInt(item.count)
            }))
            logger.debug('[AuditLogs] 操作员选项列表:', this.operatorOptions)
          }

          // 初始化报告图表
          this.$nextTick(() => {
            this.initReportCharts()
          })
        } else {
          throw new Error(response?.message || '加载审计报告失败')
        }
      } catch (error) {
        logger.error('[AuditLogs] 加载审计报告失败:', error)
        this.showError('加载审计报告失败: ' + error.message)
      } finally {
        this.reportLoading = false
      }
    },

    /**
     * 切换报告时间范围
     * @param {string} range - 时间范围（7d/30d/90d/custom）
     */
    async changeReportTimeRange(range) {
      this.reportTimeRange = range
      if (range !== 'custom') {
        await this.loadAuditReport()
      }
    },

    /**
     * 生成自定义时间范围报告
     */
    async generateCustomReport() {
      if (!this.reportStartDate || !this.reportEndDate) {
        this.showError('请选择开始日期和结束日期')
        return
      }
      if (this.reportStartDate > this.reportEndDate) {
        this.showError('开始日期不能晚于结束日期')
        return
      }
      await this.loadAuditReport()
    },

    /**
     * 刷新审计报告
     */
    async refreshReport() {
      await this.loadAuditReport()
    },

    /**
     * 初始化报告图表
     */
    async initReportCharts() {
      try {
        const echarts = await loadECharts()

        // 初始化操作类型饼图
        const operationContainer = document.getElementById('reportOperationChart')
        if (operationContainer) {
          if (this.reportOperationChart) {
            this.reportOperationChart.dispose()
          }
          this.reportOperationChart = echarts.init(operationContainer)
          this.renderReportOperationChart()
        }

        // 初始化目标类型饼图
        const targetContainer = document.getElementById('reportTargetChart')
        if (targetContainer) {
          if (this.reportTargetChart) {
            this.reportTargetChart.dispose()
          }
          this.reportTargetChart = echarts.init(targetContainer)
          this.renderReportTargetChart()
        }

        // 初始化趋势折线图
        const trendContainer = document.getElementById('reportTrendChart')
        if (trendContainer) {
          if (this.reportTrendChart) {
            this.reportTrendChart.dispose()
          }
          this.reportTrendChart = echarts.init(trendContainer)
          this.renderReportTrendChart()
        }

        // 初始化风险级别图表
        const riskLevelContainer = document.getElementById('reportRiskLevelChart')
        if (riskLevelContainer) {
          if (this.reportRiskLevelChart) {
            this.reportRiskLevelChart.dispose()
          }
          this.reportRiskLevelChart = echarts.init(riskLevelContainer)
          this.renderReportRiskLevelChart()
        }

        // 窗口大小变化时自适应（使用命名引用以便清理）
        this._reportResizeHandler = () => {
          this.reportOperationChart?.resize()
          this.reportTargetChart?.resize()
          this.reportTrendChart?.resize()
          this.reportRiskLevelChart?.resize()
        }
        window.addEventListener('resize', this._reportResizeHandler)

        logger.info('[AuditLogs] 报告图表初始化完成')
      } catch (error) {
        logger.error('[AuditLogs] 报告图表初始化失败:', error)
      }
    },

    /**
     * 渲染报告操作类型饼图
     */
    renderReportOperationChart() {
      if (!this.reportOperationChart || !this.reportData.by_operation_type?.length) {
        return
      }

      const pieData = this.reportData.by_operation_type.map(item => ({
        name: item.operation_type_display || item.operation_type,
        value: parseInt(item.count)
      }))

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'center',
          type: 'scroll'
        },
        series: [{
          name: '操作类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
              formatter: '{b}\n{c}'
            }
          },
          labelLine: { show: false },
          data: pieData
        }]
      }

      this.reportOperationChart.setOption(option)
    },

    /**
     * 渲染报告目标类型饼图
     */
    renderReportTargetChart() {
      if (!this.reportTargetChart || !this.reportData.by_target_type?.length) {
        return
      }

      const pieData = this.reportData.by_target_type.map(item => ({
        name: item.target_type_display || item.target_type,
        value: parseInt(item.count)
      }))

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'center',
          type: 'scroll'
        },
        series: [{
          name: '目标类型',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
              formatter: '{b}\n{c}'
            }
          },
          labelLine: { show: false },
          data: pieData
        }]
      }

      this.reportTargetChart.setOption(option)
    },

    /**
     * 渲染报告趋势折线图
     */
    renderReportTrendChart() {
      if (!this.reportTrendChart || !this.reportData.trend?.length) {
        return
      }

      const dates = this.reportData.trend.map(item => item.date)
      const counts = this.reportData.trend.map(item => parseInt(item.count))

      const option = {
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const data = params[0]
            return `${data.name}<br/>操作数: <b>${data.value}</b>`
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
          boundaryGap: false,
          data: dates,
          axisLabel: {
            formatter: (value) => value.substring(5) // 只显示月-日
          }
        },
        yAxis: {
          type: 'value',
          minInterval: 1
        },
        series: [{
          name: '操作数',
          type: 'line',
          smooth: true,
          data: counts,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
              ]
            }
          },
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          markPoint: {
            data: [
              { type: 'max', name: '最大值' },
              { type: 'min', name: '最小值' }
            ]
          },
          markLine: {
            data: [{ type: 'average', name: '平均值' }]
          }
        }]
      }

      this.reportTrendChart.setOption(option)
    },

    /**
     * 渲染报告风险级别饼图
     */
    renderReportRiskLevelChart() {
      if (!this.reportRiskLevelChart || !this.reportData.by_risk_level?.length) {
        logger.debug('[AuditLogs] 风险级别数据为空或图表未初始化')
        return
      }

      // 风险级别颜色映射
      const riskColors = {
        high: '#ef4444',    // 红色 - 高风险
        medium: '#f59e0b',  // 黄色 - 中风险
        low: '#22c55e'      // 绿色 - 低风险
      }

      // 风险级别中文映射
      const riskLabels = {
        high: '高风险',
        medium: '中风险',
        low: '低风险'
      }

      const pieData = this.reportData.by_risk_level.map(item => ({
        name: riskLabels[item.risk_level] || item.risk_level,
        value: parseInt(item.count),
        itemStyle: { color: riskColors[item.risk_level] || '#9ca3af' }
      }))

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'center',
          type: 'scroll'
        },
        series: [{
          name: '风险级别',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: 'bold',
              formatter: '{b}\n{c}'
            }
          },
          labelLine: { show: false },
          data: pieData
        }]
      }

      this.reportRiskLevelChart.setOption(option)
      logger.debug('[AuditLogs] 风险级别图表渲染完成')
    },

    /**
     * 刷新图表数据
     */
    async refreshCharts() {
      await this.loadChartData()
    },

    /**
     * 加载审计日志（覆盖 composable 方法以添加 loading 状态）
     */
    async loadAuditLogs() {
      this.loading = true
      try {
        const params = new URLSearchParams()
        params.append('page', this.logPage)
        params.append('page_size', this.logPageSize)
        if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id)
        if (this.logFilters.operation_type) params.append('operation_type', this.logFilters.operation_type)
        if (this.logFilters.target_type) params.append('target_type', this.logFilters.target_type)
        if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date)
        if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date)

        const response = await this.apiGet(
          `${API_PREFIX}/console/system/audit-logs?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          // 适配多种后端返回格式
          this.auditLogs = response.data?.items || response.data?.logs || response.data?.list || []
          logger.debug('[AuditLogs] 加载到日志数量:', this.auditLogs.length)
          
          if (response.data?.pagination) {
            this.logPagination.total = response.data.pagination.total || 0
            this.logPagination.total_pages = response.data.pagination.total_pages || 1
          } else if (response.data?.total) {
            this.logPagination.total = response.data.total
            this.logPagination.total_pages = Math.ceil(response.data.total / this.logPageSize)
          }
        }
      } catch (error) {
        logger.error('[AuditLogs] 加载审计日志失败:', error)
        this.auditLogs = []
        this.showError('加载审计日志失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载统计数据
     * 使用 SystemAdminAPI 直接调用，避免 apiGet 的 withLoading 切换 this.loading 导致表格闪烁
     */
    async loadStats() {
      try {
        const response = await SystemAdminAPI.getAuditLogStats()

        if (response?.success && response.data) {
          // 后端返回 by_action 数组: [{action:'create',count:5}, ...]
          // 需要转换为前端 stats 对象的平级字段
          const actionMap = {}
          if (Array.isArray(response.data.by_action)) {
            response.data.by_action.forEach(item => {
              actionMap[item.action] = parseInt(item.count) || 0
            })
          }

          this.stats = {
            create: actionMap.create || 0,
            update: actionMap.update || 0,
            delete: actionMap.delete || 0,
            login: actionMap.login || 0,
            logout: actionMap.logout || 0
          }
          logger.debug('[AuditLogs] 统计数据加载成功:', this.stats)
        }
      } catch (error) {
        logger.warn('[AuditLogs] 加载统计数据失败:', error.message)
        // 统计数据加载失败不影响主功能，静默处理
      }
    },

    /**
     * 搜索审计日志
     */
    searchAuditLogs() {
      this.logPage = 1
      this.loadAuditLogs()
    },

    /**
     * 重置筛选条件
     */
    resetLogFilters() {
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      this.logFilters = {
        operator_id: '',
        action: '',
        target: '',
        start_date: weekAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0]
      }
      this.logPage = 1
      this.loadAuditLogs()
    },

    /**
     * 查看日志详情
     * @param {Object} log - 日志对象
     */
    viewLogDetail(log) {
      this.selectedLog = log
      logger.debug('[AuditLogs] 查看日志详情:', log.admin_operation_log_id)
    },

    /**
     * 导出审计日志
     */
    exportAuditLogs() {
      const params = new URLSearchParams()
      if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id)
      if (this.logFilters.operation_type) params.append('operation_type', this.logFilters.operation_type)
      if (this.logFilters.target_type) params.append('target_type', this.logFilters.target_type)
      if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date)
      if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date)
      params.append('format', 'csv')

      const exportUrl = `${API_PREFIX}/console/system/audit-logs/export?${params.toString()}`
      window.open(exportUrl, '_blank')
      
      this.showSuccess('正在导出审计日志...')
      logger.info('[AuditLogs] 导出审计日志')
    },

    /**
     * 分页跳转
     * @param {number} pageNum - 目标页码
     */
    goToLogPage(pageNum) {
      if (pageNum < 1 || pageNum > this.logPagination.total_pages) return
      this.logPage = pageNum
      this.loadAuditLogs()
    },

    /**
     * 格式化日期时间（北京时间）
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 获取操作类型文本（使用后端返回的 display 字段）
     * @param {Object} log - 日志对象
     * @returns {string} 操作类型文本
     */
    getOperationTypeText(log) {
      return log.operation_type_display || log.operation_type || '-'
    },

    /**
     * 获取操作类型样式类（使用后端返回的 color 字段）
     * @param {Object} log - 日志对象
     * @returns {string} CSS类名
     */
    getOperationTypeClass(log) {
      const colorMap = {
        blue: 'bg-blue-100 text-blue-800',
        green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        gray: 'bg-gray-100 text-gray-800',
        purple: 'bg-purple-100 text-purple-800',
        orange: 'bg-orange-100 text-orange-800'
      }
      return colorMap[log.operation_type_color] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 格式化日志详情
     * @param {Object} details - 详情对象
     * @returns {string} 格式化的JSON字符串
     */
    formatLogDetails(details) {
      if (!details) return '无详细信息'
      try {
        return JSON.stringify(details, null, 2)
      } catch {
        return String(details)
      }
    },

    /**
     * 获取目标类型名称（直接使用后端返回的 target_type）
     * @param {string} target_type - 目标类型代码
     * @returns {string} 目标类型名称
     */
    getTargetTypeName(target_type) {
      // 直接返回后端数据，不做映射
      return target_type || '-'
    },

    /**
     * 组件销毁时清理资源
     */
    destroy() {
      // 清理图表 resize 监听
      if (this._chartResizeHandler) {
        window.removeEventListener('resize', this._chartResizeHandler)
      }
      if (this._reportResizeHandler) {
        window.removeEventListener('resize', this._reportResizeHandler)
      }
      // 销毁 ECharts 实例
      if (this.trendChart) this.trendChart.dispose()
      if (this.targetTypeChart) this.targetTypeChart.dispose()
      if (this.reportOperationChart) this.reportOperationChart.dispose()
      if (this.reportTargetChart) this.reportTargetChart.dispose()
      if (this.reportTrendChart) this.reportTrendChart.dispose()
      if (this.reportRiskLevelChart) this.reportRiskLevelChart.dispose()
      logger.info('[AuditLogs] 资源已清理')
    }
  }
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  logger.info('[AuditLogs] 注册 Alpine 组件...')
  Alpine.data('auditLogsPage', auditLogsPage)
})

export { auditLogsPage }
export default auditLogsPage

