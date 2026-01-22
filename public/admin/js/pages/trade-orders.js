/**
 * C2C交易订单管理页面 - Alpine.js 组件
 * trade-orders.js
 */

function tradeOrdersPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    globalLoading: false,
    
    // 订单数据
    orders: [],
    selectedOrder: null,
    
    // 统计
    stats: {
      total: 0,
      created: 0,
      frozen: 0,
      completed: 0
    },
    
    // 筛选
    filters: {
      status: '',
      buyer_user_id: '',
      seller_user_id: '',
      listing_id: '',
      sort_order: 'DESC'
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    pagination: null,
    
    // 弹窗实例
    detailModal: null,

/**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化C2C交易订单管理页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.detailModal = new bootstrap.Modal(this.$refs.detailModal);
      });
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载订单列表
      await this.loadOrders();
    },

/**
     * 加载用户信息
 */
    loadUserInfo() {
      try {
        const stored = localStorage.getItem('userInfo');
        if (stored) {
          this.userInfo = JSON.parse(stored);
  }
      } catch (e) {
        console.error('加载用户信息失败:', e);
}
    },

/**
     * 退出登录
     */
    logout() {
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        window.location.href = '/admin/login.html';
      }
    },

/**
     * 搜索
 */
    handleSearch() {
      this.currentPage = 1;
      this.loadOrders();
    },

/**
     * 加载订单列表
 */
    async loadOrders() {
      this.loading = true;
      
      try {
        const token = localStorage.getItem('token');
    const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize,
          sort_order: this.filters.sort_order
        });

        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.buyer_user_id) params.append('buyer_user_id', this.filters.buyer_user_id);
        if (this.filters.seller_user_id) params.append('seller_user_id', this.filters.seller_user_id);
        if (this.filters.listing_id) params.append('listing_id', this.filters.listing_id);

        const response = await fetch(`${API_BASE_URL}/admin/c2c/orders?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载订单列表失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.orders = result.data?.orders || [];
          this.pagination = result.data?.pagination || null;
          this.updateStats();
          console.log(`✅ 加载订单: ${this.orders.length} 个`);
    } else {
          this.showError(result.message || '加载失败');
    }
  } catch (error) {
        console.error('加载订单列表失败:', error);
        this.showError('加载失败，请稍后重试');
  } finally {
        this.loading = false;
  }
    },

/**
     * 更新统计
     */
    updateStats() {
      this.stats = {
        total: this.pagination?.total || this.orders.length,
        created: this.orders.filter(o => o.status === 'created').length,
        frozen: this.orders.filter(o => o.status === 'frozen').length,
        completed: this.orders.filter(o => o.status === 'completed').length
      };
    },

/**
     * 计算可见页码
     */
    get visiblePages() {
      if (!this.pagination) return [];
      
      const pages = [];
      const total = this.pagination.total_pages;
      const current = this.currentPage;
      
      for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
          pages.push(i);
        } else if (i === current - 3 || i === current + 3) {
          pages.push('...');
        }
      }
      
      return pages;
    },
    
    /**
     * 切换页码
     */
    changePage(page) {
      if (page < 1 || page > this.pagination?.total_pages) return;
      this.currentPage = page;
      this.loadOrders();
    },

/**
     * 查看订单详情
     */
    async viewOrderDetail(orderId) {
      this.globalLoading = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/c2c/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('获取订单详情失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.selectedOrder = result.data?.order || result.data;
          this.detailModal.show();
        } else {
          this.showError(result.message || '获取订单详情失败');
        }
      } catch (error) {
        console.error('获取订单详情失败:', error);
        this.showError('获取失败，请稍后重试');
      } finally {
        this.globalLoading = false;
      }
    },
    
    /**
     * 获取资产代码
     */
    getAssetCode(order) {
      return order.listing?.asset_code || order.asset_code || 'DIAMOND';
    },

    /**
     * 获取买家支付金额
     */
    getGrossAmount(order) {
      return parseInt(order.gross_amount) || 0;
    },
    
    /**
     * 获取手续费
     */
    getFeeAmount(order) {
      return parseInt(order.fee_amount) || 0;
    },
    
    /**
     * 获取卖家实收金额
     */
    getNetAmount(order) {
      return parseInt(order.net_amount) || 0;
    },

/**
     * 获取状态颜色
     */
    getStatusColor(status) {
  const colorMap = {
    created: 'bg-warning',
    frozen: 'bg-info',
    completed: 'bg-success',
    cancelled: 'bg-secondary',
    failed: 'bg-danger',
    pending: 'bg-warning',
    processing: 'bg-info'
      };
      return colorMap[(status || '').toLowerCase()] || 'bg-secondary';
    },
    
    /**
     * 获取状态文本
     */
    getStatusText(status, displayName) {
      if (displayName) return displayName;
      
      const textMap = {
        created: '进行中',
        frozen: '冻结中',
        completed: '已完成',
        cancelled: '已取消',
        failed: '失败',
        pending: '待处理',
        processing: '处理中'
      };
      return textMap[(status || '').toLowerCase()] || status || '未知';
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-';
      try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return dateStr;
      }
    },

/**
     * 显示成功消息
     */
    showSuccess(message) {
      this.$toast.success(message);
    },

/**
     * 显示错误消息
     */
    showError(message) {
      this.$toast.error(message);
    }
  };
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('tradeOrdersPage', tradeOrdersPage)
  console.log('✅ [TradeOrdersPage] Alpine 组件已注册')
})
