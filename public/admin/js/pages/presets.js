/**
 * 抽奖干预管理页面 - Alpine.js 组件
 */
function presetsPage() {
  return {
    userInfo: {},
    loading: false,
    globalLoading: false,
    submitting: false,
    
    // 筛选条件
    filters: {
      status: '',
      userSearch: '',
      prizeType: ''
    },
    
    // 列表数据
    interventions: [],
    currentPage: 1,
    pageSize: 10,
    pagination: {
      total: 0,
      totalPages: 1
    },
    
    // 奖品列表
    allPrizes: [],
    
    // 用户搜索
    userSearchKeyword: '',
    userSearchResults: [],
    searchingUser: false,
    userSearched: false,
    selectedUser: null,
    
    // 表单数据
    interventionForm: {
      prize_id: '',
      expire_time: '',
      reason: '',
      note: ''
    },
    
    // 查看详情
    viewData: null,
    
    // Modal 实例
    createModalInstance: null,
    viewModalInstance: null,

    async init() {
      console.log('🚀 初始化抽奖干预管理页面...');
      this.loadUserInfo();
      
      // Token和权限验证
      if (!getToken() || !checkAdminPermission()) {
        return;
      }
      
      this.$nextTick(() => {
        this.initModals();
      });
      
      await Promise.all([
        this.loadPrizes(),
        this.loadInterventions()
      ]);
    },

    loadUserInfo() {
      const userInfo = getCurrentUser();
      if (userInfo) {
        this.userInfo = userInfo;
      }
    },

    initModals() {
      if (this.$refs.createModal) {
        this.createModalInstance = new bootstrap.Modal(this.$refs.createModal);
      }
      if (this.$refs.viewModal) {
        this.viewModalInstance = new bootstrap.Modal(this.$refs.viewModal);
      }
    },

    // 加载奖品列表
    async loadPrizes() {
      try {
        const response = await apiRequest(API_ENDPOINTS.PRIZE.LIST);
        if (response && response.success) {
          this.allPrizes = response.data?.prizes || [];
        }
      } catch (error) {
        console.error('加载奖品列表失败:', error);
      }
    },

    // 加载干预规则列表
    async loadInterventions() {
      this.loading = true;
      
      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        });
        
        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.userSearch.trim()) params.append('user_search', this.filters.userSearch.trim());
        if (this.filters.prizeType) params.append('prize_type', this.filters.prizeType);
        
        const response = await apiRequest(`${API_ENDPOINTS.LOTTERY_INTERVENTION.LIST}?${params}`);
        
        if (response && response.success) {
          this.interventions = response.data?.interventions || [];
          const paginationData = response.data?.pagination || {};
          this.pagination = {
            total: paginationData.total || this.interventions.length,
            totalPages: Math.ceil((paginationData.total || this.interventions.length) / this.pageSize)
          };
        }
      } catch (error) {
        console.error('加载干预规则失败:', error);
        this.showError('加载失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },

    // 分页
    goToPage(page) {
      if (page >= 1 && page <= this.pagination.totalPages && page !== this.currentPage) {
        this.currentPage = page;
        this.loadInterventions();
      }
    },

    getPageNumbers() {
      const pages = [];
      const total = this.pagination.totalPages;
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

    // 打开创建模态框
    openCreateModal() {
      this.resetForm();
      if (this.createModalInstance) {
        this.createModalInstance.show();
      }
    },

    resetForm() {
      this.interventionForm = {
        prize_id: '',
        expire_time: '',
        reason: '',
        note: ''
      };
      this.userSearchKeyword = '';
      this.userSearchResults = [];
      this.userSearched = false;
      this.selectedUser = null;
    },

    // 搜索用户
    async searchUser() {
      if (!this.userSearchKeyword.trim()) {
        this.showError('请输入搜索关键词');
        return;
      }
      
      this.searchingUser = true;
      this.userSearched = false;
      
      try {
        const response = await apiRequest(
          `${API_ENDPOINTS.USER.LIST}?search=${encodeURIComponent(this.userSearchKeyword.trim())}&page_size=10`
        );
        
        if (response && response.success) {
          this.userSearchResults = response.data?.users || [];
        }
      } catch (error) {
        console.error('搜索用户失败:', error);
        this.userSearchResults = [];
      } finally {
        this.searchingUser = false;
        this.userSearched = true;
      }
    },

    // 选择用户
    selectUser(user) {
      this.selectedUser = user;
      this.userSearchResults = [];
      this.userSearchKeyword = '';
    },

    // 获取选中的奖品
    getSelectedPrize() {
      if (!this.interventionForm.prize_id) return null;
      return this.allPrizes.find(p => p.prize_id == this.interventionForm.prize_id);
    },

    // 创建干预规则
    async createIntervention() {
      if (!this.selectedUser) {
        this.showError('请选择目标用户');
        return;
      }
      
      if (!this.interventionForm.prize_id) {
        this.showError('请选择预设奖品');
        return;
      }
      
      this.submitting = true;
      
      try {
        // 计算持续时间（分钟）
        let durationMinutes = null;
        if (this.interventionForm.expire_time) {
          const expireDate = new Date(this.interventionForm.expire_time);
          const now = new Date();
          const diffMs = expireDate - now;
          if (diffMs > 0) {
            durationMinutes = Math.ceil(diffMs / (1000 * 60));
          }
        }
        
        const reason = this.interventionForm.note 
          ? `${this.interventionForm.reason || '管理员强制中奖'} - ${this.interventionForm.note}`
          : (this.interventionForm.reason || '管理员强制中奖');
        
        const response = await apiRequest(API_ENDPOINTS.LOTTERY_INTERVENTION.FORCE_WIN, {
          method: 'POST',
          body: JSON.stringify({
            user_id: parseInt(this.selectedUser.user_id),
            prize_id: parseInt(this.interventionForm.prize_id),
            duration_minutes: durationMinutes,
            reason: reason
          })
        });
        
        if (response && response.success) {
          this.showSuccess('干预规则创建成功');
          if (this.createModalInstance) {
            this.createModalInstance.hide();
          }
          this.resetForm();
          await this.loadInterventions();
        } else {
          throw new Error(response?.message || '创建失败');
        }
      } catch (error) {
        console.error('创建干预规则失败:', error);
        this.showError('创建失败：' + error.message);
      } finally {
        this.submitting = false;
      }
    },

    // 查看干预规则详情
    async viewIntervention(id) {
      this.globalLoading = true;
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.LOTTERY_INTERVENTION.DETAIL, { id }));
        
        if (response && response.success) {
          this.viewData = response.data;
          if (this.viewModalInstance) {
            this.viewModalInstance.show();
          }
        } else {
          this.showError(response?.message || '获取详情失败');
        }
      } catch (error) {
        console.error('获取干预规则详情失败:', error);
        this.showError('获取详情失败: ' + error.message);
      } finally {
        this.globalLoading = false;
      }
    },

    // 取消干预规则
    async cancelIntervention(id) {
      if (!confirm('确定要取消此干预规则吗？取消后无法恢复。')) {
        return;
      }
      
      this.globalLoading = true;
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.LOTTERY_INTERVENTION.CANCEL, { id }),
          { method: 'POST' }
        );
        
        if (response && response.success) {
          this.showSuccess('干预规则已取消');
          await this.loadInterventions();
        } else {
          throw new Error(response?.message || '取消失败');
        }
      } catch (error) {
        console.error('取消干预规则失败:', error);
        this.showError('取消失败：' + error.message);
      } finally {
        this.globalLoading = false;
      }
    },

    // 辅助函数
    formatRuleId(item, index) {
      const typeShort = {
        force_win: '强制中奖',
        force_lose: '禁止中奖',
        probability_adjust: '概率调整',
        user_queue: '队列设置',
        blacklist: '黑名单'
      };
      
      const typeName = typeShort[item.setting_type] || '规则';
      const userName = item.user_info?.nickname || '用户' + item.user_id;
      const actualIndex = index + (this.currentPage - 1) * this.pageSize;
      
      return `#${actualIndex + 1} ${typeName} - ${userName}`;
    },

    getSettingTypeLabel(type) {
      const labels = {
        probability_adjust: '概率调整',
        force_win: '强制中奖',
        force_lose: '强制不中奖',
        blacklist: '黑名单'
      };
      return labels[type] || type || '未知类型';
    },

    getPrizeTypeLabel(type) {
      const labels = {
        physical: '实物',
        virtual: '虚拟',
        points: '积分',
        coupon: '优惠券'
      };
      return labels[type] || '未知';
    },

    getStatusBadgeClass(status) {
      const colorMap = {
        active: 'bg-success',
        used: 'bg-secondary',
        expired: 'bg-danger',
        cancelled: 'bg-warning text-dark'
      };
      return colorMap[(status || '').toLowerCase()] || 'bg-light text-dark';
    },

    formatDate(dateStr) {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleString('zh-CN');
    },

    // 消息提示 - 使用全局 $toast
    showSuccess(message) {
      this.$toast.success(message);
    },

    showError(message) {
      this.$toast.error(message);
    },

    // 退出登录
    logout() {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        window.location.href = '/admin/login.html';
      }
    }
  };
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('presetsPage', presetsPage)
  console.log('✅ [PresetsPage] Alpine 组件已注册')
})
