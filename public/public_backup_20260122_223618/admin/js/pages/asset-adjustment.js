/**
 * 通用资产调整页面 - Alpine.js 组件
 * asset-adjustment.js
 * 
 * 使用 Mixin 系统重构
 */

function assetAdjustmentPage() {
  // 使用 createCrudMixin 获取标准功能
  const baseMixin = typeof createCrudMixin === 'function' 
    ? createCrudMixin({ pageSize: 20, enableFormValidation: true })
    : {}
  
  return {
    ...baseMixin,
    
    // 用户信息
    userInfo: {},
    
    // 加载状态
    searching: false,
    loadingRecords: false,
    submitting: false,
    
    // 搜索条件
    searchUserId: '',
    searchMobile: '',
    
    // 当前用户数据
    currentUser: null,
    balances: [],
    
    // 资产类型和活动列表
    assetTypes: [],
    campaigns: [],
    
    // 交易记录
    transactions: [],
    filterAssetCode: '',
    
    // 调整表单
    adjustForm: {
      assetCode: '',
      adjustType: 'increase',
      amount: '',
      reason: '',
      campaignId: ''
    },
    
    // 弹窗实例
    adjustModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化资产调整页面 (Mixin版)...');
      
      // 调用 Mixin 的初始化
      if (baseMixin.init) {
        baseMixin.init.call(this)
      }
      
      // 加载用户信息
      this.loadUserInfo();

      // 加载资产类型
      await this.loadAssetTypes();
      
      // 加载活动列表
      await this.loadCampaigns();
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
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE_URL}/console/asset-adjustment/asset-types`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            this.assetTypes = result.data?.asset_types || result.data || [];
            console.log(`📊 加载资产类型: ${this.assetTypes.length} 个`);
          }
    }
  } catch (error) {
        console.error('加载资产类型失败:', error);
  }
    },

/**
 * 加载活动列表
 */
    async loadCampaigns() {
  try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE_URL}/admin/campaign-budget/batch-status?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            this.campaigns = result.data?.campaigns || [];
            console.log(`📊 加载活动列表: ${this.campaigns.length} 个`);
          }
    }
  } catch (error) {
        console.error('加载活动列表失败:', error);
  }
    },

/**
     * 搜索用户
     */
    async handleSearch() {
      if (!this.searchUserId && !this.searchMobile) {
        this.showError('请输入用户ID或手机号');
        return;
      }
      
      this.searching = true;
      
      try {
        let targetUserId = this.searchUserId;
        
        // 如果只有手机号，先查询用户ID
        if (!targetUserId && this.searchMobile) {
          const token = localStorage.getItem('admin_token');
          const userResponse = await fetch(`${API_BASE_URL}/admin/users?search=${this.searchMobile}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (userResponse.ok) {
            const userResult = await userResponse.json();
            if (userResult.success && userResult.data?.users?.length > 0) {
              targetUserId = userResult.data.users[0].user_id;
  } else {
              this.showError('未找到该手机号对应的用户');
              return;
  }
}
        }
        
        if (!targetUserId) {
          this.showError('请输入有效的用户ID或手机号');
          return;
        }
        
        // 加载用户资产
        await this.loadUserAssets(targetUserId);
      } catch (error) {
        console.error('搜索用户失败:', error);
        this.showError('搜索失败: ' + error.message);
      } finally {
        this.searching = false;
      }
    },
    
    /**
     * 加载用户资产
     */
    async loadUserAssets(userId) {
      this.loading = true;
      
    try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`${API_BASE_URL}/console/asset-adjustment/user/${userId}/balances`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载用户资产失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.currentUser = result.data.user;
          this.balances = result.data.balances || [];
          
          console.log(`✅ 加载用户资产完成: ${this.balances.length} 种`);
          
          // 加载调整记录
          this.currentPage = 1;
          await this.loadAdjustmentRecords();
        } else {
          this.showError(result.message || '查询失败');
      }
    } catch (error) {
        console.error('加载用户资产失败:', error);
        this.showError(error.message);
      } finally {
        this.loading = false;
      }
    },

