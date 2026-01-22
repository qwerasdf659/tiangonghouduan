/**
 * Market Management Page - Alpine.js Mixin 重构版
 * 市场管理整合页面组件
 * 
 * @file public/admin/js/pages/market-management.js
 * @description 整合多个市场管理子页面
 * @version 3.0.1 (Mixin 重构版 - CRUD 完整实现)
 * @date 2026-01-23
 */

document.addEventListener('alpine:init', () => {
  // Navigation component
  Alpine.data('marketNavigation', () => ({
    currentPage: 'exchange-items',
    subPages: [
      { id: 'exchange-items', title: '兑换商品', icon: 'bi-box-seam' },
      { id: 'exchange-orders', title: '兑换订单', icon: 'bi-receipt' },
      { id: 'exchange-stats', title: '兑换统计', icon: 'bi-graph-up' },
      { id: 'trade-orders', title: '交易订单', icon: 'bi-arrow-left-right' },
      { id: 'marketplace-stats', title: '市场统计', icon: 'bi-shop' }
    ],
    
    init() {
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'exchange-items'
      Alpine.store('marketPage', this.currentPage)
    },
    
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('marketPage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // Create store for page state
  Alpine.store('marketPage', 'exchange-items')

  // Page content component - 使用 Mixin 重构
  Alpine.data('marketPageContent', () => ({
    // 组合 Mixin
    ...createDashboardMixin(),
    
    // ==================== 数据状态 ====================
    
    /** 兑换商品列表 */
    exchangeItems: [],
    
    /** 兑换订单列表 */
    exchangeOrders: [],
    
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

    init() {
      console.log('✅ 市场管理整合页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      this.loadAllData()
      this.$watch('$store.marketPage', () => this.loadAllData())
    },

    // ==================== 数据加载 ====================

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
        const response = await apiRequest(API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types?is_enabled=true')
        if (response && response.success) {
          this.assetTypes = response.data?.asset_types || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载资产类型失败:', error)
        // 使用默认值
        this.assetTypes = [
          { asset_code: 'red_shard', display_name: '碎红水晶' },
          { asset_code: 'red_crystal', display_name: '完整红水晶' }
        ]
      }
    },

    async loadExchangeItems() {
      try {
        const response = await apiRequest(API_ENDPOINTS.EXCHANGE?.ITEMS || '/api/v4/admin/marketplace/exchange-items')
        if (response && response.success) {
          this.exchangeItems = response.data?.items || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载兑换商品失败:', error)
        this.exchangeItems = []
      }
    },

    async loadExchangeOrders() {
      try {
        const response = await apiRequest(API_ENDPOINTS.EXCHANGE?.ORDERS || '/api/v4/admin/marketplace/exchange-orders')
        if (response && response.success) {
          this.exchangeOrders = response.data?.orders || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载兑换订单失败:', error)
        this.exchangeOrders = []
      }
    },

    async loadTradeOrders() {
      try {
        const response = await apiRequest(API_ENDPOINTS.TRADE?.ORDERS || '/api/v4/admin/marketplace/trade-orders')
        if (response && response.success) {
          this.tradeOrders = response.data?.trades || response.data?.list || response.data || []
        }
      } catch (error) {
        console.error('加载交易订单失败:', error)
        this.tradeOrders = []
      }
    },

    // ==================== 统计计算 ====================

    _calculateStats() {
      this.exchangeStats = {
        totalItems: this.exchangeItems.length,
        totalOrders: this.exchangeOrders.length,
        totalPoints: this.exchangeOrders.reduce((sum, o) => sum + (o.points_cost || 0), 0),
        successRate: this.exchangeOrders.length > 0 
          ? Math.round(this.exchangeOrders.filter(o => o.status === 'completed').length / this.exchangeOrders.length * 100) 
          : 0
      }
      
      this.marketStats = {
        totalListings: this.exchangeItems.filter(i => i.is_enabled || i.status === 'active').length,
        completedTrades: this.tradeOrders.filter(t => t.status === 'completed').length,
        totalVolume: this.tradeOrders.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.price || 0), 0)
      }
    },

    // ==================== 工具方法 ====================

    getOrderStatusClass(status) {
      const map = { pending: 'bg-warning', completed: 'bg-success', cancelled: 'bg-secondary', refunded: 'bg-danger' }
      return map[status] || 'bg-secondary'
    },

    getOrderStatusText(status) {
      const map = { pending: '待处理', completed: '已完成', cancelled: '已取消', refunded: '已退款' }
      return map[status] || status
    },

    getTradeStatusClass(status) {
      const map = { pending: 'bg-warning', completed: 'bg-success', cancelled: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    },

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
            `${API_ENDPOINTS.EXCHANGE?.ITEMS || '/api/v4/admin/marketplace/exchange-items'}/${item.item_id || item.id}`
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
          console.error('获取商品详情失败:', error)
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
        const baseUrl = API_ENDPOINTS.EXCHANGE?.ITEMS || '/api/v4/admin/marketplace/exchange-items'
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
        console.error('保存商品失败:', error)
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
            const response = await apiRequest(
              `${API_ENDPOINTS.EXCHANGE?.ITEMS || '/api/v4/admin/marketplace/exchange-items'}/${id}`,
              { method: 'DELETE' }
            )

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

  console.log('✅ [MarketManagement] Alpine 组件已注册 (Mixin v3.0 - CRUD 完整实现)')
})
