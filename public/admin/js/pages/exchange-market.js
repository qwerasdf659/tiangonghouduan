/**
 * 兑换市场整合页面 - Alpine.js 组件 (Mixin v3.0)
 * @file public/admin/js/pages/exchange-market.js
 * @description 整合商品管理、订单管理、统计分析
 */

document.addEventListener('alpine:init', () => {
  console.log('[ExchangeMarket] 注册 Alpine 组件 (Mixin v3.0)...')

  // 存储当前子页面
  Alpine.store('exchangePage', 'items')

  // ==================== 导航组件 ====================
  Alpine.data('exchangeNavigation', () => ({
    ...createPageMixin(),
    
    currentPage: 'items',
    
    subPages: [
      { id: 'items', title: '商品管理', icon: 'bi-box-seam' },
      { id: 'orders', title: '订单管理', icon: 'bi-receipt' },
      { id: 'stats', title: '统计分析', icon: 'bi-graph-up' }
    ],
    
    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.currentPage = page
      }
      Alpine.store('exchangePage', this.currentPage)
      console.log('[ExchangeNavigation] 当前页面:', this.currentPage)
    },
    
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('exchangePage', pageId)
      
      // 更新 URL
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)
      
      // 触发数据加载事件
      window.dispatchEvent(new CustomEvent('exchange-page-changed', { detail: pageId }))
      console.log('[ExchangeNavigation] 切换到:', pageId)
    }
  }))

  // ==================== 内容组件 ====================
  Alpine.data('exchangePageContent', () => ({
    ...createPageMixin(),
    
    // ========== 商品管理数据 ==========
    items: [],
    assetTypes: [],
    itemStats: {
      total: 0,
      active: 0,
      lowStock: 0,
      totalSold: 0
    },
    itemFilters: {
      status: '',
      cost_asset_code: '',
      sort_by: 'sort_order'
    },
    itemCurrentPage: 1,
    itemPageSize: 20,
    itemPagination: { totalPages: 1, total: 0 },
    
    itemForm: {
      item_name: '',
      item_description: '',
      cost_asset_code: '',
      cost_amount: 1,
      stock: 0,
      sort_order: 100,
      status: 'active'
    },
    editingItemId: null,
    
    // ========== 订单管理数据 ==========
    orders: [],
    selectedOrder: null,
    orderStats: {
      total: 0,
      pending: 0,
      shipped: 0,
      cancelled: 0
    },
    orderFilters: {
      status: '',
      order_no: ''
    },
    orderCurrentPage: 1,
    orderPageSize: 20,
    orderPagination: { totalPages: 1, total: 0 },
    
    // ========== 统计分析数据 ==========
    exchangeStats: {
      orders: { total: 0, pending: 0, completed: 0, shipped: 0, cancelled: 0 },
      revenue: { total_virtual_value: 0, total_points: 0 },
      items: { activeCount: 0, activeStock: 0, inactiveCount: 0, inactiveStock: 0 }
    },
    orderStatusChart: null,
    exchangeTrendChart: null,
    
    // ========== 通用状态 ==========
    saving: false,
    
    get currentPage() {
      return Alpine.store('exchangePage')
    },
    
    // ========== 初始化 ==========
    init() {
      console.log('[ExchangePageContent] 初始化...')
      
      // 加载资产类型
      this.loadAssetTypes()
      
      // 根据当前页面加载数据
      this.loadPageData()
      
      // 监听页面切换
      window.addEventListener('exchange-page-changed', (e) => {
        this.loadPageData()
      })
    },
    
    async loadPageData() {
      const page = this.currentPage
      console.log('[ExchangePageContent] 加载数据:', page)
      
      switch (page) {
        case 'items':
          await this.loadItems()
          await this.loadItemStats()
          break
        case 'orders':
          await this.loadOrders()
          await this.loadOrderStats()
          break
        case 'stats':
          await this.loadExchangeStats()
          this.$nextTick(() => this.initCharts())
          break
      }
    },
    
    // ==================== 资产类型 ====================
    async loadAssetTypes() {
      try {
        const res = await request({ url: '/api/v4/console/material-asset-types', method: 'GET' })
        if (res.success) {
          this.assetTypes = res.data?.list || res.data || []
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载资产类型失败:', e)
      }
    },
    
    // ==================== 商品管理方法 ====================
    async loadItems() {
      try {
        this.loading = true
        const params = {
          page: this.itemCurrentPage,
          pageSize: this.itemPageSize,
          ...this.itemFilters
        }
        
        // 移除空值
        Object.keys(params).forEach(k => !params[k] && delete params[k])
        
        const res = await request({ url: '/api/v4/console/exchange-market/items', method: 'GET', params })
        
        if (res.success) {
          this.items = res.data?.list || res.data || []
          this.itemPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.items.length
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载商品失败:', e)
        this.$toast?.error('加载商品失败')
      } finally {
        this.loading = false
      }
    },
    
    async loadItemStats() {
      try {
        const res = await request({ url: '/api/v4/console/exchange-market/items/stats', method: 'GET' })
        if (res.success && res.data) {
          this.itemStats = {
            total: res.data.total || 0,
            active: res.data.active || 0,
            lowStock: res.data.lowStock || res.data.low_stock || 0,
            totalSold: res.data.totalSold || res.data.total_sold || 0
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载商品统计失败:', e)
      }
    },
    
    changeItemPage(page) {
      if (page < 1 || page > this.itemPagination.totalPages) return
      this.itemCurrentPage = page
      this.loadItems()
    },
    
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        item_name: '',
        item_description: '',
        cost_asset_code: '',
        cost_amount: 1,
        stock: 0,
        sort_order: 100,
        status: 'active'
      }
      this.showModal('itemModal')
    },
    
    editItem(item) {
      this.editingItemId = item.item_id
      this.itemForm = {
        item_name: item.item_name,
        item_description: item.item_description || '',
        cost_asset_code: item.cost_asset_code,
        cost_amount: item.cost_amount,
        stock: item.stock,
        sort_order: item.sort_order || 100,
        status: item.status
      }
      this.showModal('itemModal')
    },
    
    async saveItem() {
      if (!this.itemForm.item_name || !this.itemForm.cost_asset_code) {
        this.$toast?.error('请填写必填项')
        return
      }
      
      try {
        this.saving = true
        const url = this.editingItemId 
          ? `/api/v4/console/exchange-market/items/${this.editingItemId}`
          : '/api/v4/console/exchange-market/items'
        const method = this.editingItemId ? 'PUT' : 'POST'
        
        const res = await request({ url, method, data: this.itemForm })
        
        if (res.success) {
          this.$toast?.success(this.editingItemId ? '更新成功' : '添加成功')
          this.hideModal('itemModal')
          this.loadItems()
          this.loadItemStats()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 保存商品失败:', e)
        this.$toast?.error('操作失败')
      } finally {
        this.saving = false
      }
    },
    
    async deleteItem(itemId) {
      const confirmed = await this.$confirm?.('确定要删除此商品吗？', { type: 'danger' })
      if (!confirmed) return
      
      try {
        const res = await request({ url: `/api/v4/console/exchange-market/items/${itemId}`, method: 'DELETE' })
        if (res.success) {
          this.$toast?.success('删除成功')
          this.loadItems()
          this.loadItemStats()
        } else {
          this.$toast?.error(res.message || '删除失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 删除商品失败:', e)
        this.$toast?.error('删除失败')
      }
    },
    
    // ==================== 订单管理方法 ====================
    async loadOrders() {
      try {
        this.loading = true
        const params = {
          page: this.orderCurrentPage,
          pageSize: this.orderPageSize,
          ...this.orderFilters
        }
        
        Object.keys(params).forEach(k => !params[k] && delete params[k])
        
        const res = await request({ url: '/api/v4/console/exchange-market/orders', method: 'GET', params })
        
        if (res.success) {
          this.orders = res.data?.list || res.data || []
          this.orderPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.orders.length
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载订单失败:', e)
        this.$toast?.error('加载订单失败')
      } finally {
        this.loading = false
      }
    },
    
    async loadOrderStats() {
      try {
        const res = await request({ url: '/api/v4/console/exchange-market/orders/stats', method: 'GET' })
        if (res.success && res.data) {
          this.orderStats = {
            total: res.data.total || 0,
            pending: res.data.pending || 0,
            shipped: res.data.shipped || 0,
            cancelled: res.data.cancelled || 0
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载订单统计失败:', e)
      }
    },
    
    changeOrderPage(page) {
      if (page < 1 || page > this.orderPagination.totalPages) return
      this.orderCurrentPage = page
      this.loadOrders()
    },
    
    getOrderStatusText(status) {
      const map = {
        pending: '待处理',
        shipped: '已发货',
        completed: '已完成',
        cancelled: '已取消'
      }
      return map[status] || status
    },
    
    viewOrderDetail(order) {
      this.selectedOrder = order
      this.showModal('orderDetailModal')
    },
    
    async updateOrderStatus(order) {
      const confirmed = await this.$confirm?.('确定要发货此订单吗？')
      if (!confirmed) return
      
      try {
        const res = await request({
          url: `/api/v4/console/exchange-market/orders/${order.order_no}/status`,
          method: 'PUT',
          data: { status: 'shipped' }
        })
        
        if (res.success) {
          this.$toast?.success('发货成功')
          this.loadOrders()
          this.loadOrderStats()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 更新订单状态失败:', e)
        this.$toast?.error('操作失败')
      }
    },
    
    // ==================== 统计分析方法 ====================
    async loadExchangeStats() {
      try {
        this.loading = true
        const res = await request({ url: '/api/v4/console/exchange-market/statistics', method: 'GET' })
        
        if (res.success && res.data) {
          this.exchangeStats = {
            orders: res.data.orders || { total: 0, pending: 0, completed: 0, shipped: 0, cancelled: 0 },
            revenue: res.data.revenue || { total_virtual_value: 0, total_points: 0 },
            items: res.data.items || { activeCount: 0, activeStock: 0, inactiveCount: 0, inactiveStock: 0 }
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载统计失败:', e)
      } finally {
        this.loading = false
      }
    },
    
    initCharts() {
      if (typeof echarts === 'undefined') {
        console.warn('[ExchangeMarket] ECharts 未加载')
        return
      }
      
      // 订单状态分布图
      const orderStatusDom = document.getElementById('orderStatusChart')
      if (orderStatusDom) {
        this.orderStatusChart = echarts.init(orderStatusDom)
        this.orderStatusChart.setOption({
          tooltip: { trigger: 'item' },
          legend: { bottom: '5%' },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            data: [
              { value: this.exchangeStats.orders.pending, name: '待处理', itemStyle: { color: '#ffc107' } },
              { value: this.exchangeStats.orders.shipped, name: '已发货', itemStyle: { color: '#17a2b8' } },
              { value: this.exchangeStats.orders.completed, name: '已完成', itemStyle: { color: '#28a745' } },
              { value: this.exchangeStats.orders.cancelled, name: '已取消', itemStyle: { color: '#dc3545' } }
            ]
          }]
        })
      }
      
      // 兑换趋势图 (简单示例)
      const trendDom = document.getElementById('exchangeTrendChart')
      if (trendDom) {
        this.exchangeTrendChart = echarts.init(trendDom)
        this.exchangeTrendChart.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
          yAxis: { type: 'value' },
          series: [{
            data: [12, 8, 15, 10, 20, 18, 25],
            type: 'line',
            smooth: true,
            areaStyle: { opacity: 0.3 }
          }]
        })
      }
      
      // 响应式
      window.addEventListener('resize', () => {
        this.orderStatusChart?.resize()
        this.exchangeTrendChart?.resize()
      })
    }
  }))

  console.log('[ExchangeMarket] ✅ Alpine 组件已注册')
})

