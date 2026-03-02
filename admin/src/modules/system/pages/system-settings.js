/**
 * 系统设置整合页面 - 模块化重构版
 *
 * @file admin/src/modules/system/pages/system-settings.js
 * @module SystemSettingsPage
 * @version 5.0.0
 * @date 2026-02-08
 *
 * @description
 * 系统设置整合页面，通过 composables 模块化管理：
 * - 系统配置 - 全7大分类（basic/points/notification/security/marketplace/backpack/redemption）
 * - 活动关联配置项使用下拉选择器
 * - 提醒规则
 * - 审计日志
 */

// ES Module 导入
import { logger } from '../../../utils/logger.js'
import { API_PREFIX } from '../../../api/base.js'
import { Alpine, createPageMixin, dataTable } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { $confirmDanger } from '../../../utils/index.js'

// 导入 composables 模块
import {
  useConfigState,
  useConfigMethods,
  useAuditLogsState,
  useAuditLogsMethods
} from '../composables/index.js'

// 导入提醒规则 API (P2-1)
import { ReminderRulesAPI } from '../../../api/reminder.js'


/**
 * 注册系统设置相关的 Alpine.js 组件
 */
function registerSystemSettingsComponents() {
  logger.debug('[SystemSettings] 注册 Alpine 组件 (ES Module v5.0)...')

  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[SystemSettings] 关键依赖未加载')
    return
  }

  // 全局 Store - 存储当前激活的子页面ID
  Alpine.store('systemPage', 'system-config')

  /**
   * 系统设置内容组件 - 使用 composables 组合
   * 全5大分类配置 + 活动下拉选择器
   */
  Alpine.data('systemSettings', () => ({
    // 基础混入
    ...createPageMixin(),

    // ==================== 从 Composables 导入状态 ====================
    ...useConfigState(),
    ...useAuditLogsState(),

    // ==================== 导航状态 ====================
    current_page: 'system-config',

    // 子页面配置
    subPages: [
      { id: 'system-config', name: '系统配置', icon: '⚙️' },
      { id: 'reminder-rules', name: '提醒规则', icon: '🔔' },
      { id: 'audit-logs', name: '审计日志', icon: '📋' }
    ],

    // ==================== 通用状态 ====================
    page: 1,
    page_size: 20,
    total_pages: 1,
    total: 0,

    // ==================== 提醒规则状态 (P2-1) ====================
    reminderRules: [],
    reminderRuleForm: {
      rule_type: '',
      rule_name: '',
      rule_description: '',
      trigger_condition: {},
      notification_channels: ['admin_broadcast'],
      notification_priority: 'normal',
      check_interval_minutes: 60,
      is_enabled: true
    },
    reminderRuleModalOpen: false,
    editingRuleId: null,

    // ==================== 初始化和数据加载 ====================

    init() {
      logger.debug('[SystemSettings] 组件初始化开始 (v5.0 - 全分类配置)')

      if (!this.checkAuth()) {
        logger.warn('[SystemSettings] 认证检查失败')
        return
      }

      // 从 URL 参数读取当前页面
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'system-config'

      logger.debug('[SystemSettings] 当前子页面:', this.current_page)

      // 立即加载数据
      this.loadPageData()
    },

    switchPage(pageId) {
      logger.debug('[SystemSettings] 切换到子页面:', pageId)
      this.current_page = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    async loadPageData() {
      const page = this.current_page
      await this.withLoading(
        async () => {
          switch (page) {
            case 'system-config':
              await this.loadSystemConfig()
              break
            case 'reminder-rules':
              await this.loadReminderRules()
              break
            case 'audit-logs':
              await this.loadAuditLogs()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 从 Composables 导入方法 ====================
    ...useConfigMethods(),
    ...useAuditLogsMethods(),

    // ==================== 操作日志增强方法 (P2-3) ====================

    /** 选中的审计日志 */
    selectedLog: null,

    /**
     * 查看审计日志详情
     */
    viewAuditLogDetail(log) {
      this.selectedLog = log
      this.showModal('auditDetailModal')
    },

    /**
     * 回滚操作
     */
    async rollbackOperation(log) {
      if (!(await $confirmDanger(`确定要回滚此操作吗？\n操作：${log.action_name || log.action}\n目标：${log.target || log.operation_type_name}`))) {
        return
      }

      try {
        this.saving = true
        const response = await this.apiPost(`${API_PREFIX}/console/operations/${log.id}/rollback`, {})
        if (response?.success) {
          this.showSuccess('操作已回滚')
          await this.loadAuditLogs()
        } else {
          this.showError(response?.message || '回滚失败')
        }
      } catch (error) {
        logger.error('[AuditLogs] 回滚失败:', error)
        this.showError('回滚操作失败')
      } finally {
        this.saving = false
      }
    },

    // ==================== 提醒规则方法 (P2-1) ====================

    async loadReminderRules() {
      try {
        const response = await ReminderRulesAPI.getRules()
        if (response?.success) {
          this.reminderRules = response.data?.items || response.data?.rules || []
        }
      } catch (error) {
        logger.error('[ReminderRules] 加载失败:', error)
        this.showError('加载提醒规则失败')
      }
    },

    openReminderRuleModal(rule = null) {
      if (rule) {
        this.editingRuleId = rule.reminder_rule_id
        this.reminderRuleForm = {
          rule_type: rule.rule_type || '',
          rule_name: rule.rule_name || '',
          rule_description: rule.rule_description || '',
          trigger_condition: rule.trigger_condition || {},
          notification_channels: rule.notification_channels || ['admin_broadcast'],
          notification_priority: rule.notification_priority || 'normal',
          check_interval_minutes: rule.check_interval_minutes || 60,
          is_enabled: rule.is_enabled !== false
        }
      } else {
        this.editingRuleId = null
        this.reminderRuleForm = {
          rule_type: '',
          rule_name: '',
          rule_description: '',
          trigger_condition: {},
          notification_channels: ['admin_broadcast'],
          notification_priority: 'normal',
          check_interval_minutes: 60,
          is_enabled: true
        }
      }
      this.reminderRuleModalOpen = true
    },

    async saveReminderRule() {
      try {
        this.saving = true
        let response
        if (this.editingRuleId) {
          response = await ReminderRulesAPI.updateRule(this.editingRuleId, this.reminderRuleForm)
        } else {
          response = await ReminderRulesAPI.createRule(this.reminderRuleForm)
        }
        if (response?.success) {
          this.showSuccess(this.editingRuleId ? '规则更新成功' : '规则创建成功')
          this.reminderRuleModalOpen = false
          await this.loadReminderRules()
        }
      } catch (error) {
        logger.error('[ReminderRules] 保存失败:', error)
        this.showError('保存规则失败')
      } finally {
        this.saving = false
      }
    },

    async toggleReminderRule(rule) {
      try {
        const response = await ReminderRulesAPI.toggleRule(rule.reminder_rule_id)
        if (response?.success) {
          this.showSuccess(rule.is_enabled ? '规则已禁用' : '规则已启用')
          await this.loadReminderRules()
        }
      } catch (error) {
        logger.error('[ReminderRules] 切换失败:', error)
        this.showError('操作失败')
      }
    },

    async deleteReminderRule(rule) {
      if (!(await $confirmDanger('确定要删除此提醒规则吗？'))) return
      try {
        const response = await ReminderRulesAPI.deleteRule(rule.reminder_rule_id)
        if (response?.success) {
          this.showSuccess('规则已删除')
          await this.loadReminderRules()
        }
      } catch (error) {
        logger.error('[ReminderRules] 删除失败:', error)
        this.showError('删除失败')
      }
    },

    // ==================== 工具方法 ====================

    getActionColor(action) {
      const colors = {
        create: 'bg-green-100 text-green-700',
        update: 'bg-blue-100 text-blue-700',
        delete: 'bg-red-100 text-red-700',
        login: 'bg-purple-100 text-purple-700',
        logout: 'bg-gray-100 text-gray-700'
      }
      return colors[action] || 'bg-gray-100 text-gray-700'
    },

    getRiskColor(level) {
      const colors = {
        high: 'bg-red-500',
        medium: 'bg-yellow-500',
        low: 'bg-green-500'
      }
      return colors[level] || 'bg-gray-500'
    },

    formatDate(dateValue) {
      if (!dateValue) return '-'
      try {
        if (typeof dateValue === 'object' && dateValue !== null) {
          if (dateValue.beijing) return dateValue.beijing
          if (dateValue.iso) {
            return new Date(dateValue.iso).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit'
            })
          }
          if (dateValue.relative) return dateValue.relative
        }
        const date = new Date(dateValue)
        if (isNaN(date.getTime())) return '-'
        return date.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      } catch {
        return '-'
      }
    }
  }))

  /**
   * 提醒规则列表 - data-table 组件
   */
  Alpine.data('reminderRulesTable', () => {
    const table = dataTable({
      columns: [
        { key: 'reminder_rule_id', label: '规则ID', sortable: true },
        { key: 'rule_name', label: '规则名称', sortable: true },
        { key: 'rule_type', label: '规则类型', render: (val, row) => row.rule_type_display || val || '-' },
        { key: 'notification_priority', label: '优先级', type: 'status', statusMap: { urgent: { class: 'red', label: '紧急' }, high: { class: 'orange', label: '高' }, normal: { class: 'yellow', label: '普通' }, low: { class: 'green', label: '低' } } },
        { key: 'check_interval_minutes', label: '检查间隔', render: (val) => val ? `${val}分钟` : '-' },
        { key: 'is_enabled', label: '状态', type: 'status', statusMap: { true: { class: 'green', label: '启用' }, false: { class: 'gray', label: '禁用' } } }
      ],
      dataSource: async (params) => {
        const res = await ReminderRulesAPI.getRules(params)
        return {
          items: res.data?.items || res.data?.rules || [],
          total: res.data?.pagination?.total || res.data?.total || 0
        }
      },
      primaryKey: 'reminder_rule_id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-reminder-rules', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  /**
   * 审计日志列表 - data-table 组件
   */
  Alpine.data('auditLogsTable', () => {
    const table = dataTable({
      columns: [
        { key: 'id', label: '日志ID', sortable: true },
        { key: 'operator_name', label: '操作人', render: (val, row) => val || row.admin_name || `管理员#${row.admin_id || '-'}` },
        { key: 'action', label: '操作', render: (val, row) => row.action_name || row.operation_type_display || val || '-' },
        { key: 'target', label: '目标', render: (val, row) => val || row.operation_type_name || row.resource_type || '-' },
        { key: 'ip_address', label: 'IP' },
        { key: 'created_at', label: '时间', type: 'datetime', sortable: true }
      ],
      dataSource: async (params) => {
        const res = await request({ url: `${API_PREFIX}/console/admin-audit-logs`, method: 'GET', params })
        return {
          items: res.data?.logs || [],
          total: res.data?.pagination?.total || 0
        }
      },
      primaryKey: 'id',
      sortable: true,
      page_size: 20
    })
    const origInit = table.init
    table.init = async function () {
      window.addEventListener('refresh-audit-logs', () => this.loadData())
      if (origInit) await origInit.call(this)
    }
    return table
  })

  logger.info('[SystemSettings] Alpine 组件注册完成（含 data-table）')
}

// ==================== 事件监听 ====================

document.addEventListener('alpine:init', () => {
  registerSystemSettingsComponents()
})

export { registerSystemSettingsComponents }
export default registerSystemSettingsComponents
