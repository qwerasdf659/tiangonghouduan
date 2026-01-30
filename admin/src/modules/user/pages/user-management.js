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

// 导入所有 composables 模块
import {
  useUsersState,
  useUsersMethods,
  useRolesPermissionsState,
  useRolesPermissionsMethods,
  useAdvancedStatusState,
  useAdvancedStatusMethods
} from '../composables/index.js'

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
    }
  }))

  logger.info('[UserManagement] Alpine 组件注册完成')
})
