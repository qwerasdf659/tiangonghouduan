/**
 * Config Tools Page - Alpine.js Components
 * 配置工具页面组件 (Mode A: Alpine.data() 标准模式)
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('configToolsPage', () => ({
    configListLoaded: false,
    categoryCounts: {},
    currentCategory: null,
    categorySettings: [],
    settingsLoading: false,
    editableSettings: {},
    detailTitle: '配置详情',
    categoryDisplayMap: {
      basic: { name: '基础设置', icon: 'bi-gear', color: 'primary' },
      points: { name: '积分设置', icon: 'bi-coin', color: 'warning' },
      notification: { name: '通知设置', icon: 'bi-bell', color: 'info' },
      security: { name: '安全设置', icon: 'bi-shield-lock', color: 'danger' },
      marketplace: { name: '市场设置', icon: 'bi-shop', color: 'success' }
    },
    categoryNames: { basic: '基础设置', points: '积分设置', notification: '通知设置', security: '安全设置', marketplace: '市场设置' },
    featureFlagsLoading: false,
    featureFlags: [],
    featureFlagValues: {},
    maintenanceForm: {
      enabled: false,
      message: '系统正在升级维护中，预计30分钟后恢复，给您带来不便敬请谅解。',
      endTime: ''
    },
    newConfig: { key: '', value: '', description: '', type: 'string' },

    init() {
      this.loadConfigList();
    },

    getCategoryDisplay(category) {
      return this.categoryDisplayMap[category] || { name: category, icon: 'bi-folder', color: 'secondary' };
    },

    formatSettingValue(value) {
      if (value === null || value === undefined) return '-';
      if (typeof value === 'boolean') return value ? '是' : '否';
      if (typeof value === 'object') return JSON.stringify(value, null, 2);
      return String(value);
    },

    async loadConfigList() {
      try {
        const response = await apiRequest(API_ENDPOINTS.SETTINGS.LIST);
        if (response && response.success) {
          const summary = response.data || {};
          this.categoryCounts = summary.categories || {};
        }
      } catch (error) {
        console.error('加载配置列表失败:', error);
      } finally {
        this.configListLoaded = true;
      }
    },

    async loadCategorySettings(category) {
      this.currentCategory = category;
      this.settingsLoading = true;
      this.detailTitle = (this.categoryNames[category] || category) + ' 配置列表';
      this.editableSettings = {};

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.CATEGORY, { category }));
        if (response && response.success) {
          const data = response.data || {};
          this.categorySettings = data.settings || [];

          // Initialize editable settings
          this.categorySettings.forEach(setting => {
            if (!setting.is_readonly) {
              let value = setting.parsed_value !== undefined ? setting.parsed_value : setting.setting_value;
              if (setting.value_type === 'json' && typeof value === 'object') {
                value = JSON.stringify(value, null, 2);
              }
              this.editableSettings[setting.setting_key] = value;
            }
          });
        }
      } catch (error) {
        console.error('加载分类配置失败:', error);
        this.categorySettings = [];
      } finally {
        this.settingsLoading = false;
      }
    },

    async saveSettings() {
      const settingsToUpdate = {};
      let hasError = false;

      this.categorySettings.forEach(setting => {
        if (setting.is_readonly) return;

        const key = setting.setting_key;
        let value = this.editableSettings[key];

        if (setting.value_type === 'json' && typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch (e) {
            this.$toast.error(`配置项 ${key} 的JSON格式无效`);
            hasError = true;
            return;
          }
        }

        settingsToUpdate[key] = value;
      });

      if (hasError || Object.keys(settingsToUpdate).length === 0) return;

      showLoading();
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.UPDATE, { category: this.currentCategory }), {
          method: 'PUT',
          body: JSON.stringify({ settings: settingsToUpdate })
        });

        if (response && response.success) {
          this.$toast.success('设置保存成功');
          this.loadCategorySettings(this.currentCategory);
        } else {
          throw new Error(response?.message || '保存失败');
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message);
      } finally {
        hideLoading();
      }
    },

    showCacheModal() {
      new bootstrap.Modal(this.$refs.cacheModal).show();
    },

    async clearCache(type) {
      if (!confirm(`确定要清理 ${type === 'all' ? '全部' : type} 缓存吗？`)) return;

      showLoading();
      try {
        const patternMap = { user: 'user:*', config: 'settings:*', activity: 'activity:*', all: '*' };
        const response = await apiRequest(API_ENDPOINTS.CACHE.CLEAR, {
          method: 'POST',
          body: JSON.stringify({ pattern: patternMap[type] || type, confirm: true })
        });

        if (response && response.success) {
          const result = response.data || {};
          this.$toast.success(`缓存清理成功，清理了 ${result.cleared_count || 0} 个缓存键`);
        } else {
          throw new Error(response?.message || '清理失败');
        }
      } catch (error) {
        this.$toast.error('清理失败：' + error.message);
      } finally {
        hideLoading();
      }
    },

    async showFeatureFlagsModal() {
      this.featureFlagsLoading = true;
      this.featureFlags = [];
      this.featureFlagValues = {};
      new bootstrap.Modal(this.$refs.featureFlagsModal).show();

      try {
        const response = await apiRequest(API_ENDPOINTS.SETTINGS.SECURITY);
        if (response && response.success) {
          const settings = response.data?.settings || [];
          this.featureFlags = settings.filter(s => s.value_type === 'boolean');
          this.featureFlags.forEach(flag => {
            this.featureFlagValues[flag.setting_key] = flag.parsed_value || false;
          });
        }
      } catch (error) {
        console.error('加载功能开关失败:', error);
      } finally {
        this.featureFlagsLoading = false;
      }
    },

    async saveFeatureFlags() {
      showLoading();
      try {
        const response = await apiRequest(API_ENDPOINTS.SETTINGS.SECURITY, {
          method: 'PUT',
          body: JSON.stringify({ settings: this.featureFlagValues })
        });

        if (response && response.success) {
          this.$toast.success('功能开关保存成功');
          bootstrap.Modal.getInstance(this.$refs.featureFlagsModal).hide();
        } else {
          throw new Error(response?.message || '保存失败');
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message);
      } finally {
        hideLoading();
      }
    },

    async showMaintenanceModal() {
      new bootstrap.Modal(this.$refs.maintenanceModal).show();

      try {
        const response = await apiRequest(API_ENDPOINTS.SETTINGS.BASIC);
        if (response && response.success) {
          const settings = response.data?.settings || [];
          const maintenanceEnabled = settings.find(s => s.setting_key === 'maintenance_mode');
          const maintenanceMessage = settings.find(s => s.setting_key === 'maintenance_message');
          const maintenanceEndTime = settings.find(s => s.setting_key === 'maintenance_end_time');

          this.maintenanceForm.enabled = maintenanceEnabled?.parsed_value || false;
          this.maintenanceForm.message = maintenanceMessage?.parsed_value || '系统正在升级维护中，预计30分钟后恢复，给您带来不便敬请谅解。';
          
          if (maintenanceEndTime?.parsed_value) {
            const endTime = new Date(maintenanceEndTime.parsed_value);
            this.maintenanceForm.endTime = endTime.toISOString().slice(0, 16);
          }
        }
      } catch (error) {
        console.error('加载维护模式配置失败:', error);
      }
    },

    async saveMaintenanceMode() {
      showLoading();
      try {
        const settings = {
          maintenance_mode: this.maintenanceForm.enabled,
          maintenance_message: this.maintenanceForm.message
        };

        if (this.maintenanceForm.endTime) {
          settings.maintenance_end_time = new Date(this.maintenanceForm.endTime).toISOString();
        }

        const response = await apiRequest(API_ENDPOINTS.SETTINGS.BASIC, {
          method: 'PUT',
          body: JSON.stringify({ settings })
        });

        if (response && response.success) {
          this.$toast.success('维护模式设置成功');
          bootstrap.Modal.getInstance(this.$refs.maintenanceModal).hide();
        } else {
          throw new Error(response?.message || '保存失败');
        }
      } catch (error) {
        this.$toast.error('保存失败：' + error.message);
      } finally {
        hideLoading();
      }
    },

    showAddConfigModal() {
      this.newConfig = { key: '', value: '', description: '', type: 'string' };
      new bootstrap.Modal(this.$refs.addConfigModal).show();
    },

    async addConfig() {
      if (!this.newConfig.key.trim()) {
        this.$toast.warning('请输入配置键名');
        return;
      }

      if (!this.currentCategory) {
        this.$toast.warning('请先从左侧选择一个配置分类');
        return;
      }

      showLoading();
      try {
        let value = this.newConfig.value;
        if (this.newConfig.type === 'number') {
          value = parseFloat(value);
        } else if (this.newConfig.type === 'boolean') {
          value = value.toLowerCase() === 'true';
        } else if (this.newConfig.type === 'json') {
          value = JSON.parse(value);
        }

        const settingsToUpdate = { [this.newConfig.key]: value };
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.SETTINGS.UPDATE, { category: this.currentCategory }), {
          method: 'PUT',
          body: JSON.stringify({ settings: settingsToUpdate })
        });

        if (response && response.success) {
          this.$toast.success('配置添加成功');
          bootstrap.Modal.getInstance(this.$refs.addConfigModal).hide();
          this.loadCategorySettings(this.currentCategory);
          this.loadConfigList();
        } else {
          throw new Error(response?.message || '添加失败');
        }
      } catch (error) {
        this.$toast.error('添加失败：' + error.message);
      } finally {
        hideLoading();
      }
    }
  }));

  console.log('✅ [ConfigTools] Alpine 组件已注册');
});
