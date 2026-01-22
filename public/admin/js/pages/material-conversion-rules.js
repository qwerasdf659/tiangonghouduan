/**
 * 材料转换规则管理页面 - Alpine.js 组件
 * material-conversion-rules.js
 */

function materialConversionRulesPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    submitting: false,
    
    // 资产类型
    assetTypes: [],
    
    // 规则数据
    rules: [],
    
    // 统计
    stats: {
      total: 0,
      enabled: 0,
      disabled: 0,
      paths: 0
    },
    
    // 添加表单
    addForm: {
      from_asset_code: '',
      to_asset_code: '',
      input_quantity: '',
      output_quantity: '',
      effective_at: '',
      is_enabled: '1'
    },
    
    // 编辑表单
    editForm: {
      rule_id: '',
      direction: '',
      input_quantity: '',
      output_quantity: '',
      effective_at: '',
      is_enabled: '1'
    },
    
    // 风控警告
    addValidationWarnings: [],
    editValidationWarnings: [],
    
    // 弹窗实例
    addModal: null,
    editModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化材料转换规则管理页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.addModal = new bootstrap.Modal(this.$refs.addModal);
        this.editModal = new bootstrap.Modal(this.$refs.editModal);
      });
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载资产类型和规则
      await Promise.all([this.loadAssetTypes(), this.loadRules()]);
    },
    
    /**
     * 加载用户信息
     */
    loadUserInfo() {
      try {
        const user = getCurrentUser();
        if (user) {
          this.userInfo = user;
        }
      } catch (error) {
        console.error('加载用户信息失败:', error);
      }
    },
    
    /**
     * 退出登录
     */
    handleLogout() {
      if (typeof logout === 'function') {
        logout();
      }
    },
    
    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      try {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL.ASSET_TYPES);
        if (response && response.success) {
          this.assetTypes = response.data?.asset_types || [];
        }
      } catch (error) {
        console.error('加载资产类型失败:', error);
      }
    },
    
    /**
     * 获取启用的资产类型
     */
    getEnabledAssetTypes() {
      return this.assetTypes.filter(a => a.is_enabled);
    },
    
    /**
     * 加载转换规则
     */
    async loadRules() {
      this.loading = true;
      try {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL.CONVERSION_RULES);

        if (response && response.success) {
          this.rules = response.data?.rules || [];
          this.updateStatistics();
        } else {
          alert('❌ 加载失败: ' + (response?.message || '未知错误'));
        }
      } catch (error) {
        console.error('加载转换规则失败:', error);
        alert('❌ 加载失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },
    
    /**
     * 更新统计
     */
    updateStatistics() {
      this.stats.total = this.rules.length;
      this.stats.enabled = this.rules.filter(r => r.is_enabled).length;
      this.stats.disabled = this.stats.total - this.stats.enabled;
      this.stats.paths = new Set(this.rules.map(r => `${r.from_asset_code}-${r.to_asset_code}`)).size;
    },
    
    /**
     * 打开添加弹窗
     */
    openAddModal() {
      this.addForm = {
        from_asset_code: '',
        to_asset_code: '',
        input_quantity: '',
        output_quantity: '',
        effective_at: '',
        is_enabled: '1'
      };
      this.addValidationWarnings = [];
      this.addModal.show();
    },
    
    /**
     * 提交添加
     */
    async submitAdd() {
      // 验证
      if (!this.addForm.from_asset_code || !this.addForm.to_asset_code || 
          !this.addForm.input_quantity || !this.addForm.output_quantity || 
          !this.addForm.effective_at) {
        alert('❌ 请填写所有必填字段');
        return;
      }

      const data = {
        from_asset_code: this.addForm.from_asset_code,
        to_asset_code: this.addForm.to_asset_code,
        input_quantity: parseInt(this.addForm.input_quantity),
        output_quantity: parseInt(this.addForm.output_quantity),
        effective_at: this.addForm.effective_at,
        is_enabled: parseInt(this.addForm.is_enabled)
      };

      this.submitting = true;
      try {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL.CONVERSION_RULES, {
          method: 'POST',
          body: JSON.stringify(data)
        });

        if (response && response.success) {
          alert('✅ 添加成功');
          this.addModal.hide();
          await this.loadRules();
        } else {
          alert('❌ 添加失败: ' + (response?.message || '未知错误'));
          // 显示风控警告
          if (response?.validation) {
            this.addValidationWarnings = this.parseValidationWarnings(response.validation);
          }
        }
      } catch (error) {
        console.error('添加转换规则失败:', error);
        alert('❌ 添加失败: ' + error.message);
      } finally {
        this.submitting = false;
      }
    },
    
    /**
     * 打开编辑弹窗
     */
    openEditModal(ruleId) {
      const rule = this.rules.find(r => r.rule_id === parseInt(ruleId));
      if (!rule) return;

      this.editForm = {
        rule_id: rule.rule_id,
        direction: `${rule.from_asset_code} → ${rule.to_asset_code}`,
        input_quantity: rule.input_quantity,
        output_quantity: rule.output_quantity,
        effective_at: this.formatDateTimeLocal(rule.effective_at),
        is_enabled: rule.is_enabled ? '1' : '0'
      };
      this.editValidationWarnings = [];
      this.editModal.show();
    },
    
    /**
     * 提交编辑
     */
    async submitEdit() {
      if (!this.editForm.input_quantity || !this.editForm.output_quantity || !this.editForm.effective_at) {
        alert('❌ 请填写所有必填字段');
        return;
      }

      const data = {
        input_quantity: parseInt(this.editForm.input_quantity),
        output_quantity: parseInt(this.editForm.output_quantity),
        effective_at: this.editForm.effective_at,
        is_enabled: parseInt(this.editForm.is_enabled)
      };

      this.submitting = true;
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.MATERIAL.CONVERSION_RULE_DETAIL, { rule_id: this.editForm.rule_id }), {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        if (response && response.success) {
          alert('✅ 更新成功');
          this.editModal.hide();
          await this.loadRules();
        } else {
          alert('❌ 更新失败: ' + (response?.message || '未知错误'));
          if (response?.validation) {
            this.editValidationWarnings = this.parseValidationWarnings(response.validation);
          }
        }
      } catch (error) {
        console.error('更新转换规则失败:', error);
        alert('❌ 更新失败: ' + error.message);
      } finally {
        this.submitting = false;
      }
    },
    
    /**
     * 切换规则状态
     */
    async toggleStatus(ruleId, currentStatus) {
      const newStatus = currentStatus ? 0 : 1;
      const action = newStatus ? '启用' : '禁用';

      if (!confirm(`确定要${action}该转换规则吗？`)) {
        return;
      }

      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.MATERIAL.CONVERSION_RULE_DETAIL, { rule_id: ruleId }), {
          method: 'PUT',
          body: JSON.stringify({ is_enabled: newStatus })
        });

        if (response && response.success) {
          alert(`✅ ${action}成功`);
          await this.loadRules();
        } else {
          alert(`❌ ${action}失败: ` + (response?.message || '未知错误'));
        }
      } catch (error) {
        console.error(`${action}转换规则失败:`, error);
        alert(`❌ ${action}失败: ` + error.message);
      }
    },
    
    /**
     * 解析风控警告
     */
    parseValidationWarnings(validation) {
      const warnings = [];
      
      if (validation.cycle_detected) {
        warnings.push({
          type: 'cycle',
          title: '循环检测',
          message: '检测到循环转换路径，可能导致无限套利'
        });
      }
      
      if (validation.arbitrage_detected) {
        warnings.push({
          type: 'arbitrage',
          title: '套利检测',
          message: '检测到套利风险，建议调整转换比例'
        });
      }
      
      return warnings;
    },
    
    /**
     * 获取转换比例
     */
    getRatio(rule) {
      return (rule.output_quantity / rule.input_quantity).toFixed(4);
    },
    
    /**
     * 检查规则是否有风险
     */
    hasRisk(rule) {
      return rule.cycle_detected || rule.arbitrage_detected;
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleString('zh-CN');
    },
    
    /**
     * 格式化日期时间为本地输入格式
     */
    formatDateTimeLocal(dateString) {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  };
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('materialConversionRulesPage', materialConversionRulesPage)
  console.log('✅ [MaterialConversionRulesPage] Alpine 组件已注册')
})
