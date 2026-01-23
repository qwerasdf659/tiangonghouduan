/**
 * 资产管理页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/asset/pages/asset-management.js
 * @description 资产管理综合页面，提供材料资产、物品实例、虚拟账户的统一管理
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module AssetManagementPage
 *
 * @requires Alpine.js - 响应式框架
 * @requires createPageMixin - 页面基础功能混入
 * @requires API_ENDPOINTS - API端点配置
 *
 * 功能模块：
 * 1. 材料资产类型 - 资产类型CRUD、启用禁用
 * 2. 材料账户 - 用户材料余额查询
 * 3. 材料交易 - 材料交易记录
 * 4. 物品实例 - 物品实例查询和管理
 * 5. 虚拟账户 - 虚拟货币余额
 * 6. 虚拟交易 - 虚拟货币交易记录
 * 7. 资产统计 - 资产汇总统计
 *
 * 后端API：
 * - GET/POST/PUT/DELETE /api/v4/console/material/asset-types (资产类型)
 * - GET /api/v4/console/material/accounts (材料账户)
 * - GET /api/v4/console/material/transactions (材料交易)
 * - GET /api/v4/console/item-instances (物品实例)
 * - GET /api/v4/console/virtual-accounts (虚拟账户)
 */

/**
 * @typedef {Object} MaterialType
 * @property {string} asset_code - 资产代码
 * @property {string} display_name - 显示名称
 * @property {string} group_code - 分组代码
 * @property {string} form - 形态
 * @property {number} tier - 等级
 * @property {number} visible_value_points - 可见价值点
 * @property {number} budget_value_points - 预算价值点
 * @property {number} sort_order - 排序
 * @property {boolean} is_enabled - 是否启用
 */

/**
 * @typedef {Object} SubPage
 * @property {string} id - 子页面ID
 * @property {string} title - 子页面标题
 * @property {string} icon - Bootstrap图标类名
 */

