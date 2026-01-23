/**
 * 风控告警页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/system/pages/risk-alerts.js
 * @module RiskAlertsPage
 * @version 3.1.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 风控告警管理页面，提供以下功能：
 * - 告警列表展示和筛选（按级别/类型/状态/时间）
 * - 告警详情查看和处理（审核/处理/忽略）
 * - 批量处理告警
 * - 统计分析和可视化图表（级别分布/类型分布）
 * - 自动刷新机制（60秒间隔）
 *
 * @requires createPageMixin - 页面基础混入
 * @requires ECharts - 图表库（延迟加载）
 * @requires API_ENDPOINTS - API端点配置
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用
 * <div x-data="riskAlertsPage">
 *   <div id="levelDistChart" style="height: 300px;"></div>
 *   <table>
 *     <template x-for="alert in alerts" :key="alert.alert_id">...</template>
 *   </table>
 * </div>
 */

/**
 * 风控告警对象类型
 * @typedef {Object} RiskAlert
 * @property {number} alert_id - 告警ID
 * @property {string} severity - 严重程度 ('critical'|'high'|'medium'|'low')
 * @property {string} level - 级别别名（兼容字段）
 * @property {string} alert_type - 告警类型
 * @property {string} type - 类型别名（兼容字段）
 * @property {string} status - 状态 ('pending'|'reviewed'|'resolved'|'ignored')
 * @property {string} message - 告警消息
 * @property {number} [user_id] - 关联用户ID
 * @property {string} created_at - 创建时间
 * @property {string} [reviewed_at] - 审核时间
 * @property {string} [review_notes] - 审核备注
 * @property {Object} [reviewer_info] - 审核人信息
 */

/**
 * 告警统计数据类型
 * @typedef {Object} AlertStats
 * @property {number} critical - 严重告警数
 * @property {number} warning - 警告数
 * @property {number} info - 提示数
 * @property {number} resolved - 已处理数
 */

/**
 * 告警处理表单类型
 * @typedef {Object} HandleForm
 * @property {string} alert_id - 告警ID
 * @property {string} status - 目标状态
 * @property {string} remark - 处理备注
 */

/**
 * 风控告警页面Alpine.js组件工厂函数
 * @function riskAlertsPage
 * @returns {Object} Alpine.js组件配置对象
 */
function riskAlertsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({ pagination: { pageSize: 20 } }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 表单提交状态 */
    submitting: false,

    /** @type {RiskAlert[]} 告警列表 */
    alerts: [],

    /** @type {RiskAlert|null} 当前选中的告警 */
    selectedAlert: null,

    /** @type {number[]} 批量选择的告警ID列表 */
    selectedAlerts: [],

    /** @type {number} 当前页码 */
    currentPage: 1,

    /** @type {number} 每页条数 */
    pageSize: 20,

    /** @type {number} 总条数 */
    totalCount: 0,

    /** @type {number} 总页数 */
    totalPages: 0,

    /** @type {boolean} 是否开启自动刷新 */
    autoRefresh: true,

    /** @type {number|null} 自动刷新定时器ID */
    refreshTimer: null,

    /**
     * 告警统计数据
     * @type {AlertStats}
     */
    stats: {
      critical: 0,
      warning: 0,
      info: 0,
      resolved: 0
    },

    /**
     * 筛选条件
     * @type {Object}
     * @property {string} level - 级别筛选
     * @property {string} type - 类型筛选
     * @property {string} status - 状态筛选
     * @property {string} time - 时间范围筛选
     */
    filters: {
      level: '',
      type: '',
      status: '',
      time: 'today'
    },

    /**
     * 告警处理表单
     * @type {HandleForm}
     */
    handleForm: {
      alert_id: '',
      status: 'reviewed',
      remark: ''
    },

    /** @type {Object[]} 处理时间线记录 */
    timeline: [],

    /** @type {Object|null} ECharts级别分布图实例 */
    levelDistChart: null,

    /** @type {Object|null} ECharts类型分布图实例 */
    typeDistChart: null,

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     * @async
     * @method init
     * @description
     * 组件挂载时自动调用，执行以下初始化流程：
     * 1. 验证登录状态
     * 2. 延迟加载ECharts库
     * 3. 初始化图表实例
     * 4. 加载告警数据
     * 5. 启动自动刷新定时器（60秒间隔）
     * 6. 绑定窗口resize事件用于图表自适应
     * @returns {Promise<void>}
     */
    async init() {
      console.log('✅ 风控告警页面初始化 (Mixin v3.1)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        await window.loadECharts()
        console.log('[RiskAlerts] ECharts 加载完成')
      } catch (error) {
        console.error('[RiskAlerts] ECharts 加载失败:', error)
      }

      // 初始化 ECharts
      this.initCharts()

      // 加载告警
      await this.loadAlerts()

      // 自动刷新（60秒）
      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
      }

      // 窗口大小改变时重绘图表
      window.addEventListener('resize', () => {
        if (this.levelDistChart) this.levelDistChart.resize()
        if (this.typeDistChart) this.typeDistChart.resize()
      })
    },

    /**
     * 组件销毁时清理资源
     * @method destroy
     * @description 清除定时器和ECharts实例，防止内存泄漏
     * @returns {void}
     */
    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
      }
      if (this.levelDistChart) {
        this.levelDistChart.dispose()
      }
      if (this.typeDistChart) {
        this.typeDistChart.dispose()
      }
    },

    // ==================== 图表初始化 ====================

    /**
     * 初始化ECharts图表实例
     * @method initCharts
     * @description
     * 在下一个tick中初始化级别分布饼图和类型分布柱状图。
     * 使用document.getElementById获取DOM容器（HTML使用id属性）。
     * @returns {void}
     */
    initCharts() {
      this.$nextTick(() => {
        // 使用 getElementById 而非 $refs（HTML 使用 id 属性）
        const levelContainer = document.getElementById('levelDistChart')
        const typeContainer = document.getElementById('typeDistChart')

        if (levelContainer && typeof echarts !== 'undefined') {
          this.levelDistChart = echarts.init(levelContainer)
          this.levelDistChart.setOption(this.getLevelChartOption([]))
        }

        if (typeContainer && typeof echarts !== 'undefined') {
          this.typeDistChart = echarts.init(typeContainer)
          this.typeDistChart.setOption(this.getTypeChartOption([], []))
        }
      })
    },

    /**
     * 获取告警级别分布饼图配置
     * @method getLevelChartOption
     * @param {Array<{value: number, name: string, itemStyle: Object}>} data - 饼图数据
     * @returns {Object} ECharts配置对象
     */
    getLevelChartOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [
          {
            name: '告警级别',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: { show: false, position: 'center' },
            emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
            labelLine: { show: false },
            data: data
          }
        ]
      }
    },

    /**
     * 获取告警类型分布柱状图配置
     * @method getTypeChartOption
     * @param {string[]} types - 类型标签数组
     * @param {number[]} counts - 各类型数量数组
     * @returns {Object} ECharts配置对象
     */
    getTypeChartOption(types, counts) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: types, axisLabel: { interval: 0, rotate: 0 } },
        yAxis: { type: 'value', name: '告警数' },
        series: [
          {
            name: '告警数量',
            type: 'bar',
            data: counts,
            itemStyle: {
              color: function (params) {
                const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666']
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
     * @method updateCharts
     * @description 根据当前告警列表数据更新级别分布饼图和类型分布柱状图
     * @returns {void}
     */
    updateCharts() {
      // 统计告警严重程度分布
      const severityStats = { critical: 0, high: 0, medium: 0, low: 0 }
      // 统计告警类型分布
      const alertTypeStats = {
        frequency_limit: 0,
        amount_limit: 0,
        duplicate_user: 0,
        suspicious_pattern: 0
      }

      this.alerts.forEach(alert => {
        const severity = alert.severity || alert.level
        if (severityStats.hasOwnProperty(severity)) {
          severityStats[severity]++
        }
        const alertType = alert.alert_type || alert.type
        if (alertTypeStats.hasOwnProperty(alertType)) {
          alertTypeStats[alertType]++
        }
      })

      // 更新级别分布饼图
      if (this.levelDistChart) {
        const levelData = [
          {
            value: severityStats.critical + severityStats.high,
            name: '严重',
            itemStyle: { color: '#dc3545' }
          },
          { value: severityStats.medium, name: '警告', itemStyle: { color: '#ffc107' } },
          { value: severityStats.low, name: '提示', itemStyle: { color: '#0dcaf0' } }
        ].filter(item => item.value > 0)

        this.levelDistChart.setOption(this.getLevelChartOption(levelData))
      }

      // 更新类型分布柱状图
      if (this.typeDistChart) {
        const typeLabels = ['频次限制', '金额告警', '重复用户', '可疑模式']
        const typeCounts = [
          alertTypeStats.frequency_limit,
          alertTypeStats.amount_limit,
          alertTypeStats.duplicate_user,
          alertTypeStats.suspicious_pattern
        ]

        this.typeDistChart.setOption(this.getTypeChartOption(typeLabels, typeCounts))
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载告警列表
     * @async
     * @method loadAlerts
     * @description
     * 根据当前筛选条件和分页参数从后端获取告警数据，
     * 更新列表、统计信息和图表。
     * @returns {Promise<void>}
     */
    async loadAlerts() {
      const result = await this.withLoading(async () => {
        const params = new URLSearchParams()
        if (this.filters.level) params.append('severity', this.filters.level)
        if (this.filters.type) params.append('alert_type', this.filters.type)
        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.time) params.append('time_range', this.filters.time)
        params.append('page', this.currentPage)
        params.append('page_size', this.pageSize)

        const url =
          API_ENDPOINTS.RISK_ALERT.LIST + (params.toString() ? `?${params.toString()}` : '')
        const response = await apiRequest(url)

        if (response && response.success) {
          return response.data
        }
        throw new Error(response?.message || '获取告警列表失败')
      })

      if (result.success) {
        this.alerts = result.data.items || result.data.alerts || result.data.list || []
        if (!Array.isArray(this.alerts)) {
          this.alerts = []
        }
        // 更新分页信息
        this.totalCount = result.data.total || result.data.totalCount || this.alerts.length
        this.totalPages = Math.ceil(this.totalCount / this.pageSize) || 1

        this.updateStats(result.data.stats || this.calculateStatsFromAlerts())
        this.updateCharts()
      }
    },

    /**
     * 从当前告警列表计算统计数据
     * @method calculateStatsFromAlerts
     * @description 当后端未返回统计数据时，从告警列表中计算
     * @returns {AlertStats} 计算得出的统计数据
     */
    calculateStatsFromAlerts() {
      return {
        critical: this.alerts.filter(
          a => (a.severity || a.level) === 'critical' || (a.severity || a.level) === 'high'
        ).length,
        warning: this.alerts.filter(
          a => (a.severity || a.level) === 'warning' || (a.severity || a.level) === 'medium'
        ).length,
        info: this.alerts.filter(
          a => (a.severity || a.level) === 'info' || (a.severity || a.level) === 'low'
        ).length,
        resolved: this.alerts.filter(a => a.status === 'reviewed' || a.status === 'resolved').length
      }
    },

    /**
     * 更新统计数据
     * @method updateStats
     * @param {Object} stats - 后端返回或计算的统计数据
     * @description 合并后端统计数据和前端计算结果
     * @returns {void}
     */
    updateStats(stats) {
      this.stats.critical =
        stats.critical ||
        stats.high ||
        this.alerts.filter(
          a => (a.severity || a.level) === 'critical' || (a.severity || a.level) === 'high'
        ).length
      this.stats.warning =
        stats.warning ||
        stats.medium ||
        this.alerts.filter(
          a => (a.severity || a.level) === 'warning' || (a.severity || a.level) === 'medium'
        ).length
      this.stats.info =
        stats.info ||
        stats.low ||
        this.alerts.filter(
          a => (a.severity || a.level) === 'info' || (a.severity || a.level) === 'low'
        ).length
      this.stats.resolved =
        stats.resolved ||
        stats.reviewed ||
        this.alerts.filter(a => a.status === 'reviewed' || a.status === 'resolved').length
    },

    // ==================== 分页操作 ====================

    /**
     * 跳转到上一页
     * @method prevPage
     * @description 如果当前不是第一页，则减少页码并重新加载数据
     * @returns {void}
     */
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--
        this.loadAlerts()
      }
    },

    /**
     * 跳转到下一页
     * @method nextPage
     * @description 如果当前不是最后一页，则增加页码并重新加载数据
     * @returns {void}
     */
    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++
        this.loadAlerts()
      }
    },

    // ==================== 自动刷新控制 ====================

    /**
     * 切换自动刷新状态
     * @method toggleAutoRefresh
     * @description 开启或关闭60秒自动刷新定时器
     * @returns {void}
     */
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

    /**
     * 全选/取消全选告警
     * @method toggleAllAlerts
     * @param {boolean} checked - 是否选中
     * @description 根据checked状态选择所有告警或清空选择
     * @returns {void}
     */
    toggleAllAlerts(checked) {
      if (checked) {
        this.selectedAlerts = this.alerts.map(a => a.alert_id)
      } else {
        this.selectedAlerts = []
      }
    },

    /**
     * 批量处理选中的告警
     * @async
     * @method batchResolve
     * @description 显示确认对话框后批量将选中告警标记为已审核
     * @returns {Promise<void>}
     */
    async batchResolve() {
      if (this.selectedAlerts.length === 0) {
        this.showError('请先选择要处理的告警')
        return
      }

      const result = await this.confirmAndExecute(
        `确定要批量处理选中的 ${this.selectedAlerts.length} 条告警吗？`,
        async () => {
          // 批量处理逻辑
          const promises = this.selectedAlerts.map(alertId =>
            apiRequest(API.buildURL(API_ENDPOINTS.RISK_ALERT.REVIEW, { alert_id: alertId }), {
              method: 'POST',
              body: JSON.stringify({ status: 'reviewed', review_notes: '批量处理' })
            })
          )
          await Promise.all(promises)
          return { count: this.selectedAlerts.length }
        },
        { showSuccess: true, successMessage: `已成功处理 ${this.selectedAlerts.length} 条告警` }
      )

      if (result.success) {
        this.selectedAlerts = []
        await this.loadAlerts()
      }
    },

    // ==================== 告警操作 ====================

    /**
     * 查看告警详情
     * @method viewAlertDetail
     * @param {RiskAlert} alert - 告警对象
     * @description 设置选中告警并加载处理时间线
     * @returns {void}
     */
    viewAlertDetail(alert) {
      this.selectedAlert = alert
      this.loadAlertTimeline(alert.alert_id)
    },

    /**
     * 选择告警（兼容别名方法）
     * @async
     * @method selectAlert
     * @param {number} alertId - 告警ID
     * @returns {Promise<void>}
     */
    async selectAlert(alertId) {
      this.selectedAlert = this.alerts.find(a => a.alert_id === alertId)
      if (!this.selectedAlert) return

      // 加载处理时间线
      await this.loadAlertTimeline(alertId)
    },

    /**
     * 加载告警处理时间线
     * @async
     * @method loadAlertTimeline
     * @param {number} alertId - 告警ID
     * @description 从选中告警的审核信息构建时间线记录
     * @returns {Promise<void>}
     */
    async loadAlertTimeline(alertId) {
      if (this.selectedAlert && this.selectedAlert.reviewed_at) {
        this.timeline = [
          {
            created_at: this.selectedAlert.reviewed_at,
            status: this.selectedAlert.status,
            action: `状态更新为: ${this.getStatusText(this.selectedAlert.status)}`,
            remark: this.selectedAlert.review_notes,
            operator_name: this.selectedAlert.reviewer_info?.nickname || '管理员'
          }
        ]
      } else {
        this.timeline = []
      }
    },

    /**
     * 打开告警处理弹窗
     * @method openHandleModal
     * @param {RiskAlert|number} alertOrId - 告警对象或告警ID
     * @description 初始化处理表单并显示处理弹窗
     * @returns {void}
     */
    openHandleModal(alertOrId) {
      const alertId = typeof alertOrId === 'object' ? alertOrId.alert_id : alertOrId
      this.handleForm = {
        alert_id: alertId,
        status: 'reviewed',
        remark: ''
      }
      this.showModal('handleModal')
    },

    /**
     * 提交告警处理
     * @async
     * @method submitHandle
     * @description 向后端提交告警处理请求（审核/处理状态更新）
     * @returns {Promise<void>}
     */
    async submitHandle() {
      if (!this.handleForm.alert_id) return

      this.submitting = true
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.RISK_ALERT.REVIEW, { alert_id: this.handleForm.alert_id }),
          {
            method: 'POST',
            body: JSON.stringify({
              status: this.handleForm.status,
              review_notes: this.handleForm.remark
            })
          }
        )

        if (response && response.success) {
          this.hideModal('handleModal')
          this.showSuccess(`告警已${this.handleForm.status === 'reviewed' ? '复核' : '处理'}`)
          await this.loadAlerts()
          if (this.selectedAlert && this.selectedAlert.alert_id == this.handleForm.alert_id) {
            await this.loadAlertTimeline(this.handleForm.alert_id)
          }
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        console.error('处理告警失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    },

    /**
     * 标记所有告警为已读
     * @async
     * @method markAllRead
     * @description 显示确认对话框后批量标记所有告警为已读状态
     * @returns {Promise<void>}
     */
    async markAllRead() {
      const result = await this.confirmAndExecute(
        '确定要将所有告警标记为已读吗？',
        async () => {
          const response = await apiRequest(API_ENDPOINTS.RISK_ALERT.MARK_ALL_READ, {
            method: 'POST'
          })

          if (response && response.success) {
            return response.data
          }
          throw new Error(response?.message || '标记失败')
        },
        { showSuccess: true, successMessage: '已全部标记为已读' }
      )

      if (result.success) {
        await this.loadAlerts()
      }
    },

    // ==================== 辅助方法（HTML 模板使用） ====================

    /**
     * 获取告警级别中文文本
     * @method getLevelText
     * @param {string} level - 级别代码
     * @returns {string} 级别中文文本
     */
    getLevelText(level) {
      const labels = {
        critical: '严重',
        high: '高危',
        medium: '中等',
        warning: '警告',
        low: '低',
        info: '提示'
      }
      return labels[level] || level || '-'
    },

    /**
     * 获取告警类型中文文本
     * @method getTypeText
     * @param {string} type - 类型代码
     * @returns {string} 类型中文文本
     */
    getTypeText(type) {
      const labels = {
        frequency_limit: '频次限制',
        amount_limit: '金额告警',
        duplicate_user: '重复用户',
        suspicious_pattern: '可疑模式',
        fraud: '欺诈检测',
        abuse: '滥用检测',
        anomaly: '异常行为',
        limit: '限额告警',
        login_anomaly: '登录异常',
        high_frequency: '高频操作',
        large_transaction: '大额交易',
        suspicious_behavior: '可疑行为'
      }
      return labels[type] || type || '-'
    },

    /**
     * 获取告警状态中文文本
     * @method getStatusText
     * @param {string} status - 状态代码
     * @returns {string} 状态中文文本
     */
    getStatusText(status) {
      const labels = {
        pending: '待处理',
        reviewed: '已审核',
        resolved: '已处理',
        ignored: '已忽略',
        processing: '处理中',
        false_positive: '误报'
      }
      return labels[status] || status || '-'
    },

    /**
     * 格式化日期为中文显示格式
     * @method formatDate
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      try {
        return new Date(dateStr).toLocaleString('zh-CN')
      } catch {
        return dateStr
      }
    },

    // ==================== 原有辅助方法（向后兼容） ====================

    /**
     * 将severity映射为CSS类名使用的级别
     * @method mapSeverityToLevel
     * @param {string} severity - 严重程度代码
     * @returns {string} 对应的CSS级别类名后缀
     */
    mapSeverityToLevel(severity) {
      const map = {
        critical: 'critical',
        high: 'critical',
        medium: 'warning',
        warning: 'warning',
        low: 'info',
        info: 'info'
      }
      return map[severity] || 'info'
    },

    /**
     * 获取告警类型对应的Bootstrap图标名
     * @method getAlertIcon
     * @param {string} alertType - 告警类型代码
     * @returns {string} Bootstrap图标名（不含bi-前缀）
     */
    getAlertIcon(alertType) {
      const icons = {
        frequency_limit: 'speedometer2',
        amount_limit: 'cash-stack',
        duplicate_user: 'people',
        suspicious_pattern: 'shield-exclamation',
        fraud: 'shield-exclamation',
        abuse: 'person-x',
        anomaly: 'activity',
        limit: 'speedometer2'
      }
      return icons[alertType] || 'exclamation-triangle'
    },

    /**
     * 获取告警类型对应的标题文本
     * @method getAlertTitle
     * @param {string} alertType - 告警类型代码
     * @returns {string} 告警标题文本
     */
    getAlertTitle(alertType) {
      const titles = {
        frequency_limit: '频次限制告警',
        amount_limit: '金额超限告警',
        duplicate_user: '重复用户告警',
        suspicious_pattern: '可疑模式告警',
        fraud: '欺诈检测告警',
        abuse: '滥用检测告警',
        anomaly: '异常行为告警',
        limit: '限额超标告警'
      }
      return titles[alertType] || '风控告警'
    },

    /**
     * 获取告警类型标签（兼容别名）
     * @method getAlertTypeLabel
     * @param {string} alertType - 告警类型代码
     * @returns {string} 类型标签文本
     */
    getAlertTypeLabel(alertType) {
      return this.getTypeText(alertType)
    },

    /**
     * 获取严重程度对应的Bootstrap徽章CSS类
     * @method getSeverityBadgeClass
     * @param {string} severity - 严重程度代码
     * @returns {string} Bootstrap徽章CSS类名
     */
    getSeverityBadgeClass(severity) {
      const classes = {
        critical: 'bg-danger',
        high: 'bg-danger',
        medium: 'bg-warning text-dark',
        warning: 'bg-warning text-dark',
        low: 'bg-info',
        info: 'bg-info'
      }
      return classes[severity] || 'bg-secondary'
    },

    /**
     * 获取严重程度带emoji的标签文本
     * @method getSeverityLabel
     * @param {string} severity - 严重程度代码
     * @returns {string} 带emoji的严重程度标签
     */
    getSeverityLabel(severity) {
      const labels = {
        critical: '🔴 严重',
        high: '🔴 高危',
        medium: '🟡 中等',
        warning: '🟡 警告',
        low: '🔵 低',
        info: '🔵 提示'
      }
      return labels[severity] || severity
    },

    /**
     * 获取状态对应的Bootstrap徽章CSS类
     * @method getStatusBadgeClass
     * @param {string} status - 状态代码
     * @returns {string} Bootstrap徽章CSS类名
     */
    getStatusBadgeClass(status) {
      const classes = {
        pending: 'bg-danger',
        reviewed: 'bg-success',
        ignored: 'bg-secondary',
        processing: 'bg-warning text-dark',
        resolved: 'bg-success'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取状态标签文本（兼容别名）
     * @method getStatusLabel
     * @param {string} status - 状态代码
     * @returns {string} 状态标签文本
     */
    getStatusLabel(status) {
      return this.getStatusText(status)
    },

    /**
     * 截断文本并添加省略号
     * @method truncateText
     * @param {string|null} text - 要截断的文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     */
    truncateText(text, maxLength) {
      if (!text) return ''
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    },

    /**
     * 格式化时间为相对时间显示
     * @method formatTime
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 相对时间文本，如 '5分钟前'、'2小时前'
     */
    formatTime(dateStr) {
      if (!dateStr) return '-'
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      return date.toLocaleDateString('zh-CN')
    },

    /**
     * 格式化日期时间（兼容别名）
     * @method formatDateTime
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 格式化后的日期时间字符串
     */
    formatDateTime(dateStr) {
      return this.formatDate(dateStr)
    },

    /**
     * HTML转义防止XSS攻击
     * @method escapeHtml
     * @param {string|null} str - 要转义的字符串
     * @returns {string} 转义后的安全HTML字符串
     */
    escapeHtml(str) {
      if (!str) return ''
      const div = document.createElement('div')
      div.textContent = str
      return div.innerHTML
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

/**
 * 注册Alpine.js组件
 * @description 监听alpine:init事件，注册riskAlertsPage组件到Alpine
 * @listens alpine:init
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('riskAlertsPage', riskAlertsPage)
  console.log('✅ [RiskAlertsPage] Alpine 组件已注册 (Mixin v3.1)')
})
