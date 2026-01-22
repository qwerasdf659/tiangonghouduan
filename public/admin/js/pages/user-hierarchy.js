/**
 * User Hierarchy Page - Alpine.js Components
 * 用户层级管理页面组件 (Mode A: Alpine.data() 标准模式)
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('userHierarchyPage', () => ({
    hierarchyList: [],
    rolesList: [],
    currentPage: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 1,
    filters: {
      roleLevel: '',
      status: '',
      superiorId: '',
    },
    stats: {
      total: 0,
      active: 0,
      inactive: 0,
      storeAssigned: 0,
    },
    form: {
      userId: '',
      roleId: '',
      superiorId: '',
      storeId: '',
    },
    deactivateForm: {
      userId: null,
      userInfo: '',
      reason: '',
      includeSubordinates: false,
    },
    subordinates: [],
    subordinatesLoading: false,

    init() {
      this.loadRoles();
      this.loadHierarchyList();
    },

    get paginationPages() {
      const pages = [];
      const total = this.totalPages;
      const current = this.currentPage;
      
      if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i);
      } else {
        pages.push(1);
        if (current > 3) pages.push('...');
        for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
          pages.push(i);
        }
        if (current < total - 2) pages.push('...');
        pages.push(total);
      }
      return pages;
    },

    async loadRoles() {
      try {
        const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.ROLES);
        if (response.success) {
          this.rolesList = response.data || [];
        }
      } catch (error) {
        console.error('加载角色列表失败:', error);
      }
    },

    async loadHierarchyList() {
      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        });

        if (this.filters.roleLevel) params.append('role_level', this.filters.roleLevel);
        if (this.filters.status) params.append('is_active', this.filters.status);
        if (this.filters.superiorId) params.append('superior_user_id', this.filters.superiorId);

        const response = await apiRequest(`${API_ENDPOINTS.USER_HIERARCHY.LIST}?${params}`);

        if (response && response.success) {
          this.hierarchyList = response.data.rows || [];
          this.totalCount = response.data.count || 0;
          this.totalPages = response.data.pagination?.total_pages || 1;
          this.updateStatistics(response.data);
        } else {
          this.$toast.error('加载层级列表失败: ' + (response?.message || '未知错误'));
        }
      } catch (error) {
        console.error('加载层级列表失败:', error);
        this.$toast.error('加载层级列表失败: ' + error.message);
      }
    },

    updateStatistics(data) {
      const rows = data.rows || [];
      this.stats.total = data.count || 0;
      this.stats.active = rows.filter(r => r.is_active).length;
      this.stats.inactive = rows.filter(r => !r.is_active).length;
      this.stats.storeAssigned = rows.filter(r => r.store_id).length;
    },

    goToPage(page) {
      if (page < 1 || page > this.totalPages) return;
      this.currentPage = page;
      this.loadHierarchyList();
    },

    formatDate(dateValue) {
      if (!dateValue) return '-';
      if (typeof dateValue === 'object' && dateValue.beijing) {
        return dateValue.beijing;
      }
      if (typeof dateValue === 'string') {
        return new Date(dateValue).toLocaleString('zh-CN');
      }
      return '-';
    },

    openCreateModal() {
      this.form = { userId: '', roleId: '', superiorId: '', storeId: '' };
      new bootstrap.Modal(this.$refs.hierarchyModal).show();
    },

    async saveHierarchy() {
      if (!this.form.userId || !this.form.roleId) {
        this.$toast.warning('请填写必填字段');
        return;
      }

      try {
        const response = await apiRequest(API_ENDPOINTS.USER_HIERARCHY.CREATE, {
          method: 'POST',
          body: JSON.stringify({
            user_id: parseInt(this.form.userId),
            role_id: parseInt(this.form.roleId),
            superior_user_id: this.form.superiorId ? parseInt(this.form.superiorId) : null,
            store_id: this.form.storeId ? parseInt(this.form.storeId) : null
          })
        });

        if (response.success) {
          this.$toast.success('创建层级关系成功');
          bootstrap.Modal.getInstance(this.$refs.hierarchyModal).hide();
          this.loadHierarchyList();
        } else {
          this.$toast.error('创建失败: ' + (response.message || '未知错误'));
        }
      } catch (error) {
        console.error('保存层级关系失败:', error);
        this.$toast.error('保存失败: ' + error.message);
      }
    },

    async viewSubordinates(userId) {
      this.subordinatesLoading = true;
      this.subordinates = [];
      new bootstrap.Modal(this.$refs.subordinatesModal).show();

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER_HIERARCHY.SUBORDINATES, { user_id: userId }));

        if (response.success) {
          this.subordinates = response.data.subordinates || [];
        } else {
          this.$toast.error('加载下级失败: ' + (response.message || '未知错误'));
        }
      } catch (error) {
        console.error('查看下级失败:', error);
        this.$toast.error('加载下级失败: ' + error.message);
      } finally {
        this.subordinatesLoading = false;
      }
    },

    openDeactivateModal(userId, userInfo) {
      this.deactivateForm = {
        userId: userId,
        userInfo: `${userInfo} (ID: ${userId})`,
        reason: '',
        includeSubordinates: false,
      };
      new bootstrap.Modal(this.$refs.deactivateModal).show();
    },

    async confirmDeactivate() {
      if (!this.deactivateForm.reason.trim()) {
        this.$toast.warning('请填写停用原因');
        return;
      }

      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.USER_HIERARCHY.DEACTIVATE, { user_id: this.deactivateForm.userId }),
          {
            method: 'POST',
            body: JSON.stringify({
              reason: this.deactivateForm.reason,
              include_subordinates: this.deactivateForm.includeSubordinates
            })
          }
        );

        if (response.success) {
          this.$toast.success(`成功停用 ${response.data.deactivated_count} 个用户的权限`);
          bootstrap.Modal.getInstance(this.$refs.deactivateModal).hide();
          this.loadHierarchyList();
        } else {
          this.$toast.error('停用失败: ' + (response.message || '未知错误'));
        }
      } catch (error) {
        console.error('停用失败:', error);
        this.$toast.error('停用失败: ' + error.message);
      }
    },

    async activateUser(userId) {
      if (!confirm('确定要激活该用户的层级权限吗？')) return;

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.USER_HIERARCHY.ACTIVATE, { user_id: userId }), {
          method: 'POST',
          body: JSON.stringify({
            include_subordinates: false
          })
        });

        if (response.success) {
          this.$toast.success('激活成功');
          this.loadHierarchyList();
        } else {
          this.$toast.error('激活失败: ' + (response.message || '未知错误'));
        }
      } catch (error) {
        console.error('激活失败:', error);
        this.$toast.error('激活失败: ' + error.message);
      }
    },

    exportData() {
      this.$toast.info('导出功能开发中');
    }
  }));

  console.log('✅ [UserHierarchy] Alpine 组件已注册');
});
