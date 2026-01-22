/**
 * Store Staff Page - Alpine.js Components
 * 门店员工管理页面组件 (Mode A: Alpine.data() 标准模式)
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('storeStaffPage', () => ({
    staffList: [],
    stores: [],
    filters: {
      storeId: '',
      role: '',
      status: '',
      search: '',
    },
    stats: {
      total: 0,
      active: 0,
      managers: 0,
      stores: 0,
    },
    form: {
      userId: '',
      storeId: '',
      role: 'staff',
    },
    transferForm: {
      userId: '',
      fromStoreId: '',
      staffName: '',
      currentStore: '',
      targetStoreId: '',
    },

    init() {
      this.loadStores();
      this.loadStaff();
    },

    async loadStores() {
      try {
        const response = await apiRequest(API_ENDPOINTS.STORE.LIST);
        if (response && response.success) {
          this.stores = response.data.items || [];
        }
      } catch (error) {
        console.error('加载门店失败:', error);
      }
    },

    async loadStaff() {
      showLoading();
      try {
        const params = new URLSearchParams();
        if (this.filters.storeId) params.append('store_id', this.filters.storeId);
        if (this.filters.role) params.append('role_in_store', this.filters.role);
        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.search) params.append('search', this.filters.search);

        const url = API_ENDPOINTS.STAFF.LIST + (params.toString() ? `?${params.toString()}` : '');
        const response = await apiRequest(url);

        if (response && response.success) {
          this.staffList = response.data.staff || response.data || [];
          this.updateStats(response.data.stats || {});
        } else {
          this.showError('加载失败', response?.message || '获取员工列表失败');
        }
      } catch (error) {
        console.error('加载员工失败:', error);
        this.showError('加载失败', error.message);
      } finally {
        hideLoading();
      }
    },

    updateStats(apiStats) {
      this.stats.total = apiStats.total || this.staffList.length;
      this.stats.active = apiStats.active || this.staffList.filter(s => s.status === 'active').length;
      this.stats.managers = apiStats.managers || this.staffList.filter(s => s.role_in_store === 'manager').length;
      this.stats.stores = apiStats.stores || new Set(this.staffList.map(s => s.store_id)).size;
    },

    getInitials(name) {
      return name ? name.charAt(0).toUpperCase() : 'U';
    },

    formatDate(dateValue) {
      if (!dateValue) return '-';
      if (typeof dateValue === 'object') {
        if (dateValue.beijing) {
          return dateValue.beijing.split(' ')[0];
        }
        if (dateValue.iso) {
          return new Date(dateValue.iso).toLocaleDateString('zh-CN');
        }
      }
      if (typeof dateValue === 'string') {
        return new Date(dateValue).toLocaleDateString('zh-CN');
      }
      return '-';
    },

    openCreateModal() {
      this.form = { userId: '', storeId: '', role: 'staff' };
      new bootstrap.Modal(this.$refs.staffModal).show();
    },

    async submitStaff() {
      if (!this.form.userId || !this.form.storeId) {
        alert('请填写完整信息');
        return;
      }

      showLoading();
      try {
        const response = await apiRequest(API_ENDPOINTS.STAFF.CREATE, {
          method: 'POST',
          body: JSON.stringify({
            user_id: parseInt(this.form.userId),
            store_id: parseInt(this.form.storeId),
            role_in_store: this.form.role
          })
        });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.staffModal).hide();
          alert('✅ 员工入职成功');
          this.loadStaff();
        } else {
          this.showError('入职失败', response?.message || '操作失败');
        }
      } catch (error) {
        console.error('员工入职失败:', error);
        this.showError('入职失败', error.message);
      } finally {
        hideLoading();
      }
    },

    openTransferModal(staff) {
      this.transferForm = {
        userId: staff.user_id,
        fromStoreId: staff.store_id,
        staffName: staff.user_nickname || '-',
        currentStore: staff.store_name || '-',
        targetStoreId: '',
      };
      new bootstrap.Modal(this.$refs.transferModal).show();
    },

    async submitTransfer() {
      if (!this.transferForm.targetStoreId) {
        alert('请选择目标门店');
        return;
      }

      showLoading();
      try {
        const response = await apiRequest(API_ENDPOINTS.STAFF.TRANSFER, {
          method: 'POST',
          body: JSON.stringify({
            user_id: parseInt(this.transferForm.userId),
            from_store_id: parseInt(this.transferForm.fromStoreId),
            to_store_id: parseInt(this.transferForm.targetStoreId)
          })
        });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.transferModal).hide();
          alert('✅ 调店成功');
          this.loadStaff();
        } else {
          this.showError('调店失败', response?.message || '操作失败');
        }
      } catch (error) {
        console.error('调店失败:', error);
        this.showError('调店失败', error.message);
      } finally {
        hideLoading();
      }
    },

    async changeRole(staff) {
      const newRole = staff.role_in_store === 'manager' ? 'staff' : 'manager';
      const action = newRole === 'manager' ? '升级为店长' : '降级为员工';

      if (!confirm(`确定要将此员工${action}吗？`)) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.STAFF.ROLE, { store_staff_id: staff.store_staff_id }), {
          method: 'PUT',
          body: JSON.stringify({ role_in_store: newRole })
        });

        if (response && response.success) {
          alert(`✅ 已${action}`);
          this.loadStaff();
        } else {
          this.showError('操作失败', response?.message || '角色变更失败');
        }
      } catch (error) {
        console.error('角色变更失败:', error);
        this.showError('操作失败', error.message);
      } finally {
        hideLoading();
      }
    },

    async disableStaff(userId) {
      if (!confirm('确定要将此员工设为离职状态吗？')) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.STAFF.DISABLE, { user_id: userId }), {
          method: 'POST'
        });

        if (response && response.success) {
          alert('✅ 员工已离职');
          this.loadStaff();
        } else {
          this.showError('操作失败', response?.message || '离职处理失败');
        }
      } catch (error) {
        console.error('离职处理失败:', error);
        this.showError('操作失败', error.message);
      } finally {
        hideLoading();
      }
    },

    async enableStaff(userId, storeId) {
      if (!confirm('确定要恢复此员工的在职状态吗？')) return;

      showLoading();
      try {
        const response = await apiRequest(API_ENDPOINTS.STAFF.ENABLE, {
          method: 'POST',
          body: JSON.stringify({ user_id: userId, store_id: storeId })
        });

        if (response && response.success) {
          alert('✅ 员工已复职');
          this.loadStaff();
        } else {
          this.showError('操作失败', response?.message || '复职处理失败');
        }
      } catch (error) {
        console.error('复职处理失败:', error);
        this.showError('操作失败', error.message);
      } finally {
        hideLoading();
      }
    },

    showError(title, message) {
      alert(`❌ ${title}\n${message}`);
    }
  }));

  console.log('✅ [StoreStaff] Alpine 组件已注册');
});