/**
     * 计算聚合后的余额（相同asset_code合并）
     */
    get aggregatedBalances() {
      const balanceMap = new Map();
      
      this.balances.forEach(balance => {
        const key = balance.asset_code;
        if (balanceMap.has(key)) {
          const existing = balanceMap.get(key);
          existing.available_amount = (existing.available_amount || 0) + (balance.available_amount || 0);
          existing.frozen_amount = (existing.frozen_amount || 0) + (balance.frozen_amount || 0);
          existing.total = (existing.total || 0) + (balance.total || 0);
        } else {
          balanceMap.set(key, { ...balance });
        }
      });
      
      return Array.from(balanceMap.values());
    },
    
    /**
     * 加载调整记录
     */
    async loadAdjustmentRecords() {
      if (!this.currentUser) return;
      
      this.loadingRecords = true;
      
      try {
        const token = localStorage.getItem('admin_token');
        const params = new URLSearchParams({
          user_id: this.currentUser.user_id,
          page: this.currentPage,
          page_size: this.pageSize
        });
        
        if (this.filterAssetCode) {
          params.append('asset_code', this.filterAssetCode);
        }
        
        const response = await fetch(`${API_BASE_URL}/console/assets/transactions?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            this.transactions = result.data?.transactions || [];
            this.pagination = result.data?.pagination || null;
          }
    }
  } catch (error) {
        console.error('加载调整记录失败:', error);
  } finally {
        this.loadingRecords = false;
  }
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
     * 跳转页面
     */
    goToPage(page) {
      if (page < 1 || page > this.pagination?.total_pages) return;
      this.currentPage = page;
      this.loadAdjustmentRecords();
    },
    
    /**
     * 打开调整弹窗
     */
    openAdjustModal() {
      this.adjustForm = {
        assetCode: '',
        adjustType: 'increase',
        amount: '',
        reason: '',
        campaignId: ''
      };
      this.showModal('adjustModal');
    },
    
    /**
     * 提交调整
     */
    async submitAdjust() {
      if (!this.adjustForm.assetCode || !this.adjustForm.amount || !this.adjustForm.reason) {
        this.showError('请填写完整的调整信息');
        return;
      }
      
      if (this.adjustForm.assetCode === 'BUDGET_POINTS' && !this.adjustForm.campaignId) {
        this.showError('调整预算积分必须选择活动');
        return;
      }
      
      this.submitting = true;
      
      try {
        const token = localStorage.getItem('admin_token');
        const amount = this.adjustForm.adjustType === 'decrease' 
          ? -Math.abs(this.adjustForm.amount) 
          : Math.abs(this.adjustForm.amount);
        
        const data = {
          user_id: this.currentUser.user_id,
          asset_code: this.adjustForm.assetCode,
          amount: amount,
          reason: this.adjustForm.reason,
          idempotency_key: `asset_adjust_${this.currentUser.user_id}_${this.adjustForm.assetCode}_${Date.now()}`
        };
        
        if (this.adjustForm.assetCode === 'BUDGET_POINTS') {
          data.campaign_id = parseInt(this.adjustForm.campaignId);
        }
        
        const response = await fetch(`${API_BASE_URL}/console/asset-adjustment/adjust`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          this.showSuccess('资产调整成功');
          this.hideModal('adjustModal');
          
          // 重新加载用户资产
          await this.loadUserAssets(this.currentUser.user_id);
    } else {
          this.showError(result.message || '调整失败');
        }
      } catch (error) {
        console.error('资产调整失败:', error);
        this.showError(error.message);
      } finally {
        this.submitting = false;
      }
    },
    
    /**
     * 获取资产图标
     */
    getAssetIcon(assetCode) {
      const icons = {
        POINTS: 'bi-star-fill text-warning',
        DIAMOND: 'bi-gem text-info',
        BUDGET_POINTS: 'bi-wallet2 text-success',
        GOLD: 'bi-coin text-warning',
        SILVER: 'bi-circle-fill text-secondary'
      };
      return icons[assetCode] || 'bi-box text-primary';
    },

/**
 * 获取资产显示名称
 */
    getAssetDisplayName(assetCode) {
      const assetType = this.assetTypes.find(t => t.asset_code === assetCode);
  if (assetType) {
        return assetType.display_name || assetType.name || assetCode;
  }
  
  const builtInNames = {
    POINTS: '积分',
    DIAMOND: '钻石',
    BUDGET_POINTS: '预算积分'
      };
      return builtInNames[assetCode] || assetCode;
    },

/**
     * 手机号脱敏
     */
    maskPhone(phone) {
      if (!phone) return '-';
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    },
    
    /**
     * 格式化数字
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0';
      return Number(num).toLocaleString('zh-CN');
    },

/**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
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
  Alpine.data('assetAdjustmentPage', assetAdjustmentPage)
  console.log('✅ [AssetAdjustmentPage] Alpine 组件已注册')
})
