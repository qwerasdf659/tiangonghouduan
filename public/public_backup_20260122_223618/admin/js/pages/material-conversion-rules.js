/**
 * 材料转换规则管理页面 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/material-conversion-rules.js
 * @description 管理材料之间的转换规则
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * 
 * 重构说明：
 * - 使用 createCrudMixin 组合 Mixin
 * - 减少约 70 行重复代码
 * - 保留所有原有业务功能（包括风控警告）
 */

function materialConversionRulesPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({
      enablePagination: false,
      enableFormValidation: true
    }),
    
    // ==================== 页面特有状态 ====================
    
    /** 提交加载状态 */
    submitting: false,
    
    /** 资产类型 */
    assetTypes: [],
    
    /** 规则数据 */
    rules: [],
    
    /** 统计 */
    stats: {
      total: 0,
      enabled: 0,
      disabled: 0,
      paths: 0
    },
    
    /** 添加表单 */
    addForm: {
      from_asset_code: '',
      to_asset_code: '',
      input_quantity: '',
      output_quantity: '',
      effective_at: '',
      is_enabled: '1'
    },
    
    /** 编辑表单 */
    editForm: {
      rule_id: '',
      direction: '',
      input_quantity: '',
      output_quantity: '',
      effective_at: '',
      is_enabled: '1'
    },
    
    /** 风控警告 */
    addValidationWarnings: [],
    editValidationWarnings: [],
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    async init() {
      console.log('✅ 材料转换规则管理页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      // 加载资产类型和规则
      await Promise.all([
        this.loadAssetTypes(),
        this.loadRules()
      ])
    },
    
    // ==================== 数据加载 ====================
    
    /**
     * 加载资产类型
     */
    async loadAssetTypes() {
      const result = await this.apiGet(
        API_ENDPOINTS.MATERIAL.ASSET_TYPES,
        {},
        { showError: false }
      )
      
      if (result.success) {
        this.assetTypes = result.data?.asset_types || []
      }
    },
    
    /**
     * 获取启用的资产类型
     */
    getEnabledAssetTypes() {
      return this.assetTypes.filter(a => a.is_enabled)
    },
    
    /**
     * 加载转换规则
     */
    async loadRules() {
      const result = await this.withLoading(async () => {
        const response = await apiRequest(API_ENDPOINTS.MATERIAL.CONVERSION_RULES)
        
        if (response && response.success) {
          return response.data?.rules || []
        }
        throw new Error(response?.message || '加载失败')
      })
      
      if (result.success) {
        this.rules = result.data
        this._updateStatistics()
      }
    },
    
    /**
     * 更新统计
     */
    _updateStatistics() {
      this.stats.total = this.rules.length
      this.stats.enabled = this.rules.filter(r => r.is_enabled).length
      this.stats.disabled = this.stats.total - this.stats.enabled
      this.stats.paths = new Set(this.rules.map(r => `${r.from_asset_code}-${r.to_asset_code}`)).size
    },
    
    // ==================== 添加规则 ====================
    
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
      }
      this.addValidationWarnings = []
      this.showModal('addModal')
    },
    
    /**
     * 提交添加
     */
    async submitAdd() {
      if (!this.addForm.from_asset_code || !this.addForm.to_asset_code ||
          !this.addForm.input_quantity || !this.addForm.output_quantity ||
          !this.addForm.effective_at) {
        this.showError('请填写所有必填字段')
        return
      }
      
      this.submitting = true
      
      const result = await this.apiPost(
        API_ENDPOINTS.MATERIAL.CONVERSION_RULES,
        {
          from_asset_code: this.addForm.from_asset_code,
          to_asset_code: this.addForm.to_asset_code,
          input_quantity: parseInt(this.addForm.input_quantity),
          output_quantity: parseInt(this.addForm.output_quantity),
          effective_at: this.addForm.effective_at,
          is_enabled: parseInt(this.addForm.is_enabled)
        },
        { showSuccess: true, successMessage: '添加成功' }
      )
      
      this.submitting = false
      
      if (result.success) {
        this.hideModal('addModal')
        await this.loadRules()
      } else if (result.data?.validation) {
        this.addValidationWarnings = this._parseValidationWarnings(result.data.validation)
      }
    },
    
    // ==================== 编辑规则 ====================
    
    /**
     * 打开编辑弹窗
     */
    openEditModal(ruleId) {
      const rule = this.rules.find(r => r.rule_id === parseInt(ruleId))
      if (!rule) return
      
      this.editForm = {
        rule_id: rule.rule_id,
        direction: `${rule.from_asset_code} → ${rule.to_asset_code}`,
        input_quantity: rule.input_quantity,
        output_quantity: rule.output_quantity,
        effective_at: this._formatDateTimeLocal(rule.effective_at),
        is_enabled: rule.is_enabled ? '1' : '0'
      }
      this.editValidationWarnings = []
      this.showModal('editModal')
    },
    
    /**
     * 提交编辑
     */
    async submitEdit() {
      if (!this.editForm.input_quantity || !this.editForm.output_quantity || !this.editForm.effective_at) {
        this.showError('请填写所有必填字段')
        return
      }
      
      this.submitting = true
      
      const result = await this.apiPut(
        API.buildURL(API_ENDPOINTS.MATERIAL.CONVERSION_RULE_DETAIL, { rule_id: this.editForm.rule_id }),
        {
          input_quantity: parseInt(this.editForm.input_quantity),
          output_quantity: parseInt(this.editForm.output_quantity),
          effective_at: this.editForm.effective_at,
          is_enabled: parseInt(this.editForm.is_enabled)
        },
        { showSuccess: true, successMessage: '更新成功' }
      )
      
      this.submitting = false
      
      if (result.success) {
        this.hideModal('editModal')
        await this.loadRules()
      } else if (result.data?.validation) {
        this.editValidationWarnings = this._parseValidationWarnings(result.data.validation)
      }
    },
    
    /**
     * 切换规则状态
     */
    async toggleStatus(ruleId, currentStatus) {
      const newStatus = currentStatus ? 0 : 1
      const action = newStatus ? '启用' : '禁用'
      
      const result = await this.confirmAndExecute(
        `确定要${action}该转换规则吗？`,
        async () => {
          const response = await apiRequest(
            API.buildURL(API_ENDPOINTS.MATERIAL.CONVERSION_RULE_DETAIL, { rule_id: ruleId }),
            {
              method: 'PUT',
              body: JSON.stringify({ is_enabled: newStatus })
            }
          )
          if (response && response.success) {
            return response.data
          }
          throw new Error(response?.message || `${action}失败`)
        },
        { showSuccess: true, successMessage: `${action}成功` }
      )
      
      if (result.success) {
        await this.loadRules()
      }
    },
    
    // ==================== 辅助方法 ====================
    
    /**
     * 解析风控警告
     */
    _parseValidationWarnings(validation) {
      const warnings = []
      
      if (validation.cycle_detected) {
        warnings.push({
          type: 'cycle',
          title: '循环检测',
          message: '检测到循环转换路径，可能导致无限套利'
        })
      }
      
      if (validation.arbitrage_detected) {
        warnings.push({
          type: 'arbitrage',
          title: '套利检测',
          message: '检测到套利风险，建议调整转换比例'
        })
      }
      
      return warnings
    },
    
    /**
     * 获取转换比例
     */
    getRatio(rule) {
      return (rule.output_quantity / rule.input_quantity).toFixed(4)
    },
    
    /**
     * 检查规则是否有风险
     */
    hasRisk(rule) {
      return rule.cycle_detected || rule.arbitrage_detected
    },
    
    /**
     * 格式化日期
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * 格式化日期时间为本地输入格式
     */
    _formatDateTimeLocal(dateString) {
      const date = new Date(dateString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('materialConversionRulesPage', materialConversionRulesPage)
  console.log('✅ [MaterialConversionRulesPage] Alpine 组件已注册 (Mixin v3.0)')
})
