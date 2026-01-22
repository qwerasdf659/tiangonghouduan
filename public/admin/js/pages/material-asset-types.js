/**
 * 材料资产类型管理页面 - Alpine.js 组件
 * material-asset-types.js
 */

function materialAssetTypesPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    submitting: false,
    
    // 资产类型数据
    assetTypes: [],
    
    // 统计
    stats: {
      total: 0,
      enabled: 0,
      disabled: 0,
      groups: 0
    },
    
    // 添加表单
    addForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },
    
    // 编辑表单
    editForm: {
      asset_code: '',
      display_name: '',
      group_code: '',
      form: '',
      tier: '',
      visible_value_points: '',
      budget_value_points: '',
      sort_order: 0,
      is_enabled: '1'
    },
    
    // 弹窗实例
    addModal: null,
    editModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化材料资产类型管理页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.addModal = new bootstrap.Modal(this.$refs.addModal);
        this.editModal = new bootstrap.Modal(this.$refs.editModal);
      });
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载资产类型列表
      await this.loadAssetTypes();
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
 * 加载资产类型列表
 */
    async loadAssetTypes() {
      this.loading = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/material/asset-types`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载资产类型列表失败');
        
        const result = await response.json();
        
        if (result.success) {
          this.assetTypes = result.data?.asset_types || [];
          this.updateStats();
          console.log(`✅ 加载资产类型: ${this.assetTypes.length} 个`);
    } else {
          this.showError(result.message || '加载失败');
    }
  } catch (error) {
        console.error('加载资产类型列表失败:', error);
        this.showError('加载失败，请稍后重试');
      } finally {
        this.loading = false;
      }
    },

/**
     * 更新统计
 */
    updateStats() {
      const enabled = this.assetTypes.filter(a => a.is_enabled).length;
      const groups = new Set(this.assetTypes.map(a => a.group_code)).size;
      
      this.stats = {
        total: this.assetTypes.length,
        enabled: enabled,
        disabled: this.assetTypes.length - enabled,
        groups: groups
      };
    },

/**
     * 打开添加弹窗
 */
    openAddModal() {
      this.addForm = {
        asset_code: '',
        display_name: '',
        group_code: '',
        form: '',
        tier: '',
        visible_value_points: '',
        budget_value_points: '',
        sort_order: 0,
        is_enabled: '1'
      };
      this.addModal.show();
    },
    
    /**
     * 提交添加
     */
    async submitAdd() {
      if (!this.addForm.asset_code || !this.addForm.display_name || 
          !this.addForm.group_code || !this.addForm.form || !this.addForm.tier) {
        this.showError('请填写必填项');
        return;
      }
      
      this.submitting = true;
      
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/material/asset-types`, {
      method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            asset_code: this.addForm.asset_code.trim(),
            display_name: this.addForm.display_name.trim(),
            group_code: this.addForm.group_code.trim(),
            form: this.addForm.form,
            tier: parseInt(this.addForm.tier),
            visible_value_points: parseInt(this.addForm.visible_value_points) || 0,
            budget_value_points: parseInt(this.addForm.budget_value_points) || 0,
            sort_order: parseInt(this.addForm.sort_order) || 0,
            is_enabled: parseInt(this.addForm.is_enabled)
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          this.showSuccess('添加成功');
          this.addModal.hide();
          this.loadAssetTypes();
    } else {
          this.showError(result.message || '添加失败');
    }
  } catch (error) {
        console.error('添加资产类型失败:', error);
        this.showError('添加失败，请稍后重试');
  } finally {
        this.submitting = false;
  }
    },

/**
     * 打开编辑弹窗
 */
    openEditModal(assetCode) {
      const asset = this.assetTypes.find(a => a.asset_code === assetCode);
      if (!asset) return;
      
      this.editForm = {
        asset_code: asset.asset_code,
        display_name: asset.display_name,
        group_code: asset.group_code,
        form: this.getFormLabel(asset.form),
        tier: asset.tier,
        visible_value_points: asset.visible_value_points,
        budget_value_points: asset.budget_value_points,
        sort_order: asset.sort_order,
        is_enabled: asset.is_enabled ? '1' : '0'
      };
      
      this.editModal.show();
    },

/**
     * 提交编辑
 */
    async submitEdit() {
      if (!this.editForm.display_name) {
        this.showError('请填写显示名称');
        return;
      }
      
      this.submitting = true;

  try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/material/asset-types/${this.editForm.asset_code}`, {
      method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            display_name: this.editForm.display_name.trim(),
            visible_value_points: parseInt(this.editForm.visible_value_points) || 0,
            budget_value_points: parseInt(this.editForm.budget_value_points) || 0,
            sort_order: parseInt(this.editForm.sort_order) || 0,
            is_enabled: parseInt(this.editForm.is_enabled)
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          this.showSuccess('更新成功');
          this.editModal.hide();
          this.loadAssetTypes();
    } else {
          this.showError(result.message || '更新失败');
    }
  } catch (error) {
        console.error('更新资产类型失败:', error);
        this.showError('更新失败，请稍后重试');
  } finally {
        this.submitting = false;
  }
    },

/**
     * 切换状态
 */
    async toggleStatus(assetCode, currentStatus) {
      const newStatus = currentStatus ? 0 : 1;
      const action = newStatus ? '启用' : '禁用';

  if (!confirm(`确定要${action}该资产类型吗？`)) {
        return;
  }

  try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/material/asset-types/${assetCode}`, {
      method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
      body: JSON.stringify({ is_enabled: newStatus })
        });
        
        const result = await response.json();
        
        if (result.success) {
          this.showSuccess(`${action}成功`);
          this.loadAssetTypes();
    } else {
          this.showError(result.message || `${action}失败`);
    }
  } catch (error) {
        console.error(`${action}资产类型失败:`, error);
        this.showError(`${action}失败，请稍后重试`);
  }
    },

/**
 * 获取形态标签
 */
    getFormLabel(form) {
  const labels = {
    shard: '碎片',
    crystal: '水晶'
      };
      return labels[form] || form;
    },

/**
     * 获取形态颜色
     */
    getFormColor(form) {
      return form === 'shard' ? 'bg-warning' : 'bg-primary';
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
  Alpine.data('materialAssetTypesPage', materialAssetTypesPage)
  console.log('✅ [MaterialAssetTypesPage] Alpine 组件已注册')
})
