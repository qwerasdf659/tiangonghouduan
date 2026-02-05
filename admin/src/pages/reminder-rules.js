/**
 * 提醒规则页面模块
 * @description 管理自动提醒规则的配置
 * @version 1.0.0
 * @date 2026-02-01
 */

import Alpine from 'alpinejs'
import { logger } from '../utils/logger.js'
import { createPageMixin } from '../alpine/mixins/index.js'
import { request, buildURL, API_PREFIX } from '../api/base.js'

// API 端点 - 使用 API_PREFIX 确保正确的版本前缀
const REMINDER_ENDPOINTS = {
  LIST: `${API_PREFIX}/console/reminder-rules`,
  CREATE: `${API_PREFIX}/console/reminder-rules`,
  DETAIL: id => `${API_PREFIX}/console/reminder-rules/${id}`,
  UPDATE: id => `${API_PREFIX}/console/reminder-rules/${id}`,
  DELETE: id => `${API_PREFIX}/console/reminder-rules/${id}`,
  TOGGLE: id => `${API_PREFIX}/console/reminder-rules/${id}/toggle`,
  TEST: id => `${API_PREFIX}/console/reminder-rules/${id}/test`,
  EXECUTE: id => `${API_PREFIX}/console/reminder-rules/${id}/execute`
}

/**
 * 提醒规则页面组件
 */
