/**
 * 用户管理中心 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/user-management.js
 * @description 用户管理中心页面（Tab 导航整合多个子模块）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module user/pages/user-management
 *
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 整合用户管理相关的多个子模块
 * - 保留 Tab 导航和 URL 参数同步
 *
 * 包含子模块：
 * - 用户列表管理
 * - 角色管理
 * - 权限管理
 * - 用户角色分配
 * - 用户统计
 * - 高级状态管理
 * - 风控配置管理
 * - 角色变更历史
 * - 状态变更历史
 */

/**
 * @typedef {Object} SubPageConfig
 * @property {string} id - 子页面标识
 * @property {string} title - 子页面标题
 * @property {string} icon - Bootstrap图标类名
 */

/**
 * @typedef {Object} UserFilters
 * @property {string} user_id - 用户ID筛选
 * @property {string} nickname - 昵称筛选
 * @property {string} status - 状态筛选
 */

/**
 * @typedef {Object} UserStats
 * @property {number} totalUsers - 总用户数
 * @property {number} activeUsers - 活跃用户数
 * @property {number} totalRoles - 总角色数
 * @property {number} totalPermissions - 总权限数
 */

/**
 * @typedef {Object} PremiumStats
 * @property {number} total - 总数
 * @property {number} active - 活跃数
 * @property {number} expired - 已过期数
 * @property {number} expiring_soon - 即将过期数
 */

/**
 * @typedef {Object} ProbabilityModal
 * @property {number|null} userId - 用户ID
 * @property {string} userNickname - 用户昵称
 * @property {string} mode - 调整模式（global/specific）
 * @property {number} multiplier - 概率倍数
 * @property {string} targetPrizeId - 目标奖品ID
 * @property {number} customProbability - 自定义概率
 * @property {number} duration - 持续时间（分钟）
 * @property {string} reason - 调整原因
 */

