/**
 * Market Management Page - Alpine.js Mixin 重构版
 * 市场管理整合页面组件
 *
 * @file admin/src/modules/market/pages/market-management.js
 * @description 市场管理整合页面，包含兑换商品、兑换订单、交易订单等子模块
 * @version 3.0.1 (Mixin 重构版 - CRUD 完整实现)
 * @date 2026-01-23
 * @module MarketManagementPage
 *
 * @requires Alpine.js - 响应式框架
 * @requires createDashboardMixin - 仪表板基础混入
 * @requires MARKET_ENDPOINTS - 市场模块API端点配置
 * @requires ASSET_ENDPOINTS - 资产模块API端点配置
 *
 * 功能模块：
 * 1. 兑换商品管理 - 商品CRUD、库存管理
 * 2. 兑换订单管理 - 订单查看、状态筛选
 * 3. 兑换统计 - 商品统计、订单统计
 * 4. 交易订单管理 - C2C交易订单
 * 5. 市场统计 - 交易量、成交统计
 *
 * 后端API：
 * - GET/POST/PUT/DELETE /api/v4/console/marketplace/exchange-items (兑换商品)
 * - GET /api/v4/console/marketplace/exchange-orders (兑换订单)
 * - GET /api/v4/console/marketplace/trade-orders (交易订单)
 */


import { logger } from '../../../utils/logger.js'
import { MARKET_ENDPOINTS } from '../../../api/market.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
/**
 * @typedef {Object} ExchangeItem
 * @property {number} item_id - 商品ID
 * @property {string} item_name - 商品名称
 * @property {string} item_description - 商品描述
 * @property {string} cost_asset_code - 消耗资产代码
 * @property {number} cost_amount - 消耗数量
 * @property {number} cost_price - 价格
 * @property {number} stock - 库存数量
 * @property {number} sort_order - 排序
 * @property {string} status - 状态 ('active'|'inactive')
 */

/**
 * @typedef {Object} ExchangeOrder
 * @property {number} order_id - 订单ID
 * @property {number} user_id - 用户ID
 * @property {number} item_id - 商品ID
 * @property {number} points_cost - 积分消耗
 * @property {string} status - 状态 ('pending'|'completed'|'cancelled'|'refunded')
 * @property {string} created_at - 创建时间
 */

/**
 * @typedef {Object} SubPage
 * @property {string} id - 子页面ID
 * @property {string} title - 子页面标题
 * @property {string} icon - Bootstrap图标类名
 */