function reminderRulesPage() {
  return {
    ...createPageMixin(),

    // 规则列表
    rules: [],

    // 统计数据
    stats: {
      total: 0,
      enabled: 0,
      disabled: 0
    },

    // 筛选条件
    filter: {
      rule_type: '',
      priority: '',
      is_enabled: ''
    },

    // 分页
    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    // 计算属性
    get totalPages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    get hasPrevPage() {
      return this.pagination.page > 1
    },
    get hasNextPage() {
      return this.pagination.page < this.totalPages
    },

    // 编辑模态框
    showModal: false,
    editMode: false,
    saving: false,
    form: {
      rule_type: 'budget',
      rule_name: '',
      description: '',
      priority: 50,
      is_enabled: true,
      check_interval: 60,
      conditions: {},
      actions: {}
    },

    // 规则类型选项
    ruleTypes: [
      { value: 'budget', label: '预算提醒' },
      { value: 'inventory', label: '库存提醒' },
      { value: 'performance', label: '性能提醒' },
      { value: 'security', label: '安全提醒' },
      { value: 'business', label: '业务提醒' },
      { value: 'system', label: '系统提醒' }
    ],

    /**
     * 初始化
     */
    async init() {
      logger.info('[ReminderRules] 初始化页面')

      // 监听筛选变化
      this.$watch('filter.rule_type', () => this.loadRules())
      this.$watch('filter.priority', () => this.loadRules())
      this.$watch('filter.is_enabled', () => this.loadRules())

      // 加载数据
      await this.loadRules()
    },

    /**
     * 加载规则列表
     */
    async loadRules() {
      this.loading = true
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }

        // 添加筛选条件
        if (this.filter.rule_type) {
          params.rule_type = this.filter.rule_type
        }
        if (this.filter.priority) {
          params.priority = this.filter.priority
        }
        if (this.filter.is_enabled !== '') {
          params.is_enabled = this.filter.is_enabled
        }

        const response = await request({
          url: buildURL(REMINDER_ENDPOINTS.LIST, params),
          method: 'GET'
        })

        if (response.success) {
          this.rules = response.data?.list || response.data?.items || []
          this.pagination.total = response.data?.total || 0
          this.updateStats()
          logger.info('[ReminderRules] 加载成功', { count: this.rules.length })
        } else {
          logger.error('[ReminderRules] 加载失败', response.message)
          this.showError(response.message || '加载失败')
        }
      } catch (error) {
        logger.error('[ReminderRules] 加载异常', error)
        this.showError('加载失败: ' + error.message)
      } finally {
        this.loading = false
      }
    },

    /**
     * 更新统计数据
     */
    updateStats() {
      this.stats.total = this.pagination.total
      this.stats.enabled = this.rules.filter(r => r.is_enabled).length
      this.stats.disabled = this.rules.filter(r => !r.is_enabled).length
    },

    /**
     * 打开新建模态框
     */
    openCreateModal() {
      this.editMode = false
      this.form = {
        rule_type: 'budget',
        rule_name: '',
        description: '',
        priority: 50,
        is_enabled: true,
        check_interval: 60,
        conditions: {},
        actions: {}
      }
      this.showModal = true
    },

    /**
     * 打开编辑模态框
     */
    openEditModal(rule) {
      this.editMode = true
      this.form = {
        reminder_rule_id: rule.reminder_rule_id,
        rule_type: rule.rule_type,
        rule_name: rule.rule_name || rule.name,
        description: rule.description || '',
        priority: rule.priority || 50,
        is_enabled: rule.is_enabled,
        check_interval: rule.check_interval || 60,
        conditions: rule.conditions || {},
        actions: rule.actions || {}
      }
      this.showModal = true
    },

    /**
     * 关闭模态框
     */
    closeModal() {
      this.showModal = false
    },

    /**
     * 保存规则
     */
    async saveRule() {
      if (!this.form.rule_name) {
        this.showError('请输入规则名称')
        return
      }

      this.saving = true
      try {
        const url = this.editMode
          ? REMINDER_ENDPOINTS.UPDATE(this.form.reminder_rule_id)
          : REMINDER_ENDPOINTS.CREATE
        const method = this.editMode ? 'PUT' : 'POST'

        const response = await request({
          url,
          method,
          data: this.form
        })

        if (response.success) {
          this.showSuccess(this.editMode ? '规则更新成功' : '规则创建成功')
          this.closeModal()
          await this.loadRules()
        } else {
          this.showError(response.message || '保存失败')
        }
      } catch (error) {
        logger.error('[ReminderRules] 保存异常', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 切换规则状态
     */
    async toggleRule(rule) {
      try {
        const newStatus = !rule.is_enabled

        const response = await request({
          url: REMINDER_ENDPOINTS.TOGGLE(rule.reminder_rule_id),
          method: 'PUT',
          data: { is_enabled: newStatus }
        })

        if (response.success) {
          rule.is_enabled = newStatus
          this.updateStats()
          this.showSuccess(newStatus ? '规则已启用' : '规则已禁用')
        } else {
          this.showError(response.message || '操作失败')
          rule.is_enabled = !newStatus // 恢复原状态
        }
      } catch (error) {
        logger.error('[ReminderRules] 切换状态异常', error)
        this.showError('操作失败: ' + error.message)
      }
    },

    /**
     * 测试规则
     */
    async testRule(rule) {
      try {
        const response = await request({
          url: REMINDER_ENDPOINTS.TEST(rule.reminder_rule_id),
          method: 'POST'
        })

        if (response.success) {
          const data = response.data
          const msg = data.would_trigger
            ? `规则会触发\n匹配用户数: ${data.matched_users}`
            : '规则不会触发（条件不满足）'
          this.showSuccess(msg)
        } else {
          this.showError(response.message || '测试失败')
        }
      } catch (error) {
        logger.error('[ReminderRules] 测试异常', error)
        this.showError('测试失败: ' + error.message)
      }
    },

    /**
     * 执行规则
     */
    async executeRule(rule) {
      if (!confirm(`确定要立即执行规则"${rule.rule_name || rule.name}"吗？这将实际发送通知。`)) {
        return
      }

      try {
        const response = await request({
          url: REMINDER_ENDPOINTS.EXECUTE(rule.reminder_rule_id),
          method: 'POST'
        })

        if (response.success) {
          this.showSuccess('规则执行完成')
        } else {
          this.showError(response.message || '执行失败')
        }
      } catch (error) {
        logger.error('[ReminderRules] 执行异常', error)
        this.showError('执行失败: ' + error.message)
      }
    },

    /**
     * 删除规则
     */
    async deleteRule(rule) {
      if (rule.is_system) {
        this.showError('系统规则不可删除')
        return
      }

      if (!confirm(`确定要删除规则"${rule.rule_name || rule.name}"吗？此操作不可撤销。`)) {
        return
      }

      try {
        const response = await request({
          url: REMINDER_ENDPOINTS.DELETE(rule.reminder_rule_id),
          method: 'DELETE'
        })

        if (response.success) {
          this.showSuccess('规则删除成功')
          await this.loadRules()
        } else {
          this.showError(response.message || '删除失败')
        }
      } catch (error) {
        logger.error('[ReminderRules] 删除异常', error)
        this.showError('删除失败: ' + error.message)
      }
    },

    /**
     * 分页操作
     */
    prevPage() {
      if (this.hasPrevPage) {
        this.pagination.page--
        this.loadRules()
      }
    },

    nextPage() {
      if (this.hasNextPage) {
        this.pagination.page++
        this.loadRules()
      }
    },

    goToPage(page) {
      if (page >= 1 && page <= this.totalPages) {
        this.pagination.page = page
        this.loadRules()
      }
    },

    // 工具方法
    getRuleTypeName(type) {
      const types = {
        budget: '预算提醒',
        inventory: '库存提醒',
        performance: '性能提醒',
        security: '安全提醒',
        business: '业务提醒',
        system: '系统提醒'
      }
      return types[type] || type || '未知'
    },

    getRuleTypeClass(type) {
      const classes = {
        budget: 'bg-green-100 text-green-700',
        inventory: 'bg-yellow-100 text-yellow-700',
        performance: 'bg-blue-100 text-blue-700',
        security: 'bg-red-100 text-red-700',
        business: 'bg-purple-100 text-purple-700',
        system: 'bg-gray-100 text-gray-700'
      }
      return classes[type] || 'bg-gray-100 text-gray-700'
    },

    getPriorityName(priority) {
      if (priority >= 70) return '高'
      if (priority >= 40) return '中'
      return '低'
    },

    getPriorityClass(priority) {
      if (priority >= 70) return 'text-red-600 font-medium'
      if (priority >= 40) return 'text-yellow-600'
      return 'text-gray-500'
    },

    formatInterval(minutes) {
      if (!minutes) return '-'
      if (minutes < 60) return `${minutes} 分钟`
      if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`
      return `${Math.floor(minutes / 1440)} 天`
    }
  }
}

// 注册组件
document.addEventListener('alpine:init', () => {
  Alpine.data('reminderRulesPage', reminderRulesPage)
  logger.info('[ReminderRules] 页面组件已注册')
})
