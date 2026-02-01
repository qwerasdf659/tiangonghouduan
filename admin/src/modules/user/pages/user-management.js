/**
 * 用户管理中心 - 模块化重构版
 *
 * @file admin/src/modules/user/pages/user-management.js
 * @module user/pages/user-management
 * @version 4.0.0
 * @date 2026-01-24
 *
 * @description
 * 用户管理中心页面，通过 composables 模块化管理：
 * - 用户列表管理
 * - 角色权限管理
 * - 高级状态、风控配置、变更历史
 *
 * @requires createPageMixin
 * @requires composables/*
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { loadECharts } from '../../../utils/index.js'
import { API_PREFIX, authHeaders, handleResponse } from '../../../api/base.js'

// 导入所有 composables 模块
import {
  useUsersState,
  useUsersMethods,
  useRolesPermissionsState,
  useRolesPermissionsMethods,
  useAdvancedStatusState,
  useAdvancedStatusMethods
} from '../composables/index.js'

// 导入用户画像分析API
import { UserSegmentsAPI } from '../../../api/user-segments.js'

document.addEventListener('alpine:init', () => {
  logger.info('[UserManagement] 注册 Alpine 组件 (模块化 v4.0)...')

  // 全局 Store: 当前页面状态
  Alpine.store('userPage', 'user-list')

  // ==================== 导航组件 ====================

  /**
   * 用户管理导航组件
   */
  Alpine.data('userNavigation', () => ({
    ...createPageMixin(),

    current_page: 'user-list',

    subPages: [
      { id: 'user-list', title: '用户列表', icon: 'bi-people' },
      { id: 'user-segments', title: '用户画像', icon: 'bi-person-bounding-box' },
      { id: 'role-list', title: '角色管理', icon: 'bi-shield' },
      { id: 'permission-list', title: '权限管理', icon: 'bi-key' },
      { id: 'user-roles', title: '角色分配', icon: 'bi-person-badge' },
      { id: 'premium-status', title: '高级状态', icon: 'bi-star' },
      { id: 'risk-profiles', title: '风控配置', icon: 'bi-shield-exclamation' },
      { id: 'role-history', title: '角色变更历史', icon: 'bi-clock-history' },
      { id: 'status-history', title: '状态变更历史', icon: 'bi-journal-text' },
      { id: 'user-stats', title: '用户统计', icon: 'bi-graph-up' }
    ],

    init() {
      logger.info('用户管理导航初始化 (模块化 v4.0)')
      if (!this.checkAuth()) return

      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'user-list'
      Alpine.store('userPage', this.current_page)
    },

    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('userPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================

  /**
   * 用户管理页面内容组件 - 使用 composables 组合
   */
  Alpine.data('userPageContent', () => ({
    // 基础混入
    ...createPageMixin({ pagination: { page_size: 20 } }),

    // ==================== 备用默认值（防止展开失败）====================
    // 放在 composables 之前，会被 composables 的值覆盖
    selectedRoleCode: '',
    roles: [],
    permissions: [],
    selectedUserForRole: null,

    // ==================== 用户行为轨迹状态 (P2-4) ====================
    userActivities: [],

    // ==================== 从 Composables 导入状态 ====================
    ...useUsersState(),
    ...useRolesPermissionsState(),
    ...useAdvancedStatusState(),

    // ==================== 通用状态 ====================
    // 用户列表分页由 useUsersState() 的 pagination 对象统一管理
    saving: false,

    get current_page() {
      return Alpine.store('userPage')
    },

    // ==================== 分页 Getter - 单一对象模式 ====================
    /** 高级状态总页数 */
    get premiumTotalPages() {
      return Math.ceil(this.premiumPagination.total / this.premiumPagination.page_size) || 1
    },
    /** 风控配置总页数 */
    get riskTotalPages() {
      return Math.ceil(this.riskPagination.total / this.riskPagination.page_size) || 1
    },
    /** 角色历史总页数 */
    get roleHistoryTotalPages() {
      return Math.ceil(this.roleHistoryPagination.total / this.roleHistoryPagination.page_size) || 1
    },
    /** 状态历史总页数 */
    get statusHistoryTotalPages() {
      return (
        Math.ceil(this.statusHistoryPagination.total / this.statusHistoryPagination.page_size) || 1
      )
    },

    // ==================== 初始化和数据加载 ====================

    init() {
      logger.info('用户管理内容初始化 (模块化 v4.0)')
      this.loadAllData()
      this.$watch('$store.userPage', () => this.loadAllData())
    },

    async loadAllData() {
      const page = this.current_page
      await this.withLoading(
        async () => {
          switch (page) {
            case 'user-list':
              await this.loadUsers()
              await this.loadUserStats()
              break
            case 'role-list':
              await this.loadRoles()
              break
            case 'permission-list':
              await this.loadPermissions()
              break
            case 'user-roles':
              await this.loadUserRoles()
              await this.loadRoles()
              break
            case 'premium-status':
              await this.loadPremiumUsers()
              await this.loadPremiumStats()
              break
            case 'risk-profiles':
              await this.loadRiskProfiles()
              break
            case 'role-history':
              await this.loadRoleChangeHistory()
              break
            case 'status-history':
              await this.loadStatusChangeHistory()
              break
            case 'user-stats':
              await this.loadUsers()
              await this.loadRoles()
              await this.loadPermissions()
              await this.loadUserStats()
              break
            case 'user-segments':
              await this.loadUserSegments()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 从 Composables 导入方法 ====================
    ...useUsersMethods(),
    ...useRolesPermissionsMethods(),
    ...useAdvancedStatusMethods(),

    // ==================== 工具方法 ====================

    // ==================== 分页方法 ====================

    goToPage(pageNum) {
      // 使用 pagination 对象作为唯一数据源
      this.pagination.page = pageNum
      this.loadAllData()
    },

    goToPremiumPage(pageNum) {
      this.premiumPagination.page = pageNum
      this.loadPremiumUsers()
    },

    goToRiskPage(pageNum) {
      this.riskPagination.page = pageNum
      this.loadRiskProfiles()
    },

    goToRoleHistoryPage(pageNum) {
      this.roleHistoryPagination.page = pageNum
      this.loadRoleChangeHistory()
    },

    goToStatusHistoryPage(pageNum) {
      this.statusHistoryPagination.page = pageNum
      this.loadStatusChangeHistory()
    },

    // ==================== 用户画像分析 (P1-2) ====================

    /** @type {Object} 用户分层数据 */
    userSegments: {
      new_users: { count: 0, percentage: 0 },
      active_users: { count: 0, percentage: 0 },
      loyal_users: { count: 0, percentage: 0 },
      dormant_users: { count: 0, percentage: 0 },
      lost_users: { count: 0, percentage: 0 }
    },

    /** @type {Array} 活跃度热力图数据 */
    activityHeatmap: [],

    /** @type {Object} 兑换偏好数据 */
    exchangePreferences: { top_categories: [], top_prizes: [] },

    /** @type {Array} 行为漏斗数据 */
    behaviorFunnel: [],

    /** @type {Object|null} 分层图表实例 */
    segmentChart: null,

    /** @type {Object|null} 漏斗图表实例 */
    funnelChart: null,

    /** @type {Object|null} 热力图实例 */
    heatmapChart: null,

    /**
     * 加载用户画像分析数据
     */
    async loadUserSegments() {
      const result = await this.withLoading(async () => {
        const [segmentsRes, heatmapRes, preferencesRes, funnelRes] = await Promise.allSettled([
          UserSegmentsAPI.getSegments(),
          UserSegmentsAPI.getActivityHeatmap(),
          UserSegmentsAPI.getExchangePreferences(),
          UserSegmentsAPI.getFunnel()
        ])

        return {
          segments: segmentsRes.status === 'fulfilled' ? segmentsRes.value : null,
          heatmap: heatmapRes.status === 'fulfilled' ? heatmapRes.value : null,
          preferences: preferencesRes.status === 'fulfilled' ? preferencesRes.value : null,
          funnel: funnelRes.status === 'fulfilled' ? funnelRes.value : null
        }
      })

      if (result.success) {
        const data = result.data

        // 更新分层数据
        if (data.segments?.success && data.segments.data) {
          this.userSegments = data.segments.data.segments || data.segments.data
        }

        // 更新热力图数据
        if (data.heatmap?.success && data.heatmap.data) {
          this.activityHeatmap = data.heatmap.data.heatmap || data.heatmap.data
        }

        // 更新兑换偏好
        if (data.preferences?.success && data.preferences.data) {
          this.exchangePreferences = data.preferences.data
        }

        // 更新漏斗数据
        if (data.funnel?.success && data.funnel.data) {
          this.behaviorFunnel = data.funnel.data.stages || data.funnel.data
        }

        // 初始化图表
        this.$nextTick(async () => {
          await this.initSegmentCharts()
        })
      }
    },

    /**
     * 初始化用户画像图表
     */
    async initSegmentCharts() {
      const echarts = await loadECharts()
      if (!echarts) return

      // 分层饼图
      const segmentContainer = document.getElementById('userSegmentChart')
      if (segmentContainer && !this.segmentChart) {
        this.segmentChart = echarts.init(segmentContainer)
        
        const segmentData = Object.entries(this.userSegments).map(([key, value]) => ({
          name: this.getSegmentName(key),
          value: value.count || value
        })).filter(item => item.value > 0)

        this.segmentChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
          legend: { orient: 'vertical', left: 'left', top: 'center' },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: { show: true, formatter: '{b}: {d}%' },
            data: segmentData
          }]
        })
      }

      // 行为漏斗图
      const funnelContainer = document.getElementById('behaviorFunnelChart')
      if (funnelContainer && !this.funnelChart && this.behaviorFunnel.length > 0) {
        this.funnelChart = echarts.init(funnelContainer)

        const funnelData = this.behaviorFunnel.map(stage => ({
          name: stage.name || stage.stage,
          value: stage.count || stage.value
        }))

        this.funnelChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c}' },
          series: [{
            type: 'funnel',
            left: '10%',
            top: 60,
            bottom: 60,
            width: '80%',
            min: 0,
            max: funnelData[0]?.value || 100,
            gap: 2,
            label: { show: true, position: 'inside' },
            labelLine: { show: false },
            data: funnelData
          }]
        })
      }

      // 活跃时段热力图 (F-32)
      const heatmapContainer = document.getElementById('activityHeatmapChart')
      if (heatmapContainer && !this.heatmapChart && this.activityHeatmap?.length > 0) {
        this.heatmapChart = echarts.init(heatmapContainer)
        
        // 格式化热力图数据 [weekday, hour, value]
        const heatmapData = []
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
        
        this.activityHeatmap.forEach((dayData, dayIndex) => {
          if (Array.isArray(dayData)) {
            dayData.forEach((value, hourIndex) => {
              heatmapData.push([hourIndex, dayIndex, value || 0])
            })
          }
        })
        
        // 计算最大值
        const maxValue = Math.max(...heatmapData.map(d => d[2]), 1)
        
        this.heatmapChart.setOption({
          tooltip: {
            position: 'top',
            formatter: (params) => `${days[params.value[1]]} ${hours[params.value[0]]}<br/>活跃用户: ${params.value[2]}`
          },
          grid: {
            top: '10%',
            left: '15%',
            right: '10%',
            bottom: '15%'
          },
          xAxis: {
            type: 'category',
            data: hours,
            splitArea: { show: true },
            axisLabel: {
              interval: 2,
              fontSize: 10
            }
          },
          yAxis: {
            type: 'category',
            data: days,
            splitArea: { show: true }
          },
          visualMap: {
            min: 0,
            max: maxValue,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '0%',
            inRange: {
              color: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
            }
          },
          series: [{
            type: 'heatmap',
            data: heatmapData,
            label: { show: false },
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
            }
          }]
        })
      }
    },

    /**
     * 获取分层名称
     */
    getSegmentName(key) {
      const map = {
        new_users: '新用户',
        active_users: '活跃用户',
        loyal_users: '忠诚用户',
        dormant_users: '沉睡用户',
        lost_users: '流失用户'
      }
      return map[key] || key
    },

    // ==================== 用户行为轨迹方法 (P2-4) ====================

    /**
     * 加载用户行为轨迹
     * @param {number} userId - 用户ID
     */
    async loadUserActivities(userId) {
      if (!userId) return
      
      try {
        const response = await fetch(`${API_PREFIX}/console/users/${userId}/activities?limit=10`, {
          headers: authHeaders()
        })
        const data = await handleResponse(response)
        if (data?.success) {
          this.userActivities = data.data?.activities || data.data || []
        }
      } catch (error) {
        logger.warn('[UserActivities] 加载失败:', error.message)
        this.userActivities = []
      }
    },

    /**
     * 获取行为类型名称
     * @param {string} type - 行为类型
     * @returns {string} 类型名称
     */
    getActivityTypeName(type) {
      const map = {
        draw: '🎰 抽奖',
        transaction: '💰 资产变动',
        exchange: '🎁 兑换',
        consumption: '💳 消费',
        login: '🔐 登录',
        trade: '📦 交易'
      }
      return map[type] || type || '其他'
    }
  }))

  logger.info('[UserManagement] Alpine 组件注册完成')
})
