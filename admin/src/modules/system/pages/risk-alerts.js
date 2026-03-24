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
 * @requires SYSTEM_ENDPOINTS - 系统API端点配置
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用
 * <div x-data="riskAlertsPage">
 *   <div id="levelDistChart" style="height: 300px;"></div>
 *   <table>
 *     <template x-for="alert in alerts" :key="alert.risk_alert_id">...</template>
 *   </table>
 * </div>
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS, SystemAPI } from '../../../api/system/index.js'
import { TRADE_ENDPOINTS } from '../../../api/market/trade.js'
import { buildURL, request } from '../../../api/base.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { io } from 'socket.io-client'

/** 获取认证Token */
const getToken = () => localStorage.getItem('admin_token')

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}
/**
 * 风控告警对象类型
 * @typedef {Object} RiskAlert
 * @property {number} risk_alert_id - 风控告警ID（主键）
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
 * @property {string} risk_alert_id - 风控告警ID（主键）
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
    ...createPageMixin({ pagination: { page_size: 20 } }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 表单提交状态 */
    submitting: false,

    /** @type {RiskAlert[]} 告警列表 */
    alerts: [],

    /** @type {RiskAlert|null} 当前选中的告警 */
    selectedAlert: null,

    /** @type {number[]} 批量选择的告警ID列表 */
    selectedAlerts: [],

    // ========== data-table 列配置 ==========
    alertsTableColumns: [
      { key: 'risk_alert_id', label: '告警ID', sortable: true, type: 'code' },
      {
        key: 'severity',
        label: '级别',
        type: 'status',
        statusMap: {
          critical: { class: 'red', label: '严重' },
          high: { class: 'red', label: '高' },
          medium: { class: 'yellow', label: '中' },
          low: { class: 'blue', label: '低' }
        }
      },
      {
        key: 'alert_type',
        label: '类型',
        render: (val, row) => row.alert_type_display || val || '-'
      },
      {
        key: 'target_user_info',
        label: '关联用户',
        render: val => val?.nickname || val?.user_id || '-'
      },
      { key: 'alert_message', label: '描述', type: 'truncate', maxLength: 40 },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          pending: { class: 'yellow', label: '待处理' },
          reviewed: { class: 'blue', label: '已审核' },
          resolved: { class: 'green', label: '已处理' },
          ignored: { class: 'gray', label: '已忽略' }
        }
      },
      { key: 'created_at', label: '时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '120px',
        actions: [
          { name: 'detail', label: '详情', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'handle',
            label: '处理',
            class: 'text-green-500 hover:text-green-700',
            condition: row => row.status === 'pending'
          }
        ]
      }
    ],

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

    /** @type {string|null} 上次数据更新时间（#2） */
    lastUpdateTime: null,

    // ========== P2#11: 市场价格异常监控状态 ==========
    /** @type {Object|null} 市场监控数据 */
    marketMonitor: null,
    /** @type {boolean} 市场监控加载状态 */
    loadingMarketMonitor: false,

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
     * 筛选条件（字段名与后端API参数一致）
     * @type {Object}
     * @property {string} severity - 严重程度筛选
     * @property {string} alert_type - 告警类型筛选
     * @property {string} status - 状态筛选
     * @property {string} time - 时间范围筛选（默认全部，不限制时间）
     */
    filters: {
      severity: '',
      alert_type: '',
      status: '',
      time: '' // 默认为空（显示全部时间范围），避免筛选掉历史数据
    },

    /**
     * 告警处理表单
     * @type {HandleForm}
     */
    handleForm: {
      risk_alert_id: '', // 告警ID（主键）
      status: 'reviewed',
      remark: ''
    },

    /** @type {Object[]} 处理时间线记录 */
    timeline: [],

    /** @type {Object|null} ECharts级别分布图实例 */
    levelDistChart: null,

    /** @type {Object|null} ECharts类型分布图实例 */
    typeDistChart: null,

    /** ECharts 核心模块引用 */
    _echarts: null,

    /** @type {Object|null} WebSocket连接实例 */
    wsConnection: null,

    /** @type {boolean} WebSocket连接状态 */
    wsConnected: false,

    /** @type {boolean} 浏览器通知权限状态 */
    notificationEnabled: false,

    // ==================== P2-8: 告警疲劳预防机制 ====================

    /**
     * 静默的告警配置
     * @type {Object}
     * @property {Set} risk_alert_ids - 静默的告警ID集合
     * @property {Set} alert_types - 静默的告警类型集合
     * @property {Set} user_ids - 静默的用户ID集合
     */
    silencedAlerts: {
      risk_alert_ids: new Set(), // 静默的告警ID集合
      alert_types: new Set(),
      user_ids: new Set()
    },

    /**
     * 告警合并记录 - 记录最近1小时内各类型的告警
     * @type {Map<string, {count: number, first_time: number, last_alert: Object}>}
     */
    alertMergeTracker: new Map(),

    /**
     * 已升级告警的ID集合
     * @type {Set<number>}
     */
    escalatedAlertIds: new Set(),

    /**
     * 告警升级检查定时器
     * @type {number|null}
     */
    escalationTimer: null,

    /**
     * 是否显示合并告警弹窗
     * @type {boolean}
     */
    showMergedAlertsModal: false,

    /**
     * 当前合并告警组
     * @type {Object|null}
     */
    currentMergedAlertGroup: null,

    // ==================== 静默规则 Tab 状态 ====================

    /** @type {string} 当前激活的 Tab ('alerts' | 'silence') */
    activeTab: 'alerts',

    /** @type {boolean} 静默规则模态框可见 */
    showSilenceRuleModal: false,

    /** @type {boolean} 静默规则提交中 */
    silenceRuleSubmitting: false,

    /** @type {Object} 静默规则表单 */
    silenceRuleForm: {
      alert_silence_rule_id: null,
      rule_name: '',
      alert_type: 'win_rate',
      alert_level: 'all',
      start_time: '',
      end_time: '',
      effective_start_date: '',
      effective_end_date: '',
      is_active: true
    },

    /** @type {Object[]} data-table 列配置 - 静默规则 */
    silenceRulesTableColumns: [
      { key: 'alert_silence_rule_id', label: 'ID', sortable: true, type: 'code' },
      { key: 'rule_name', label: '规则名称' },
      {
        key: 'alert_type',
        label: '告警类型',
        type: 'status',
        statusMap: {
          win_rate: { class: 'yellow', label: '中奖率' },
          budget: { class: 'purple', label: '预算' },
          inventory: { class: 'orange', label: '库存' },
          user: { class: 'gray', label: '用户' },
          frequency_limit: { class: 'red', label: '频次超限' },
          amount_limit: { class: 'red', label: '金额超限' },
          duplicate_user: { class: 'red', label: '重复用户' },
          suspicious_pattern: { class: 'red', label: '可疑模式' }
        }
      },
      {
        key: 'alert_level',
        label: '级别',
        type: 'status',
        statusMap: {
          all: { class: 'gray', label: '全部' },
          critical: { class: 'red', label: '紧急' },
          warning: { class: 'yellow', label: '警告' },
          info: { class: 'blue', label: '信息' }
        }
      },
      {
        key: 'time_range',
        label: '静默时段',
        render: (_, row) => {
          if (row.start_time && row.end_time) return `${row.start_time} ~ ${row.end_time}`
          return '全天'
        }
      },
      {
        key: 'date_range',
        label: '生效日期',
        render: (_, row) => {
          if (row.effective_start_date && row.effective_end_date)
            return `${row.effective_start_date} ~ ${row.effective_end_date}`
          if (row.effective_start_date) return `${row.effective_start_date} 起`
          if (row.effective_end_date) return `至 ${row.effective_end_date}`
          return '长期'
        }
      },
      {
        key: 'is_active',
        label: '状态',
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '启用' },
          false: { class: 'gray', label: '停用' }
        }
      },
      { key: 'created_at', label: '创建时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '150px',
        actions: [
          { name: 'edit_silence', label: '编辑', class: 'text-blue-600 hover:text-blue-800' },
          { name: 'delete_silence', label: '删除', class: 'text-red-500 hover:text-red-700' }
        ]
      }
    ],

    // ==================== data-table 数据源 ====================

    /**
     * data-table 数据源：风控告警列表
     */
    async fetchAlertsTableData(params) {
      const queryParams = new URLSearchParams()
      if (params.severity) queryParams.append('severity', params.severity)
      if (params.alert_type) queryParams.append('alert_type', params.alert_type)
      if (params.status) queryParams.append('status', params.status)
      queryParams.append('page', params.page || 1)
      queryParams.append('page_size', params.page_size || 20)

      const url =
        SYSTEM_ENDPOINTS.RISK_ALERT_LIST +
        (queryParams.toString() ? `?${queryParams.toString()}` : '')
      const response = await apiRequest(url)

      if (response?.success) {
        const items = response.data.items || response.data.alerts || response.data.list || []
        const total = response.data.total || response.data.totalCount || items.length
        this.alerts = items
        this.totalCount = total
        this.updateStats(response.data.stats || this.calculateStatsFromAlerts())
        this.updateCharts()
        return { items, total }
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
        case 'handle':
          this.openHandleModal(row)
          break
        default:
          logger.warn('[RiskAlerts] 未知操作:', action)
      }
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('风控告警页面初始化 (ES Module v3.2)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 动态加载 ECharts（懒加载优化）
      try {
        this._echarts = await loadECharts()
        logger.info('[RiskAlerts] ECharts 加载完成', { hasEcharts: !!this._echarts })
      } catch (error) {
        logger.error('[RiskAlerts] ECharts 加载失败:', error)
        this.showError('图表组件加载失败，部分功能可能不可用')
      }

      // 初始化 ECharts
      this.initCharts()

      // 加载告警
      await this.loadAlerts()

      // P2#11: 加载市场价格监控数据
      this.loadMarketPriceMonitor()

      // 自动刷新（60秒）
      if (this.autoRefresh) {
        this.refreshTimer = setInterval(() => this.loadAlerts(), 60000)
      }

      // 窗口大小改变时重绘图表（命名引用以便清理）
      this._resizeHandler = () => {
        if (this.levelDistChart) this.levelDistChart.resize()
        if (this.typeDistChart) this.typeDistChart.resize()
      }
      window.addEventListener('resize', this._resizeHandler)

      // 初始化WebSocket实时推送
      this.initWebSocket()

      // 请求浏览器通知权限
      this.requestNotificationPermission()

      // 页面卸载时断开WebSocket（命名引用以便清理）
      this._beforeUnloadHandler = () => {
        if (this.wsConnection) {
          this.wsConnection.disconnect()
        }
      }
      window.addEventListener('beforeunload', this._beforeUnloadHandler)

      // P2-8: 启动告警升级检查（每分钟检查一次）
      this.startEscalationChecker()
    },

    /**
     * 组件销毁时清理资源
     * @method destroy
     * @description 清除定时器和ECharts实例，防止内存泄漏
     * @returns {void}
     */
    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler)
      }
      if (this._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      }
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
      }
      if (this.levelDistChart) {
        this.levelDistChart.dispose()
      }
      if (this.typeDistChart) {
        this.typeDistChart.dispose()
      }
      if (this.wsConnection) {
        this.wsConnection.disconnect()
      }
      // P2-8: 清理告警升级定时器
      if (this.escalationTimer) {
        clearInterval(this.escalationTimer)
      }
    },

    // ==================== WebSocket实时推送 ====================

    /**
     * 初始化WebSocket连接
     * @method initWebSocket
     * @description 连接WebSocket服务器并加入管理员房间以接收实时告警推送
     * @returns {void}
     */
    initWebSocket() {
      try {
        const wsUrl = window.location.origin
        logger.info('[RiskAlerts] 初始化WebSocket连接:', wsUrl)

        this.wsConnection = io(wsUrl, {
          auth: { token: getToken() },
          transports: ['websocket', 'polling'],
          path: '/socket.io'
        })

        this.wsConnection.on('connect', () => {
          logger.info('[RiskAlerts] WebSocket连接成功')
          this.wsConnected = true

          // 加入管理员房间以接收告警推送
          this.wsConnection.emit('join_admin_room')
          logger.info('[RiskAlerts] 请求加入管理员房间')
        })

        // 监听加入房间确认（可选）
        this.wsConnection.on('joined_admin_room', () => {
          logger.info('[RiskAlerts] 已成功加入管理员房间')
        })

        // 监听新告警推送
        this.wsConnection.on('new_alert', alert => {
          logger.info('[RiskAlerts] 收到新告警:', alert)
          this.handleNewAlert(alert)
        })

        // 监听未确认告警列表推送（管理员登录时）
        this.wsConnection.on('pending_alerts', alerts => {
          logger.info('[RiskAlerts] 收到未确认告警列表:', alerts?.length || 0)
          if (alerts && alerts.length > 0) {
            this.handlePendingAlerts(alerts)
          }
        })

        this.wsConnection.on('disconnect', reason => {
          logger.info('[RiskAlerts] WebSocket连接已断开:', reason)
          this.wsConnected = false
        })

        this.wsConnection.on('connect_error', error => {
          logger.warn('[RiskAlerts] WebSocket连接失败:', error.message)
          this.wsConnected = false
        })

        this.wsConnection.on('error', error => {
          logger.warn('[RiskAlerts] WebSocket错误:', error.message)
        })
      } catch (error) {
        logger.error('[RiskAlerts] WebSocket初始化失败:', error)
      }
    },

    /**
     * 处理新告警推送
     * @method handleNewAlert
     * @param {Object} alert - 新告警对象
     * @returns {void}
     */
    handleNewAlert(alert) {
      // P2-8: 检查是否被静默
      if (this.isAlertSilenced(alert)) {
        logger.info('[RiskAlerts] 告警已静默，跳过:', alert.risk_alert_id)
        return
      }

      // P2-8: 应用告警合并策略
      const mergeResult = this.applyAlertMerging(alert)
      if (mergeResult.merged) {
        // 告警被合并，只更新计数
        logger.info('[RiskAlerts] 告警已合并:', mergeResult.message)
        if (mergeResult.showBatchAlert) {
          this.showInfo(`批量告警: 同类告警 ${mergeResult.count} 条，点击查看详情`)
        }
        return
      }

      // 添加到告警列表顶部
      this.alerts.unshift(alert)

      // 更新统计数据
      if (alert.severity === 'critical' || alert.severity === 'high') {
        this.stats.critical++
      } else if (alert.severity === 'medium') {
        this.stats.warning++
      } else {
        this.stats.info++
      }

      // 更新图表
      this.updateCharts()

      // 显示桌面通知
      this.showAlertNotification(alert)

      // 播放提示音
      this.playAlertSound(alert.severity)

      // 显示页面内通知
      const severityText = this.getSeverityLabel(alert.severity)
      this.showInfo(`新告警: ${severityText} - ${alert.message}`)
    },

    /**
     * 处理未确认告警列表推送
     * @method handlePendingAlerts
     * @param {Array} alerts - 未确认告警列表
     * @returns {void}
     */
    handlePendingAlerts(alerts) {
      // 显示桌面通知提醒有未处理的告警
      if (this.notificationEnabled && alerts.length > 0) {
        new Notification('风控告警中心', {
          body: `您有 ${alerts.length} 条未确认的告警需要处理`,
          icon: '/admin/images/logo.png',
          tag: 'pending-alerts'
        })
      }

      // 如果当前告警列表为空，使用推送的数据
      if (this.alerts.length === 0) {
        this.alerts = alerts
        this.updateCharts()
      }
    },

    /**
     * 请求浏览器通知权限
     * @method requestNotificationPermission
     * @returns {Promise<void>}
     */
    async requestNotificationPermission() {
      if (!('Notification' in window)) {
        logger.warn('[RiskAlerts] 浏览器不支持桌面通知')
        return
      }

      if (Notification.permission === 'granted') {
        this.notificationEnabled = true
        logger.info('[RiskAlerts] 已有通知权限')
      } else if (Notification.permission !== 'denied') {
        try {
          const permission = await Notification.requestPermission()
          this.notificationEnabled = permission === 'granted'
          logger.info('[RiskAlerts] 通知权限:', permission)
        } catch (error) {
          logger.warn('[RiskAlerts] 请求通知权限失败:', error)
        }
      }
    },

    /**
     * 显示桌面通知
     * @method showAlertNotification
     * @param {Object} alert - 告警对象
     * @returns {void}
     */
    showAlertNotification(alert) {
      if (!this.notificationEnabled) return

      try {
        const severityText = this.getSeverityLabel(alert.severity)
        const notification = new Notification(`风控告警 - ${severityText}`, {
          body: alert.message || '新的风控告警需要处理',
          icon: '/admin/images/logo.png',
          tag: `alert-${alert.risk_alert_id}`,
          requireInteraction: alert.severity === 'critical' || alert.severity === 'high'
        })

        // 点击通知时聚焦窗口并查看详情
        notification.onclick = () => {
          window.focus()
          this.viewAlertDetail(alert)
          notification.close()
        }
      } catch (error) {
        logger.warn('[RiskAlerts] 显示通知失败:', error)
      }
    },

    /**
     * 播放告警提示音
     * @method playAlertSound
     * @param {string} severity - 告警严重程度
     * @returns {void}
     */
    playAlertSound(severity) {
      try {
        // 根据严重程度选择不同频率的提示音
        const frequency = severity === 'critical' || severity === 'high' ? 800 : 500
        const duration = severity === 'critical' || severity === 'high' ? 300 : 150

        // 使用Web Audio API播放简单提示音
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = frequency
        oscillator.type = 'sine'
        gainNode.gain.value = 0.3

        oscillator.start()
        setTimeout(() => {
          oscillator.stop()
          audioContext.close()
        }, duration)
      } catch (error) {
        // 静默忽略音频播放失败
        logger.debug('[RiskAlerts] 播放提示音失败:', error)
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
        const echarts = this._echarts

        logger.info('[RiskAlerts] 初始化图表', { hasEcharts: !!echarts })

        if (!echarts) {
          logger.warn('[RiskAlerts] ECharts 未加载，跳过图表初始化')
          return
        }

        // 使用 getElementById 而非 $refs（HTML 使用 id 属性）
        const levelContainer = document.getElementById('levelDistChart')
        const typeContainer = document.getElementById('typeDistChart')

        if (levelContainer) {
          this.levelDistChart = echarts.init(levelContainer)
          this.levelDistChart.setOption(this.getLevelChartOption([]))
          logger.info('[RiskAlerts] 级别分布图初始化完成')
        }

        if (typeContainer) {
          this.typeDistChart = echarts.init(typeContainer)
          this.typeDistChart.setOption(this.getTypeChartOption([], []))
          logger.info('[RiskAlerts] 类型分布图初始化完成')
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
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            // 默认显示标签：名称和数量
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
      // 统计告警严重程度分布（直接使用后端字段 severity）
      const severityStats = { critical: 0, high: 0, medium: 0, low: 0 }
      // 统计告警类型分布（直接使用后端字段 alert_type）
      const alertTypeStats = {
        frequency_limit: 0,
        amount_limit: 0,
        duplicate_user: 0,
        suspicious_pattern: 0
      }

      this.alerts.forEach(alert => {
        // 后端返回的字段是 severity
        const severity = alert.severity
        if (severity && Object.hasOwn(severityStats, severity)) {
          severityStats[severity]++
        }
        // 后端返回的字段是 alert_type
        const alertType = alert.alert_type
        if (alertType && Object.hasOwn(alertTypeStats, alertType)) {
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
        // 直接使用后端字段名
        if (this.filters.severity) params.append('severity', this.filters.severity)
        if (this.filters.alert_type) params.append('alert_type', this.filters.alert_type)
        if (this.filters.status) params.append('status', this.filters.status)

        // 转换时间范围为 start_time（后端使用 start_time/end_time，不支持 time_range）
        // 空值或空字符串表示不限制时间，显示全部数据
        if (this.filters.time && this.filters.time.trim() !== '') {
          const now = new Date()
          let startTime = new Date()

          switch (this.filters.time) {
            case 'today':
              startTime.setHours(0, 0, 0, 0)
              break
            case 'week':
              startTime.setDate(now.getDate() - 7)
              break
            case 'month':
              startTime.setDate(now.getDate() - 30)
              break
            default:
              // 未知时间范围或空值，不添加时间筛选
              startTime = null
              break
          }

          if (startTime) {
            params.append('start_time', startTime.toISOString())
          }
        }

        params.append('page', this.current_page)
        params.append('page_size', this.page_size)

        const url =
          SYSTEM_ENDPOINTS.RISK_ALERT_LIST + (params.toString() ? `?${params.toString()}` : '')
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
        this.total_pages = Math.ceil(this.totalCount / this.page_size) || 1

        this.updateStats(result.data.stats || this.calculateStatsFromAlerts())
        this.updateCharts()

        // #2 更新上次刷新时间
        this.lastUpdateTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      }
    },

    /**
     * P2#11: 加载市场价格异常监控数据
     * @description 并行请求三个后端API，聚合市场监控面板所需数据
     * 后端API:
     * - GET /api/v4/console/marketplace/listing-stats （挂单统计）
     * - GET /api/v4/console/settings/marketplace （市场阈值配置）
     * - GET /api/v4/console/marketplace/stats/overview （市场概览统计）
     */
    async loadMarketPriceMonitor() {
      this.loadingMarketMonitor = true
      try {
        const [listingStatsRes, settingsRes, exchangeStatsRes] = await Promise.allSettled([
          apiRequest(
            SYSTEM_ENDPOINTS.SETTING_MARKETPLACE.replace(
              '/settings/marketplace',
              '/marketplace/listing-stats'
            ) + '?page=1&limit=50'
          ),
          apiRequest(SYSTEM_ENDPOINTS.SETTING_MARKETPLACE),
          apiRequest(TRADE_ENDPOINTS.STATS_OVERVIEW)
        ])

        const listingData =
          listingStatsRes.status === 'fulfilled' && listingStatsRes.value?.success
            ? listingStatsRes.value.data
            : null
        const settingsRaw =
          settingsRes.status === 'fulfilled' && settingsRes.value?.success
            ? settingsRes.value.data
            : null
        const exchangeData =
          exchangeStatsRes.status === 'fulfilled' && exchangeStatsRes.value?.success
            ? exchangeStatsRes.value.data
            : null

        // 后端 settings/marketplace → 键值对转换
        const settingsMap = {}
        if (settingsRaw?.settings && Array.isArray(settingsRaw.settings)) {
          settingsRaw.settings.forEach(s => {
            settingsMap[s.setting_key] =
              s.parsed_value !== undefined ? s.parsed_value : s.setting_value
          })
        }

        // 后端 listing-stats → summary 字段
        const summary = listingData?.summary || {}

        // 后端 marketplace/stats/overview → 市场概览统计
        const totals = exchangeData?.totals || {}
        const onSale = exchangeData?.on_sale_summary || []
        const totalItems = onSale.reduce((s, i) => s + (i.count || 0), 0)
        const activeItems = totalItems
        const totalExchanges = totals.total_trades || 0
        const lowStockItems = 0

        // 计算成交率（有商品数据时）: 总兑换次数 / 上架商品数
        const dealRate = activeItems > 0 ? (totalExchanges / activeItems) * 100 : 0
        // 计算库存预警率: 库存预警商品数 / 商品总数
        const lowStockRate = totalItems > 0 ? (lowStockItems / totalItems) * 100 : 0

        this.marketMonitor = {
          // 挂单统计（直接使用后端字段名）
          active_listings: summary.total_users_with_listings || 0,
          total_listings: summary.total_listings || 0,
          users_at_limit: summary.users_at_limit || 0,
          users_near_limit: summary.users_near_limit || 0,
          // 市场统计（来自 marketplace/stats/overview）
          deal_rate: parseFloat(dealRate.toFixed(1)),
          low_stock_rate: parseFloat(lowStockRate.toFixed(1)),
          price_anomaly_count: lowStockItems,
          // 兑换市场详细数据
          total_exchange_items: totalItems,
          active_exchange_items: activeItems,
          total_exchanges: totalExchanges,
          // 阈值配置（从 system_settings 键值对中获取）
          thresholds: {
            price_low: settingsMap.monitor_price_low_threshold ?? '未配置',
            price_high: settingsMap.monitor_price_high_threshold ?? '未配置',
            alert_enabled:
              settingsMap.monitor_alert_enabled === true ||
              settingsMap.monitor_alert_enabled === 'true',
            long_listing_days: settingsMap.monitor_long_listing_days ?? '未配置',
            min_price: settingsMap.min_price_red_shard ?? '未配置',
            max_price: settingsMap.max_price_red_shard ?? '未配置'
          }
        }

        logger.info('[P2-11] 市场价格监控数据加载完成', {
          active_listings: this.marketMonitor.active_listings,
          deal_rate: this.marketMonitor.deal_rate,
          total_exchanges: this.marketMonitor.total_exchanges
        })
      } catch (error) {
        logger.error('[P2-11] 加载市场价格监控失败:', error.message)
        this.marketMonitor = null
      } finally {
        this.loadingMarketMonitor = false
      }
    },

    /**
     * 从当前告警列表计算统计数据
     * @method calculateStatsFromAlerts
     * @description 当后端未返回统计数据时，从告警列表中计算
     * @returns {AlertStats} 计算得出的统计数据
     */
    calculateStatsFromAlerts() {
      // 直接使用后端字段 severity
      return {
        critical: this.alerts.filter(a => a.severity === 'critical' || a.severity === 'high')
          .length,
        warning: this.alerts.filter(a => a.severity === 'medium').length,
        info: this.alerts.filter(a => a.severity === 'low').length,
        resolved: this.alerts.filter(a => a.status === 'reviewed' || a.status === 'ignored').length
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
      // 后端统计API返回 by_severity 和 by_status 对象
      const bySeverity = stats.by_severity || {}
      const byStatus = stats.by_status || {}

      // 严重告警 = critical + high
      this.stats.critical =
        (bySeverity.critical || 0) + (bySeverity.high || 0) ||
        stats.critical ||
        this.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length

      // 警告 = medium
      this.stats.warning =
        bySeverity.medium ||
        stats.warning ||
        this.alerts.filter(a => a.severity === 'medium').length

      // 提示 = low
      this.stats.info =
        bySeverity.low || stats.info || this.alerts.filter(a => a.severity === 'low').length

      // 已处理 = reviewed + ignored
      this.stats.resolved =
        (byStatus.reviewed || 0) + (byStatus.ignored || 0) ||
        stats.resolved ||
        this.alerts.filter(a => a.status === 'reviewed' || a.status === 'ignored').length
    },

    // ==================== 分页操作 ====================

    /**
     * 跳转到上一页
     * @method prevPage
     * @description 如果当前不是第一页，则减少页码并重新加载数据
     * @returns {void}
     */
    prevPage() {
      if (this.current_page > 1) {
        this.current_page--
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
      if (this.current_page < this.total_pages) {
        this.current_page++
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
        this.selectedAlerts = this.alerts.map(a => a.risk_alert_id)
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
            apiRequest(buildURL(SYSTEM_ENDPOINTS.RISK_ALERT_REVIEW, { id: alertId }), {
              method: 'POST',
              data: { status: 'reviewed', review_notes: '批量处理' }
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
      this.loadAlertTimeline(alert.risk_alert_id)
    },

    /**
     * 根据ID选择告警并加载时间线
     * @async
     * @method selectAlert
     * @param {number} alertId - 告警ID
     * @returns {Promise<void>}
     */
    async selectAlert(alertId) {
      this.selectedAlert = this.alerts.find(a => a.risk_alert_id === alertId)
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
    async loadAlertTimeline(_alertId) {
      // 后端返回 reviewed_at 可能是对象或字符串
      const reviewedAt = this.selectedAlert?.reviewed_at
      if (this.selectedAlert && reviewedAt) {
        this.timeline = [
          {
            created_at: reviewedAt,
            status: this.selectedAlert.status,
            action: `状态更新为: ${this.selectedAlert.status_display || this.selectedAlert.status}`,
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
      const alertId = typeof alertOrId === 'object' ? alertOrId.risk_alert_id : alertOrId
      this.handleForm = {
        risk_alert_id: alertId,
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
      if (!this.handleForm.risk_alert_id) return

      this.submitting = true
      try {
        // 使用 data 而非 body（request 函数会自动 JSON.stringify）
        const response = await apiRequest(
          buildURL(SYSTEM_ENDPOINTS.RISK_ALERT_REVIEW, { id: this.handleForm.risk_alert_id }),
          {
            method: 'POST',
            data: {
              status: this.handleForm.status,
              review_notes: this.handleForm.remark
            }
          }
        )

        if (response && response.success) {
          this.hideModal('handleModal')
          this.showSuccess(`告警已${this.handleForm.status === 'reviewed' ? '复核' : '处理'}`)
          await this.loadAlerts()
          if (
            this.selectedAlert &&
            this.selectedAlert.risk_alert_id == this.handleForm.risk_alert_id
          ) {
            await this.loadAlertTimeline(this.handleForm.risk_alert_id)
          }
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('处理告警失败:', error)
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
          const response = await apiRequest(SYSTEM_ENDPOINTS.RISK_ALERT_MARK_ALL_READ, {
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
    // ✅ 已删除 getLevelText 映射函数 - 改用后端 _display 字段（P2 中文化）

    // ✅ 已删除 getTypeText / getStatusText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 xxx_display 字段
    // HTML 模板直接使用 alert.alert_type_display / alert.status_display

    /**
     * 格式化日期为中文显示格式
     * 支持后端返回的时间对象格式：{ iso, beijing, timestamp, relative }
     * @method formatDate
     * @param {string|Object|null} dateValue - ISO日期字符串或时间对象
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(dateValue) {
      if (!dateValue) return '-'
      try {
        // 如果是后端返回的时间对象格式
        if (typeof dateValue === 'object' && dateValue !== null) {
          // 优先使用 beijing 格式（北京时间）
          if (dateValue.beijing) return dateValue.beijing
          // 或者使用 iso 格式
          if (dateValue.iso) return new Date(dateValue.iso).toLocaleString('zh-CN')
          // 或者使用 relative 格式
          if (dateValue.relative) return dateValue.relative
        }
        // 如果是字符串格式
        return new Date(dateValue).toLocaleString('zh-CN')
      } catch {
        return typeof dateValue === 'string' ? dateValue : '-'
      }
    },

    // ==================== 辅助方法（CSS类和图标） ====================

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
     * 支持后端返回的时间对象格式：{ iso, beijing, timestamp, relative }
     * @method formatTime
     * @param {string|Object|null} dateValue - ISO日期字符串或时间对象
     * @returns {string} 相对时间文本，如 '5分钟前'、'2小时前'
     */
    formatTime(dateValue) {
      if (!dateValue) return '-'

      // 如果是后端返回的时间对象格式，直接使用 relative 字段
      if (typeof dateValue === 'object' && dateValue !== null) {
        if (dateValue.relative) return dateValue.relative
        // 使用 iso 或 timestamp 计算
        dateValue = dateValue.iso || dateValue.timestamp
      }

      if (!dateValue) return '-'

      const date = new Date(dateValue)
      if (isNaN(date.getTime())) return '-'

      const now = new Date()
      const diff = now - date

      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
      return date.toLocaleDateString('zh-CN')
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
    },

    // ==================== P2-8: 告警疲劳预防方法 ====================

    /**
     * 检查告警是否被静默
     * @param {Object} alert - 告警对象
     * @returns {boolean} 是否被静默
     */
    isAlertSilenced(alert) {
      // 检查单条告警ID是否静默
      if (this.silencedAlerts.risk_alert_ids.has(alert.risk_alert_id)) {
        return true
      }
      // 检查告警类型是否静默
      if (this.silencedAlerts.alert_types.has(alert.alert_type)) {
        return true
      }
      // 检查用户ID是否静默
      if (alert.user_id && this.silencedAlerts.user_ids.has(alert.user_id)) {
        return true
      }
      return false
    },

    /**
     * 静默单条告警
     * @param {Object} alert - 告警对象
     * @param {number} duration - 静默时长（分钟），默认60分钟
     */
    silenceAlert(alert, duration = 60) {
      this.silencedAlerts.risk_alert_ids.add(alert.risk_alert_id)
      logger.info('[P2-8] 静默告警:', alert.risk_alert_id, `${duration}分钟`)
      this.showSuccess(`已静默该告警 ${duration} 分钟`)

      // 自动解除静默
      setTimeout(
        () => {
          this.silencedAlerts.risk_alert_ids.delete(alert.risk_alert_id)
          logger.info('[P2-8] 解除告警静默:', alert.risk_alert_id)
        },
        duration * 60 * 1000
      )
    },

    /**
     * 静默同类告警
     * @param {string} alertType - 告警类型
     * @param {number} duration - 静默时长（分钟），默认60分钟
     */
    silenceAlertType(alertType, duration = 60) {
      this.silencedAlerts.alert_types.add(alertType)
      logger.info('[P2-8] 静默告警类型:', alertType, `${duration}分钟`)
      this.showSuccess(`已静默 ${alertType} 类型告警 ${duration} 分钟`)

      // 自动解除静默
      setTimeout(
        () => {
          this.silencedAlerts.alert_types.delete(alertType)
          logger.info('[P2-8] 解除告警类型静默:', alertType)
        },
        duration * 60 * 1000
      )
    },

    /**
     * 静默用户相关告警
     * @param {number} userId - 用户ID
     * @param {number} duration - 静默时长（分钟），默认60分钟
     */
    silenceUserAlerts(userId, duration = 60) {
      this.silencedAlerts.user_ids.add(userId)
      logger.info('[P2-8] 静默用户告警:', userId, `${duration}分钟`)
      this.showSuccess(`已静默用户 ${userId} 的告警 ${duration} 分钟`)

      // 自动解除静默
      setTimeout(
        () => {
          this.silencedAlerts.user_ids.delete(userId)
          logger.info('[P2-8] 解除用户告警静默:', userId)
        },
        duration * 60 * 1000
      )
    },

    /**
     * 应用告警合并策略
     * @param {Object} alert - 新告警对象
     * @returns {Object} {merged: boolean, count: number, message: string, showBatchAlert: boolean}
     */
    applyAlertMerging(alert) {
      const mergeKey = `${alert.alert_type}_${alert.severity}`
      const now = Date.now()
      const oneHour = 60 * 60 * 1000

      const existingGroup = this.alertMergeTracker.get(mergeKey)

      if (existingGroup && now - existingGroup.first_time < oneHour) {
        // 1小时内同类告警，增加计数
        existingGroup.count++
        existingGroup.last_alert = alert
        existingGroup.alerts = existingGroup.alerts || []
        existingGroup.alerts.push(alert)

        // 超过5个同类显示"批量告警"
        if (existingGroup.count === 5) {
          return {
            merged: true,
            count: existingGroup.count,
            message: `同类告警合并（${existingGroup.count}条）`,
            showBatchAlert: true,
            group: existingGroup
          }
        } else if (existingGroup.count > 5) {
          return {
            merged: true,
            count: existingGroup.count,
            message: `同类告警合并（${existingGroup.count}条）`,
            showBatchAlert: false,
            group: existingGroup
          }
        } else {
          return {
            merged: true,
            count: existingGroup.count,
            message: `同类告警合并（${existingGroup.count}条）`,
            showBatchAlert: false,
            group: existingGroup
          }
        }
      } else {
        // 新的合并组或超过1小时
        this.alertMergeTracker.set(mergeKey, {
          count: 1,
          first_time: now,
          last_alert: alert,
          alerts: [alert]
        })
        return { merged: false, count: 1, message: '', showBatchAlert: false }
      }
    },

    /**
     * 查看合并的告警组详情
     * @param {string} alertType - 告警类型
     * @param {string} severity - 严重程度
     */
    viewMergedAlerts(alertType, severity) {
      const mergeKey = `${alertType}_${severity}`
      const group = this.alertMergeTracker.get(mergeKey)

      if (group) {
        this.currentMergedAlertGroup = {
          type: alertType,
          severity: severity,
          count: group.count,
          alerts: group.alerts || [],
          first_time: new Date(group.first_time).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai'
          })
        }
        this.showMergedAlertsModal = true
      }
    },

    /**
     * 关闭合并告警弹窗
     */
    closeMergedAlertsModal() {
      this.showMergedAlertsModal = false
      this.currentMergedAlertGroup = null
    },

    /**
     * 启动告警升级检查器
     */
    startEscalationChecker() {
      this.escalationTimer = setInterval(() => {
        this.checkAlertEscalation()
      }, 60 * 1000) // 每分钟检查一次

      logger.info('[P2-8] 告警升级检查器已启动')
    },

    /**
     * 检查告警升级
     * - 30分钟未处理→升级告警（弹窗+徽标闪烁）
     * - 1小时未处理→紧急告警（置顶+音效）
     * - 2小时未处理→通知管理员
     */
    checkAlertEscalation() {
      const now = Date.now()
      const thirtyMinutes = 30 * 60 * 1000
      const oneHour = 60 * 60 * 1000
      const twoHours = 2 * 60 * 60 * 1000

      const pendingAlerts = this.alerts.filter(a => a.status === 'pending')

      pendingAlerts.forEach(alert => {
        const alertTime = new Date(alert.created_at).getTime()
        const elapsed = now - alertTime
        const alertId = alert.risk_alert_id

        // 已经升级过的告警不重复处理
        if (this.escalatedAlertIds.has(`${alertId}_2h`) && elapsed >= twoHours) {
          return
        }
        if (
          this.escalatedAlertIds.has(`${alertId}_1h`) &&
          elapsed >= oneHour &&
          elapsed < twoHours
        ) {
          return
        }
        if (
          this.escalatedAlertIds.has(`${alertId}_30m`) &&
          elapsed >= thirtyMinutes &&
          elapsed < oneHour
        ) {
          return
        }

        // 2小时未处理 - 通知管理员
        if (elapsed >= twoHours && !this.escalatedAlertIds.has(`${alertId}_2h`)) {
          this.escalatedAlertIds.add(`${alertId}_2h`)
          this.escalateAlert(alert, 'admin_notify')
          logger.warn('[P2-8] 告警2小时未处理，通知管理员:', alertId)
        }
        // 1小时未处理 - 紧急告警（置顶+音效）
        else if (elapsed >= oneHour && !this.escalatedAlertIds.has(`${alertId}_1h`)) {
          this.escalatedAlertIds.add(`${alertId}_1h`)
          this.escalateAlert(alert, 'urgent')
          logger.warn('[P2-8] 告警1小时未处理，升级为紧急:', alertId)
        }
        // 30分钟未处理 - 升级告警（弹窗+徽标闪烁）
        else if (elapsed >= thirtyMinutes && !this.escalatedAlertIds.has(`${alertId}_30m`)) {
          this.escalatedAlertIds.add(`${alertId}_30m`)
          this.escalateAlert(alert, 'warning')
          logger.warn('[P2-8] 告警30分钟未处理，升级提醒:', alertId)
        }
      })
    },

    /**
     * 升级告警处理
     * @param {Object} alert - 告警对象
     * @param {string} level - 升级级别 'warning'|'urgent'|'admin_notify'
     */
    escalateAlert(alert, level) {
      switch (level) {
        case 'warning':
          // 30分钟未处理 - 弹窗+徽标闪烁
          this.showWarning(`⚠️ 告警升级: "${alert.message}" 已超过30分钟未处理！`)
          // 添加闪烁效果
          document.title = '⚠️ 告警待处理 - 风控告警'
          setTimeout(() => {
            document.title = '风控告警'
          }, 3000)
          break

        case 'urgent': {
          // 1小时未处理 - 置顶+音效
          this.showError(`🚨 紧急告警: "${alert.message}" 已超过1小时未处理！`)
          this.playAlertSound('critical')

          // 将告警移到列表顶部
          const index = this.alerts.findIndex(a => a.risk_alert_id === alert.risk_alert_id)
          if (index > 0) {
            const [escalatedAlert] = this.alerts.splice(index, 1)
            escalatedAlert._escalated = 'urgent'
            this.alerts.unshift(escalatedAlert)
          }
          break
        }

        case 'admin_notify':
          // 2小时未处理 - 通知管理员
          this.showError(`🆘 超级告警: "${alert.message}" 已超过2小时未处理，请立即处理！`)
          this.playAlertSound('critical')

          // 尝试发送桌面通知
          if (this.notificationEnabled && Notification.permission === 'granted') {
            new Notification('🆘 紧急告警需要处理', {
              body: `告警 "${alert.message}" 已超过2小时未处理，请立即处理！`,
              icon: '/admin/favicon.ico',
              requireInteraction: true
            })
          }
          break
      }
    },

    /**
     * 获取告警升级状态文本
     * @param {Object} alert - 告警对象
     * @returns {string|null} 升级状态文本
     */
    // ==================== 静默规则 Tab 方法 ====================

    async fetchSilenceRulesTableData(params) {
      try {
        const res = await SystemAPI.getAlertSilenceRules({
          page: params.page || 1,
          page_size: params.page_size || 20
        })
        if (res?.data?.list) {
          return {
            list: res.data.list,
            total: res.data.pagination?.total_count || 0
          }
        }
        return { list: [], total: 0 }
      } catch (error) {
        logger.error('[RiskAlerts] 获取静默规则失败', error)
        this.showError('获取静默规则失败')
        return { list: [], total: 0 }
      }
    },

    openSilenceRuleModal(rule = null) {
      if (rule) {
        this.silenceRuleForm = {
          alert_silence_rule_id: rule.alert_silence_rule_id,
          rule_name: rule.rule_name || '',
          alert_type: rule.alert_type || 'win_rate',
          alert_level: rule.alert_level || 'all',
          start_time: rule.start_time || '',
          end_time: rule.end_time || '',
          effective_start_date: rule.effective_start_date || '',
          effective_end_date: rule.effective_end_date || '',
          is_active: rule.is_active !== false
        }
      } else {
        this.silenceRuleForm = {
          alert_silence_rule_id: null,
          rule_name: '',
          alert_type: 'win_rate',
          alert_level: 'all',
          start_time: '',
          end_time: '',
          effective_start_date: '',
          effective_end_date: '',
          is_active: true
        }
      }
      this.showSilenceRuleModal = true
    },

    async saveSilenceRule() {
      if (!this.silenceRuleForm.rule_name || !this.silenceRuleForm.alert_type) {
        this.showError('请填写规则名称和告警类型')
        return
      }
      this.silenceRuleSubmitting = true
      try {
        const data = { ...this.silenceRuleForm }
        const id = data.alert_silence_rule_id
        delete data.alert_silence_rule_id

        if (!data.start_time) delete data.start_time
        if (!data.end_time) delete data.end_time
        if (!data.effective_start_date) delete data.effective_start_date
        if (!data.effective_end_date) delete data.effective_end_date

        if (id) {
          await SystemAPI.updateAlertSilenceRule(id, data)
          this.showSuccess('静默规则更新成功')
        } else {
          await SystemAPI.createAlertSilenceRule(data)
          this.showSuccess('静默规则创建成功')
        }

        this.showSilenceRuleModal = false
        this.$dispatch('refresh-table', { tableId: 'silenceRulesTable' })
      } catch (error) {
        logger.error('[RiskAlerts] 保存静默规则失败', error)
        this.showError(error?.data?.message || '保存失败')
      } finally {
        this.silenceRuleSubmitting = false
      }
    },

    async deleteSilenceRule(rule) {
      if (!confirm(`确认删除规则「${rule.rule_name}」？此操作不可恢复。`)) return
      try {
        await SystemAPI.deleteAlertSilenceRule(rule.alert_silence_rule_id)
        this.showSuccess('静默规则已删除')
        this.$dispatch('refresh-table', { tableId: 'silenceRulesTable' })
      } catch (error) {
        logger.error('[RiskAlerts] 删除静默规则失败', error)
        this.showError('删除失败')
      }
    },

    handleSilenceRulesAction(event) {
      const { action, row } = event.detail || event
      if (action === 'edit_silence') {
        this.openSilenceRuleModal(row)
      } else if (action === 'delete_silence') {
        this.deleteSilenceRule(row)
      }
    },

    getEscalationStatus(alert) {
      if (alert.status !== 'pending') return null

      const alertId = alert.risk_alert_id
      if (this.escalatedAlertIds.has(`${alertId}_2h`)) {
        return '🆘 超2小时未处理'
      }
      if (this.escalatedAlertIds.has(`${alertId}_1h`)) {
        return '🚨 超1小时未处理'
      }
      if (this.escalatedAlertIds.has(`${alertId}_30m`)) {
        return '⚠️ 超30分钟未处理'
      }
      return null
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
  logger.info('[RiskAlertsPage] Alpine 组件已注册 (Mixin v3.1)')
})
