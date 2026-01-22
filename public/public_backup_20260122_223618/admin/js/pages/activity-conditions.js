/**
 * 活动条件配置页面 - Alpine.js Mixin 重构版
 * 
 * @file public/admin/js/pages/activity-conditions.js
 * @description 配置抽奖活动的参与条件
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 */

function activityConditionsPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({
      enablePagination: false,
      enableModal: false,
      enableFormValidation: true
    }),
    
    // ==================== 页面特有状态 ====================
    
    /** 活动列表 */
    activities: [],
    
    /** 选中的活动代码 */
    selectedActivityCode: '',
    
    /** 活动状态文本 */
    activityStatus: '',
    
    /** 条件列表 */
    conditions: [],
    
    /** 条件计数器 */
    conditionCounter: 0,
    
    /** 预览 HTML */
    previewHtml: '<div class="text-muted">暂无条件配置（所有用户均可参与）</div>',
    
    /** 保存中状态 */
    saving: false,
    
    /** 条件类型配置 */
    CONDITION_TYPES: {
      user_points: {
        label: '用户积分',
        operators: ['>=', '<=', '>', '<', '='],
        valueType: 'number',
        placeholder: '如：100',
        defaultMessage: '您的积分不足，快去消费获取积分吧！'
      },
      user_type: {
        label: '用户类型',
        operators: ['=', 'in'],
        valueType: 'select',
        options: ['normal', 'vip', 'svip', 'admin'],
        placeholder: '选择用户类型',
        defaultMessage: '此活动仅限特定用户类型参与'
      },
      registration_days: {
        label: '注册天数',
        operators: ['>=', '<=', '>', '<'],
        valueType: 'number',
        placeholder: '如：30',
        defaultMessage: '注册满30天后才能参与'
      },
      consecutive_fail_count: {
        label: '连续未中奖次数',
        operators: ['>=', '<=', '='],
        valueType: 'number',
        placeholder: '如：10',
        defaultMessage: '连续未中奖次数不足，继续努力吧！'
      }
    },

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 活动条件配置页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }
      
      // 加载活动列表
      this.loadActivities()
    },

    // ==================== 数据加载 ====================
    
    /**
     * 加载活动列表
     */
    async loadActivities() {
      await this.withLoading(async () => {
        const response = await apiRequest(`${API_ENDPOINTS.LOTTERY_CAMPAIGNS.LIST}?status=`)
        if (response && response.success && response.data) {
          this.activities = response.data
        }
      }, '加载活动列表...')
    },

    /**
     * 加载活动条件
     */
    async loadActivityConditions() {
      if (!this.selectedActivityCode) {
        this.clearConditionsUI()
        return
      }

      await this.withLoading(async () => {
        // 获取活动基本信息
        const activity = this.activities.find(a => a.campaign_code === this.selectedActivityCode)
        if (activity) {
          this.activityStatus = this.getStatusText(activity.status)
        }

        // 获取活动条件配置
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.LOTTERY_CAMPAIGNS.CONDITIONS, { code: this.selectedActivityCode })
        )

        if (response && response.success && response.data) {
          const conditionData = response.data
          this.clearConditionsUI()

          const conditions = conditionData.participation_conditions || {}
          const messages = conditionData.condition_error_messages || {}

          if (Object.keys(conditions).length > 0) {
            Object.entries(conditions).forEach(([type, rule]) => {
              this.addCondition(type, rule.operator, rule.value, messages[type])
            })
          }
          this.updatePreview()
        } else {
          this.clearConditionsUI()
          this.updatePreview()
        }
      }, '加载条件配置...')
    },

    // ==================== 条件管理 ====================
    
    /**
     * 添加条件
     */
    addCondition(presetType = 'user_points', presetOperator = '>=', presetValue = '', presetMessage = '') {
      this.conditionCounter++
      const config = this.CONDITION_TYPES[presetType]
      
      this.conditions.push({
        id: this.conditionCounter,
        type: presetType,
        operator: presetOperator,
        value: presetValue,
        message: presetMessage || config.defaultMessage
      })
      
      this.updatePreview()
    },

    /**
     * 更新条件 UI
     */
    updateConditionUI(index) {
      const condition = this.conditions[index]
      const config = this.CONDITION_TYPES[condition.type]
      
      // 更新运算符为默认值
      condition.operator = config.operators[0]
      
      // 清空值
      if (config.valueType === 'select') {
        condition.value = config.options[0]
      } else {
        condition.value = ''
      }
      
      // 更新默认消息
      condition.message = config.defaultMessage
      
      this.updatePreview()
    },

    /**
     * 删除条件
     */
    removeCondition(index) {
      this.conditions.splice(index, 1)
      this.updatePreview()
    },

    /**
     * 清空所有条件
     */
    async clearAllConditions() {
      const confirmed = await this.confirmAction('确定要清空所有条件吗？')
      if (confirmed) {
        this.clearConditionsUI()
        this.updatePreview()
      }
    },

    /**
     * 清除条件 UI
     */
    clearConditionsUI() {
      this.conditions = []
      this.conditionCounter = 0
      this.activityStatus = ''
    },

    // ==================== 预览和提交 ====================
    
    /**
     * 更新预览
     */
    updatePreview() {
      if (this.conditions.length === 0) {
        this.previewHtml = '<div class="text-muted">暂无条件配置（所有用户均可参与）</div>'
        return
      }

      let html = '<div class="alert alert-info mb-0">'
      html += '<strong>参与此活动需要满足以下所有条件：</strong><ul class="mb-0 mt-2">'

      this.conditions.forEach(condition => {
        const config = this.CONDITION_TYPES[condition.type]
        let valueDisplay = condition.value
        if (Array.isArray(condition.value)) {
          valueDisplay = condition.value.join('、')
        }
        html += `<li><strong>${config.label}</strong> <span class="badge bg-secondary">${condition.operator}</span> ${valueDisplay}</li>`
      })

      html += '</ul></div>'
      this.previewHtml = html
    },

    /**
     * 收集条件数据
     */
    collectConditions() {
      const participation_conditions = {}
      const condition_error_messages = {}

      this.conditions.forEach(condition => {
        let value = condition.value
        if (!isNaN(value) && value !== '' && !Array.isArray(value)) {
          value = Number(value)
        }
        
        participation_conditions[condition.type] = {
          operator: condition.operator,
          value: value
        }
        condition_error_messages[condition.type] = condition.message
      })

      return { participation_conditions, condition_error_messages }
    },

    /**
     * 保存条件
     */
    async saveConditions() {
      if (!this.selectedActivityCode) {
        this.showError('请先选择活动')
        return
      }

      const conditions = this.collectConditions()

      if (Object.keys(conditions.participation_conditions).length === 0) {
        const confirmed = await this.confirmAction('未配置任何条件，这意味着所有用户都可以参与此活动。确定要保存吗？')
        if (!confirmed) return
      }

      this.saving = true
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.LOTTERY_CAMPAIGNS.CONFIGURE_CONDITIONS, { code: this.selectedActivityCode }),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conditions)
          }
        )

        if (response && response.success) {
          this.showSuccess('条件配置保存成功！')
        } else {
          this.showError(response?.message || '保存失败')
        }
      } catch (error) {
        console.error('保存条件失败:', error)
        if (error.message.includes('403') || error.message.includes('权限')) {
          this.showError('您没有管理员权限，请联系系统管理员')
        } else if (error.message.includes('404')) {
          this.showError('活动不存在，请刷新页面重试')
        } else {
          this.showError(error.message || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },

    // ==================== 辅助方法 ====================
    
    /**
     * 获取状态文本
     */
    getStatusText(status) {
      const statusMap = {
        active: '进行中',
        draft: '草稿',
        paused: '已暂停',
        completed: '已结束'
      }
      return statusMap[status] || status
    },

    /**
     * 确认操作
     */
    async confirmAction(message) {
      if (Alpine.store('confirm')) {
        return await Alpine.store('confirm').show({
          title: '确认操作',
          message: message,
          confirmText: '确定',
          cancelText: '取消'
        })
      }
      return confirm(message)
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('activityConditionsPage', activityConditionsPage)
  console.log('✅ [ActivityConditionsPage] Alpine 组件已注册 (Mixin v3.0)')
})
