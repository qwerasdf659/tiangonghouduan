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
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { loadECharts } from '../../../utils/index.js'
import { API_PREFIX, request } from '../../../api/base.js'

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
    // 基础混入（启用用户解析 mixin）
    ...createPageMixin({ pagination: { page_size: 20 }, userResolver: true }),

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

    /** @type {Object} 兑换偏好数据（后端返回 preferences 数组 + statistics 统计） */
    exchangePreferences: { preferences: [], statistics: null },

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

        const segmentData = Object.entries(this.userSegments)
          .map(([key, value]) => ({
            name: this.getSegmentName(key),
            value: value.count || value
          }))
          .filter(item => item.value > 0)

        this.segmentChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
          legend: { orient: 'vertical', left: 'left', top: 'center' },
          series: [
            {
              type: 'pie',
              radius: ['40%', '70%'],
              avoidLabelOverlap: true,
              itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
              label: { show: true, formatter: '{b}: {d}%' },
              data: segmentData
            }
          ]
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
          series: [
            {
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
            }
          ]
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
            formatter: params =>
              `${days[params.value[1]]} ${hours[params.value[0]]}<br/>活跃用户: ${params.value[2]}`
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
          series: [
            {
              type: 'heatmap',
              data: heatmapData,
              label: { show: false },
              emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
              }
            }
          ]
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
        const data = await request({
          url: `${API_PREFIX}/console/users/${userId}/activities`,
          params: { limit: 10 }
        })
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
    },

    // ==================== P2-9: 一键分析功能 ====================

    /** @type {Object|null} 用户分析报告数据 */
    userAnalysisReport: null,
    /** @type {boolean} 是否正在生成分析报告 */
    generatingReport: false,
    /** @type {boolean} 显示用户分析报告弹窗 */
    showAnalysisReportModal: false,

    /**
     * 一键分析用户 - 获取用户完整分析报告
     * @param {Object} user - 用户对象
     */
    async analyzeUser(user) {
      if (!user?.user_id) {
        Alpine.store('notification')?.show?.('请选择要分析的用户', 'error')
        return
      }

      this.generatingReport = true
      this.userAnalysisReport = null

      try {
        logger.info('[P2-9] 开始一键分析用户:', user.user_id)

        // 并行获取多个分析数据
        const [profileRes, activitiesRes, assetsRes] = await Promise.allSettled([
          // 获取用户抽奖档案
          request({
            url: `${API_PREFIX}/console/lottery-user-analysis/profile/${user.user_id}`
          }),
          // 获取用户行为轨迹
          request({
            url: `${API_PREFIX}/console/users/${user.user_id}/activities`,
            params: { limit: 20 }
          }),
          // 获取用户资产汇总
          request({
            url: `${API_PREFIX}/console/assets/user/${user.user_id}/summary`
          })
        ])

        // 组装分析报告
        this.userAnalysisReport = {
          user_info: {
            user_id: user.user_id,
            phone: user.phone,
            nickname: user.nickname || '未设置',
            status: user.status,
            created_at: user.created_at
          },
          lottery_profile: profileRes.status === 'fulfilled' && profileRes.value?.success
            ? profileRes.value.data
            : null,
          activities: activitiesRes.status === 'fulfilled' && activitiesRes.value?.success
            ? (activitiesRes.value.data?.activities || activitiesRes.value.data || [])
            : [],
          assets: assetsRes.status === 'fulfilled' && assetsRes.value?.success
            ? assetsRes.value.data
            : null,
          generated_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        }

        this.showAnalysisReportModal = true
        logger.info('[P2-9] 用户分析报告生成成功')
      } catch (error) {
        logger.error('[P2-9] 一键分析失败:', error.message)
        Alpine.store('notification')?.show?.('生成分析报告失败: ' + error.message, 'error')
      } finally {
        this.generatingReport = false
      }
    },

    /**
     * 关闭分析报告弹窗
     */
    closeAnalysisReportModal() {
      this.showAnalysisReportModal = false
      this.userAnalysisReport = null
    },

    /**
     * 导出用户分析报告为 PDF
     */
    async exportAnalysisReportPDF() {
      if (!this.userAnalysisReport) {
        Alpine.store('notification')?.show?.('没有可导出的报告', 'warning')
        return
      }

      try {
        logger.info('[P2-9] 开始导出PDF报告')

        // 创建打印友好的 HTML
        const report = this.userAnalysisReport
        const printWindow = window.open('', '_blank')
        
        if (!printWindow) {
          Alpine.store('notification')?.show?.('请允许弹窗以导出PDF', 'warning')
          return
        }

        const lotteryStats = report.lottery_profile?.stats || {}
        const assets = report.assets || {}
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>用户分析报告 - ${report.user_info.user_id}</title>
            <style>
              body { font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 40px; color: #333; }
              h1 { color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 10px; }
              h2 { color: #374151; margin-top: 30px; border-left: 4px solid #1a56db; padding-left: 10px; }
              table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
              th { background-color: #f3f4f6; }
              .section { margin-bottom: 30px; }
              .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }
              .stat-card { background: #f9fafb; padding: 15px; border-radius: 8px; text-align: center; }
              .stat-value { font-size: 24px; font-weight: bold; color: #1a56db; }
              .stat-label { color: #6b7280; font-size: 14px; }
              .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
              @media print { body { padding: 20px; } }
            </style>
          </head>
          <body>
            <h1>📊 用户分析报告</h1>
            
            <div class="section">
              <h2>👤 基本信息</h2>
              <table>
                <tr><th>用户ID</th><td>${report.user_info.user_id}</td></tr>
                <tr><th>手机号</th><td>${report.user_info.phone || '-'}</td></tr>
                <tr><th>昵称</th><td>${report.user_info.nickname}</td></tr>
                <tr><th>状态</th><td>${report.user_info.status === 'active' ? '正常' : '禁用'}</td></tr>
                <tr><th>注册时间</th><td>${report.user_info.created_at || '-'}</td></tr>
              </table>
            </div>
            
            ${report.lottery_profile ? `
            <div class="section">
              <h2>🎰 抽奖数据</h2>
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-value">${lotteryStats.total_draws || 0}</div>
                  <div class="stat-label">总抽奖次数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${lotteryStats.total_wins || 0}</div>
                  <div class="stat-label">中奖次数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${lotteryStats.win_rate ? (lotteryStats.win_rate * 100).toFixed(1) + '%' : '0%'}</div>
                  <div class="stat-label">中奖率</div>
                </div>
              </div>
            </div>
            ` : ''}
            
            ${report.assets ? `
            <div class="section">
              <h2>💰 资产概览</h2>
              <div class="stat-grid">
                <div class="stat-card">
                  <div class="stat-value">${assets.total_balance || 0}</div>
                  <div class="stat-label">总资产</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${assets.asset_count || 0}</div>
                  <div class="stat-label">资产种类</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">${assets.transaction_count || 0}</div>
                  <div class="stat-label">交易次数</div>
                </div>
              </div>
            </div>
            ` : ''}
            
            ${report.activities?.length > 0 ? `
            <div class="section">
              <h2>📋 近期行为</h2>
              <table>
                <thead>
                  <tr><th>时间</th><th>类型</th><th>详情</th></tr>
                </thead>
                <tbody>
                  ${report.activities.slice(0, 10).map(a => `
                    <tr>
                      <td>${a.created_at || a.time || '-'}</td>
                      <td>${a.type || a.activity_type || '-'}</td>
                      <td>${a.description || a.detail || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}
            
            <div class="footer">
              <p>报告生成时间：${report.generated_at}</p>
              <p>本报告由运营后台自动生成</p>
            </div>
          </body>
          </html>
        `)
        
        printWindow.document.close()
        
        // 等待内容加载完成后触发打印
        printWindow.onload = function() {
          printWindow.print()
        }
        
        // 如果 onload 没触发，2秒后自动打印
        setTimeout(() => {
          if (!printWindow.closed) {
            printWindow.print()
          }
        }, 2000)

        logger.info('[P2-9] PDF导出完成')
        Alpine.store('notification')?.show?.('已打开打印预览，请选择保存为PDF', 'success')
      } catch (error) {
        logger.error('[P2-9] PDF导出失败:', error.message)
        Alpine.store('notification')?.show?.('导出PDF失败: ' + error.message, 'error')
      }
    }
  }))

  // ==================== data-table 组件注册 ====================

  /** 用户列表 */
  Alpine.data('usersDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'mobile', label: '手机号' },
        { key: 'nickname', label: '昵称' },
        { key: 'role_name', label: '角色', render: (val, row) => row.role_display || val || '-' },
        { key: 'status', label: '状态', type: 'status', statusMap: { active: { class: 'green', label: '正常' }, inactive: { class: 'gray', label: '停用' }, banned: { class: 'red', label: '封禁' } } },
        { key: 'created_at', label: '注册时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/users`, method: 'GET', params })
        return { items: res.data?.rows || res.data?.list || res.data || [], total: res.data?.count || res.data?.pagination?.total || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-users', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 角色列表 */
  Alpine.data('rolesDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'role_id', label: '角色ID', sortable: true },
        { key: 'role_name', label: '角色名称' },
        { key: 'description', label: '描述' },
        { key: 'role_level', label: '级别', type: 'number', sortable: true },
        { key: 'is_system', label: '系统角色', type: 'boolean' }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/roles`, method: 'GET', params })
        return { items: res.data?.roles || res.data?.list || res.data || [], total: res.data?.total || 0 }
      },
      primaryKey: 'role_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-roles', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 权限列表 */
  Alpine.data('permissionsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'permission_key', label: '权限标识', sortable: true },
        { key: 'permission_name', label: '权限名称' },
        { key: 'description', label: '描述' },
        { key: 'module', label: '模块', render: (val) => val || '-' }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/permission-resources`, method: 'GET', params })
        return { items: res.data?.permissions || res.data?.list || res.data || [], total: res.data?.total || 0 }
      },
      primaryKey: 'permission_key', sortable: true, page_size: 50
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-permissions', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 用户角色分配 */
  Alpine.data('userRolesDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'mobile', label: '手机号' },
        { key: 'nickname', label: '昵称' },
        { key: 'role_name', label: '当前角色', render: (val, row) => row.role_display || val || '-' },
        { key: 'role_level', label: '角色级别', type: 'number' }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/users`, method: 'GET', params: { ...params, role_filter: 'all' } })
        return { items: res.data?.rows || res.data?.list || [], total: res.data?.count || res.data?.pagination?.total || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-user-roles', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 高级用户状态 */
  Alpine.data('premiumDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'nickname', label: '昵称', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'premium_level', label: '等级' },
        { key: 'status', label: '状态', type: 'status' },
        { key: 'expires_at', label: '到期时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-premium`, method: 'GET', params })
        return { items: res.data?.list || res.data?.rows || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-premium', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 风控配置 */
  Alpine.data('riskProfilesDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'nickname', label: '昵称', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'risk_level', label: '风险等级', type: 'status', statusMap: { high: { class: 'red', label: '高风险' }, medium: { class: 'yellow', label: '中风险' }, low: { class: 'green', label: '低风险' } } },
        { key: 'total_draws', label: '抽奖次数', type: 'number', sortable: true },
        { key: 'total_wins', label: '中奖次数', type: 'number' },
        { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/risk-profiles`, method: 'GET', params })
        return { items: res.data?.list || res.data?.profiles || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-risk-profiles', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 角色变更历史 */
  Alpine.data('roleHistoryDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'id', label: 'ID', sortable: true },
        { key: 'user_id', label: '用户ID' },
        { key: 'nickname', label: '用户', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'old_role', label: '原角色', render: (val, row) => row.old_role_display || val || '-' },
        { key: 'new_role', label: '新角色', render: (val, row) => row.new_role_display || val || '-' },
        { key: 'reason', label: '变更原因', type: 'truncate', maxLength: 30 },
        { key: 'changed_by', label: '操作人', render: (val, row) => row.changed_by_name || val || '-' },
        { key: 'created_at', label: '变更时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/users/role-changes`, method: 'GET', params })
        return { items: res.data?.list || res.data?.rows || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-role-history', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 状态变更历史 */
  Alpine.data('statusHistoryDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'id', label: 'ID', sortable: true },
        { key: 'user_id', label: '用户ID' },
        { key: 'nickname', label: '用户', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'old_status', label: '原状态', type: 'status', statusMap: { active: { class: 'green', label: '正常' }, inactive: { class: 'gray', label: '停用' }, banned: { class: 'red', label: '封禁' } } },
        { key: 'new_status', label: '新状态', type: 'status', statusMap: { active: { class: 'green', label: '正常' }, inactive: { class: 'gray', label: '停用' }, banned: { class: 'red', label: '封禁' } } },
        { key: 'reason', label: '变更原因', type: 'truncate', maxLength: 30 },
        { key: 'changed_by', label: '操作人', render: (val, row) => row.changed_by_name || val || '-' },
        { key: 'created_at', label: '变更时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/user-management/users/status-changes`, method: 'GET', params })
        return { items: res.data?.list || res.data?.rows || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-status-history', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  logger.info('[UserManagement] Alpine 组件注册完成（含 8 个 data-table）')
})
