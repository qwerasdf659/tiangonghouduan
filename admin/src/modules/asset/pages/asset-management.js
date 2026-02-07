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
 * @requires ASSET_ENDPOINTS - 资产管理API端点配置
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

import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL } from '../../../api/base.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request, API_PREFIX } from '../../../api/base.js'
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
  // 全局 Store: 当前页面状态
  Alpine.store('assetPage', 'material-types')

  // 注册主组件（HTML 使用 assetManagement()）
  Alpine.data('assetManagement', () => ({
    ...createPageMixin({ userResolver: true }),

    // 子页面导航
    current_page: 'material-types',
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
    materialAccountFilters: { mobile: '', asset_code: '' },
    materialAccountPagination: { total: 0, total_pages: 1, current_page: 1 },

    // 材料交易
    materialTransactions: [],
    materialTxFilters: { mobile: '', asset_code: '', type: '' },
    materialTxPagination: { total: 0, total_pages: 1, current_page: 1 },

    // 物品实例
    itemInstances: [],
    itemInstanceFilters: { mobile: '', template_code: '', status: '' },
    itemInstancePagination: { total: 0, total_pages: 1, current_page: 1 },
    instanceDetail: null,

    // 虚拟账户
    virtualAccounts: [],
    virtualAccountFilters: { mobile: '', account_type: '' },
    virtualAccountPagination: { total: 0, total_pages: 1, current_page: 1 },

    // 虚拟交易
    virtualTransactions: [],
    virtualTxFilters: { mobile: '', account_type: '', direction: '' },
    virtualTxPagination: { total: 0, total_pages: 1, current_page: 1 },

    // 资产统计
    assetStats: { totalMaterialValue: 0, totalVirtualValue: 0, totalItemCount: 0 },

    // 资产日志相关
    logFilters: { mobile: '', asset_code: '', start_date: '' },
    assetLogs: [],
    assetTypes: [],
    userAssets: [],

    // 用户资产筛选条件
    userAssetFilters: { mobile: '', asset_code: '' },

    // 通用状态
    saving: false,

    init() {
      logger.info('资产管理页面初始化 (合并组件)')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'material-types'
      this.loadPageData()
    },

    switchPage(pageId) {
      this.current_page = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    async loadPageData() {
      await this.withLoading(async () => {
        switch (this.current_page) {
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
        const response = await this.apiGet(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES)
        logger.debug('[AssetManagement] loadMaterialTypes response:', response)
        if (response.success && response.data) {
          // 后端返回 data.asset_types 数组
          const matTypeData = response.data?.asset_types || response.data?.list || response.data
          this.materialTypes = Array.isArray(matTypeData) ? matTypeData : []
          logger.info(`[AssetManagement] 加载材料类型成功: ${this.materialTypes.length} 条`)
          this.materialTypeStats = {
            total: this.materialTypes.length,
            enabled: this.materialTypes.filter(t => t.is_enabled).length,
            disabled: this.materialTypes.filter(t => !t.is_enabled).length,
            groups: new Set(this.materialTypes.map(t => t.group_code)).size
          }
        }
      } catch (error) {
        logger.error('加载材料类型失败:', error)
      }
    },

    async loadMaterialAccounts() {
      try {
        // 检查是否有手机号，后端 API 需要 user_id 参数
        if (!this.materialAccountFilters.mobile) {
          this.materialAccounts = []
          logger.info('[AssetManagement] 请输入手机号查询资产')
          return
        }
        // 手机号 → resolve 获取 user_id
        const user = await this.resolveUserByMobile(this.materialAccountFilters.mobile)
        if (!user) return

        // 使用正确的资产组合接口，转换参数名为后端格式
        const response = await this.apiGet(ASSET_ENDPOINTS.PORTFOLIO, {
          user_id: user.user_id,
          asset_code: this.materialAccountFilters.asset_code || undefined
        })
        logger.debug('[AssetManagement] loadMaterialAccounts response:', response)
        if (response.success && response.data) {
          // 后端返回 data.fungible_assets 数组
          const matAcctData =
            response.data?.fungible_assets ||
            response.data?.list ||
            response.data?.accounts ||
            response.data
          this.materialAccounts = Array.isArray(matAcctData)
            ? matAcctData.map(item => ({
                ...item,
                user_id: response.data?.user_id || user.user_id,
                balance: item.available_amount || item.balance || 0,
                updated_at: item.updated_at || new Date().toISOString()
              }))
            : []
          logger.info(`[AssetManagement] 加载材料账户成功: ${this.materialAccounts.length} 条`)
        }
      } catch (error) {
        logger.warn('材料账户接口暂不可用，显示空列表:', error.message)
        this.materialAccounts = []
      }
    },

    async loadMaterialTransactions() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.logFilters.mobile) {
          this.materialTransactions = []
          logger.info('请输入手机号进行查询')
          return
        }
        // 手机号 → resolve 获取 user_id
        const user = await this.resolveUserByMobile(this.logFilters.mobile)
        if (!user) return

        const response = await this.apiGet(ASSET_ENDPOINTS.TRANSACTIONS, {
          user_id: user.user_id,
          asset_code: this.logFilters.asset_code
        })
        logger.debug('[AssetManagement] loadMaterialTransactions response:', response)
        if (response.success && response.data) {
          // 后端返回 data.transactions 数组
          const matTxData = response.data?.transactions || response.data?.list || response.data
          this.materialTransactions = Array.isArray(matTxData) ? matTxData : []
          logger.info(`[AssetManagement] 加载材料交易成功: ${this.materialTransactions.length} 条`)
        }
      } catch (error) {
        logger.warn('材料交易查询失败:', error.message)
        this.materialTransactions = []
      }
    },

    async loadItemInstances() {
      try {
        // 使用物品模板接口获取列表
        const response = await this.apiGet(ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST, {
          item_type: this.itemInstanceFilters.template_code || undefined,
          is_enabled:
            this.itemInstanceFilters.status === 'enabled'
              ? true
              : this.itemInstanceFilters.status === 'disabled'
                ? false
                : undefined
        })
        logger.debug('[AssetManagement] loadItemInstances response:', response)
        if (response.success && response.data) {
          // 后端返回 data.list 数组
          const itemInsData = response.data?.list || response.data?.items || response.data
          this.itemInstances = Array.isArray(itemInsData) ? itemInsData : []
          logger.info(`[AssetManagement] 加载物品模板成功: ${this.itemInstances.length} 条`)
        }
      } catch (error) {
        logger.warn('物品模板查询失败:', error.message)
        this.itemInstances = []
      }
    },

    async loadVirtualAccounts() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.virtualAccountFilters.mobile) {
          this.virtualAccounts = []
          logger.info('请输入手机号进行查询')
          return
        }
        // 手机号 → resolve 获取 user_id
        const user = await this.resolveUserByMobile(this.virtualAccountFilters.mobile)
        if (!user) return

        // 使用 ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES 端点
        const url = buildURL(ASSET_ENDPOINTS.ADJUSTMENT_USER_BALANCES, {
          user_id: user.user_id
        })
        const response = await this.apiGet(url)
        if (response.success && response.data) {
          // 过滤出虚拟资产类型（DIAMOND, POINTS 等）
          const balances = response.data?.balances || response.data
          this.virtualAccounts = Array.isArray(balances)
            ? balances.filter(b => ['DIAMOND', 'POINTS', 'CREDITS'].includes(b.asset_code))
            : []
        }
      } catch (error) {
        logger.warn('虚拟账户查询失败:', error.message)
        this.virtualAccounts = []
      }
    },

    async loadVirtualTransactions() {
      try {
        // 后端 API 要求 user_id 是必填参数，没有时显示提示
        if (!this.virtualTxFilters.mobile) {
          this.virtualTransactions = []
          logger.info('请输入手机号进行查询')
          return
        }
        // 手机号 → resolve 获取 user_id
        const user = await this.resolveUserByMobile(this.virtualTxFilters.mobile)
        if (!user) return

        const response = await this.apiGet(ASSET_ENDPOINTS.TRANSACTIONS, {
          user_id: user.user_id,
          account_type: this.virtualTxFilters.account_type,
          type: 'virtual'
        })
        if (response.success && response.data) {
          const virtTxData = response.data?.list || response.data?.transactions || response.data
          this.virtualTransactions = Array.isArray(virtTxData) ? virtTxData : []
        }
      } catch (error) {
        logger.warn('虚拟交易查询失败:', error.message)
        this.virtualTransactions = []
      }
    },

    async loadAssetStats() {
      // 使用 withLoading 包裹，提供加载状态反馈
      await this.withLoading(async () => {
        const response = await this.apiGet(ASSET_ENDPOINTS.STATS)
        logger.debug('[AssetManagement] loadAssetStats response:', response)
        if (response.success && response.data) {
          const assetStats = response.data.asset_stats || []
          const summary = response.data.summary || {}

          // 计算材料资产总值（排除 POINTS, DIAMOND, BUDGET_POINTS 等虚拟资产）
          const virtualAssetCodes = ['POINTS', 'DIAMOND', 'BUDGET_POINTS', 'CREDITS']
          const materialAssets = assetStats.filter(a => !virtualAssetCodes.includes(a.asset_code))
          const virtualAssets = assetStats.filter(a => virtualAssetCodes.includes(a.asset_code))

          const totalMaterialValue = materialAssets.reduce(
            (sum, a) => sum + (a.total_circulation || 0),
            0
          )
          const totalVirtualValue = virtualAssets.reduce(
            (sum, a) => sum + (a.total_circulation || 0),
            0
          )

          this.assetStats = {
            totalMaterialValue,
            totalVirtualValue,
            totalItemCount: this.itemInstances?.length || 0,
            totalAssetTypes: summary.total_asset_types || assetStats.length,
            totalHolders: summary.total_holders || 0,
            totalCirculation: summary.total_circulation || 0,
            totalFrozen: summary.total_frozen || 0,
            raw: response.data
          }
          logger.info('[AssetManagement] 资产统计已加载:', this.assetStats)
          this.showSuccess('统计数据已刷新')
        }
      })
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
          ? buildURL(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPE_DETAIL, { asset_code: form.asset_code })
          : ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES
        const method = this.editingMaterialType ? 'apiPut' : 'apiPost'
        await this[method](endpoint, form)
        this.$refs.materialTypeModal?.hide()
        await this.loadMaterialTypes()
        this.showSuccess(this.editingMaterialType ? '材料类型已更新' : '材料类型已创建')
      } catch (_error) {
        this.showError('保存失败')
      } finally {
        this.saving = false
      }
    },

    viewInstanceDetail(instance) {
      this.instanceDetail = instance
      this.$refs.instanceDetailModal?.show()
    },

    // ✅ 已删除 getStatusText 映射函数，使用后端返回的 status_display 字段
  }))

  // ==================== data-table 组件注册 ====================

  /** 资产类型列表 */
  Alpine.data('assetTypesDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'asset_code', label: '资产代码', sortable: true },
        { key: 'display_name', label: '显示名称', sortable: true },
        { key: 'group_code', label: '分组' },
        { key: 'form', label: '形态' },
        { key: 'is_enabled', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES, method: 'GET', params })
        const types = res.data?.asset_types || res.data?.list || res.data || []
        return { items: types, total: types.length }
      },
      primaryKey: 'asset_code', sortable: true, page_size: 50
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-asset-types', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 资产账户列表 */
  Alpine.data('assetAccountsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'nickname', label: '用户', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'asset_code', label: '资产类型' },
        { key: 'balance', label: '余额', type: 'number', sortable: true },
        { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.MATERIAL_USERS, method: 'GET', params })
        return { items: res.data?.list || res.data?.rows || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-asset-accounts', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 资产交易记录 */
  Alpine.data('assetTransactionsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'transaction_id', label: '交易ID', sortable: true },
        { key: 'user_id', label: '用户ID' },
        { key: 'asset_code', label: '资产类型' },
        { key: 'amount', label: '金额', type: 'number', sortable: true },
        { key: 'transaction_type', label: '类型', render: (val, row) => row.transaction_type_display || val || '-' },
        { key: 'created_at', label: '时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.MATERIAL_TRANSACTIONS, method: 'GET', params })
        return { items: res.data?.list || res.data?.transactions || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'transaction_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-asset-transactions', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 物品实例列表 */
  Alpine.data('itemInstancesDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'item_instance_id', label: '实例ID', sortable: true },
        { key: 'item_name', label: '物品名称', render: (val, row) => val || row.template_name || '-' },
        { key: 'owner_user_id', label: '持有者' },
        { key: 'status', label: '状态', type: 'status' },
        { key: 'source', label: '来源', render: (val, row) => row.source_display || val || '-' },
        { key: 'created_at', label: '获取时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.ITEM_INSTANCE_LIST, method: 'GET', params })
        return { items: res.data?.list || res.data?.instances || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'item_instance_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-item-instances', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 虚拟账户列表 */
  Alpine.data('virtualAccountsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'user_id', label: '用户ID', sortable: true },
        { key: 'nickname', label: '用户', render: (val, row) => val || row.user_nickname || '-' },
        { key: 'diamond_balance', label: '钻石余额', type: 'number', sortable: true },
        { key: 'points_balance', label: '积分余额', type: 'number', sortable: true },
        { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.DIAMOND_USERS || `${API_PREFIX}/console/diamond/users`, method: 'GET', params })
        return { items: res.data?.list || res.data?.rows || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'user_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-virtual-accounts', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  /** 虚拟交易记录 */
  Alpine.data('virtualTransactionsDataTable', () => {
    const table = dataTable({
      columns: [
        { key: 'transaction_id', label: '交易ID', sortable: true },
        { key: 'user_id', label: '用户ID' },
        { key: 'type', label: '类型', render: (val, row) => row.type_display || val || '-' },
        { key: 'amount', label: '金额', type: 'number', sortable: true },
        { key: 'balance_after', label: '交易后余额', type: 'number' },
        { key: 'description', label: '说明', type: 'truncate', maxLength: 30 },
        { key: 'created_at', label: '时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: ASSET_ENDPOINTS.TRANSACTIONS, method: 'GET', params })
        return { items: res.data?.list || res.data?.transactions || res.data || [], total: res.data?.pagination?.total || res.data?.count || 0 }
      },
      primaryKey: 'transaction_id', sortable: true, page_size: 20
    })
    const origInit = table.init
    table.init = async function () { window.addEventListener('refresh-virtual-transactions', () => this.loadData()); if (origInit) await origInit.call(this) }
    return table
  })

  logger.info('[AssetManagementPage] Alpine 组件已注册 (Mixin v3.0 + 6 data-table)')
})
