/**
 * Market Management Page - Alpine.js Components
 * 市场管理页面组件 (Mode A: Alpine.data() 标准模式)
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
      const urlParams = new URLSearchParams(window.location.search);
      this.currentPage = urlParams.get('page') || 'exchange-items';
      Alpine.store('marketPage', this.currentPage);
    },
    switchPage(pageId) {
      this.currentPage = pageId;
      Alpine.store('marketPage', pageId);
      window.history.pushState({}, '', `?page=${pageId}`);
    }
  }));

  // Create store for page state
  Alpine.store('marketPage', 'exchange-items');

  // Page content component
  Alpine.data('marketPageContent', () => ({
    exchangeItems: [],
    exchangeOrders: [],
    tradeOrders: [],
    exchangeStats: { totalItems: 0, totalOrders: 0, totalPoints: 0, successRate: 0 },
    marketStats: { totalListings: 0, completedTrades: 0, totalVolume: 0 },

    get currentPage() {
      return Alpine.store('marketPage');
    },

    init() {
      this.loadAllData();
      this.$watch('$store.marketPage', () => this.loadAllData());
    },

    async loadAllData() {
      showLoading();
      try {
        await Promise.all([
          this.loadExchangeItems(),
          this.loadExchangeOrders(),
          this.loadTradeOrders()
        ]);
        this.calculateStats();
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        hideLoading();
      }
    },

    async loadExchangeItems() {
      try {
        const response = await apiRequest(API_ENDPOINTS.EXCHANGE?.ITEMS || '/api/v4/exchange/items');
        if (response && response.success) {
          this.exchangeItems = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载兑换商品失败:', error);
        this.exchangeItems = [];
      }
    },

    async loadExchangeOrders() {
      try {
        const response = await apiRequest(API_ENDPOINTS.EXCHANGE?.ORDERS || '/api/v4/exchange/orders');
        if (response && response.success) {
          this.exchangeOrders = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载兑换订单失败:', error);
        this.exchangeOrders = [];
      }
    },

    async loadTradeOrders() {
      try {
        const response = await apiRequest(API_ENDPOINTS.TRADE?.ORDERS || '/api/v4/trade/orders');
        if (response && response.success) {
          this.tradeOrders = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载交易订单失败:', error);
        this.tradeOrders = [];
      }
    },

    calculateStats() {
      this.exchangeStats = {
        totalItems: this.exchangeItems.length,
        totalOrders: this.exchangeOrders.length,
        totalPoints: this.exchangeOrders.reduce((sum, o) => sum + (o.points_cost || 0), 0),
        successRate: this.exchangeOrders.length > 0 ? 
          Math.round(this.exchangeOrders.filter(o => o.status === 'completed').length / this.exchangeOrders.length * 100) : 0
      };
      
      this.marketStats = {
        totalListings: this.exchangeItems.filter(i => i.is_enabled).length,
        completedTrades: this.tradeOrders.filter(t => t.status === 'completed').length,
        totalVolume: this.tradeOrders.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.price || 0), 0)
      };
    },

    getOrderStatusClass(status) {
      const map = { pending: 'bg-warning', completed: 'bg-success', cancelled: 'bg-secondary', refunded: 'bg-danger' };
      return map[status] || 'bg-secondary';
    },

    getOrderStatusText(status) {
      const map = { pending: '待处理', completed: '已完成', cancelled: '已取消', refunded: '已退款' };
      return map[status] || status;
    },

    getTradeStatusClass(status) {
      const map = { pending: 'bg-warning', completed: 'bg-success', cancelled: 'bg-secondary' };
      return map[status] || 'bg-secondary';
    },

    getTradeStatusText(status) {
      const map = { pending: '进行中', completed: '已完成', cancelled: '已取消' };
      return map[status] || status;
    },

    openCreateModal(type) {
      this.$toast.info(`创建${type}功能开发中`);
    },

    editItem(type, item) {
      this.$toast.info(`编辑${type}: ${item.item_id || item.name}`);
    },

    deleteItem(type, id) {
      if (confirm('确定要删除吗？')) {
        this.$toast.info(`删除${type}: ${id}`);
      }
    },

    viewOrderDetail(order) {
      this.$toast.info(`订单详情: ${order.order_id}`);
    },

    viewTradeDetail(trade) {
      this.$toast.info(`交易详情: ${trade.trade_id}`);
    }
  }));

  console.log('✅ [MarketManagement] Alpine 组件已注册');
});
