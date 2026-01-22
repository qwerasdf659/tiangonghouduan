/**
 * Asset Management Page - Alpine.js Components
 * 资产管理页面组件 (Mode A: Alpine.data() 标准模式)
 */

document.addEventListener('alpine:init', () => {
  // Navigation component
  Alpine.data('assetNavigation', () => ({
    currentPage: 'material-types',
    subPages: [
      { id: 'material-types', title: '材料资产类型', icon: 'bi-archive' },
      { id: 'material-accounts', title: '材料账户', icon: 'bi-wallet2' },
      { id: 'material-transactions', title: '材料交易', icon: 'bi-arrow-left-right' },
      { id: 'item-instances', title: '物品实例', icon: 'bi-collection' },
      { id: 'virtual-accounts', title: '虚拟账户', icon: 'bi-coin' },
      { id: 'virtual-transactions', title: '虚拟交易', icon: 'bi-receipt-cutoff' },
      { id: 'asset-stats', title: '资产统计', icon: 'bi-graph-up' }
    ],
    init() {
      const urlParams = new URLSearchParams(window.location.search);
      this.currentPage = urlParams.get('page') || 'material-types';
      Alpine.store('assetPage', this.currentPage);
    },
    switchPage(pageId) {
      this.currentPage = pageId;
      Alpine.store('assetPage', pageId);
      window.history.pushState({}, '', `?page=${pageId}`);
    }
  }));

  // Global store for current page
  Alpine.store('assetPage', 'material-types');

  // Page content component
  Alpine.data('assetPageContent', () => ({
    materialTypes: [],
    materialAccounts: [],
    materialTransactions: [],
    itemInstances: [],
    virtualAccounts: [],
    virtualTransactions: [],
    materialAccountFilters: { user_id: '', asset_code: '' },
    itemInstanceFilters: { user_id: '', status: '' },
    virtualAccountFilters: { user_id: '', currency_type: '' },
    assetStats: { materialTypesCount: 0, itemInstancesCount: 0, totalCoins: 0, totalDiamonds: 0 },

    get currentPage() {
      return Alpine.store('assetPage');
    },

    init() {
      this.loadAllData();
      this.$watch('$store.assetPage', () => this.loadAllData());
    },

    async loadAllData() {
      showLoading();
      try {
        await Promise.all([
          this.loadMaterialTypes(),
          this.loadMaterialAccounts(),
          this.loadMaterialTransactions(),
          this.loadItemInstances(),
          this.loadVirtualAccounts(),
          this.loadVirtualTransactions()
        ]);
        this.calculateStats();
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        hideLoading();
      }
    },

    async loadMaterialTypes() {
      try {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL?.ASSET_TYPES || '/api/v4/admin/material/asset-types');
        if (response && response.success) {
          this.materialTypes = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载材料类型失败:', error);
        this.materialTypes = [];
      }
    },

    async loadMaterialAccounts() {
      try {
        let url = API_ENDPOINTS.MATERIAL?.ACCOUNTS || '/api/v4/admin/material/accounts';
        const params = new URLSearchParams();
        if (this.materialAccountFilters.user_id) params.append('user_id', this.materialAccountFilters.user_id);
        if (this.materialAccountFilters.asset_code) params.append('asset_code', this.materialAccountFilters.asset_code);
        if (params.toString()) url += '?' + params.toString();
        const response = await apiRequest(url);
        if (response && response.success) {
          this.materialAccounts = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载材料账户失败:', error);
        this.materialAccounts = [];
      }
    },

    async loadMaterialTransactions() {
      try {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL?.TRANSACTIONS || '/api/v4/admin/material/transactions');
        if (response && response.success) {
          this.materialTransactions = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载材料交易失败:', error);
        this.materialTransactions = [];
      }
    },

    async loadItemInstances() {
      try {
        let url = API_ENDPOINTS.ITEM?.INSTANCES || '/api/v4/admin/items/instances';
        const params = new URLSearchParams();
        if (this.itemInstanceFilters.user_id) params.append('user_id', this.itemInstanceFilters.user_id);
        if (this.itemInstanceFilters.status) params.append('status', this.itemInstanceFilters.status);
        if (params.toString()) url += '?' + params.toString();
        const response = await apiRequest(url);
        if (response && response.success) {
          this.itemInstances = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载物品实例失败:', error);
        this.itemInstances = [];
      }
    },

    async loadVirtualAccounts() {
      try {
        let url = API_ENDPOINTS.VIRTUAL?.ACCOUNTS || '/api/v4/admin/virtual/accounts';
        const params = new URLSearchParams();
        if (this.virtualAccountFilters.user_id) params.append('user_id', this.virtualAccountFilters.user_id);
        if (this.virtualAccountFilters.currency_type) params.append('currency_type', this.virtualAccountFilters.currency_type);
        if (params.toString()) url += '?' + params.toString();
        const response = await apiRequest(url);
        if (response && response.success) {
          this.virtualAccounts = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载虚拟账户失败:', error);
        this.virtualAccounts = [];
      }
    },

    async loadVirtualTransactions() {
      try {
        const response = await apiRequest(API_ENDPOINTS.VIRTUAL?.TRANSACTIONS || '/api/v4/admin/virtual/transactions');
        if (response && response.success) {
          this.virtualTransactions = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载虚拟交易失败:', error);
        this.virtualTransactions = [];
      }
    },

    calculateStats() {
      this.assetStats = {
        materialTypesCount: this.materialTypes.length,
        itemInstancesCount: this.itemInstances.length,
        totalCoins: this.virtualAccounts.filter(a => a.currency_type === 'coins').reduce((sum, a) => sum + (a.balance || 0), 0),
        totalDiamonds: this.virtualAccounts.filter(a => a.currency_type === 'diamonds').reduce((sum, a) => sum + (a.balance || 0), 0)
      };
    },

    getInstanceStatusClass(status) {
      const map = { active: 'bg-success', used: 'bg-secondary', expired: 'bg-danger', locked: 'bg-warning' };
      return map[status] || 'bg-secondary';
    },

    getInstanceStatusText(status) {
      const map = { active: '正常', used: '已使用', expired: '已过期', locked: '锁定中' };
      return map[status] || status;
    },

    getCurrencyName(type) {
      const map = { coins: '金币', diamonds: '钻石', points: '积分' };
      return map[type] || type;
    },

    openCreateModal(type) {
      alert(`创建${type}功能开发中`);
    },

    editItem(type, item) {
      alert(`编辑${type}: ${item.asset_code || item.name}`);
    },

    deleteItem(type, id) {
      if (confirm('确定要删除吗？')) {
        alert(`删除${type}: ${id}`);
      }
    },

    viewInstanceDetail(instance) {
      alert(`物品实例详情: ${instance.instance_id}`);
    }
  }));

  console.log('✅ [AssetManagement] Alpine 组件已注册');
});