document.addEventListener('alpine:init', () => {
  /**
   * 市场管理导航组件
   *
   * @function marketNavigation
   * @description 提供市场管理子页面切换导航功能
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('marketNavigation', () => ({
    /**
     * 当前激活的子页面ID
     * @type {string}
     */
    currentPage: 'exchange-items',

    /**
     * 子页面配置列表
     * @type {SubPage[]}
     */
    subPages: [
      { id: 'exchange-items', title: '兑换商品', icon: 'bi-box-seam' },
      { id: 'exchange-orders', title: '兑换订单', icon: 'bi-receipt' },
      { id: 'exchange-stats', title: '兑换统计', icon: 'bi-graph-up' },
      { id: 'trade-orders', title: '交易订单', icon: 'bi-arrow-left-right' },
      { id: 'marketplace-stats', title: '市场统计', icon: 'bi-shop' }
    ],

    /**
     * 初始化导航组件
     * @description 从URL参数获取初始页面并同步到Store
     * @returns {void}
     */
    init() {
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'exchange-items'
      Alpine.store('marketPage', this.currentPage)
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标子页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('marketPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // 创建页面状态Store
  Alpine.store('marketPage', 'exchange-items')

  /**
   * 市场管理页面内容组件
   *
   * @function marketPageContent
   * @description 市场管理主内容区域，包含商品CRUD、订单管理、统计展示
   * @returns {Object} Alpine.js组件配置对象
   */
  Alpine.data('marketPageContent', () => ({
    // 组合 Mixin
    ...createDashboardMixin(),

    // ==================== 数据状态 ====================

    /** 兑换商品列表 */
    exchangeItems: [],

    /** 兑换订单列表 */
    exchangeOrders: [],

    /** 兑换订单筛选条件 */
    orderFilters: {
      status: '',
      userId: '',
      startDate: ''
    },

    /** 交易订单列表 */
    tradeOrders: [],

    /** 资产类型列表 */
    assetTypes: [],

    /** 兑换统计 */
    exchangeStats: { totalItems: 0, totalOrders: 0, totalPoints: 0, successRate: 0 },

    /** 市场统计 */
    marketStats: { totalListings: 0, completedTrades: 0, totalVolume: 0 },

    /** 商品表单 */
    itemForm: {
      item_id: null,
      item_name: '',
      item_description: '',
      cost_asset_code: '',
      cost_amount: 1,
      cost_price: 0,
      stock: 0,
      sort_order: 100,
      status: 'active'
    },

    /** 是否编辑模式 */
    editingItem: false,

    /** 选中的订单 */
    selectedOrder: null,

    /** 选中的交易 */
    selectedTrade: null,

    /** 保存中状态 */
    saving: false,

    // ==================== 计算属性 ====================

    get currentPage() {
      return Alpine.store('marketPage')
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化市场管理页面
     * @description 验证登录、加载数据、监听页面切换
     * @returns {void}
     */
    init() {
      logger.info('市场管理整合页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      this.loadAllData()
      this.$watch('$store.marketPage', () => this.loadAllData())
    },

    // ==================== 数据加载 ====================

    /**
     * 加载所有市场数据
     * @async
     * @description 并行加载资产类型、商品、订单、交易数据
     * @returns {Promise<void>}
     */
    async loadAllData() {
      await this.withLoading(async () => {
        await Promise.all([
          this.loadAssetTypes(),
          this.loadExchangeItems(),
          this.loadExchangeOrders(),
          this.loadTradeOrders()
        ])
        this._calculateStats()
        return true
      })
    },

    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      try {
        const response = await apiRequest(ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES + '?is_enabled=true')
        if (response && response.success) {
          const assetData = response.data?.asset_types || response.data?.list || response.data
          this.assetTypes = Array.isArray(assetData) ? assetData : []
        }
      } catch (error) {
        logger.error('加载资产类型失败:', error)
        // 使用默认值
        this.assetTypes = [
          { asset_code: 'red_shard', display_name: '碎红水晶' },
          { asset_code: 'red_crystal', display_name: '完整红水晶' }
        ]
      }
    },

    /**
     * 加载兑换商品列表
     * @async
     * @returns {Promise<void>}
     */
    async loadExchangeItems() {
      try {
        const response = await apiRequest(MARKET_ENDPOINTS.EXCHANGE_ITEMS)
        if (response && response.success) {
          const itemsData = response.data?.items || response.data?.list || response.data
          this.exchangeItems = Array.isArray(itemsData) ? itemsData : []
        }
      } catch (error) {
        logger.error('加载兑换商品失败:', error)
        this.exchangeItems = []
      }
    },

    /**
     * 加载兑换订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadExchangeOrders() {
      try {
        const response = await apiRequest(MARKET_ENDPOINTS.EXCHANGE_ORDERS)
        if (response && response.success) {
          const ordersData = response.data?.orders || response.data?.list || response.data
          this.exchangeOrders = Array.isArray(ordersData) ? ordersData : []
        }
      } catch (error) {
        logger.error('加载兑换订单失败:', error)
        this.exchangeOrders = []
      }
    },

    /**
     * 加载交易订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadTradeOrders() {
      try {
        const response = await apiRequest(MARKET_ENDPOINTS.TRADE_ORDERS)
        if (response && response.success) {
          const tradesData = response.data?.trades || response.data?.list || response.data
          this.tradeOrders = Array.isArray(tradesData) ? tradesData : []
        }
      } catch (error) {
        logger.error('加载交易订单失败:', error)
        this.tradeOrders = []
      }
    },

    // ==================== 统计计算 ====================

    /**
     * 计算统计数据
     * @private
     * @description 根据加载的数据计算兑换统计和市场统计
     * @returns {void}
     */
    _calculateStats() {
      this.exchangeStats = {
        totalItems: this.exchangeItems.length,
        totalOrders: this.exchangeOrders.length,
        totalPoints: this.exchangeOrders.reduce((sum, o) => sum + (o.points_cost || 0), 0),
        successRate:
          this.exchangeOrders.length > 0
            ? Math.round(
                (this.exchangeOrders.filter(o => o.status === 'completed').length /
                  this.exchangeOrders.length) *
                  100
              )
            : 0
      }

      this.marketStats = {
        totalListings: this.exchangeItems.filter(i => i.is_enabled || i.status === 'active').length,
        completedTrades: this.tradeOrders.filter(t => t.status === 'completed').length,
        totalVolume: this.tradeOrders
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + (t.price || 0), 0)
      }
    },

    // ==================== 工具方法 ====================

    /**
     * 获取订单状态CSS类名
     * @param {string} status - 订单状态
     * @returns {string} Bootstrap徽章类名
     */
    getOrderStatusClass(status) {
      const map = {
        pending: 'bg-warning',
        completed: 'bg-success',
        cancelled: 'bg-secondary',
        refunded: 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取订单状态显示文本
     * @param {string} status - 订单状态
     * @returns {string} 中文状态文本
     */
    getOrderStatusText(status) {
      const map = {
        pending: '待处理',
        completed: '已完成',
        cancelled: '已取消',
        refunded: '已退款'
      }
      return map[status] || status
    },

    /**
     * 获取交易状态CSS类名
     * @param {string} status - 交易状态
     * @returns {string} Bootstrap徽章类名
     */
    getTradeStatusClass(status) {
      const map = { pending: 'bg-warning', completed: 'bg-success', cancelled: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取交易状态显示文本
     * @param {string} status - 交易状态
     * @returns {string} 中文状态文本
     */
    getTradeStatusText(status) {
      const map = { pending: '进行中', completed: '已完成', cancelled: '已取消' }
      return map[status] || status
    },

    /**
     * 获取资产显示名称
     */
    getAssetDisplayName(assetCode) {
      if (!assetCode) return '未设置'
      const asset = this.assetTypes.find(a => a.asset_code === assetCode)
      return asset ? asset.display_name : assetCode
    },

    // ==================== 兑换商品 CRUD ====================

    /**
     * 打开创建商品模态框
     */
    openCreateModal(type) {
      if (type === 'exchange-item') {
        this.editingItem = false
        this.itemForm = {
          item_id: null,
          item_name: '',
          item_description: '',
          cost_asset_code: '',
          cost_amount: 1,
          cost_price: 0,
          stock: 0,
          sort_order: 100,
          status: 'active'
        }
        this.showModal('exchangeItemModal')
      } else {
        this.showInfo(`创建${type}功能暂未开放`)
      }
    },

    /**
     * 编辑商品
     */
    async editItem(type, item) {
      if (type === 'exchange-item') {
        this.editingItem = true

        try {
          // 尝试获取详细信息
          const response = await apiRequest(
            `${MARKET_ENDPOINTS.EXCHANGE_ITEMS}/${item.item_id || item.id}`
          )

          if (response && response.success) {
            const detail = response.data?.item || response.data || item
            this.itemForm = {
              item_id: detail.item_id || detail.id,
              item_name: detail.item_name || detail.name || '',
              item_description: detail.item_description || detail.description || '',
              cost_asset_code: detail.cost_asset_code || '',
              cost_amount: detail.cost_amount || 1,
              cost_price: detail.cost_price || 0,
              stock: detail.stock || 0,
              sort_order: detail.sort_order || 100,
              status: detail.status || 'active'
            }
          } else {
            // 使用列表数据
            this.itemForm = {
              item_id: item.item_id || item.id,
              item_name: item.item_name || item.name || '',
              item_description: item.item_description || item.description || '',
              cost_asset_code: item.cost_asset_code || '',
              cost_amount: item.cost_amount || item.points_cost || 1,
              cost_price: item.cost_price || 0,
              stock: item.stock || 0,
              sort_order: item.sort_order || 100,
              status: item.status || (item.is_enabled ? 'active' : 'inactive')
            }
          }

          this.showModal('exchangeItemModal')
        } catch (error) {
          logger.error('获取商品详情失败:', error)
          // 使用列表数据作为后备
          this.itemForm = {
            item_id: item.item_id || item.id,
            item_name: item.item_name || item.name || '',
            item_description: item.item_description || item.description || '',
            cost_asset_code: item.cost_asset_code || '',
            cost_amount: item.cost_amount || item.points_cost || 1,
            cost_price: item.cost_price || 0,
            stock: item.stock || 0,
            sort_order: item.sort_order || 100,
            status: item.status || (item.is_enabled ? 'active' : 'inactive')
          }

          this.showModal('exchangeItemModal')
        }
      } else {
        this.showInfo(`编辑${type}: ${item.item_id || item.name}`)
      }
    },

    /**
     * 提交商品表单
     */
    async submitExchangeItem() {
      if (!this.itemForm.item_name || !this.itemForm.cost_asset_code) {
        this.showError('请填写必填字段')
        return
      }

      if (this.itemForm.cost_amount <= 0) {
        this.showError('消耗数量必须大于0')
        return
      }

      if (this.saving) return
      this.saving = true

      try {
        const baseUrl = MARKET_ENDPOINTS.EXCHANGE_ITEMS
        const url = this.editingItem ? `${baseUrl}/${this.itemForm.item_id}` : baseUrl
        const method = this.editingItem ? 'PUT' : 'POST'

        const response = await apiRequest(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_name: this.itemForm.item_name,
            item_description: this.itemForm.item_description,
            cost_asset_code: this.itemForm.cost_asset_code,
            cost_amount: this.itemForm.cost_amount,
            cost_price: this.itemForm.cost_price,
            stock: this.itemForm.stock,
            sort_order: this.itemForm.sort_order,
            status: this.itemForm.status
          })
        })

        if (response && response.success) {
          this.showSuccess(this.editingItem ? '商品已更新' : '商品已添加')
          this.hideModal('exchangeItemModal')
          await this.loadExchangeItems()
          this._calculateStats()
        } else {
          this.showError(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('保存商品失败:', error)
        this.showError(error.message || '操作失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除商品
     */
    async deleteItem(type, id) {
      if (type === 'exchange-item') {
        await this.confirmAndExecute(
          '确定要删除这个商品吗？此操作不可恢复！',
          async () => {
            const response = await apiRequest(`${MARKET_ENDPOINTS.EXCHANGE_ITEMS}/${id}`, {
              method: 'DELETE'
            })

            if (response && response.success) {
              this.showSuccess('商品已删除')
              await this.loadExchangeItems()
              this._calculateStats()
            } else {
              this.showError(response?.message || '删除失败')
            }
          },
          { title: '删除商品', confirmText: '确认删除', type: 'danger' }
        )
      } else {
        this.showInfo(`删除${type}: ${id}`)
      }
    },

    // ==================== 订单详情 ====================

    /**
     * 查看订单详情
     */
    viewOrderDetail(order) {
      this.selectedOrder = order
      this.showModal('orderDetailModal')
    },

    /**
     * 查看交易详情
     */
    viewTradeDetail(trade) {
      this.selectedTrade = trade
      this.showModal('tradeDetailModal')
    }
  }))

  logger.info('[MarketManagement] Alpine 组件已注册 (Mixin v3.0 - CRUD 完整实现)')
})
