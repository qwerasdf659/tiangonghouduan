/**
 * 资产管理页面 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/asset-management.js
 * @description 资产管理综合页面（Tab 导航整合多个子模块）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createPageMixin 组合 Mixin
 * - 整合资产管理相关的多个子模块
 * - 保留 Tab 导航和 URL 参数同步
 * 
 * 包含子模块：
 * - 材料资产类型
 * - 材料账户
 * - 材料交易
 * - 物品实例
 * - 虚拟账户
 * - 虚拟交易
 * - 资产统计
 */

document.addEventListener('alpine:init', () => {
  // ==================== 导航组件 ====================
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
     * 初始化
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
     * 切换页面
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

    // ==================== 计算属性 ====================

    /**
     * 获取当前页面
     */
    get currentPage() {
      return Alpine.store('assetPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化
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
     * 加载所有数据
     */
    async loadAllData() {
      await this.withLoading(async () => {
        await Promise.all([
          this.loadMaterialTypes(),
          this.loadMaterialAccounts(),
          this.loadMaterialTransactions(),
          this.loadItemInstances(),
          this.loadVirtualAccounts(),
          this.loadVirtualTransactions()
        ])
        this.calculateStats()
      }, { loadingText: '加载资产数据...' })
    },

    /**
     * 加载材料类型
     */
    async loadMaterialTypes() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types',
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          this.materialTypes = response.data?.asset_types || response.data?.list || response.data || []
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
        const response = await this.apiCall(
          API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types',
          {
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
          }
        )

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
        const url = `${API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types'}/${form.asset_code}`
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
          const url = `${API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types'}/${assetCode}`
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
        let url = API_ENDPOINTS.MATERIAL?.ACCOUNTS || '/api/v4/admin/material/accounts'
        const params = new URLSearchParams()
        if (this.materialAccountFilters.user_id) params.append('user_id', this.materialAccountFilters.user_id)
        if (this.materialAccountFilters.asset_code) params.append('asset_code', this.materialAccountFilters.asset_code)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          this.materialAccounts = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载材料账户失败:', error)
        this.materialAccounts = []
      }
    },

    /**
     * 加载材料交易
     */
    async loadMaterialTransactions() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.MATERIAL?.TRANSACTIONS || '/api/v4/admin/material/transactions',
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          this.materialTransactions = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载材料交易失败:', error)
        this.materialTransactions = []
      }
    },

    /**
     * 加载物品实例
     */
    async loadItemInstances() {
      try {
        let url = API_ENDPOINTS.ITEM?.INSTANCES || '/api/v4/admin/items/instances'
        const params = new URLSearchParams()
        if (this.itemInstanceFilters.user_id) params.append('user_id', this.itemInstanceFilters.user_id)
        if (this.itemInstanceFilters.status) params.append('status', this.itemInstanceFilters.status)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          this.itemInstances = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载物品实例失败:', error)
        this.itemInstances = []
      }
    },

    /**
     * 加载虚拟账户
     */
    async loadVirtualAccounts() {
      try {
        let url = API_ENDPOINTS.VIRTUAL?.ACCOUNTS || '/api/v4/admin/virtual/accounts'
        const params = new URLSearchParams()
        if (this.virtualAccountFilters.user_id) params.append('user_id', this.virtualAccountFilters.user_id)
        if (this.virtualAccountFilters.currency_type) params.append('currency_type', this.virtualAccountFilters.currency_type)
        if (params.toString()) url += '?' + params.toString()

        const response = await this.apiGet(url, {}, { showLoading: false })
        if (response && response.success) {
          this.virtualAccounts = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载虚拟账户失败:', error)
        this.virtualAccounts = []
      }
    },

    /**
     * 加载虚拟交易
     */
    async loadVirtualTransactions() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.VIRTUAL?.TRANSACTIONS || '/api/v4/admin/virtual/transactions',
          {},
          { showLoading: false }
        )
        if (response && response.success) {
          this.virtualTransactions = response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载虚拟交易失败:', error)
        this.virtualTransactions = []
      }
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

  console.log('✅ [AssetManagementPage] Alpine 组件已注册 (Mixin v3.0)')
})
