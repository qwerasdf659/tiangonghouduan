/**
 * 交易管理整合页面 - Alpine.js 组件 (Mixin v3.0)
 * @file public/admin/js/pages/trade-management.js
 * @description 整合C2C交易订单、上架统计、兑换订单
 */

document.addEventListener('alpine:init', () => {
  console.log('[TradeManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 存储当前子页面
  Alpine.store('tradePage', 'trade-orders')

  // ==================== 导航组件 ====================
  Alpine.data('tradeNavigation', () => ({
    ...createPageMixin(),
    
    currentPage: 'trade-orders',
    
    subPages: [
      { id: 'trade-orders', title: 'C2C交易订单', icon: 'bi-arrow-left-right' },
      { id: 'marketplace-stats', title: '上架统计', icon: 'bi-bar-chart' },
      { id: 'redemption-orders', title: '兑换订单', icon: 'bi-arrow-repeat' }
    ],
    
    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.currentPage = page
      }
      Alpine.store('tradePage', this.currentPage)
      console.log('[TradeNavigation] 当前页面:', this.currentPage)
    },
    
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('tradePage', pageId)
      
      // 更新 URL
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)
      
      // 触发数据加载事件
      window.dispatchEvent(new CustomEvent('trade-page-changed', { detail: pageId }))
      console.log('[TradeNavigation] 切换到:', pageId)
    }
  }))

  // ==================== 内容组件 ====================
  Alpine.data('tradePageContent', () => ({
    ...createPageMixin(),
    
    // ========== C2C交易订单数据 ==========
    tradeOrders: [],
    selectedTradeOrder: null,
    tradeStats: {
      total: 0,
      created: 0,
      frozen: 0,
      completed: 0
    },
    tradeFilters: {
      status: '',
      buyer_user_id: '',
      seller_user_id: '',
      listing_id: ''
    },
    tradeCurrentPage: 1,
    tradePageSize: 20,
    tradePagination: { totalPages: 1, total: 0 },
    
    // ========== 上架统计数据 ==========
    marketplaceStats: [],
    marketplaceSummary: {
      total_users_with_listings: 0,
      users_near_limit: 0,
      users_at_limit: 0
    },
    marketplaceFilters: {
      status: 'all'
    },
    marketplaceCurrentPage: 1,
    marketplacePageSize: 20,
    marketplacePagination: { totalPages: 1, total: 0 },
    maxListings: 10,
    
    // ========== 兑换订单数据 ==========
    redemptionOrders: [],
    redemptionFilters: {
      status: ''
    },
    redemptionCurrentPage: 1,
    redemptionPageSize: 20,
    redemptionPagination: { totalPages: 1, total: 0 },
    
    // ========== 通用状态 ==========
    saving: false,
    
    get currentPage() {
      return Alpine.store('tradePage')
    },
    
    // ========== 初始化 ==========
    init() {
      console.log('[TradePageContent] 初始化...')
      
      // 根据当前页面加载数据
      this.loadPageData()
      
      // 监听页面切换
      window.addEventListener('trade-page-changed', (e) => {
        this.loadPageData()
      })
    },
    
    async loadPageData() {
      const page = this.currentPage
      console.log('[TradePageContent] 加载数据:', page)
      
      switch (page) {
        case 'trade-orders':
          await this.loadTradeOrders()
          await this.loadTradeStats()
          break
        case 'marketplace-stats':
          await this.loadMarketplaceSummary()
          await this.loadMarketplaceStats()
          break
        case 'redemption-orders':
          await this.loadRedemptionOrders()
          break
      }
    },
    
    // ==================== C2C交易订单方法 ====================
    async loadTradeOrders() {
      try {
        this.loading = true
        const params = {
          page: this.tradeCurrentPage,
          pageSize: this.tradePageSize,
          ...this.tradeFilters
        }
        
        // 移除空值
        Object.keys(params).forEach(k => !params[k] && delete params[k])
        
        const res = await request({ url: '/api/v4/admin/c2c-market/orders', method: 'GET', params })
        
        if (res.success) {
          this.tradeOrders = res.data?.list || res.data || []
          this.tradePagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.tradeOrders.length
          }
        }
      } catch (e) {
        console.error('[TradeManagement] 加载交易订单失败:', e)
        this.$toast?.error('加载交易订单失败')
      } finally {
        this.loading = false
      }
    },
    
    async loadTradeStats() {
      try {
        const res = await request({ url: '/api/v4/admin/c2c-market/orders/stats', method: 'GET' })
        if (res.success && res.data) {
          this.tradeStats = {
            total: res.data.total || 0,
            created: res.data.created || res.data.pending || 0,
            frozen: res.data.frozen || 0,
            completed: res.data.completed || 0
          }
        }
      } catch (e) {
        console.error('[TradeManagement] 加载交易统计失败:', e)
      }
    },
    
    changeTradePage(page) {
      if (page < 1 || page > this.tradePagination.totalPages) return
      this.tradeCurrentPage = page
      this.loadTradeOrders()
    },
    
    getTradeStatusText(status) {
      const map = {
        created: '待支付',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        pending: '待处理'
      }
      return map[status] || status
    },
    
    viewTradeOrderDetail(order) {
      this.selectedTradeOrder = order
      this.showModal('tradeDetailModal')
    },
    
    // ==================== 上架统计方法 ====================
    async loadMarketplaceSummary() {
      try {
        const res = await request({ url: '/api/v4/admin/c2c-market/listings/summary', method: 'GET' })
        if (res.success && res.data) {
          this.marketplaceSummary = {
            total_users_with_listings: res.data.total_users_with_listings || 0,
            users_near_limit: res.data.users_near_limit || 0,
            users_at_limit: res.data.users_at_limit || 0
          }
        }
      } catch (e) {
        console.error('[TradeManagement] 加载上架摘要失败:', e)
      }
    },
    
    async loadMarketplaceStats() {
      try {
        this.loading = true
        const params = {
          page: this.marketplaceCurrentPage,
          pageSize: this.marketplacePageSize,
          status: this.marketplaceFilters.status
        }
        
        if (params.status === 'all') delete params.status
        
        const res = await request({ url: '/api/v4/admin/c2c-market/listings/user-stats', method: 'GET', params })
        
        if (res.success) {
          this.marketplaceStats = res.data?.list || res.data || []
          this.marketplacePagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.marketplaceStats.length
          }
          
          // 获取最大上架数
          if (res.data?.max_listings) {
            this.maxListings = res.data.max_listings
          }
        }
      } catch (e) {
        console.error('[TradeManagement] 加载上架统计失败:', e)
        this.$toast?.error('加载上架统计失败')
      } finally {
        this.loading = false
      }
    },
    
    changeMarketplacePage(page) {
      if (page < 1 || page > this.marketplacePagination.totalPages) return
      this.marketplaceCurrentPage = page
      this.loadMarketplaceStats()
    },
    
    // ==================== 兑换订单方法 ====================
    async loadRedemptionOrders() {
      try {
        this.loading = true
        const params = {
          page: this.redemptionCurrentPage,
          pageSize: this.redemptionPageSize,
          ...this.redemptionFilters
        }
        
        Object.keys(params).forEach(k => !params[k] && delete params[k])
        
        const res = await request({ url: '/api/v4/admin/redemption/orders', method: 'GET', params })
        
        if (res.success) {
          this.redemptionOrders = res.data?.list || res.data || []
          this.redemptionPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.redemptionOrders.length
          }
        }
      } catch (e) {
        console.error('[TradeManagement] 加载兑换订单失败:', e)
        this.$toast?.error('加载兑换订单失败')
      } finally {
        this.loading = false
      }
    },
    
    changeRedemptionPage(page) {
      if (page < 1 || page > this.redemptionPagination.totalPages) return
      this.redemptionCurrentPage = page
      this.loadRedemptionOrders()
    },
    
    getRedemptionStatusText(status) {
      const map = {
        pending: '待处理',
        completed: '已完成',
        rejected: '已拒绝',
        processing: '处理中'
      }
      return map[status] || status
    },
    
    async approveRedemption(order) {
      const confirmed = await this.$confirm?.('确定要通过此兑换申请吗？')
      if (!confirmed) return
      
      try {
        const res = await request({
          url: `/api/v4/admin/redemption/orders/${order.order_id}/approve`,
          method: 'POST'
        })
        
        if (res.success) {
          this.$toast?.success('审批成功')
          this.loadRedemptionOrders()
        } else {
          this.$toast?.error(res.message || '审批失败')
        }
      } catch (e) {
        console.error('[TradeManagement] 审批兑换订单失败:', e)
        this.$toast?.error('审批失败')
      }
    },
    
    async rejectRedemption(order) {
      const confirmed = await this.$confirm?.('确定要拒绝此兑换申请吗？', { type: 'danger' })
      if (!confirmed) return
      
      try {
        const res = await request({
          url: `/api/v4/admin/redemption/orders/${order.order_id}/reject`,
          method: 'POST'
        })
        
        if (res.success) {
          this.$toast?.success('已拒绝')
          this.loadRedemptionOrders()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        console.error('[TradeManagement] 拒绝兑换订单失败:', e)
        this.$toast?.error('操作失败')
      }
    }
  }))

  console.log('[TradeManagement] ✅ Alpine 组件已注册')
})

