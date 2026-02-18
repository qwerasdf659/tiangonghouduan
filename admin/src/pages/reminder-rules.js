/**
 * 提醒规则页面模块
 * @description 管理自动提醒规则的配置
 * @version 1.0.0
 * @date 2026-02-01
 */

import Alpine from 'alpinejs'
import { logger } from '../utils/logger.js'
import { createPageMixin } from '../alpine/mixins/index.js'
import { request, API_PREFIX } from '../api/base.js'

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

    // 规则列表（保留用于 stats 更新）
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

    // 分页（由 data-table 管理，保留兼容）
    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    // 计算属性（保留兼容）
    get totalPages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    get hasPrevPage() {
      return this.pagination.page > 1
    },
    get hasNextPage() {
      return this.pagination.page < this.totalPages
    },

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'rule_name', label: '规则名称', sortable: true },
      {
        key: 'rule_type',
        label: '类型',
        type: 'badge',
        badgeMap: {
          budget: 'yellow',
          inventory: 'blue',
          performance: 'purple',
          security: 'red',
          business: 'green',
          system: 'gray'
        },
        labelMap: {
          budget: '预算提醒',
          inventory: '库存提醒',
          performance: '性能提醒',
          security: '安全提醒',
          business: '业务提醒',
          system: '系统提醒'
        }
      },
      {
        key: 'notification_priority',
        label: '优先级',
        sortable: true,
        type: 'badge',
        badgeMap: { urgent: 'red', high: 'orange', medium: 'yellow', low: 'gray' },
        labelMap: { urgent: '紧急', high: '高', medium: '中', low: '低' }
      },
      {
        key: 'is_enabled',
        label: '状态',
        type: 'status',
        statusMap: {
          true: { class: 'green', label: '已启用' },
          false: { class: 'gray', label: '已禁用' }
        }
      },
      {
        key: 'check_interval_minutes',
        label: '检查间隔',
        render: (val) => {
          if (!val) return '-'
          if (val < 60) return `${val}分钟`
          if (val < 1440) return `${Math.floor(val / 60)}小时`
          return `${Math.floor(val / 1440)}天`
        }
      },
      { key: 'updated_at', label: '更新时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '180px',
        actions: [
          { name: 'edit', label: '编辑', icon: '✏️', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'toggle',
            label: '切换',
            icon: '🔄',
            class: 'text-green-600 hover:text-green-800'
          },
          { name: 'test', label: '测试', icon: '🧪', class: 'text-purple-600 hover:text-purple-800' },
          { name: 'delete', label: '删除', icon: '🗑️', class: 'text-red-500 hover:text-red-700' }
        ]
      }
    ],

    /**
     * data-table 数据源
     * 后端返回字段: rule_name, rule_type, notification_priority, check_interval_minutes, is_enabled
     */
    async fetchTableData(params) {
      const response = await request({
        url: REMINDER_ENDPOINTS.LIST,
        method: 'GET',
        params: params
      })
      if (response?.success) {
        const items = response.data?.list || response.data?.items || []
        const total = response.data?.total || 0

        // 同步更新页面级统计数据
        this.rules = items
        this.pagination.total = total
        this.stats.total = total
        this.stats.enabled = items.filter(r => r.is_enabled).length
        this.stats.disabled = items.filter(r => !r.is_enabled).length

        return { items, total }
      }
      throw new Error(response?.message || '加载提醒规则失败')
    },

    /**
     * 处理表格操作事件 - 传递完整 row 对象（方法内部需要访问多个字段）
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'edit':
          this.openEditModal(row)
          break
        case 'toggle':
          this.toggleRule(row)
          break
        case 'test':
          this.testRule(row)
          break
        case 'delete':
          this.deleteRule(row)
          break
        default:
          logger.warn('[ReminderRules] 未知操作:', action)
      }
    },

    /**
     * 搜索（触发 data-table 重载）
     */
    searchTable() {
      const filters = {}
      if (this.filter.rule_type) filters.rule_type = this.filter.rule_type
      if (this.filter.priority) filters.priority = this.filter.priority
      if (this.filter.is_enabled !== '') filters.is_enabled = this.filter.is_enabled
      window.dispatchEvent(new CustomEvent('dt-search', { detail: { filters } }))
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
      logger.info('[ReminderRules] 初始化页面（data-table 模式）')

      // 监听筛选变化 → 触发 data-table 重载
      this.$watch('filter.rule_type', () => this.searchTable())
      this.$watch('filter.priority', () => this.searchTable())
      this.$watch('filter.is_enabled', () => this.searchTable())

      // 数据加载由 data-table 的 init() 自动完成
    },

    /**
     * 覆写 loadRules：刷新 data-table（CRUD 操作后调用）
     */
    async loadRules() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
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
     * 保存规则 - 字段映射到后端期望格式
     * 后端期望: name, rule_type, description, trigger_conditions, action_config,
     *           notification_priority, check_interval, is_enabled
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

        const priorityMap = { 80: 'high', 50: 'medium', 20: 'low' }
        const payload = {
          name: this.form.rule_name,
          rule_type: this.form.rule_type,
          description: this.form.description,
          trigger_conditions: this.form.conditions || {},
          action_config: this.form.actions || {},
          notification_priority: priorityMap[this.form.priority] || 'medium',
          check_interval: this.form.check_interval,
          is_enabled: this.form.is_enabled
        }

        const response = await request({ url, method, data: payload })

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
      await this.confirmAndExecute(
        `确定要立即执行规则"${rule.rule_name || rule.name}"吗？这将实际发送通知。`,
        async () => {
          const response = await request({
            url: REMINDER_ENDPOINTS.EXECUTE(rule.reminder_rule_id),
            method: 'POST'
          })
          if (!response.success) throw new Error(response.message || '执行失败')
          return response
        },
        { successMessage: '规则执行完成', showSuccess: true }
      )
    },

    /**
     * 删除规则
     */
    async deleteRule(rule) {
      if (rule.is_system) {
        this.showError('系统规则不可删除')
        return
      }

      await this.confirmAndExecute(
        `确定要删除规则"${rule.rule_name || rule.name}"吗？此操作不可撤销。`,
        async () => {
          const response = await request({
            url: REMINDER_ENDPOINTS.DELETE(rule.reminder_rule_id),
            method: 'DELETE'
          })
          if (!response.success) throw new Error(response.message || '删除失败')
          this.loadData()
          return response
        },
        { successMessage: '规则已删除', showSuccess: true, danger: true }
      )
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

    // ✅ 已删除 getRuleTypeName 映射函数
    // HTML 直接使用后端返回的 rule_type_display 字段

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