document.addEventListener('alpine:init', () => {
  console.log('[UserManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store: 当前页面状态
  Alpine.store('userPage', 'user-list')

  // ==================== 导航组件 ====================

  /**
   * 用户管理导航组件
   *
   * @description 管理用户管理中心的Tab导航，支持URL参数同步
   * @returns {Object} Alpine.js组件配置对象
   *
   * @property {string} currentPage - 当前激活的子页面ID
   * @property {Array<SubPageConfig>} subPages - 子页面配置列表
   *
   * @fires init - 组件初始化
   * @fires switchPage - 切换子页面
   */
  Alpine.data('userNavigation', () => ({
    ...createPageMixin(),

    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    currentPage: 'user-list',

    /**
     * 子页面配置列表
     * @type {Array<SubPageConfig>}
     */
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

    /**
     * 初始化导航组件
     *
     * @description 执行权限检查并从URL参数恢复当前页面状态
     * @returns {void}
     */
    init() {
      console.log('✅ 用户管理导航初始化 (Mixin v3.0)')

      // 权限检查
      if (!this.checkAuth()) return

      // 从 URL 参数获取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'user-list'
      Alpine.store('userPage', this.currentPage)
    },

    /**
     * 切换子页面
     *
     * @description 更新当前页面状态、全局Store和URL参数
     * @param {string} pageId - 目标子页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('userPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================

  /**
   * 用户管理页面内容组件
   *
   * @description 用户管理中心的主要内容组件，包含用户列表、角色管理、权限管理、
   *              用户角色分配、高级状态管理、风控配置、角色/状态变更历史、概率调整等功能
   * @returns {Object} Alpine.js组件配置对象
   *
   * @property {Array<Object>} users - 用户列表
   * @property {Array<Object>} roles - 角色列表
   * @property {Array<Object>} permissions - 权限列表
   * @property {Array<Object>} userRoles - 用户角色分配列表
   * @property {UserFilters} userFilters - 用户筛选条件
   * @property {UserStats} userStats - 用户统计数据
   * @property {Array<Object>} premiumUsers - 高级状态用户列表
   * @property {PremiumStats} premiumStats - 高级状态统计
   * @property {Array<Object>} riskProfiles - 风控配置列表
   * @property {Array<Object>} roleChangeHistory - 角色变更历史
   * @property {Array<Object>} statusChangeHistory - 状态变更历史
   * @property {ProbabilityModal} probabilityModal - 概率调整模态框数据
   * @property {boolean} saving - 保存中状态
   *
   * @fires init - 组件初始化
   * @fires loadAllData - 加载所有数据
   * @fires loadUsers - 加载用户列表
   * @fires loadRoles - 加载角色列表
   * @fires loadPermissions - 加载权限列表
   * @fires loadUserRoles - 加载用户角色分配
   * @fires loadPremiumUsers - 加载高级状态用户
   * @fires loadRiskProfiles - 加载风控配置
   * @fires loadRoleChangeHistory - 加载角色变更历史
   * @fires loadStatusChangeHistory - 加载状态变更历史
   */
  Alpine.data('userPageContent', () => ({
    ...createPageMixin({ pagination: { pageSize: 20 } }),

    // ==================== 数据状态 ====================

    /**
     * 用户列表数据
     * @type {Array<Object>}
     */
    users: [],

    /**
     * 角色列表数据
     * @type {Array<Object>}
     */
    roles: [],

    /**
     * 权限列表数据
     * @type {Array<Object>}
     */
    permissions: [],

    /**
     * 用户角色分配列表
     * @type {Array<Object>}
     */
    userRoles: [],

    /**
     * 用户列表筛选条件
     * @type {UserFilters}
     */
    userFilters: { user_id: '', nickname: '', status: '' },

    /**
     * 用户角色筛选条件
     * @type {Object}
     */
    userRoleFilters: { user_id: '', role_code: '' },

    // ==================== 高级状态数据 ====================

    /**
     * 高级状态用户列表
     * @type {Array<Object>}
     */
    premiumUsers: [],

    /**
     * 高级状态筛选条件
     * @type {Object}
     */
    premiumFilters: { user_id: '', is_valid: '', unlock_method: '' },

    /**
     * 高级状态当前页码
     * @type {number}
     */
    premiumPage: 1,

    /**
     * 高级状态每页数量
     * @type {number}
     */
    premiumPageSize: 20,

    /**
     * 高级状态分页信息
     * @type {Object}
     */
    premiumPagination: { total: 0, totalPages: 1 },

    /**
     * 高级状态统计数据
     * @type {PremiumStats}
     */
    premiumStats: { total: 0, active: 0, expired: 0, expiring_soon: 0 },

    /**
     * 选中的高级状态用户详情
     * @type {Object|null}
     */
    selectedPremiumUser: null,

    // ==================== 风控配置数据 ====================

    /**
     * 风控配置列表
     * @type {Array<Object>}
     */
    riskProfiles: [],

    /**
     * 风控配置筛选条件
     * @type {Object}
     */
    riskFilters: { config_type: '', user_level: '', is_frozen: '' },

    /**
     * 风控配置当前页码
     * @type {number}
     */
    riskPage: 1,

    /**
     * 风控配置每页数量
     * @type {number}
     */
    riskPageSize: 20,

    /**
     * 风控配置分页信息
     * @type {Object}
     */
    riskPagination: { total: 0, totalPages: 1 },

    /**
     * 冻结用户列表
     * @type {Array<Object>}
     */
    frozenUsers: [],

    /**
     * 风控等级配置列表
     * @type {Array<Object>}
     */
    riskLevels: [],

    /**
     * 选中的风控配置
     * @type {Object|null}
     */
    selectedRiskProfile: null,

    /**
     * 风控配置表单数据
     * @type {Object}
     */
    riskForm: {
      user_id: '',
      daily_points_limit: 10000,
      single_transaction_limit: 1000,
      daily_lottery_limit: 100,
      freeze_reason: ''
    },

    // ==================== 角色变更历史数据 ====================

    /**
     * 角色变更历史列表
     * @type {Array<Object>}
     */
    roleChangeHistory: [],

    /**
     * 角色变更历史筛选条件
     * @type {Object}
     */
    roleHistoryFilters: { user_id: '', operator_id: '', startDate: '', endDate: '' },

    /**
     * 角色变更历史当前页码
     * @type {number}
     */
    roleHistoryPage: 1,

    /**
     * 角色变更历史每页数量
     * @type {number}
     */
    roleHistoryPageSize: 20,

    /**
     * 角色变更历史分页信息
     * @type {Object}
     */
    roleHistoryPagination: { total: 0, totalPages: 1 },

    // ==================== 状态变更历史数据 ====================

    /**
     * 状态变更历史列表
     * @type {Array<Object>}
     */
    statusChangeHistory: [],

    /**
     * 状态变更历史筛选条件
     * @type {Object}
     */
    statusHistoryFilters: { user_id: '', operator_id: '', status: '', startDate: '', endDate: '' },

    /**
     * 状态变更历史当前页码
     * @type {number}
     */
    statusHistoryPage: 1,

    /**
     * 状态变更历史每页数量
     * @type {number}
     */
    statusHistoryPageSize: 20,

    /**
     * 状态变更历史分页信息
     * @type {Object}
     */
    statusHistoryPagination: { total: 0, totalPages: 1 },

    /**
     * 用户统计数据
     * @type {UserStats}
     */
    userStats: {
      totalUsers: 0,
      activeUsers: 0,
      totalRoles: 0,
      totalPermissions: 0
    },

    /**
     * 选中的用户（用于详情/编辑）
     * @type {Object|null}
     */
    selectedUser: null,

    /**
     * 编辑用户表单数据
     * @type {Object}
     */
    editUserForm: { user_id: '', nickname: '', status: '' },

    /**
     * 选中的用户（用于角色管理）
     * @type {Object|null}
     */
    selectedUserForRole: null,

    /**
     * 选中的角色代码
     * @type {string}
     */
    selectedRoleCode: '',

    /**
     * 分配角色表单数据
     * @type {Object}
     */
    assignRoleForm: { user_id: '', role_code: '' },

    /**
     * 所有奖品列表（用于概率调整）
     * @type {Array<Object>}
     */
    allPrizes: [],

    /**
     * 概率调整模态框数据
     * @type {ProbabilityModal}
     */
    probabilityModal: {
      userId: null,
      userNickname: '',
      mode: 'global',
      multiplier: 2.0,
      targetPrizeId: '',
      customProbability: 50,
      duration: 60,
      reason: ''
    },

    /**
     * 概率预览HTML内容
     * @type {string}
     */
    probabilityPreviewHtml: '<p class="text-muted mb-0">请选择奖品并设置概率</p>',

    /**
     * 保存中状态
     * @type {boolean}
     */
    saving: false,

    // Modal 由 modalMixin 统一管理

    // ==================== 计算属性 ====================

    /**
     * 获取当前激活的子页面ID
     *
     * @returns {string} 当前页面ID
     */
    get currentPage() {
      return Alpine.store('userPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化组件
     *
     * @description 加载初始数据并设置页面切换监听
     * @returns {void}
     */
    init() {
      console.log('✅ 用户管理内容初始化 (Mixin v3.0)')

      // Modal 由 modalMixin 统一管理，无需手动初始化

      // 初始加载数据
      this.loadAllData()

      // 监听页面切换
      this.$watch('$store.userPage', () => this.loadAllData())
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有数据
     *
     * @description 根据当前页面加载对应的数据，始终加载基础数据（用户、角色、权限、用户角色）
     * @async
     * @returns {Promise<void>}
     */
    async loadAllData() {
      await this.withLoading(
        async () => {
          const currentPage = this.currentPage
          // 始终加载基础数据
          await Promise.all([
            this.loadUsers(),
            this.loadRoles(),
            this.loadPermissions(),
            this.loadUserRoles()
          ])

          // 根据当前页面加载特定数据
          if (currentPage === 'premium-status') {
            await this.loadPremiumUsers()
          } else if (currentPage === 'risk-profiles') {
            await this.loadRiskProfiles()
          } else if (currentPage === 'role-history') {
            await this.loadRoleChangeHistory()
          } else if (currentPage === 'status-history') {
            await this.loadStatusChangeHistory()
          }

          this.calculateStats()
        },
        { loadingText: '加载用户数据...' }
      )
    },

    /**
     * 加载用户列表
     *
     * @description 根据筛选条件从API获取用户列表数据
     * @async
     * @returns {Promise<void>}
     */
    async loadUsers() {
      try {
        let url = API_ENDPOINTS.USER.LIST
        const params = new URLSearchParams()
        if (this.userFilters.user_id) params.append('user_id', this.userFilters.user_id)
        if (this.userFilters.nickname) params.append('nickname', this.userFilters.nickname)
        if (this.userFilters.status) params.append('status', this.userFilters.status)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          const data = response.data?.list || response.data
          this.users = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户失败:', error)
        this.users = []
      }
    },

    /**
     * 加载角色列表
     *
     * @description 从API获取所有可用角色
     * @async
     * @returns {Promise<void>}
     */
    async loadRoles() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.ROLE.LIST, {}, { showLoading: false })
        if (response && response.success) {
          const data = response.data?.list || response.data
          this.roles = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.error('[UserManagement] 加载角色失败:', error)
        this.roles = []
      }
    },

    /**
     * 加载权限列表
     *
     * @description 从API获取当前用户的权限列表
     * @async
     * @returns {Promise<void>}
     */
    async loadPermissions() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.PERMISSION.MY_PERMISSIONS,
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          const data = response.data?.list || response.data
          this.permissions = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.error('[UserManagement] 加载权限失败:', error)
        this.permissions = []
      }
    },

    /**
     * 加载用户角色分配列表
     *
     * @description 根据筛选条件从API获取用户角色分配数据
     * @async
     * @returns {Promise<void>}
     */
    async loadUserRoles() {
      try {
        let url = API_ENDPOINTS.SYSTEM_DATA.USER_ROLES
        const params = new URLSearchParams()
        if (this.userRoleFilters.user_id) params.append('user_id', this.userRoleFilters.user_id)
        if (this.userRoleFilters.role_code)
          params.append('role_code', this.userRoleFilters.role_code)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          const data = response.data?.list || response.data
          this.userRoles = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.error('[UserManagement] 加载用户角色失败:', error)
        this.userRoles = []
      }
    },

    // ==================== 统计计算 ====================

    /**
     * 计算用户统计数据
     *
     * @description 根据当前数据计算各项统计指标
     * @returns {void}
     */
    calculateStats() {
      this.userStats = {
        totalUsers: this.users.length,
        activeUsers: this.users.filter(u => u.status === 'active').length,
        totalRoles: this.roles.length,
        totalPermissions: this.permissions.length
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 获取用户状态对应的CSS类名
     *
     * @param {string} status - 用户状态（active/inactive/banned）
     * @returns {string} Bootstrap背景色类名
     */
    getUserStatusClass(status) {
      const map = {
        active: 'bg-success',
        inactive: 'bg-secondary',
        banned: 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取用户状态的中文文本
     *
     * @param {string} status - 用户状态（active/inactive/banned）
     * @returns {string} 中文状态文本
     */
    getUserStatusText(status) {
      const map = {
        active: '正常',
        inactive: '禁用',
        banned: '封禁'
      }
      return map[status] || status
    },

    // ==================== 用户操作 ====================

    /**
     * 打开创建模态框
     *
     * @description 根据类型显示对应的创建提示信息
     * @param {string} type - 创建类型（user/role/permission）
     * @returns {void}
     */
    openCreateModal(type) {
      // 目前只支持通过分配角色来添加管理员用户
      if (type === 'user') {
        this.showInfo('新用户通过前端注册，如需添加管理员请使用"角色分配"功能')
      } else if (type === 'role') {
        this.showInfo('角色创建功能需要通过系统配置，请联系超级管理员')
      } else if (type === 'permission') {
        this.showInfo('权限由系统预设，如需新增请联系开发人员')
      }
    },

    /**
     * 查看用户详情
     *
     * @description 获取并显示用户的详细信息
     * @async
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @returns {Promise<void>}
     */
    async viewUserDetail(user) {
      try {
        // 获取用户详情
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: user.user_id }),
          {},
          { showLoading: true }
        )

        if (response && response.success) {
          this.selectedUser = response.data?.user || response.data || user
        } else {
          // 如果 API 失败，使用列表中的数据
          this.selectedUser = user
        }

        this.showModal('userDetailModal')
      } catch (error) {
        console.error('[UserManagement] 获取用户详情失败:', error)
        // 使用列表中的数据作为后备
        this.selectedUser = user
        this.showModal('userDetailModal')
      }
    },

    /**
     * 编辑用户信息
     *
     * @description 初始化编辑表单并显示编辑模态框
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @param {string} user.nickname - 用户昵称
     * @param {string} user.status - 用户状态
     * @returns {void}
     */
    editUser(user) {
      this.editUserForm = {
        user_id: user.user_id,
        nickname: user.nickname || '',
        status: user.status || 'active'
      }
      this.showModal('editUserModal')
    },

    /**
     * 提交编辑用户信息
     *
     * @description 将编辑后的用户信息提交到服务器
     * @async
     * @returns {Promise<void>}
     */
    async submitEditUser() {
      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: this.editUserForm.user_id }),
          {
            nickname: this.editUserForm.nickname,
            status: this.editUserForm.status
          },
          { method: 'PUT' }
        )

        if (response && response.success) {
          this.showSuccess('用户信息已更新')
          this.hideModal('editUserModal')
          await this.loadUsers()
        } else {
          this.showError(response?.message || '更新失败')
        }
      } catch (error) {
        console.error('[UserManagement] 更新用户失败:', error)
        this.showError(error.message || '更新失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换用户状态（封禁/解封）
     *
     * @description 切换用户的封禁状态，需用户确认
     * @async
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @param {string} user.nickname - 用户昵称
     * @param {string} user.status - 当前状态
     * @returns {Promise<void>}
     */
    async toggleUserStatus(user) {
      const newStatus = user.status === 'active' ? 'banned' : 'active'
      const action = newStatus === 'banned' ? '封禁' : '解封'

      await this.confirmAndExecute(
        `确定要${action}用户 ${user.nickname || user.user_id} 吗？`,
        async () => {
          const response = await this.apiPost(
            API.buildURL(API_ENDPOINTS.USER.UPDATE_STATUS, { user_id: user.user_id }),
            {
              status: newStatus,
              reason: `管理员手动${action}`
            },
            { method: 'PUT' }
          )

          if (response && response.success) {
            this.showSuccess(`用户已${action}`)
            await this.loadUsers()
          } else {
            this.showError(response?.message || `${action}失败`)
          }
        },
        { title: `${action}用户`, confirmText: `确认${action}` }
      )
    },

    /**
     * 管理用户角色
     *
     * @description 打开用户角色管理模态框，并尝试获取用户当前角色
     * @async
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @returns {Promise<void>}
     */
    async manageUserRole(user) {
      this.selectedUserForRole = user
      this.selectedRoleCode = ''

      // 尝试获取用户当前角色
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.USER.DETAIL, { user_id: user.user_id }),
          {},
          { showLoading: false }
        )

        if (response && response.success) {
          const userData = response.data?.user || response.data
          if (userData.roles && userData.roles.length > 0) {
            const firstRole = userData.roles[0]
            this.selectedRoleCode = typeof firstRole === 'string' ? firstRole : firstRole.role_code
          }
        }
      } catch (error) {
        console.error('[UserManagement] 获取用户角色失败:', error)
      }

      this.showModal('userRoleModal')
    },

    /**
     * 提交用户角色更新
     *
     * @description 更新用户的角色分配
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当未选择角色时显示错误提示
     */
    async submitUserRole() {
      if (!this.selectedRoleCode) {
        this.showError('请选择一个角色')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(
          API.buildURL(API_ENDPOINTS.USER.UPDATE_ROLE, {
            user_id: this.selectedUserForRole.user_id
          }),
          {
            role_code: this.selectedRoleCode,
            reason: '管理员手动更新角色'
          },
          { method: 'PUT' }
        )

        if (response && response.success) {
          this.showSuccess('用户角色已更新')
          this.hideModal('userRoleModal')
          await this.loadUsers()
          await this.loadUserRoles()
        } else {
          this.showError(response?.message || '更新角色失败')
        }
      } catch (error) {
        console.error('[UserManagement] 更新用户角色失败:', error)
        this.showError(error.message || '更新角色失败')
      } finally {
        this.saving = false
      }
    },

    // ==================== 角色操作 ====================

    /**
     * 编辑角色（需超级管理员权限）
     *
     * @description 显示角色编辑提示，角色编辑需要超级管理员权限
     * @param {Object} role - 角色对象
     * @param {string} role.role_name - 角色名称
     * @returns {void}
     */
    editRole(role) {
      // 角色编辑通常需要更高权限，这里提供提示
      this.showInfo(`角色 "${role.role_name}" 的编辑功能需要超级管理员权限`)
    },

    /**
     * 管理角色权限（需超级管理员权限）
     *
     * @description 显示角色权限管理提示信息
     * @param {Object} role - 角色对象
     * @param {string} role.role_name - 角色名称
     * @param {number} role.permission_level - 权限等级
     * @returns {void}
     */
    manageRolePermissions(role) {
      // 角色权限管理通常需要更高权限
      this.showInfo(
        `角色 "${role.role_name}" 包含 ${role.permission_level || 0} 级权限，详细权限管理请联系超级管理员`
      )
    },

    // ==================== 权限操作 ====================

    /**
     * 编辑权限（需开发人员参与）
     *
     * @description 显示权限编辑提示，权限由系统预设
     * @param {Object} perm - 权限对象
     * @param {string} perm.permission_name - 权限名称
     * @param {string} perm.permission_code - 权限代码
     * @returns {void}
     */
    editPermission(perm) {
      // 权限编辑需要开发人员参与
      this.showInfo(
        `权限 "${perm.permission_name}" (${perm.permission_code}) 由系统预设，如需修改请联系开发人员`
      )
    },

    // ==================== 用户角色操作 ====================

    /**
     * 打开分配角色模态框
     *
     * @description 重置分配角色表单并显示模态框
     * @returns {void}
     */
    openAssignRoleModal() {
      this.assignRoleForm = { user_id: '', role_code: '' }
      this.showModal('assignRoleModal')
    },

    /**
     * 提交分配角色
     *
     * @description 为指定用户分配角色
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当用户ID或角色未填写时显示错误提示
     */
    async submitAssignRole() {
      if (!this.assignRoleForm.user_id || !this.assignRoleForm.role_code) {
        this.showError('请填写用户ID和选择角色')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(API_ENDPOINTS.USER.UPDATE_ROLE, {
          user_id: parseInt(this.assignRoleForm.user_id),
          role_code: this.assignRoleForm.role_code,
          reason: '管理员手动分配角色'
        })

        if (response && response.success) {
          this.showSuccess('角色分配成功')
          this.hideModal('assignRoleModal')
          await this.loadUserRoles()
        } else {
          this.showError(response?.message || '分配角色失败')
        }
      } catch (error) {
        console.error('[UserManagement] 分配角色失败:', error)
        this.showError(error.message || '分配角色失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 撤销用户角色
     *
     * @description 撤销指定用户的角色分配，需用户确认
     * @async
     * @param {Object} ur - 用户角色分配对象
     * @param {number} ur.id - 分配记录ID
     * @param {number} ur.user_id - 用户ID
     * @param {string} ur.user_nickname - 用户昵称
     * @param {string} ur.role_name - 角色名称
     * @param {string} ur.role_code - 角色代码
     * @returns {Promise<void>}
     */
    async revokeUserRole(ur) {
      await this.confirmAndExecute(
        `确定要撤销用户 ${ur.user_nickname || ur.user_id} 的 ${ur.role_name || ur.role_code} 角色吗？`,
        async () => {
          const response = await this.apiPost(
            API.buildURL(API_ENDPOINTS.SYSTEM_DATA.USER_ROLES + '/:id', { id: ur.id }),
            { reason: '管理员手动撤销' },
            { method: 'DELETE' }
          )

          if (response && response.success) {
            this.showSuccess('角色已撤销')
            await this.loadUserRoles()
          } else {
            this.showError(response?.message || '撤销角色失败')
          }
        },
        { title: '撤销角色', confirmText: '确认撤销', type: 'danger' }
      )
    },

    // ==================== 高级状态管理 ====================

    /**
     * 加载高级状态用户列表
     *
     * @description 根据筛选条件和分页参数加载高级状态用户数据
     * @async
     * @returns {Promise<void>}
     */
    async loadPremiumUsers() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.premiumPage)
        params.append('page_size', this.premiumPageSize)
        if (this.premiumFilters.user_id) params.append('user_id', this.premiumFilters.user_id)
        if (this.premiumFilters.is_valid) params.append('is_valid', this.premiumFilters.is_valid)
        if (this.premiumFilters.unlock_method)
          params.append('unlock_method', this.premiumFilters.unlock_method)

        const response = await this.apiGet(
          `${API_ENDPOINTS.USER_PREMIUM.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const data = response.data?.list || response.data?.items || response.data
          this.premiumUsers = Array.isArray(data) ? data : []

          if (response.data?.pagination) {
            this.premiumPagination = {
              total: response.data.pagination.total || 0,
              totalPages: response.data.pagination.total_pages || 1
            }
          }
        }

        // 加载统计信息
        await this.loadPremiumStats()
      } catch (error) {
        console.error('[UserManagement] 加载高级状态失败:', error)
        this.premiumUsers = []
      }
    },

    /**
     * 加载高级状态统计数据
     *
     * @description 获取高级状态的统计信息（总数、活跃、过期、即将过期）
     * @async
     * @returns {Promise<void>}
     */
    async loadPremiumStats() {
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.USER_PREMIUM.LIST}/stats`,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.premiumStats = response.data || { total: 0, active: 0, expired: 0, expiring_soon: 0 }
        }
      } catch (error) {
        console.error('[UserManagement] 加载高级状态统计失败:', error)
      }
    },

    /**
     * 查看高级状态详情
     *
     * @description 获取并显示用户的高级状态详细信息
     * @async
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @returns {Promise<void>}
     */
    async viewPremiumDetail(user) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.USER_PREMIUM.DETAIL, { user_id: user.user_id }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedPremiumUser = response.data || user
        } else {
          this.selectedPremiumUser = user
        }
        this.showModal('premiumDetailModal')
      } catch (error) {
        console.error('[UserManagement] 获取高级状态详情失败:', error)
        this.selectedPremiumUser = user
        this.showModal('premiumDetailModal')
      }
    },

    /**
     * 获取解锁方式的中文文本
     *
     * @param {string} method - 解锁方式代码（purchase/admin_grant/promotion/referral）
     * @returns {string} 中文解锁方式文本
     */
    getUnlockMethodText(method) {
      const map = {
        purchase: '购买解锁',
        admin_grant: '管理员授权',
        promotion: '活动赠送',
        referral: '推荐奖励'
      }
      return map[method] || method || '-'
    },

    /**
     * 切换高级状态分页
     *
     * @description 切换到指定页码并重新加载数据
     * @param {number} newPage - 目标页码
     * @returns {void}
     */
    changePremiumPage(newPage) {
      if (newPage < 1 || newPage > this.premiumPagination.totalPages) return
      this.premiumPage = newPage
      this.loadPremiumUsers()
    },

    // ==================== 风控配置管理 ====================

    /**
     * 加载风控配置列表
     *
     * @description 根据筛选条件和分页参数加载风控配置数据
     * @async
     * @returns {Promise<void>}
     */
    async loadRiskProfiles() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.riskPage)
        params.append('page_size', this.riskPageSize)
        if (this.riskFilters.config_type) params.append('config_type', this.riskFilters.config_type)
        if (this.riskFilters.user_level) params.append('user_level', this.riskFilters.user_level)
        if (this.riskFilters.is_frozen) params.append('is_frozen', this.riskFilters.is_frozen)

        const response = await this.apiGet(
          `${API_ENDPOINTS.RISK_PROFILES.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          const data = response.data?.list || response.data?.items || response.data
          this.riskProfiles = Array.isArray(data) ? data : []

          if (response.data?.pagination) {
            this.riskPagination = {
              total: response.data.pagination.total || 0,
              totalPages: response.data.pagination.total_pages || 1
            }
          }
        }

        // 加载冻结用户列表
        await this.loadFrozenUsers()
        // 加载等级配置
        await this.loadRiskLevels()
      } catch (error) {
        console.error('[UserManagement] 加载风控配置失败:', error)
        this.riskProfiles = []
      }
    },

    /**
     * 加载冻结用户列表
     *
     * @description 获取所有被冻结的用户列表
     * @async
     * @returns {Promise<void>}
     */
    async loadFrozenUsers() {
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.RISK_PROFILES.LIST}/frozen`,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.frozenUsers = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载冻结用户失败:', error)
        this.frozenUsers = []
      }
    },

    /**
     * 加载风控等级配置
     *
     * @description 获取系统风控等级配置列表
     * @async
     * @returns {Promise<void>}
     */
    async loadRiskLevels() {
      try {
        const response = await this.apiGet(
          `${API_ENDPOINTS.RISK_PROFILES.LIST}/levels`,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.riskLevels = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('[UserManagement] 加载风控等级失败:', error)
        this.riskLevels = []
      }
    },

    /**
     * 查看用户风控配置
     *
     * @description 获取并显示指定用户的风控配置详情
     * @async
     * @param {number} userId - 用户ID
     * @returns {Promise<void>}
     */
    async viewRiskProfile(userId) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.RISK_PROFILES.USER, { user_id: userId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedRiskProfile = response.data
          this.riskForm = {
            user_id: userId,
            daily_points_limit: response.data.daily_points_limit || 10000,
            single_transaction_limit: response.data.single_transaction_limit || 1000,
            daily_lottery_limit: response.data.daily_lottery_limit || 100,
            freeze_reason: ''
          }
        }
        this.showModal('riskProfileModal')
      } catch (error) {
        console.error('[UserManagement] 获取风控配置失败:', error)
        this.showError('获取风控配置失败')
      }
    },

    /**
     * 打开编辑风控配置模态框
     *
     * @description 初始化风控表单并显示编辑模态框
     * @param {Object} profile - 风控配置对象
     * @param {number} profile.user_id - 用户ID
     * @param {number} profile.daily_points_limit - 每日积分限制
     * @param {number} profile.single_transaction_limit - 单笔交易限制
     * @param {number} profile.daily_lottery_limit - 每日抽奖限制
     * @returns {void}
     */
    openEditRiskModal(profile) {
      this.selectedRiskProfile = profile
      this.riskForm = {
        user_id: profile.user_id || '',
        daily_points_limit: profile.daily_points_limit || 10000,
        single_transaction_limit: profile.single_transaction_limit || 1000,
        daily_lottery_limit: profile.daily_lottery_limit || 100,
        freeze_reason: ''
      }
      this.showModal('riskProfileModal')
    },

    /**
     * 保存风控配置
     *
     * @description 提交更新后的风控配置到服务器
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当用户ID为空时显示错误提示
     */
    async saveRiskProfile() {
      if (!this.riskForm.user_id) {
        this.showError('请输入用户ID')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const payload = {
          daily_points_limit: parseInt(this.riskForm.daily_points_limit) || 10000,
          single_transaction_limit: parseInt(this.riskForm.single_transaction_limit) || 1000,
          daily_lottery_limit: parseInt(this.riskForm.daily_lottery_limit) || 100
        }

        const response = await this.apiPost(
          API.buildURL(API_ENDPOINTS.RISK_PROFILES.UPDATE, { user_id: this.riskForm.user_id }),
          payload
        )

        if (response?.success) {
          this.showSuccess('风控配置已保存')
          this.hideModal('riskProfileModal')
          await this.loadRiskProfiles()
        } else {
          this.showError(response?.message || '保存失败')
        }
      } catch (error) {
        console.error('[UserManagement] 保存风控配置失败:', error)
        this.showError(error.message || '保存失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 冻结用户账户
     *
     * @description 冻结指定用户的账户，需用户确认
     * @async
     * @param {number} userId - 要冻结的用户ID
     * @param {string} [reason] - 冻结原因
     * @returns {Promise<void>}
     */
    async freezeUser(userId, reason) {
      await this.confirmAndExecute(
        `确定要冻结用户 ${userId} 的账户吗？`,
        async () => {
          const response = await this.apiPost(
            `${API_ENDPOINTS.RISK_PROFILES.LIST}/user/${userId}/freeze`,
            { reason: reason || '管理员手动冻结' }
          )
          if (response?.success) {
            this.showSuccess('用户已冻结')
            await this.loadRiskProfiles()
          }
        },
        { title: '冻结用户', confirmText: '确认冻结', type: 'danger' }
      )
    },

    /**
     * 解冻用户账户
     *
     * @description 解冻指定用户的账户，需用户确认
     * @async
     * @param {number} userId - 要解冻的用户ID
     * @returns {Promise<void>}
     */
    async unfreezeUser(userId) {
      await this.confirmAndExecute(
        `确定要解冻用户 ${userId} 的账户吗？`,
        async () => {
          const response = await this.apiPost(
            `${API_ENDPOINTS.RISK_PROFILES.LIST}/user/${userId}/unfreeze`,
            {}
          )
          if (response?.success) {
            this.showSuccess('用户已解冻')
            await this.loadRiskProfiles()
          }
        },
        { title: '解冻用户', confirmText: '确认解冻' }
      )
    },

    /**
     * 切换风控配置分页
     *
     * @description 切换到指定页码并重新加载数据
     * @param {number} newPage - 目标页码
     * @returns {void}
     */
    changeRiskPage(newPage) {
      if (newPage < 1 || newPage > this.riskPagination.totalPages) return
      this.riskPage = newPage
      this.loadRiskProfiles()
    },

    // ==================== 角色变更历史方法 ====================

    /**
     * 加载角色变更历史
     *
     * @description 使用审计日志API获取角色变更相关的操作记录
     * @async
     * @returns {Promise<void>}
     */
    async loadRoleChangeHistory() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.roleHistoryPage)
        params.append('page_size', this.roleHistoryPageSize)
        params.append('action_type', 'role_change')

        if (this.roleHistoryFilters.user_id) {
          params.append('user_id', this.roleHistoryFilters.user_id)
        }
        if (this.roleHistoryFilters.operator_id) {
          params.append('operator_id', this.roleHistoryFilters.operator_id)
        }
        if (this.roleHistoryFilters.startDate) {
          params.append('start_date', this.roleHistoryFilters.startDate)
        }
        if (this.roleHistoryFilters.endDate) {
          params.append('end_date', this.roleHistoryFilters.endDate)
        }

        const response = await this.apiGet(`${API_ENDPOINTS.AUDIT_LOGS.LIST}?${params.toString()}`)

        if (response?.success) {
          const data = response.data?.list || response.data?.logs || response.data
          this.roleChangeHistory = Array.isArray(data) ? data : []
          this.roleHistoryPagination = {
            total: response.data?.pagination?.total || response.data?.total || 0,
            totalPages:
              response.data?.pagination?.totalPages ||
              Math.ceil((response.data?.total || 0) / this.roleHistoryPageSize)
          }
          console.log('[UserManagement] 角色变更历史记录数:', this.roleChangeHistory.length)
        }
      } catch (error) {
        console.error('[UserManagement] 加载角色变更历史失败:', error)
        this.roleChangeHistory = []
      }
    },

    /**
     * 搜索角色变更历史
     *
     * @description 重置页码并根据当前筛选条件重新加载数据
     * @returns {void}
     */
    searchRoleHistory() {
      this.roleHistoryPage = 1
      this.loadRoleChangeHistory()
    },

    /**
     * 重置角色变更历史筛选条件
     *
     * @description 清空所有筛选条件并重新加载数据
     * @returns {void}
     */
    resetRoleHistoryFilters() {
      this.roleHistoryFilters = { user_id: '', operator_id: '', startDate: '', endDate: '' }
      this.roleHistoryPage = 1
      this.loadRoleChangeHistory()
    },

    /**
     * 切换角色变更历史分页
     *
     * @description 切换到指定页码并重新加载数据
     * @param {number} newPage - 目标页码
     * @returns {void}
     */
    changeRoleHistoryPage(newPage) {
      if (newPage < 1 || newPage > this.roleHistoryPagination.totalPages) return
      this.roleHistoryPage = newPage
      this.loadRoleChangeHistory()
    },

    /**
     * 格式化角色变更详情
     *
     * @description 将角色变更日志详情格式化为可读字符串
     * @param {Object} log - 日志记录对象
     * @param {string|Object} log.details - 变更详情（JSON字符串或对象）
     * @returns {string} 格式化后的变更详情（如：admin → super_admin）
     */
    formatRoleChangeDetail(log) {
      if (!log || !log.details) return '-'
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
      const oldRole = details.old_role || details.from_role || '-'
      const newRole = details.new_role || details.to_role || '-'
      return `${oldRole} → ${newRole}`
    },

    // ==================== 状态变更历史方法 ====================

    /**
     * 加载状态变更历史
     *
     * @description 使用审计日志API获取用户状态变更相关的操作记录
     * @async
     * @returns {Promise<void>}
     */
    async loadStatusChangeHistory() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.statusHistoryPage)
        params.append('page_size', this.statusHistoryPageSize)
        params.append('action_type', 'status_change')

        if (this.statusHistoryFilters.user_id) {
          params.append('user_id', this.statusHistoryFilters.user_id)
        }
        if (this.statusHistoryFilters.operator_id) {
          params.append('operator_id', this.statusHistoryFilters.operator_id)
        }
        if (this.statusHistoryFilters.status) {
          params.append('status', this.statusHistoryFilters.status)
        }
        if (this.statusHistoryFilters.startDate) {
          params.append('start_date', this.statusHistoryFilters.startDate)
        }
        if (this.statusHistoryFilters.endDate) {
          params.append('end_date', this.statusHistoryFilters.endDate)
        }

        const response = await this.apiGet(`${API_ENDPOINTS.AUDIT_LOGS.LIST}?${params.toString()}`)

        if (response?.success) {
          const data = response.data?.list || response.data?.logs || response.data
          this.statusChangeHistory = Array.isArray(data) ? data : []
          this.statusHistoryPagination = {
            total: response.data?.pagination?.total || response.data?.total || 0,
            totalPages:
              response.data?.pagination?.totalPages ||
              Math.ceil((response.data?.total || 0) / this.statusHistoryPageSize)
          }
          console.log('[UserManagement] 状态变更历史记录数:', this.statusChangeHistory.length)
        }
      } catch (error) {
        console.error('[UserManagement] 加载状态变更历史失败:', error)
        this.statusChangeHistory = []
      }
    },

    /**
     * 搜索状态变更历史
     *
     * @description 重置页码并根据当前筛选条件重新加载数据
     * @returns {void}
     */
    searchStatusHistory() {
      this.statusHistoryPage = 1
      this.loadStatusChangeHistory()
    },

    /**
     * 重置状态变更历史筛选条件
     *
     * @description 清空所有筛选条件并重新加载数据
     * @returns {void}
     */
    resetStatusHistoryFilters() {
      this.statusHistoryFilters = {
        user_id: '',
        operator_id: '',
        status: '',
        startDate: '',
        endDate: ''
      }
      this.statusHistoryPage = 1
      this.loadStatusChangeHistory()
    },

    /**
     * 切换状态变更历史分页
     *
     * @description 切换到指定页码并重新加载数据
     * @param {number} newPage - 目标页码
     * @returns {void}
     */
    changeStatusHistoryPage(newPage) {
      if (newPage < 1 || newPage > this.statusHistoryPagination.totalPages) return
      this.statusHistoryPage = newPage
      this.loadStatusChangeHistory()
    },

    /**
     * 格式化状态变更详情
     *
     * @description 将状态变更日志详情格式化为可读字符串
     * @param {Object} log - 日志记录对象
     * @param {string|Object} log.details - 变更详情（JSON字符串或对象）
     * @returns {string} 格式化后的变更详情（如：active → banned）
     */
    formatStatusChangeDetail(log) {
      if (!log || !log.details) return '-'
      const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
      const oldStatus = details.old_status || details.from_status || '-'
      const newStatus = details.new_status || details.to_status || '-'
      return `${oldStatus} → ${newStatus}`
    },

    /**
     * 获取状态变更标签样式
     *
     * @description 根据状态值返回对应的Bootstrap样式类
     * @param {string} status - 状态标识
     * @returns {string} Bootstrap样式类名
     */
    getStatusChangeClass(status) {
      const classes = {
        active: 'bg-success',
        inactive: 'bg-secondary',
        banned: 'bg-danger',
        frozen: 'bg-warning text-dark',
        pending: 'bg-info'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取状态变更标签文本
     *
     * @description 根据状态值返回对应的中文显示文本
     * @param {string} status - 状态标识
     * @returns {string} 状态的中文显示文本
     */
    getStatusChangeText(status) {
      const labels = {
        active: '正常',
        inactive: '未激活',
        banned: '已封禁',
        frozen: '已冻结',
        pending: '待审核'
      }
      return labels[status] || status
    },

    // ==================== 概率调整操作 ====================

    /**
     * 打开概率调整模态框
     *
     * @description 初始化概率调整表单并加载所需的奖品列表
     * @async
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @param {string} [user.nickname] - 用户昵称
     * @param {string} [user.mobile] - 用户手机号
     * @returns {Promise<void>}
     */
    async openProbabilityModal(user) {
      this.probabilityModal = {
        userId: user.user_id,
        userNickname: user.nickname || user.mobile || `用户${user.user_id}`,
        mode: 'global',
        multiplier: 2.0,
        targetPrizeId: '',
        customProbability: 50,
        duration: 60,
        reason: ''
      }
      this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'

      // 加载奖品列表
      await this.loadPrizesForProbability()

      this.showModal('probabilityModal')
    },

    /**
     * 加载奖品列表（用于特定奖品调整）
     *
     * @description 从API获取奖品列表，用于概率调整时选择目标奖品
     * @async
     * @returns {Promise<void>}
     */
    async loadPrizesForProbability() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.PRIZE.LIST,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.allPrizes = response.data?.prizes || response.data?.list || []
        }
      } catch (error) {
        console.error('加载奖品列表失败:', error)
        this.allPrizes = []
      }
    },

    /**
     * 更新概率预览
     *
     * @description 根据选择的奖品和概率计算调整后的概率分布并生成预览表格
     * @returns {void}
     */
    updateProbabilityPreview() {
      const selectedPrizeId = parseInt(this.probabilityModal.targetPrizeId)
      const newProbability = parseFloat(this.probabilityModal.customProbability) / 100

      if (!selectedPrizeId || !newProbability) {
        this.probabilityPreviewHtml = '<p class="text-muted mb-0">请选择奖品并设置概率</p>'
        return
      }

      const targetPrize = this.allPrizes.find(p => (p.prize_id || p.id) === selectedPrizeId)
      if (!targetPrize) return

      const otherPrizesTotalProb = this.allPrizes
        .filter(p => (p.prize_id || p.id) !== selectedPrizeId)
        .reduce((sum, p) => sum + parseFloat(p.win_probability || p.probability || 0), 0)

      const remainingProb = 1.0 - newProbability
      const scaleFactor = otherPrizesTotalProb > 0 ? remainingProb / otherPrizesTotalProb : 0

      let previewHtml = '<table class="table table-sm mb-0">'
      previewHtml += '<thead><tr><th>奖品</th><th>原概率</th><th>→</th><th>新概率</th></tr></thead>'
      previewHtml += '<tbody>'

      this.allPrizes.forEach(prize => {
        const prizeId = prize.prize_id || prize.id
        const originalProb = parseFloat(prize.win_probability || prize.probability || 0)
        let adjustedProb
        let isTarget = false

        if (prizeId === selectedPrizeId) {
          adjustedProb = newProbability
          isTarget = true
        } else {
          adjustedProb = originalProb * scaleFactor
        }

        const className = isTarget ? 'table-info' : ''
        const prizeName = prize.prize_name || prize.name
        previewHtml += `
          <tr class="${className}">
            <td>${prizeName}${isTarget ? ' 🎯' : ''}</td>
            <td>${(originalProb * 100).toFixed(1)}%</td>
            <td><i class="bi bi-arrow-right"></i></td>
            <td class="fw-bold ${isTarget ? 'text-info' : ''}">${(adjustedProb * 100).toFixed(1)}%</td>
          </tr>
        `
      })

      const totalAdjusted = this.allPrizes.reduce((sum, prize) => {
        const prizeId = prize.prize_id || prize.id
        if (prizeId === selectedPrizeId) return sum + newProbability
        const originalProb = parseFloat(prize.win_probability || prize.probability || 0)
        return sum + originalProb * scaleFactor
      }, 0)

      previewHtml += `
        <tr class="table-light fw-bold">
          <td>总计</td>
          <td>100%</td>
          <td></td>
          <td>${(totalAdjusted * 100).toFixed(1)}%</td>
        </tr>
      `
      previewHtml += '</tbody></table>'

      this.probabilityPreviewHtml = previewHtml
    },

    /**
     * 保存概率调整设置
     *
     * @description 验证表单数据并提交概率调整请求到后端API
     * @async
     * @returns {Promise<void>}
     */
    async saveProbabilityAdjustment() {
      if (!this.probabilityModal.userId) {
        this.showError('未选择用户')
        return
      }

      let requestData = {
        user_id: this.probabilityModal.userId,
        duration_minutes: parseInt(this.probabilityModal.duration) || 60,
        reason: this.probabilityModal.reason || '管理员概率调整'
      }

      if (this.probabilityModal.mode === 'global') {
        const multiplier = parseFloat(this.probabilityModal.multiplier)
        if (!multiplier || multiplier < 0.1 || multiplier > 10) {
          this.showError('概率倍数必须在0.1-10之间')
          return
        }
        requestData.probability_multiplier = multiplier
      } else {
        const prizeId = parseInt(this.probabilityModal.targetPrizeId)
        const customProb = parseFloat(this.probabilityModal.customProbability) / 100

        if (!prizeId) {
          this.showError('请选择要调整的奖品')
          return
        }

        if (!customProb || customProb < 0.01 || customProb > 1.0) {
          this.showError('自定义概率必须在1%-100%之间')
          return
        }

        requestData.prize_id = prizeId
        requestData.custom_probability = customProb
      }

      if (this.saving) return
      this.saving = true

      try {
        const response = await this.apiPost(API_ENDPOINTS.PROBABILITY.ADJUST, requestData)

        if (response && response.success) {
          this.showSuccess(response.message || '用户概率调整成功')
          this.hideModal('probabilityModal')
        } else {
          this.showError(response?.message || '概率调整失败')
        }
      } catch (error) {
        console.error('概率调整失败:', error)
        this.showError(error.message || '概率调整失败')
      } finally {
        this.saving = false
      }
    }
  }))

  console.log('✅ [UserManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})

console.log('📦 [UserManagement] 页面脚本已加载 (Mixin v3.0)')
