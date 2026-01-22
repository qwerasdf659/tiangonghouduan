/**
 * 活动条件配置页面 - Alpine.js 组件
 * 迁移自原生 JavaScript DOM 操作
 */

function activityConditionsPage() {
  return {
    // ========== 状态数据 ==========
    welcomeText: '管理员',
    loadingOverlay: false,
    
    // 活动相关
    activities: [],
    selectedActivityCode: '',
    activityStatus: '',
    
    // 条件列表
    conditions: [],
    conditionCounter: 0,
    
    // 预览
    previewHtml: '<div class="text-muted">暂无条件配置（所有用户均可参与）</div>',
    
    // 条件类型配置
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

    // ========== 初始化 ==========
    init() {
      // 权限检查
      if (!checkAdminPermission()) return

      // 获取用户信息
      const user = getCurrentUser()
      if (user) {
        this.welcomeText = user.nickname || user.mobile
      }
      
      // 加载活动列表
      this.loadActivities()
    },

    // ========== 数据加载 ==========
    async loadActivities() {
      try {
        const response = await apiRequest(`${API_ENDPOINTS.LOTTERY_CAMPAIGNS.LIST}?status=`)
        if (response && response.success && response.data) {
          this.activities = response.data
        }
      } catch (error) {
        console.error('加载活动列表失败:', error)
        alert('加载活动列表失败，请刷新页面重试')
      }
    },

    async loadActivityConditions() {
      if (!this.selectedActivityCode) {
        this.clearConditionsUI()
        return
      }

      this.loadingOverlay = true
      try {
        // 获取活动基本信息
        const activity = this.activities.find(a => a.campaign_code === this.selectedActivityCode)
        if (activity) {
          this.activityStatus = this.getStatusText(activity.status)
        }

        // 获取活动条件配置
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.LOTTERY_CAMPAIGNS.CONDITIONS, { code: this.selectedActivityCode }))

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
      } catch (error) {
        console.error('加载活动条件失败:', error)
        if (error.message && error.message.includes('404')) {
          this.clearConditionsUI()
          this.updatePreview()
        } else {
          alert('加载活动条件失败: ' + error.message)
        }
      } finally {
        this.loadingOverlay = false
      }
    },

    // ========== 条件管理 ==========
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

    removeCondition(index) {
      this.conditions.splice(index, 1)
      this.updatePreview()
    },

    clearAllConditions() {
      if (confirm('确定要清空所有条件吗？')) {
        this.clearConditionsUI()
        this.updatePreview()
      }
    },

    clearConditionsUI() {
      this.conditions = []
      this.conditionCounter = 0
      this.activityStatus = ''
    },

    // ========== 预览和提交 ==========
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

    async saveConditions() {
      if (!this.selectedActivityCode) {
        alert('请先选择活动')
        return
      }

      const conditions = this.collectConditions()

      if (Object.keys(conditions.participation_conditions).length === 0) {
        if (!confirm('未配置任何条件，这意味着所有用户都可以参与此活动。确定要保存吗？')) {
          return
        }
      }

      this.loadingOverlay = true
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
          alert('✅ 条件配置保存成功！')
        } else {
          alert('保存失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        console.error('保存条件失败:', error)
        if (error.message.includes('403') || error.message.includes('权限')) {
          alert('保存失败: 您没有管理员权限，请联系系统管理员')
        } else if (error.message.includes('404')) {
          alert('保存失败: 活动不存在，请刷新页面重试')
        } else {
          alert('保存失败: ' + error.message)
        }
      } finally {
        this.loadingOverlay = false
      }
    },

    // ========== 辅助方法 ==========
    getStatusText(status) {
      const statusMap = {
        active: '进行中',
        draft: '草稿',
        paused: '已暂停',
        completed: '已结束'
      }
      return statusMap[status] || status
    },

    handleLogout() {
      logout()
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('activityConditionsPage', activityConditionsPage)
})
