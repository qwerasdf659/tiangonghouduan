/**
 * 兑换订单管理页面 - Alpine.js 组件
 * exchange-market-orders.js
 */

function exchangeOrdersPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    globalLoading: false,
    submitting: false,
    
    // 订单数据
    orders: [],
    selectedOrder: null,
    
    // 统计
    stats: {
      total: 0,
      pending: 0,
      shipped: 0,
      cancelled: 0
    },
    
    // 筛选
    filters: {
  status: '',
  order_no: ''
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    pagination: null,
    
    // 更新状态表单
    updateForm: {
      order_no: '',
      status: '',
      remark: ''
    },
    
    // 弹窗实例
    detailModal: null,
    updateModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化兑换订单管理页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.detailModal = new bootstrap.Modal(this.$refs.detailModal);
        this.updateModal = new bootstrap.Modal(this.$refs.updateModal);
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
          page_size: this.pageSize
        });

        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.order_no) params.append('order_no', this.filters.order_no);

        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-orders?${params}`, {
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
        total: this.orders.length,
        pending: this.orders.filter(o => o.status === 'pending').length,
        shipped: this.orders.filter(o => o.status === 'shipped').length,
        cancelled: this.orders.filter(o => o.status === 'cancelled').length
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
    async viewOrderDetail(orderNo) {
      this.globalLoading = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-orders/${orderNo}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('获取订单详情失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.selectedOrder = result.data?.order;
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
     * 打开更新状态弹窗
 */
    openUpdateModal(orderNo) {
      this.updateForm = {
        order_no: orderNo,
        status: '',
        remark: ''
      };
      this.updateModal.show();
    },

/**
 * 提交状态更新
 */
    async handleUpdateStatus() {
      if (!this.updateForm.status) {
        this.showError('请选择新状态');
        return;
    }

      this.submitting = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-orders/${this.updateForm.order_no}/status`, {
      method: 'POST',
      headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
      },
          body: JSON.stringify({
            status: this.updateForm.status,
            remark: this.updateForm.remark
          })
        });

        const result = await response.json();

        if (result.success) {
          this.showSuccess('状态更新成功');
          this.updateModal.hide();
          this.loadOrders();
    } else {
          this.showError(result.message || '更新失败');
    }
  } catch (error) {
        console.error('更新订单状态失败:', error);
        this.showError('更新失败，请稍后重试');
  } finally {
        this.submitting = false;
      }
    },

/**
     * 获取资产类型文本
 */
    getAssetTypeText(assetCode) {
  const assetMap = {
    points_virtual_value: '虚拟价值',
    points_lottery: '抽奖积分',
    points_consumption: '消费积分',
    coins: '金币',
    red_shard: '红色碎片',
    blue_shard: '蓝色碎片',
    green_shard: '绿色碎片',
    gold_shard: '金色碎片',
    purple_shard: '紫色碎片',
    shard: '碎片',
    crystal: '水晶',
    gem: '宝石',
    ticket: '兑换券'
      };
      return assetMap[assetCode] || assetCode || '未知';
    },

/**
     * 获取资产单位
 */
    getAssetUnit(assetCode) {
  const unitMap = {
    points_virtual_value: '虚拟值',
    points_lottery: '积分',
    points_consumption: '积分',
    coins: '金币',
    red_shard: '个',
    blue_shard: '个',
    green_shard: '个',
    gold_shard: '个',
    purple_shard: '个',
    shard: '个',
    crystal: '个',
    gem: '个',
    ticket: '张'
      };
      return unitMap[assetCode] || '个';
    },
    
    /**
     * 获取状态颜色
     */
    getStatusColor(status) {
      const colorMap = {
        pending: 'bg-warning',
        completed: 'bg-info',
        shipped: 'bg-success',
        cancelled: 'bg-secondary'
      };
      return colorMap[status] || 'bg-secondary';
    },
    
    /**
     * 获取状态文本
     */
    getStatusText(status) {
      const textMap = {
        pending: '待处理',
        completed: '已完成',
        shipped: '已发货',
        cancelled: '已取消'
      };
      return textMap[status] || status || '未知';
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
  Alpine.data('exchangeOrdersPage', exchangeOrdersPage)
  console.log('✅ [ExchangeOrdersPage] Alpine 组件已注册')
})
