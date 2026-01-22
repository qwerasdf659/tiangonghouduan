/**
 * 材料流水查询页面 - Alpine.js 组件
 * material-transactions.js
 */

function materialTransactionsPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    
    // 资产类型
    assetTypes: [],
    
    // 交易数据
    transactions: [],
    
    // 统计
    stats: {
      total: 0,
      increase: 0,
      decrease: 0
    },
    
    // 筛选
    filters: {
      user_id: '',
      business_id: '',
      asset_code: '',
      tx_type: '',
      start_time: '',
      end_time: ''
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    pagination: null,
    
    // Toast 使用全局 $toast
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化材料流水查询页面...');
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载资产类型
      await this.loadAssetTypes();
    },
    
    /**
     * 加载用户信息
     */
    loadUserInfo() {
      try {
        const user = getCurrentUser();
        if (user) {
          this.userInfo = user;
        }
      } catch (error) {
        console.error('加载用户信息失败:', error);
      }
    },
    
    /**
     * 退出登录
     */
    handleLogout() {
      if (typeof logout === 'function') {
        logout();
      }
    },
    
    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      try {
        const response = await apiRequest(API_ENDPOINTS.ASSET_ADJUSTMENT.ASSET_TYPES);
        if (response && response.success) {
          this.assetTypes = response.data.asset_types || response.data || [];
        }
      } catch (error) {
        console.error('加载资产类型失败:', error);
      }
    },
    
    /**
     * 搜索/筛选
     */
    handleSearch() {
      this.currentPage = 1;
      this.loadTransactions();
    },
    
    /**
     * 重置筛选
     */
    resetFilter() {
      this.filters = {
        user_id: '',
        business_id: '',
        asset_code: '',
        tx_type: '',
        start_time: '',
        end_time: ''
      };
      this.currentPage = 1;
      this.transactions = [];
      this.stats = { total: 0, increase: 0, decrease: 0 };
      this.pagination = null;
    },
    
    /**
     * 加载交易流水
     */
    async loadTransactions() {
      // 验证必填
      if (!this.filters.user_id) {
        this.showToast('请输入用户ID（必填）', 'error');
        return;
      }
      
      this.loading = true;
      try {
        const params = new URLSearchParams();
        params.append('user_id', this.filters.user_id);
        
        if (this.filters.asset_code) params.append('asset_code', this.filters.asset_code);
        if (this.filters.tx_type) params.append('business_type', this.filters.tx_type);
        if (this.filters.start_time) params.append('start_date', this.filters.start_time);
        if (this.filters.end_time) params.append('end_date', this.filters.end_time);
        
        params.append('page', this.currentPage);
        params.append('page_size', this.pageSize);

        const response = await apiRequest(`${API_ENDPOINTS.ASSETS.TRANSACTIONS}?${params.toString()}`);

        if (response && response.success) {
          this.transactions = response.data.transactions || [];
          this.pagination = response.data.pagination;
          this.updateStatistics();
        } else {
          this.showToast(response?.message || '查询失败', 'error');
          this.transactions = [];
        }
      } catch (error) {
        console.error('加载交易流水失败:', error);
        this.showToast(error.message, 'error');
        this.transactions = [];
      } finally {
        this.loading = false;
      }
    },
    
    /**
     * 更新统计
     */
    updateStatistics() {
      this.stats.total = this.pagination?.total || this.transactions.length;
      this.stats.increase = this.transactions.filter(tx => tx.amount > 0).length;
      this.stats.decrease = this.transactions.filter(tx => tx.amount < 0).length;
    },
    
    /**
     * 切换页码
     */
    changePage(page) {
      if (page < 1 || (this.pagination && page > this.pagination.total_pages)) return;
      this.currentPage = page;
      this.loadTransactions();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    
    /**
     * 获取可见页码数组
     */
    getVisiblePages() {
      if (!this.pagination) return [];
      
      const totalPages = this.pagination.total_pages;
      const current = this.currentPage;
      const maxVisible = 5;
      
      let startPage = Math.max(1, current - Math.floor(maxVisible / 2));
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);
      
      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }
      
      const pages = [];
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      return pages;
    },
    
    /**
     * 判断是否为增加类型
     */
    isIncrease(tx) {
      return tx.amount > 0;
    },
    
    /**
     * 获取显示金额
     */
    getDisplayAmount(tx) {
      return Math.abs(tx.amount);
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleString('zh-CN');
    },
    
    /**
     * 显示提示 - 使用全局 $toast
     */
    showToast(message, type = 'success') {
      if (type === 'success') {
        this.$toast.success(message);
      } else {
        this.$toast.error(message);
      }
    }
  };
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('materialTransactionsPage', materialTransactionsPage)
  console.log('✅ [MaterialTransactionsPage] Alpine 组件已注册')
})
