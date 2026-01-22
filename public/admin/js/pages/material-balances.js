/**
 * 用户材料余额查询页面 - Alpine.js 组件
 * material-balances.js
 */

function materialBalancesPage() {
  return {
    // 用户信息
    adminInfo: {},
    
    // 加载状态
    loading: false,
    submitting: false,
    
    // 搜索参数
    searchUserId: '',
    searchMobile: '',
    
    // 当前用户数据
    currentUserId: null,
    currentUser: null,
    balances: [],
    
    // 资产类型
    assetTypes: [],
    
    // 调整表单
    adjustForm: {
      asset_code: '',
      adjust_type: 'increase',
      amount: '',
      reason: ''
    },
    
    // 弹窗实例
    adjustModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化用户材料余额查询页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.adjustModal = new bootstrap.Modal(this.$refs.adjustModal);
      });
      
      // 加载管理员信息
      this.loadAdminInfo();

  // 加载资产类型
      await this.loadAssetTypes();
    },
    
    /**
     * 加载管理员信息
     */
    loadAdminInfo() {
      try {
        const stored = localStorage.getItem('userInfo');
        if (stored) {
          this.adminInfo = JSON.parse(stored);
        }
      } catch (e) {
        console.error('加载管理员信息失败:', e);
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
        const response = await fetch(`${API_BASE_URL}/admin/asset-adjustment/asset-types`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载资产类型失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.assetTypes = result.data?.asset_types || [];
          console.log(`✅ 加载资产类型: ${this.assetTypes.length} 个`);
    }
  } catch (error) {
        console.error('加载资产类型失败:', error);
  }
    },

/**
     * 获取启用的资产类型
 */
    get enabledAssetTypes() {
      return this.assetTypes.filter(a => a.is_enabled);
    },

/**
     * 搜索用户
 */
    async handleSearch() {
      if (!this.searchUserId && !this.searchMobile) {
        this.showError('请输入用户ID或手机号');
        return;
      }
      
      let targetUserId = this.searchUserId;

  // 如果提供了手机号，先通过手机号查询用户ID
      if (this.searchMobile && !this.searchUserId) {
    try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE_URL}/admin/users?search=${this.searchMobile}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          const result = await response.json();
          
          if (result.success && result.data) {
            const users = result.data.users || result.data;
        if (users.length > 0) {
              targetUserId = users[0].user_id;
        } else {
              this.showError('未找到该手机号对应的用户');
              return;
        }
      } else {
            this.showError('查询用户失败');
            return;
      }
    } catch (error) {
          this.showError('查询用户失败：' + error.message);
          return;
    }
  }

  // 加载用户材料余额
      await this.loadUserBalances(targetUserId);
    },

/**
 * 加载用户材料余额
 */
    async loadUserBalances(userId) {
      this.loading = true;
      this.currentUserId = userId;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/asset-adjustment/users/${userId}/balances`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载用户余额失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.currentUser = result.data?.user;
          this.balances = result.data?.balances || [];
          console.log(`✅ 加载用户余额: ${this.balances.length} 条记录`);
    } else {
          this.showError(result.message || '查询失败');
    }
  } catch (error) {
        console.error('加载用户余额失败:', error);
        this.showError('加载失败，请稍后重试');
      } finally {
        this.loading = false;
      }
    },

/**
     * 打开调整余额弹窗
     */
    openAdjustModal() {
      this.adjustForm = {
        asset_code: '',
        adjust_type: 'increase',
        amount: '',
        reason: ''
      };
      this.adjustModal.show();
    },

/**
     * 提交余额调整
 */
    async submitAdjust() {
      if (!this.adjustForm.asset_code || !this.adjustForm.amount || !this.adjustForm.reason) {
        this.showError('请填写所有必填项');
        return;
  }

      if (!this.currentUserId) {
        this.showError('未选择用户');
        return;
      }
      
      this.submitting = true;
      
      try {
        const token = localStorage.getItem('token');
        const adminId = this.adminInfo?.user_id || 0;
        const rawAmount = parseInt(this.adjustForm.amount);
        const amount = this.adjustForm.adjust_type === 'decrease' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
        const timestamp = Date.now();
        const idempotencyKey = `admin_adjust_${adminId}_${this.currentUserId}_${this.adjustForm.asset_code}_${timestamp}`;
        
        const response = await fetch(`${API_BASE_URL}/admin/asset-adjustment/adjust`, {
      method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: this.currentUserId,
            asset_code: this.adjustForm.asset_code,
            amount: amount,
            reason: this.adjustForm.reason,
            idempotency_key: idempotencyKey
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          this.showSuccess('调整成功');
          this.adjustModal.hide();
          this.loadUserBalances(this.currentUserId);
    } else {
          this.showError(result.message || '调整失败');
    }
  } catch (error) {
        console.error('调整余额失败:', error);
        this.showError('调整失败，请稍后重试');
  } finally {
        this.submitting = false;
  }
    },

/**
 * 手机号脱敏
 */
    maskPhone(phone) {
      if (!phone || phone.length !== 11) return phone;
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
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
  Alpine.data('materialBalancesPage', materialBalancesPage)
  console.log('✅ [MaterialBalancesPage] Alpine 组件已注册')
})