document.addEventListener('alpine:init', () => {
  // ==================== 导航组件 ====================
  /**
   * 资产管理导航组件
   *
   * @function assetNavigation
   * @description 提供资产管理子页面切换导航功能
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('assetNavigation', () => ({
    ...createPageMixin(),

    /** 当前页面 */
    currentPage: 'material-types',

    /** 子页面配置 */
    subPages: [
      { id: 'material-types', title: '材料资产类型', icon: 'bi-archive' },
      { id: 'material-accounts', title: '材料账户', icon: 'bi-wallet2' },
      { id: 'material-transactions', title: '材料交易', icon: 'bi-arrow-left-right' },
      { id: 'item-instances', title: '物品实例', icon: 'bi-collection' },
      { id: 'virtual-accounts', title: '虚拟账户', icon: 'bi-coin' },
      { id: 'virtual-transactions', title: '虚拟交易', icon: 'bi-receipt-cutoff' },
      { id: 'asset-stats', title: '资产统计', icon: 'bi-graph-up' }
    ],

    /**
     * 初始化导航组件
     * @description 验证权限并从URL同步当前页面状态
     * @returns {void}
     */
    init() {
      console.log('✅ 资产管理导航初始化 (Mixin v3.0)')

      // 权限检查
      if (!this.checkAuth()) return

      // 从 URL 参数获取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'material-types'
      Alpine.store('assetPage', this.currentPage)
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标子页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('assetPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // 全局 Store: 当前页面状态
  Alpine.store('assetPage', 'material-types')

  // ==================== 页面内容组件 ====================
  /**
   * 资产管理页面内容组件
   *
   * @function assetPageContent
   * @description 资产管理主内容区域，包含材料、物品、虚拟账户管理
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('assetPageContent', () => ({
    ...createPageMixin(),

    // ==================== 数据状态 ====================

    /** 材料类型列表 */
    materialTypes: [],

    /** 材料类型统计 */
    materialTypeStats: { total: 0, enabled: 0, disabled: 0, groups: 0 },

    /** 材料类型添加表单 */
    materialTypeAddForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },

    /** 材料类型编辑表单 */
    materialTypeEditForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },

    /** 材料类型提交状态 */
    materialTypeSubmitting: false,

    // Modal 实例由 modalMixin 统一管理，使用 x-ref 引用

    /** 材料账户列表 */
    materialAccounts: [],

    /** 材料交易列表 */
    materialTransactions: [],

    /** 物品实例列表 */
    itemInstances: [],

    /** 虚拟账户列表 */
    virtualAccounts: [],

    /** 虚拟交易列表 */
    virtualTransactions: [],

    /** 材料账户筛选条件 */
    materialAccountFilters: { user_id: '', asset_code: '' },

    /** 物品实例筛选条件 */
    itemInstanceFilters: { user_id: '', status: '' },

    /** 虚拟账户筛选条件 */
    virtualAccountFilters: { user_id: '', currency_type: '' },

    /** 资产统计 */
    assetStats: {
      materialTypesCount: 0,
      itemInstancesCount: 0,
      totalCoins: 0,
      totalDiamonds: 0
    },

    /** 资产日志筛选条件 */
    logFilters: {
      userId: '',
      assetCode: '',
      startDate: ''
    },

    /** 用户资产筛选条件 */
    userAssetFilters: {
      userId: '',
      assetCode: ''
    },

    /** 资产日志列表 */
    assetLogs: [],

    /** 资产类型列表（用于下拉选择） */
    assetTypes: [],

    /** 用户资产列表 */
    userAssets: [],

    // ==================== 计算属性 ====================

    /**
     * 获取当前页面
     */
    get currentPage() {
      return Alpine.store('assetPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化页面内容组件
     * @description 加载数据并监听页面切换
     * @returns {void}
     */
    init() {
      console.log('✅ 资产管理内容初始化 (Mixin v3.0)')

      // 初始加载数据
      this.loadAllData()

      // 监听页面切换
      this.$watch('$store.assetPage', () => this.loadAllData())
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有资产数据
     * @async
     * @description 并行加载材料类型、账户、交易、物品实例、虚拟账户等数据
     * @returns {Promise<void>}
     */
    async loadAllData() {
      await this.withLoading(
        async () => {
          await Promise.all([
            this.loadMaterialTypes(),
            this.loadMaterialAccounts(),
            this.loadMaterialTransactions(),
            this.loadItemInstances(),
            this.loadVirtualAccounts(),
            this.loadVirtualTransactions()
          ])
          this.calculateStats()
        },
        { loadingText: '加载资产数据...' }
      )
    },

    /**
     * 加载材料类型
     */
    async loadMaterialTypes() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.MATERIAL.ASSET_TYPES,
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          const data = response.data?.asset_types || response.data?.list || response.data
          this.materialTypes = Array.isArray(data) ? data : []
          this.updateMaterialTypeStats()
        }
      } catch (error) {
        console.error('加载材料类型失败:', error)
        this.materialTypes = []
      }
    },

    /**
     * 更新材料类型统计
     */
    updateMaterialTypeStats() {
      const enabled = this.materialTypes.filter(a => a.is_enabled).length
      const groups = new Set(this.materialTypes.map(a => a.group_code)).size

      this.materialTypeStats = {
        total: this.materialTypes.length,
        enabled: enabled,
        disabled: this.materialTypes.length - enabled,
        groups: groups
      }
    },

    // ==================== 材料类型 CRUD 操作 ====================

    /**
     * 打开添加材料类型弹窗
     */
    openAddMaterialTypeModal() {
      this.materialTypeAddForm = {
        asset_code: '',
        display_name: '',
        group_code: '',
        form: '',
        tier: '',
        visible_value_points: '',
        budget_value_points: '',
        sort_order: 0,
        is_enabled: '1'
      }
      this.showModal('addMaterialTypeModal')
    },

    /**
     * 提交添加材料类型
     */
    async submitAddMaterialType() {
      const form = this.materialTypeAddForm
      if (!form.asset_code || !form.display_name || !form.group_code || !form.form || !form.tier) {
        this.showError('请填写所有必填项')
        return
      }

      this.materialTypeSubmitting = true

      try {
        const response = await this.apiCall(API_ENDPOINTS.MATERIAL.ASSET_TYPES, {
          method: 'POST',
          body: JSON.stringify({
            asset_code: form.asset_code.trim(),
            display_name: form.display_name.trim(),
            group_code: form.group_code.trim(),
            form: form.form,
            tier: parseInt(form.tier),
            visible_value_points: parseInt(form.visible_value_points) || 0,
            budget_value_points: parseInt(form.budget_value_points) || 0,
            sort_order: parseInt(form.sort_order) || 0,
            is_enabled: parseInt(form.is_enabled)
          })
        })

        if (response?.success) {
          this.showSuccess('添加成功')
          this.hideModal('addMaterialTypeModal')
          await this.loadMaterialTypes()
        } else {
          this.showError(response?.message || '添加失败')
        }
      } catch (error) {
        console.error('添加材料类型失败:', error)
        this.showError('添加失败，请稍后重试')
      } finally {
        this.materialTypeSubmitting = false
      }
    },

    /**
     * 打开编辑材料类型弹窗
     */
    openEditMaterialTypeModal(assetCode) {
      const asset = this.materialTypes.find(a => a.asset_code === assetCode)
      if (!asset) return

      this.materialTypeEditForm = {
        asset_code: asset.asset_code,
        display_name: asset.display_name || asset.name,
        group_code: asset.group_code,
        form: asset.form,
        tier: asset.tier,
        visible_value_points: asset.visible_value_points,
        budget_value_points: asset.budget_value_points,
        sort_order: asset.sort_order,
        is_enabled: asset.is_enabled ? '1' : '0'
      }

      this.showModal('editMaterialTypeModal')
    },

    /**
     * 提交编辑材料类型
     */
    async submitEditMaterialType() {
      const form = this.materialTypeEditForm
      if (!form.display_name) {
        this.showError('请填写显示名称')
        return
      }

      this.materialTypeSubmitting = true

      try {
        const url = `${API_ENDPOINTS.MATERIAL.ASSET_TYPES}/${form.asset_code}`
        const response = await this.apiCall(url, {
          method: 'PUT',
          body: JSON.stringify({
            display_name: form.display_name.trim(),
            visible_value_points: parseInt(form.visible_value_points) || 0,
            budget_value_points: parseInt(form.budget_value_points) || 0,
            sort_order: parseInt(form.sort_order) || 0,
            is_enabled: parseInt(form.is_enabled)
          })
        })

        if (response?.success) {
          this.showSuccess('更新成功')
          this.hideModal('editMaterialTypeModal')
          await this.loadMaterialTypes()
        } else {
          this.showError(response?.message || '更新失败')
        }
      } catch (error) {
        console.error('更新材料类型失败:', error)
        this.showError('更新失败，请稍后重试')
      } finally {
        this.materialTypeSubmitting = false
      }
    },

    /**
     * 切换材料类型状态
     */
    async toggleMaterialTypeStatus(assetCode, currentStatus) {
      const newStatus = currentStatus ? 0 : 1
      const action = newStatus ? '启用' : '禁用'

      await this.confirmAndExecute(
        `确定要${action}该资产类型吗？`,
        async () => {
          const url = `${API_ENDPOINTS.MATERIAL.ASSET_TYPES}/${assetCode}`
          const response = await this.apiCall(url, {
            method: 'PUT',
            body: JSON.stringify({ is_enabled: newStatus })
          })

          if (response?.success) {
            await this.loadMaterialTypes()
          }
        },
        { successMessage: `${action}成功` }
      )
    },

    /**
     * 获取形态标签
     */
    getFormLabel(form) {
      const labels = { shard: '碎片', crystal: '水晶' }
      return labels[form] || form || '-'
    },

    /**
     * 获取形态颜色
     */
    getFormColor(form) {
      return form === 'shard' ? 'bg-warning' : 'bg-primary'
    },

    /**
     * 加载材料账户
     */
    async loadMaterialAccounts() {
      try {
        // 使用已存在的资产组合接口
        let url = API_ENDPOINTS.ASSETS.PORTFOLIO
        const params = new URLSearchParams()
        if (this.materialAccountFilters.user_id)
          params.append('user_id', this.materialAccountFilters.user_id)
        if (this.materialAccountFilters.asset_code)
          params.append('asset_code', this.materialAccountFilters.asset_code)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          const data = response.data?.list || response.data?.accounts || response.data
          this.materialAccounts = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.warn('材料账户接口暂不可用')
        this.materialAccounts = []
      }
    },

    /**
     * 加载材料交易
     */
    async loadMaterialTransactions() {
      // 后端要求 user_id 必填，页面初始加载时不调用
      this.materialTransactions = []
      // 此接口需要用户手动搜索，初始化时不自动加载
    },

    /**
     * 加载物品实例
     */
    async loadItemInstances() {
      try {
        // 使用已存在的物品模板接口
        const response = await this.apiGet(
          API_ENDPOINTS.ITEM_TEMPLATE.LIST,
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          const data = response.data?.list || response.data?.items || response.data
          this.itemInstances = Array.isArray(data) ? data : []
        }
      } catch (error) {
        console.warn('物品实例查询失败:', error.message)
        this.itemInstances = []
      }
    },

    /**
     * 加载虚拟账户
     */
    async loadVirtualAccounts() {
      // 后端要求 user_id 必填，页面初始加载时不调用
      this.virtualAccounts = []
      // 此接口需要用户手动搜索，初始化时不自动加载
    },

    /**
     * 加载虚拟交易
     */
    async loadVirtualTransactions() {
      // 后端要求 user_id 必填，页面初始加载时不调用
      this.virtualTransactions = []
      // 此接口需要用户手动搜索，初始化时不自动加载
    },

    // ==================== 统计计算 ====================

    /**
     * 计算统计数据
     */
    calculateStats() {
      this.assetStats = {
        materialTypesCount: this.materialTypes.length,
        itemInstancesCount: this.itemInstances.length,
        totalCoins: this.virtualAccounts
          .filter(a => a.currency_type === 'coins')
          .reduce((sum, a) => sum + (a.balance || 0), 0),
        totalDiamonds: this.virtualAccounts
          .filter(a => a.currency_type === 'diamonds')
          .reduce((sum, a) => sum + (a.balance || 0), 0)
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 获取物品实例状态样式
     */
    getInstanceStatusClass(status) {
      const map = {
        active: 'bg-success',
        used: 'bg-secondary',
        expired: 'bg-danger',
        locked: 'bg-warning'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取物品实例状态文本
     */
    getInstanceStatusText(status) {
      const map = {
        active: '正常',
        used: '已使用',
        expired: '已过期',
        locked: '锁定中'
      }
      return map[status] || status
    },

    /**
     * 获取货币名称
     */
    getCurrencyName(type) {
      const map = {
        coins: '金币',
        diamonds: '钻石',
        points: '积分'
      }
      return map[type] || type
    },

    // ==================== 物品实例操作 ====================

    /** 当前查看的物品实例详情 */
    instanceDetail: null,

    /**
     * 查看物品实例详情
     * @param {Object} instance - 物品实例对象
     */
    viewInstanceDetail(instance) {
      this.instanceDetail = instance
      this.showModal('instanceDetailModal')
    }
  }))

  // 注册主组件别名（HTML 使用 assetManagement()）
  Alpine.data('assetManagement', () => ({
    ...createPageMixin(),

    // 子页面导航
    currentPage: 'material-types',
    subPages: [
      { id: 'material-types', name: '材料资产类型', icon: '📦' },
      { id: 'material-accounts', name: '材料账户', icon: '💰' },
      { id: 'material-transactions', name: '材料交易', icon: '🔄' },
      { id: 'item-instances', name: '物品实例', icon: '🎁' },
      { id: 'virtual-accounts', name: '虚拟账户', icon: '💎' },
      { id: 'virtual-transactions', name: '虚拟交易', icon: '📊' },
      { id: 'asset-stats', name: '资产统计', icon: '📈' }
    ],

    // 材料类型
    materialTypes: [],
    materialTypeStats: { total: 0, enabled: 0, disabled: 0, groups: 0 },
    materialTypeAddForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },
    materialTypeEditForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },
    editingMaterialType: null,

    // 材料账户
    materialAccounts: [],
    materialAccountFilters: { userId: '', assetCode: '' },
    materialAccountPagination: { total: 0, totalPages: 1, currentPage: 1 },

    // 材料交易
    materialTransactions: [],
    materialTxFilters: { userId: '', assetCode: '', type: '' },
    materialTxPagination: { total: 0, totalPages: 1, currentPage: 1 },

    // 物品实例
    itemInstances: [],
    itemInstanceFilters: { userId: '', templateCode: '', status: '' },
    itemInstancePagination: { total: 0, totalPages: 1, currentPage: 1 },
    instanceDetail: null,

    // 虚拟账户
    virtualAccounts: [],
    virtualAccountFilters: { userId: '', accountType: '' },
    virtualAccountPagination: { total: 0, totalPages: 1, currentPage: 1 },

    // 虚拟交易
    virtualTransactions: [],
    virtualTxFilters: { userId: '', accountType: '', direction: '' },
    virtualTxPagination: { total: 0, totalPages: 1, currentPage: 1 },

    // 资产统计
    assetStats: { totalMaterialValue: 0, totalVirtualValue: 0, totalItemCount: 0 },

    // 资产日志相关
    logFilters: { userId: '', assetCode: '', startDate: '' },
    assetLogs: [],
    assetTypes: [],
    userAssets: [],

    // 用户资产筛选条件
    userAssetFilters: { userId: '', assetCode: '' },

    // 通用状态
    saving: false,

    init() {
      console.log('✅ 资产管理页面初始化 (合并组件)')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'material-types'
      this.loadPageData()
    },

    switchPage(pageId) {
      this.currentPage = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    async loadPageData() {
      await this.withLoading(async () => {
        switch (this.currentPage) {
          case 'material-types':
            await this.loadMaterialTypes()
            break
          case 'material-accounts':
            await this.loadMaterialAccounts()
            break
          case 'material-transactions':
            await this.loadMaterialTransactions()
            break
          case 'item-instances':
            await this.loadItemInstances()
            break
          case 'virtual-accounts':
            await this.loadVirtualAccounts()
            break
          case 'virtual-transactions':
            await this.loadVirtualTransactions()
            break
          case 'asset-stats':
            await this.loadAssetStats()
            break
        }
      })
    },

    async loadMaterialTypes() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.MATERIAL.ASSET_TYPES)
        if (response.success && response.data) {
          const matTypeData = response.data?.list || response.data
          this.materialTypes = Array.isArray(matTypeData) ? matTypeData : []
          this.materialTypeStats = {
            total: this.materialTypes.length,
            enabled: this.materialTypes.filter(t => t.is_enabled).length,
            disabled: 0,
            groups: 0
          }
        }
      } catch (error) {
        console.error('加载材料类型失败:', error)
      }
    },

    async loadMaterialAccounts() {
      try {
        // 使用正确的资产组合接口
        const response = await this.apiGet(
          API_ENDPOINTS.ASSETS.PORTFOLIO,
          this.materialAccountFilters
        )
        if (response.success && response.data) {
          const matAcctData = response.data?.list || response.data?.accounts || response.data
          this.materialAccounts = Array.isArray(matAcctData) ? matAcctData : []
        }
      } catch (error) {
        console.warn('材料账户接口暂不可用，显示空列表')
        this.materialAccounts = []
      }
    },

    async loadMaterialTransactions() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.materialTxFilters.userId) {
          this.materialTransactions = []
          console.log('请输入用户ID进行查询')
          return
        }
        const response = await this.apiGet(API_ENDPOINTS.ASSETS.TRANSACTIONS, {
          user_id: this.materialTxFilters.userId,
          asset_code: this.materialTxFilters.assetCode,
          type: 'material'
        })
        if (response.success && response.data) {
          const matTxData = response.data?.list || response.data?.transactions || response.data
          this.materialTransactions = Array.isArray(matTxData) ? matTxData : []
        }
      } catch (error) {
        console.warn('材料交易查询失败:', error.message)
        this.materialTransactions = []
      }
    },

    async loadItemInstances() {
      try {
        // 使用已存在的物品模板接口
        const response = await this.apiGet(
          API_ENDPOINTS.ITEM_TEMPLATE.LIST,
          this.itemInstanceFilters
        )
        if (response.success && response.data) {
          const itemInsData = response.data?.list || response.data?.items || response.data
          this.itemInstances = Array.isArray(itemInsData) ? itemInsData : []
        }
      } catch (error) {
        console.warn('物品实例查询失败:', error.message)
        this.itemInstances = []
      }
    },

    async loadVirtualAccounts() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.virtualAccountFilters.userId) {
          this.virtualAccounts = []
          console.log('请输入用户ID进行查询')
          return
        }
        // 使用已存在的 API 端点 /asset-adjustment/user/:user_id/balances
        const response = await this.apiGet(
          `/api/v4/console/asset-adjustment/user/${this.virtualAccountFilters.userId}/balances`
        )
        if (response.success && response.data) {
          // 过滤出虚拟资产类型（DIAMOND, POINTS 等）
          const balances = response.data?.balances || response.data
          this.virtualAccounts = Array.isArray(balances)
            ? balances.filter(b => ['DIAMOND', 'POINTS', 'CREDITS'].includes(b.asset_code))
            : []
        }
      } catch (error) {
        console.warn('虚拟账户查询失败:', error.message)
        this.virtualAccounts = []
      }
    },

    async loadVirtualTransactions() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.virtualTxFilters.userId) {
          this.virtualTransactions = []
          console.log('请输入用户ID进行查询')
          return
        }
        const response = await this.apiGet(API_ENDPOINTS.ASSETS.TRANSACTIONS, {
          user_id: this.virtualTxFilters.userId,
          account_type: this.virtualTxFilters.accountType,
          type: 'virtual'
        })
        if (response.success && response.data) {
          const virtTxData = response.data?.list || response.data?.transactions || response.data
          this.virtualTransactions = Array.isArray(virtTxData) ? virtTxData : []
        }
      } catch (error) {
        console.warn('虚拟交易查询失败:', error.message)
        this.virtualTransactions = []
      }
    },

    async loadAssetStats() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.ASSETS.STATS)
        if (response.success && response.data) {
          this.assetStats = response.data
        }
      } catch (error) {
        console.error('加载资产统计失败:', error)
      }
    },

    openAddMaterialTypeModal() {
      this.editingMaterialType = null
      this.materialTypeAddForm = {
        asset_code: '',
        display_name: '',
        group_code: '',
        form: '',
        tier: '',
        visible_value_points: '',
        budget_value_points: '',
        sort_order: 0,
        is_enabled: '1'
      }
      this.$refs.materialTypeModal?.show()
    },

    editMaterialType(type) {
      this.editingMaterialType = type
      this.materialTypeEditForm = { ...type }
      this.$refs.materialTypeModal?.show()
    },

    async saveMaterialType() {
      try {
        this.saving = true
        const form = this.editingMaterialType ? this.materialTypeEditForm : this.materialTypeAddForm
        const endpoint = this.editingMaterialType
          ? API.buildURL(API_ENDPOINTS.MATERIAL.ASSET_TYPE_DETAIL, { asset_code: form.asset_code })
          : API_ENDPOINTS.MATERIAL.ASSET_TYPES
        const method = this.editingMaterialType ? 'apiPut' : 'apiPost'
        await this[method](endpoint, form)
        this.$refs.materialTypeModal?.hide()
        await this.loadMaterialTypes()
        this.showSuccess(this.editingMaterialType ? '材料类型已更新' : '材料类型已创建')
      } catch (error) {
        this.showError('保存失败')
      } finally {
        this.saving = false
      }
    },

    viewInstanceDetail(instance) {
      this.instanceDetail = instance
      this.$refs.instanceDetailModal?.show()
    },

    getStatusText(status) {
      const map = {
        active: '有效',
        inactive: '无效',
        used: '已使用',
        expired: '已过期',
        pending: '待处理'
      }
      return map[status] || status || '-'
    },

    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    }
  }))

  console.log('✅ [AssetManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})
