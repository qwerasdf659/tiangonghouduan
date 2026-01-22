/**
 * 字典管理页面 Alpine.js 组件
 * 从 dict-management.html 内嵌脚本迁移
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('dictManagementPage', () => ({
    currentDictType: 'categories',
    categoriesData: [],
    raritiesData: [],
    assetGroupsData: [],
    isSubmitting: false,
    dictTitles: {
      'categories': '物品类目列表',
      'rarities': '稀有度列表',
      'asset-groups': '资产分组列表'
    },
    typeLabels: { system: '系统', material: '材料', custom: '自定义' },
    categoryForm: {
      editCode: '',
      code: '',
      displayName: '',
      description: '',
      iconUrl: '',
      sortOrder: 0,
      isEnabled: true,
    },
    rarityForm: {
      editCode: '',
      code: '',
      displayName: '',
      description: '',
      tier: 1,
      colorHex: '#6c757d',
      sortOrder: 0,
      isEnabled: true,
    },
    assetGroupForm: {
      editCode: '',
      code: '',
      displayName: '',
      description: '',
      groupType: 'material',
      colorHex: '#28a745',
      sortOrder: 0,
      isTradable: true,
      isEnabled: true,
    },

    init() {
      this.loadAllData();
    },

    getGroupTypeLabel(type) {
      return this.typeLabels[type] || type;
    },

    syncColorHex(formType) {
      // Color inputs sync automatically with x-model
    },

    async loadAllData() {
      showLoading();
      try {
        const [catRes, rarRes, groupRes] = await Promise.all([
          apiRequest(API_ENDPOINTS.DICT.CATEGORIES),
          apiRequest(API_ENDPOINTS.DICT.RARITIES),
          apiRequest(API_ENDPOINTS.DICT.ASSET_GROUPS)
        ]);

        if (catRes && catRes.success) {
          this.categoriesData = catRes.data.items || [];
        }
        if (rarRes && rarRes.success) {
          this.raritiesData = rarRes.data.items || [];
        }
        if (groupRes && groupRes.success) {
          this.assetGroupsData = groupRes.data.items || [];
        }
      } catch (error) {
        console.error('加载字典数据失败:', error);
        this.showError('加载失败', error.message);
      } finally {
        hideLoading();
      }
    },

    switchDictType(type) {
      this.currentDictType = type;
    },

    openAddModal() {
      switch (this.currentDictType) {
        case 'categories':
          this.categoryForm = { editCode: '', code: '', displayName: '', description: '', iconUrl: '', sortOrder: 0, isEnabled: true };
          new bootstrap.Modal(this.$refs.categoryModal).show();
          break;
        case 'rarities':
          this.rarityForm = { editCode: '', code: '', displayName: '', description: '', tier: 1, colorHex: '#6c757d', sortOrder: 0, isEnabled: true };
          new bootstrap.Modal(this.$refs.rarityModal).show();
          break;
        case 'asset-groups':
          this.assetGroupForm = { editCode: '', code: '', displayName: '', description: '', groupType: 'material', colorHex: '#28a745', sortOrder: 0, isTradable: true, isEnabled: true };
          new bootstrap.Modal(this.$refs.assetGroupModal).show();
          break;
      }
    },

    // ===== Category Operations =====
    editCategory(item) {
      this.categoryForm = {
        editCode: item.category_code,
        code: item.category_code,
        displayName: item.display_name || '',
        description: item.description || '',
        iconUrl: item.icon_url || '',
        sortOrder: item.sort_order || 0,
        isEnabled: item.is_enabled,
      };
      new bootstrap.Modal(this.$refs.categoryModal).show();
    },

    async submitCategory() {
      if (this.isSubmitting) return;
      
      const data = {
        category_code: this.categoryForm.code.trim().toLowerCase(),
        display_name: this.categoryForm.displayName.trim(),
        description: this.categoryForm.description.trim() || null,
        icon_url: this.categoryForm.iconUrl.trim() || null,
        sort_order: this.categoryForm.sortOrder || 0,
        is_enabled: this.categoryForm.isEnabled
      };

      if (!data.category_code || !data.display_name) {
        alert('请填写类目代码和显示名称');
        return;
      }

      if (!/^[a-z][a-z0-9_]*$/.test(data.category_code)) {
        alert('类目代码格式错误：必须以小写字母开头，仅包含小写字母、数字和下划线');
        return;
      }

      this.isSubmitting = true;
      showLoading();
      try {
        const url = this.categoryForm.editCode
          ? API.buildURL(API_ENDPOINTS.DICT.UPDATE_CATEGORY, { code: this.categoryForm.editCode })
          : API_ENDPOINTS.DICT.CREATE_CATEGORY;
        const method = this.categoryForm.editCode ? 'PUT' : 'POST';

        const response = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.categoryModal).hide();
          alert(`✅ ${this.categoryForm.editCode ? '更新' : '创建'}成功`);
          this.loadAllData();
        } else {
          this.showError('保存失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('保存失败', error.message);
      } finally {
        this.isSubmitting = false;
        hideLoading();
      }
    },

    async deleteCategory(code) {
      if (!confirm(`确定要删除类目 "${code}" 吗？`)) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.DICT.DELETE_CATEGORY, { code }), { method: 'DELETE' });
        if (response && response.success) {
          alert('✅ 删除成功');
          this.loadAllData();
        } else {
          this.showError('删除失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('删除失败', error.message);
      } finally {
        hideLoading();
      }
    },

    // ===== Rarity Operations =====
    editRarity(item) {
      this.rarityForm = {
        editCode: item.rarity_code,
        code: item.rarity_code,
        displayName: item.display_name || '',
        description: item.description || '',
        tier: item.tier || 1,
        colorHex: item.color_hex || '#6c757d',
        sortOrder: item.sort_order || 0,
        isEnabled: item.is_enabled,
      };
      new bootstrap.Modal(this.$refs.rarityModal).show();
    },

    async submitRarity() {
      if (this.isSubmitting) return;
      
      const data = {
        rarity_code: this.rarityForm.code.trim().toLowerCase(),
        display_name: this.rarityForm.displayName.trim(),
        description: this.rarityForm.description.trim() || null,
        tier: this.rarityForm.tier || 1,
        color_hex: this.rarityForm.colorHex.trim() || null,
        sort_order: this.rarityForm.sortOrder || 0,
        is_enabled: this.rarityForm.isEnabled
      };

      if (!data.rarity_code || !data.display_name) {
        alert('请填写稀有度代码和显示名称');
        return;
      }

      if (!/^[a-z][a-z0-9_]*$/.test(data.rarity_code)) {
        alert('稀有度代码格式错误：必须以小写字母开头，仅包含小写字母、数字和下划线');
        return;
      }

      this.isSubmitting = true;
      showLoading();
      try {
        const url = this.rarityForm.editCode
          ? API.buildURL(API_ENDPOINTS.DICT.UPDATE_RARITY, { code: this.rarityForm.editCode })
          : API_ENDPOINTS.DICT.CREATE_RARITY;
        const method = this.rarityForm.editCode ? 'PUT' : 'POST';

        const response = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.rarityModal).hide();
          alert(`✅ ${this.rarityForm.editCode ? '更新' : '创建'}成功`);
          this.loadAllData();
        } else {
          this.showError('保存失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('保存失败', error.message);
      } finally {
        this.isSubmitting = false;
        hideLoading();
      }
    },

    async deleteRarity(code) {
      if (!confirm(`确定要删除稀有度 "${code}" 吗？`)) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.DICT.DELETE_RARITY, { code }), { method: 'DELETE' });
        if (response && response.success) {
          alert('✅ 删除成功');
          this.loadAllData();
        } else {
          this.showError('删除失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('删除失败', error.message);
      } finally {
        hideLoading();
      }
    },

    // ===== Asset Group Operations =====
    editAssetGroup(item) {
      this.assetGroupForm = {
        editCode: item.group_code,
        code: item.group_code,
        displayName: item.display_name || '',
        description: item.description || '',
        groupType: item.group_type || 'material',
        colorHex: item.color_hex || '#28a745',
        sortOrder: item.sort_order || 0,
        isTradable: item.is_tradable,
        isEnabled: item.is_enabled,
      };
      new bootstrap.Modal(this.$refs.assetGroupModal).show();
    },

    async submitAssetGroup() {
      if (this.isSubmitting) return;
      
      const data = {
        group_code: this.assetGroupForm.code.trim().toLowerCase(),
        display_name: this.assetGroupForm.displayName.trim(),
        description: this.assetGroupForm.description.trim() || null,
        group_type: this.assetGroupForm.groupType,
        color_hex: this.assetGroupForm.colorHex.trim() || null,
        sort_order: this.assetGroupForm.sortOrder || 0,
        is_tradable: this.assetGroupForm.isTradable,
        is_enabled: this.assetGroupForm.isEnabled
      };

      if (!data.group_code || !data.display_name) {
        alert('请填写分组代码和显示名称');
        return;
      }

      if (!/^[a-z][a-z0-9_]*$/.test(data.group_code)) {
        alert('分组代码格式错误：必须以小写字母开头，仅包含小写字母、数字和下划线');
        return;
      }

      this.isSubmitting = true;
      showLoading();
      try {
        const url = this.assetGroupForm.editCode
          ? API.buildURL(API_ENDPOINTS.DICT.UPDATE_ASSET_GROUP, { code: this.assetGroupForm.editCode })
          : API_ENDPOINTS.DICT.CREATE_ASSET_GROUP;
        const method = this.assetGroupForm.editCode ? 'PUT' : 'POST';

        const response = await apiRequest(url, { method, body: JSON.stringify(data) });

        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.assetGroupModal).hide();
          alert(`✅ ${this.assetGroupForm.editCode ? '更新' : '创建'}成功`);
          this.loadAllData();
        } else {
          this.showError('保存失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('保存失败', error.message);
      } finally {
        this.isSubmitting = false;
        hideLoading();
      }
    },

    async deleteAssetGroup(code) {
      if (!confirm(`确定要删除资产分组 "${code}" 吗？`)) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.DICT.DELETE_ASSET_GROUP, { code }), { method: 'DELETE' });
        if (response && response.success) {
          alert('✅ 删除成功');
          this.loadAllData();
        } else {
          this.showError('删除失败', response?.message || '操作失败');
        }
      } catch (error) {
        this.showError('删除失败', error.message);
      } finally {
        hideLoading();
      }
    },

    showError(title, message) {
      alert(`❌ ${title}\n${message}`);
    }
  }));
});

