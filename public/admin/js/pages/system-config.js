/**
 * System Config Page - Alpine.js Components
 * 系统配置页面组件 (Mode A: Alpine.data() 标准模式)
 */

document.addEventListener('alpine:init', () => {
  // Navigation component
  Alpine.data('systemNavigation', () => ({
    currentPage: 'system-params',
    subPages: [
      { id: 'system-params', title: '系统参数', icon: 'bi-gear' },
      { id: 'feature-flags', title: '功能开关', icon: 'bi-toggles' },
      { id: 'scheduled-tasks', title: '定时任务', icon: 'bi-clock-history' },
      { id: 'audit-logs', title: '操作日志', icon: 'bi-journal-text' },
      { id: 'cache-management', title: '缓存管理', icon: 'bi-hdd' },
      { id: 'system-stats', title: '系统统计', icon: 'bi-graph-up' }
    ],
    init() {
      const urlParams = new URLSearchParams(window.location.search);
      this.currentPage = urlParams.get('page') || 'system-params';
      Alpine.store('systemPage', this.currentPage);
    },
    switchPage(pageId) {
      this.currentPage = pageId;
      Alpine.store('systemPage', pageId);
      window.history.pushState({}, '', `?page=${pageId}`);
    }
  }));

  Alpine.store('systemPage', 'system-params');

  // Page content component
  Alpine.data('systemPageContent', () => ({
    systemParams: [],
    featureFlags: [],
    scheduledTasks: [],
    auditLogs: [],
    paramFilters: { param_key: '', category: '' },
    logFilters: { operator_id: '', action_type: '', start_date: '', end_date: '' },
    cacheStats: { hitRate: 0, totalKeys: 0, memoryUsage: '0 MB' },
    systemStats: { totalParams: 0, totalFlags: 0, totalTasks: 0, todayLogs: 0 },

    get currentPage() {
      return Alpine.store('systemPage');
    },

    init() {
      this.loadAllData();
      this.$watch('$store.systemPage', () => this.loadAllData());
    },

    async loadAllData() {
      showLoading();
      try {
        await Promise.all([
          this.loadSystemParams(),
          this.loadFeatureFlags(),
          this.loadScheduledTasks(),
          this.loadAuditLogs(),
          this.loadCacheStats()
        ]);
        this.calculateStats();
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        hideLoading();
      }
    },

    async loadSystemParams() {
      try {
        let url = API_ENDPOINTS.SYSTEM?.PARAMS || '/api/v4/admin/system/params';
        const params = new URLSearchParams();
        if (this.paramFilters.param_key) params.append('param_key', this.paramFilters.param_key);
        if (this.paramFilters.category) params.append('category', this.paramFilters.category);
        if (params.toString()) url += '?' + params.toString();
        const response = await apiRequest(url);
        if (response && response.success) {
          this.systemParams = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载系统参数失败:', error);
        this.systemParams = [];
      }
    },

    async loadFeatureFlags() {
      try {
        const response = await apiRequest(API_ENDPOINTS.SYSTEM?.FEATURE_FLAGS || '/api/v4/admin/system/feature-flags');
        if (response && response.success) {
          this.featureFlags = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载功能开关失败:', error);
        this.featureFlags = [];
      }
    },

    async loadScheduledTasks() {
      try {
        const response = await apiRequest(API_ENDPOINTS.SYSTEM?.TASKS || '/api/v4/admin/system/scheduled-tasks');
        if (response && response.success) {
          this.scheduledTasks = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载定时任务失败:', error);
        this.scheduledTasks = [];
      }
    },

    async loadAuditLogs() {
      try {
        let url = API_ENDPOINTS.SYSTEM?.AUDIT_LOGS || '/api/v4/admin/system/audit-logs';
        const params = new URLSearchParams();
        if (this.logFilters.operator_id) params.append('operator_id', this.logFilters.operator_id);
        if (this.logFilters.action_type) params.append('action_type', this.logFilters.action_type);
        if (this.logFilters.start_date) params.append('start_date', this.logFilters.start_date);
        if (this.logFilters.end_date) params.append('end_date', this.logFilters.end_date);
        if (params.toString()) url += '?' + params.toString();
        const response = await apiRequest(url);
        if (response && response.success) {
          this.auditLogs = response.data?.list || response.data || [];
        }
      } catch (error) {
        console.error('加载操作日志失败:', error);
        this.auditLogs = [];
      }
    },

    async loadCacheStats() {
      try {
        const response = await apiRequest(API_ENDPOINTS.SYSTEM?.CACHE_STATS || '/api/v4/admin/system/cache/stats');
        if (response && response.success) {
          this.cacheStats = {
            hitRate: response.data?.hit_rate || 0,
            totalKeys: response.data?.total_keys || 0,
            memoryUsage: response.data?.memory_usage || '0 MB'
          };
        }
      } catch (error) {
        console.error('加载缓存统计失败:', error);
      }
    },

    calculateStats() {
      this.systemStats = {
        totalParams: this.systemParams.length,
        totalFlags: this.featureFlags.length,
        totalTasks: this.scheduledTasks.length,
        todayLogs: this.auditLogs.filter(log => {
          const logDate = new Date(log.created_at).toDateString();
          return logDate === new Date().toDateString();
        }).length
      };
    },

    getTaskStatusClass(status) {
      const map = { active: 'bg-success', paused: 'bg-warning', failed: 'bg-danger', disabled: 'bg-secondary' };
      return map[status] || 'bg-secondary';
    },

    getTaskStatusText(status) {
      const map = { active: '运行中', paused: '已暂停', failed: '失败', disabled: '已禁用' };
      return map[status] || status;
    },

    getActionTypeClass(type) {
      const map = { create: 'bg-success', update: 'bg-primary', delete: 'bg-danger', login: 'bg-info' };
      return map[type] || 'bg-secondary';
    },

    openCreateModal(type) {
      this.$toast.info(`创建${type}功能开发中`);
    },

    editParam(param) {
      this.$toast.info(`编辑参数: ${param.param_key}`);
    },

    deleteParam(param) {
      if (confirm(`确定要删除参数 ${param.param_key} 吗？`)) {
        this.$toast.info('删除参数功能开发中');
      }
    },

    async toggleFeatureFlag(flag) {
      try {
        showLoading();
        const response = await apiRequest(
          (API_ENDPOINTS.SYSTEM?.FEATURE_FLAGS || '/api/v4/admin/system/feature-flags') + `/${flag.flag_key}/toggle`,
          { method: 'POST', body: JSON.stringify({ is_enabled: !flag.is_enabled }) }
        );
        if (response && response.success) {
          flag.is_enabled = !flag.is_enabled;
          showToast('success', '功能开关已更新');
        }
      } catch (error) {
        console.error('切换功能开关失败:', error);
        showToast('error', '操作失败');
      } finally {
        hideLoading();
      }
    },

    editTask(task) {
      this.$toast.info(`编辑任务: ${task.task_name}`);
    },

    async runTask(task) {
      if (confirm(`确定要立即执行任务 ${task.task_name} 吗？`)) {
        try {
          showLoading();
          const response = await apiRequest(
            (API_ENDPOINTS.SYSTEM?.TASKS || '/api/v4/admin/system/scheduled-tasks') + `/${task.task_id}/run`,
            { method: 'POST' }
          );
          if (response && response.success) {
            showToast('success', '任务已触发执行');
            await this.loadScheduledTasks();
          }
        } catch (error) {
          console.error('执行任务失败:', error);
          showToast('error', '执行失败');
        } finally {
          hideLoading();
        }
      }
    },

    async toggleTask(task) {
      const action = task.status === 'active' ? '暂停' : '启用';
      if (confirm(`确定要${action}任务 ${task.task_name} 吗？`)) {
        try {
          showLoading();
          const response = await apiRequest(
            (API_ENDPOINTS.SYSTEM?.TASKS || '/api/v4/admin/system/scheduled-tasks') + `/${task.task_id}/toggle`,
            { method: 'POST' }
          );
          if (response && response.success) {
            showToast('success', `任务已${action}`);
            await this.loadScheduledTasks();
          }
        } catch (error) {
          console.error('切换任务状态失败:', error);
          showToast('error', '操作失败');
        } finally {
          hideLoading();
        }
      }
    },

    async clearCache(type) {
      const typeNames = { user: '用户', config: '配置', session: '会话', all: '所有' };
      if (confirm(`确定要清除${typeNames[type]}缓存吗？`)) {
        try {
          showLoading();
          const response = await apiRequest(
            (API_ENDPOINTS.SYSTEM?.CACHE_CLEAR || '/api/v4/admin/system/cache/clear'),
            { method: 'POST', body: JSON.stringify({ type }) }
          );
          if (response && response.success) {
            showToast('success', `${typeNames[type]}缓存已清除`);
            await this.loadCacheStats();
          }
        } catch (error) {
          console.error('清除缓存失败:', error);
          showToast('error', '清除失败');
        } finally {
          hideLoading();
        }
      }
    }
  }));

  console.log('✅ [SystemConfig] Alpine 组件已注册');
});
