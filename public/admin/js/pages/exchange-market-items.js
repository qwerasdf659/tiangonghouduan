/**
 * 兑换市场商品管理页面 - Alpine.js 组件
 * exchange-market-items.js
 */

function exchangeMarketItemsPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    globalLoading: false,
    submitting: false,
    
    // 数据
    items: [],
    assetTypes: [],
    
    // 统计
    stats: {
      total: 0,
      active: 0,
      lowStock: 0,
      totalSold: 0
    },
    
    // 筛选
    filters: {
  status: '',
  cost_asset_code: '',
  sort_by: 'sort_order'
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    pagination: null,
    
    // 添加表单
    addForm: {
      item_name: '',
      item_description: '',
      cost_asset_code: '',
      cost_amount: 1,
      cost_price: 0,
      stock: 0,
      sort_order: 100,
      status: 'active'
    },
    
    // 编辑表单
    editForm: {
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
    
    // 弹窗实例
    addModal: null,
    editModal: null,

/**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化兑换市场商品管理页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.addModal = new bootstrap.Modal(this.$refs.addModal);
        this.editModal = new bootstrap.Modal(this.$refs.editModal);
      });
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载资产类型
      await this.loadAssetTypes();
      
      // 加载商品列表
      await this.loadItems();
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
     * 加载资产类型
 */
    async loadAssetTypes() {
  try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/material/asset-types?is_enabled=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data?.asset_types) {
            this.assetTypes = result.data.asset_types;
          }
    }
  } catch (error) {
        console.error('加载资产类型失败:', error);
        // 使用默认值
        this.assetTypes = [
      { asset_code: 'red_shard', display_name: '碎红水晶' },
      { asset_code: 'red_crystal', display_name: '完整红水晶' }
        ];
  }
    },

/**
     * 获取资产显示名称
     */
    getAssetDisplayName(assetCode) {
      if (!assetCode) return '未设置';
      const asset = this.assetTypes.find(a => a.asset_code === assetCode);
      return asset ? asset.display_name : assetCode;
    },

/**
     * 获取库存样式类
     */
    getStockClass(stock) {
      if (stock === 0) return 'stock-warning';
      if (stock <= 10) return 'stock-low';
      return 'stock-ok';
    },

/**
     * 搜索
 */
    handleSearch() {
      this.currentPage = 1;
      this.loadItems();
    },

/**
 * 加载商品列表
 */
    async loadItems() {
      this.loading = true;
      
  try {
        const token = localStorage.getItem('token');
    const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize,
          sort_by: this.filters.sort_by || 'sort_order',
      sort_order: 'ASC'
        });

        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.cost_asset_code) params.append('cost_asset_code', this.filters.cost_asset_code);
        
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-items?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载商品列表失败');

        const result = await response.json();

        if (result.success) {
          this.items = result.data?.items || [];
          this.pagination = result.data?.pagination || null;
          this.updateStats();
          console.log(`✅ 加载商品: ${this.items.length} 个`);
    } else {
          this.showError(result.message || '加载失败');
    }
  } catch (error) {
        console.error('加载商品列表失败:', error);
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
        total: this.items.length,
        active: this.items.filter(i => i.status === 'active').length,
        lowStock: this.items.filter(i => i.stock <= 10 && i.stock > 0).length,
        totalSold: this.items.reduce((sum, i) => sum + (i.sold_count || 0), 0)
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
      this.loadItems();
    },
    
    /**
     * 打开添加弹窗
     */
    openAddModal() {
      this.addForm = {
        item_name: '',
        item_description: '',
        cost_asset_code: '',
        cost_amount: 1,
        cost_price: 0,
        stock: 0,
        sort_order: 100,
        status: 'active'
      };
      this.addModal.show();
    },

/**
 * 添加商品
 */
    async handleAddItem() {
      if (!this.addForm.item_name || !this.addForm.cost_asset_code) {
        this.showError('请填写必填字段');
        return;
      }
      
      if (this.addForm.cost_amount <= 0) {
        this.showError('材料消耗数量必须大于0');
        return;
    }

      this.submitting = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-items`, {
      method: 'POST',
      headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
      },
          body: JSON.stringify(this.addForm)
        });

        const result = await response.json();

    if (result.success) {
          this.showSuccess('添加成功');
          this.addModal.hide();
          this.loadItems();
    } else {
          this.showError(result.message || '添加失败');
    }
  } catch (error) {
        console.error('添加商品失败:', error);
        this.showError('添加失败，请稍后重试');
  } finally {
        this.submitting = false;
  }
    },

/**
     * 编辑商品
 */
    async editItem(itemId) {
      this.globalLoading = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-items/${itemId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('获取商品信息失败');

        const result = await response.json();

        if (result.success) {
          const item = result.data?.item;
          this.editForm = {
            item_id: item.id || item.item_id,
            item_name: item.name || '',
            item_description: item.description || '',
            cost_asset_code: item.cost_asset_code || '',
            cost_amount: item.cost_amount || 0,
            cost_price: item.cost_price || 0,
            stock: item.stock || 0,
            sort_order: item.sort_order || 100,
            status: item.status || 'active'
          };
          this.editModal.show();
    } else {
          this.showError(result.message || '获取商品信息失败');
    }
  } catch (error) {
        console.error('加载商品信息失败:', error);
        this.showError('加载失败，请稍后重试');
  } finally {
        this.globalLoading = false;
  }
    },

/**
 * 提交编辑
 */
    async handleEditItem() {
      if (!this.editForm.item_name || !this.editForm.cost_asset_code) {
        this.showError('请填写必填字段');
        return;
      }
      
      if (this.editForm.cost_amount <= 0) {
        this.showError('材料消耗数量必须大于0');
        return;
    }

      this.submitting = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-items/${this.editForm.item_id}`, {
      method: 'PUT',
      headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            item_name: this.editForm.item_name,
            item_description: this.editForm.item_description,
            cost_asset_code: this.editForm.cost_asset_code,
            cost_amount: this.editForm.cost_amount,
            cost_price: this.editForm.cost_price,
            stock: this.editForm.stock,
            sort_order: this.editForm.sort_order,
            status: this.editForm.status
          })
        });

        const result = await response.json();

    if (result.success) {
          this.showSuccess('更新成功');
          this.editModal.hide();
          this.loadItems();
    } else {
          this.showError(result.message || '更新失败');
    }
  } catch (error) {
        console.error('更新商品失败:', error);
        this.showError('更新失败，请稍后重试');
  } finally {
        this.submitting = false;
  }
    },

/**
 * 删除商品
 */
    async deleteItem(itemId) {
  if (!confirm('确定要删除这个商品吗？此操作不可恢复！')) {
        return;
  }

      this.globalLoading = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/marketplace/exchange-items/${itemId}`, {
      method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (result.success) {
          this.showSuccess('删除成功');
          this.loadItems();
    } else {
          this.showError(result.message || '删除失败');
    }
  } catch (error) {
        console.error('删除商品失败:', error);
        this.showError('删除失败，请稍后重试');
  } finally {
        this.globalLoading = false;
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
  Alpine.data('exchangeMarketItemsPage', exchangeMarketItemsPage)
  console.log('✅ [ExchangeMarketItemsPage] Alpine 组件已注册')
})
