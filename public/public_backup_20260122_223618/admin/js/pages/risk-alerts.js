/**
 * 风控告警页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/risk-alerts.js
 * @description 风控告警管理、告警处理、统计分析等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 使用 modalMixin 管理模态框
 * - 保留 ECharts 图表功能
 * - 统一使用 showSuccess/showError 替代 alert
 */

function riskAlertsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),
    
    // ==================== 页面特有状态 ====================
    
    /** 提交状态 */
    submitting: false,
    
    /** 告警数据 */
    alerts: [],
    selectedAlert: null,
    
    /** 统计数据 */
    stats: {
      critical: 0,
      warning: 0,
      info: 0,
      resolved: 0
    },
    
    /** 筛选条件 */
    filters: {
      level: '',
      type: '',
      status: '',
      time: 'today'
    },
    
    /** 处理表单 */
    handleForm: {
      alert_id: '',
      status: 'reviewed',
      remark: ''
    },
    
    /** 处理时间线 */
    timeline: [],
    
    /** ECharts 实例 */
    levelDistChart: null,
    typeDistChart: null,
    
    /** 自动刷新定时器 */
    refreshTimer: null,
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    async init() {
      console.log('✅ 风控告警页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      // 初始化 ECharts
      this.initCharts()
      
      // 加载告警
      await this.loadAlerts()
      
      // 自动刷新（60秒）
      this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
      
      // 窗口大小改变时重绘图表
      window.addEventListener('resize', () => {
        if (this.levelDistChart) this.levelDistChart.resize()
        if (this.typeDistChart) this.typeDistChart.resize()
      })
    },
    
    /**
     * 组件销毁时清理
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
     * 初始化 ECharts 图表
     */
    initCharts() {
      this.$nextTick(() => {
        const levelContainer = this.$refs.levelDistChart
        const typeContainer = this.$refs.typeDistChart
        
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
     * 告警级别分布图配置
     */
    getLevelChartOption(data) {
      return {
        tooltip: { trigger: 'item', formatter: '{a} <br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left', top: 'center' },
        series: [{
          name: '告警级别',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 18, fontWeight: 'bold' } },
          labelLine: { show: false },
          data: data
        }]
      }
    },
    
    /**
     * 告警类型分布图配置
     */
    getTypeChartOption(types, counts) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: types, axisLabel: { interval: 0, rotate: 0 } },
        yAxis: { type: 'value', name: '告警数' },
        series: [{
          name: '告警数量',
          type: 'bar',
          data: counts,
          itemStyle: {
            color: function(params) {
              const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666']
              return colors[params.dataIndex % colors.length]
            },
            borderRadius: [4, 4, 0, 0]
          },
          label: { show: true, position: 'top' }
        }]
      }
    },
    
    /**
     * 更新图表数据
     */
    updateCharts() {
      // 统计告警严重程度分布
      const severityStats = { critical: 0, high: 0, medium: 0, low: 0 }
      // 统计告警类型分布
      const alertTypeStats = { frequency_limit: 0, amount_limit: 0, duplicate_user: 0, suspicious_pattern: 0 }
      
      this.alerts.forEach(alert => {
        if (severityStats.hasOwnProperty(alert.severity)) {
          severityStats[alert.severity]++
        }
        if (alertTypeStats.hasOwnProperty(alert.alert_type)) {
          alertTypeStats[alert.alert_type]++
        }
      })
      
      // 更新级别分布饼图
      if (this.levelDistChart) {
        const levelData = [
          { value: severityStats.critical + severityStats.high, name: '严重', itemStyle: { color: '#dc3545' } },
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
     */
    async loadAlerts() {
      const result = await this.withLoading(async () => {
        const params = new URLSearchParams()
        if (this.filters.level) params.append('severity', this.filters.level)
        if (this.filters.type) params.append('alert_type', this.filters.type)
        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.time) params.append('time_range', this.filters.time)

        const url = API_ENDPOINTS.RISK_ALERT.LIST + (params.toString() ? `?${params.toString()}` : '')
        const response = await apiRequest(url)

        if (response && response.success) {
          return response.data
        }
        throw new Error(response?.message || '获取告警列表失败')
      })

      if (result.success) {
        this.alerts = result.data.items || result.data.alerts || []
        if (!Array.isArray(this.alerts)) {
          this.alerts = []
        }
        this.updateStats(result.data.stats || this.calculateStatsFromAlerts())
        this.updateCharts()
      }
    },
    
    /**
     * 计算统计数据
     */
    calculateStatsFromAlerts() {
      return {
        critical: this.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length,
        warning: this.alerts.filter(a => a.severity === 'warning' || a.severity === 'medium').length,
        info: this.alerts.filter(a => a.severity === 'info' || a.severity === 'low').length,
        resolved: this.alerts.filter(a => a.status === 'reviewed').length
      }
    },
    
    /**
     * 更新统计
     */
    updateStats(stats) {
      this.stats.critical = stats.critical || stats.high || this.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length
      this.stats.warning = stats.warning || stats.medium || this.alerts.filter(a => a.severity === 'warning' || a.severity === 'medium').length
      this.stats.info = stats.info || stats.low || this.alerts.filter(a => a.severity === 'info' || a.severity === 'low').length
      this.stats.resolved = stats.resolved || stats.reviewed || this.alerts.filter(a => a.status === 'reviewed').length
    },
    
    // ==================== 告警操作 ====================
    
    /**
     * 选择告警
     */
    async selectAlert(alertId) {
      this.selectedAlert = this.alerts.find(a => a.alert_id === alertId)
      if (!this.selectedAlert) return
      
      // 加载处理时间线
      await this.loadAlertTimeline(alertId)
    },
    
    /**
     * 加载告警时间线
     */
    async loadAlertTimeline(alertId) {
      if (this.selectedAlert && this.selectedAlert.reviewed_at) {
        this.timeline = [{
          created_at: this.selectedAlert.reviewed_at,
          status: this.selectedAlert.status,
          remark: this.selectedAlert.review_notes,
          operator_name: this.selectedAlert.reviewer_info?.nickname || '管理员'
        }]
      } else {
        this.timeline = []
      }
    },
    
    /**
     * 打开处理弹窗
     */
    openHandleModal(alertId) {
      this.handleForm = {
        alert_id: alertId,
        status: 'reviewed',
        remark: ''
      }
      this.showModal('handleModal')
    },
    
    /**
     * 提交处理
     */
    async submitHandle() {
      if (!this.handleForm.alert_id) return
      
      this.submitting = true
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.RISK_ALERT.REVIEW, { alert_id: this.handleForm.alert_id }), {
          method: 'POST',
          body: JSON.stringify({
            status: this.handleForm.status,
            review_notes: this.handleForm.remark
          })
        })

        if (response && response.success) {
          this.hideModal('handleModal')
          this.showSuccess(`告警已${this.handleForm.status === 'reviewed' ? '复核' : '忽略'}`)
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
     * 标记全部已读
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
    
    // ==================== 辅助方法 ====================
    
    /**
     * 将 severity 映射为 CSS 级别
     */
    mapSeverityToLevel(severity) {
      const map = { 'critical': 'critical', 'high': 'critical', 'medium': 'warning', 'warning': 'warning', 'low': 'info', 'info': 'info' }
      return map[severity] || 'info'
    },
    
    /**
     * 获取告警图标
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
     * 获取告警标题
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
     * 获取告警类型标签
     */
    getAlertTypeLabel(alertType) {
      const labels = {
        frequency_limit: '⏱️ 频次限制',
        amount_limit: '💰 金额告警',
        duplicate_user: '👥 重复用户',
        suspicious_pattern: '🔍 可疑模式',
        fraud: '🛡️ 欺诈检测',
        abuse: '👤 滥用检测',
        anomaly: '📊 异常行为',
        limit: '⚡ 限额告警'
      }
      return labels[alertType] || alertType
    },
    
    /**
     * 获取 severity 徽章类
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
     * 获取 severity 标签
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
     * 获取状态徽章类
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
     * 获取状态标签
     */
    getStatusLabel(status) {
      const labels = {
        pending: '待处理',
        reviewed: '已复核',
        ignored: '已忽略',
        processing: '处理中',
        resolved: '已解决'
      }
      return labels[status] || status
    },
    
    /**
     * 截断文本
     */
    truncateText(text, maxLength) {
      if (!text) return ''
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    },
    
    /**
     * 格式化时间（相对时间）
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
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * HTML 转义
     */
    escapeHtml(str) {
      if (!str) return ''
      const div = document.createElement('div')
      div.textContent = str
      return div.innerHTML
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('riskAlertsPage', riskAlertsPage)
  console.log('✅ [RiskAlertsPage] Alpine 组件已注册 (Mixin v3.0)')
})
