/**
 * 审核链配置管理页面 - Alpine.js 组件
 *
 * 功能：
 *   1. 模板管理（CRUD + 启用/禁用）— 仅 admin
 *   2. 实例列表查看 — 审核状态追踪
 *   3. 我的待审核 — 当前登录人需要处理的审核步骤
 *   4. 审核操作（通过/拒绝）— 审核链步骤处理
 *
 * @module modules/operations/pages/approval-chain
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { ApprovalChainAPI } from '../../../api/approval-chain.js'

/** 业务类型映射（后端 auditable_type → 中文） */
const AUDITABLE_TYPE_MAP = {
  consumption: '消费审核',
  merchant_points: '商家积分审核',
  exchange: '兑换审核'
}

/** 实例状态映射 */
const INSTANCE_STATUS_MAP = {
  in_progress: { label: '审核中', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800' },
  timeout: { label: '已超时', color: 'bg-yellow-100 text-yellow-800' }
}

/** 步骤状态映射 */
const STEP_STATUS_MAP = {
  waiting: { label: '等待中', color: 'bg-gray-100 text-gray-600' },
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
  skipped: { label: '已跳过', color: 'bg-gray-100 text-gray-500' },
  timeout: { label: '已超时', color: 'bg-orange-100 text-orange-800' }
}

function approvalChainPage() {
  return {
    ...createPageMixin(),

    // 当前子页签
    current_tab: 'templates',

    // ========== 模板管理 ==========
    templates: [],
    templates_loading: false,
    template_form_visible: false,
    template_form: {
      template_code: '', template_name: '', auditable_type: 'consumption',
      description: '', priority: 0, match_conditions: '{}', is_active: 1,
      nodes: []
    },
    editing_template_id: null,

    // ========== 实例列表 ==========
    instances: [],
    instances_loading: false,
    instance_filter: { auditable_type: '', status: '' },
    instance_pagination: { page: 1, page_size: 20, total: 0 },
    instance_detail: null,
    instance_detail_visible: false,

    // ========== 我的待审核 ==========
    my_pending: [],
    my_pending_loading: false,
    my_pending_pagination: { page: 1, page_size: 20, total: 0 },

    // ========== 审核操作弹窗 ==========
    review_modal_visible: false,
    review_step_id: null,
    review_action: '',
    review_reason: '',

    // ========== 初始化 ==========
    async init() {
      logger.info('[ApprovalChain] 页面初始化')
      await this.loadTemplates()
    },

    switchTab(tab) {
      this.current_tab = tab
      if (tab === 'templates') this.loadTemplates()
      else if (tab === 'instances') this.loadInstances()
      else if (tab === 'my-pending') this.loadMyPending()
    },

    // ========== 模板管理方法 ==========
    async loadTemplates() {
      this.templates_loading = true
      try {
        const res = await ApprovalChainAPI.getTemplates()
        this.templates = res.data?.list || res.data || []
      } catch (err) {
        Alpine.store('notification').show('加载模板失败: ' + err.message, 'error')
      } finally {
        this.templates_loading = false
      }
    },

    getAuditableTypeLabel(type) {
      return AUDITABLE_TYPE_MAP[type] || type
    },

    getInstanceStatusInfo(status) {
      return INSTANCE_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
    },

    getStepStatusInfo(status) {
      return STEP_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
    },

    openCreateTemplate() {
      this.editing_template_id = null
      this.template_form = {
        template_code: '', template_name: '', auditable_type: 'consumption',
        description: '', priority: 0, match_conditions: '{}', is_active: 1,
        nodes: [{ step_number: 9, node_name: '管理员终审', assignee_type: 'role', assignee_role_id: 2, is_final: 1, timeout_hours: 12, timeout_action: 'notify' }]
      }
      this.template_form_visible = true
    },

    async openEditTemplate(templateId) {
      try {
        const res = await ApprovalChainAPI.getTemplateDetail(templateId)
        const t = res.data
        this.editing_template_id = t.template_id
        this.template_form = {
          template_code: t.template_code,
          template_name: t.template_name,
          auditable_type: t.auditable_type,
          description: t.description || '',
          priority: t.priority,
          match_conditions: JSON.stringify(t.match_conditions || {}),
          is_active: t.is_active,
          nodes: (t.nodes || []).map(n => ({
            step_number: n.step_number, node_name: n.node_name,
            assignee_type: n.assignee_type, assignee_role_id: n.assignee_role_id,
            assignee_user_id: n.assignee_user_id, is_final: n.is_final,
            timeout_hours: n.timeout_hours, timeout_action: n.timeout_action
          }))
        }
        this.template_form_visible = true
      } catch (err) {
        Alpine.store('notification').show('加载模板详情失败: ' + err.message, 'error')
      }
    },

    addNode() {
      const maxStep = this.template_form.nodes.reduce((max, n) => Math.max(max, n.step_number), 1)
      this.template_form.nodes.push({
        step_number: Math.min(maxStep + 1, 9), node_name: '', assignee_type: 'role',
        assignee_role_id: null, assignee_user_id: null, is_final: 0,
        timeout_hours: 12, timeout_action: 'escalate'
      })
    },

    removeNode(index) {
      this.template_form.nodes.splice(index, 1)
    },

    async saveTemplate() {
      try {
        let matchConditions = {}
        try { matchConditions = JSON.parse(this.template_form.match_conditions) } catch { /* 空对象 */ }

        const payload = {
          ...this.template_form,
          match_conditions: matchConditions
        }

        if (this.editing_template_id) {
          await ApprovalChainAPI.updateTemplate(this.editing_template_id, payload)
          Alpine.store('notification').show('模板更新成功', 'success')
        } else {
          await ApprovalChainAPI.createTemplate(payload)
          Alpine.store('notification').show('模板创建成功', 'success')
        }
        this.template_form_visible = false
        await this.loadTemplates()
      } catch (err) {
        Alpine.store('notification').show('保存失败: ' + err.message, 'error')
      }
    },

    async toggleTemplate(templateId) {
      try {
        await ApprovalChainAPI.toggleTemplate(templateId)
        Alpine.store('notification').show('模板状态已切换', 'success')
        await this.loadTemplates()
      } catch (err) {
        Alpine.store('notification').show('操作失败: ' + err.message, 'error')
      }
    },

    // ========== 实例列表方法 ==========
    async loadInstances() {
      this.instances_loading = true
      try {
        const res = await ApprovalChainAPI.getInstances({
          ...this.instance_filter,
          page: this.instance_pagination.page,
          page_size: this.instance_pagination.page_size
        })
        const data = res.data
        this.instances = data?.list || data?.rows || []
        this.instance_pagination.total = data?.pagination?.total || data?.count || 0
      } catch (err) {
        Alpine.store('notification').show('加载实例失败: ' + err.message, 'error')
      } finally {
        this.instances_loading = false
      }
    },

    async viewInstanceDetail(instanceId) {
      try {
        const res = await ApprovalChainAPI.getInstanceDetail(instanceId)
        this.instance_detail = res.data
        this.instance_detail_visible = true
      } catch (err) {
        Alpine.store('notification').show('加载实例详情失败: ' + err.message, 'error')
      }
    },

    // ========== 我的待审核方法 ==========
    async loadMyPending() {
      this.my_pending_loading = true
      try {
        const res = await ApprovalChainAPI.getMyPending({
          page: this.my_pending_pagination.page,
          page_size: this.my_pending_pagination.page_size
        })
        const data = res.data
        this.my_pending = data?.list || data?.rows || []
        this.my_pending_pagination.total = data?.pagination?.total || data?.count || 0
      } catch (err) {
        Alpine.store('notification').show('加载待审核失败: ' + err.message, 'error')
      } finally {
        this.my_pending_loading = false
      }
    },

    // ========== 审核操作方法 ==========
    openReviewModal(stepId, action) {
      this.review_step_id = stepId
      this.review_action = action
      this.review_reason = ''
      this.review_modal_visible = true
    },

    async submitReview() {
      try {
        if (this.review_action === 'reject' && (!this.review_reason || this.review_reason.trim().length < 5)) {
          Alpine.store('notification').show('拒绝原因不少于5个字符', 'error')
          return
        }

        if (this.review_action === 'approve') {
          await ApprovalChainAPI.approveStep(this.review_step_id, this.review_reason)
          Alpine.store('notification').show('审核通过', 'success')
        } else {
          await ApprovalChainAPI.rejectStep(this.review_step_id, this.review_reason)
          Alpine.store('notification').show('审核已拒绝', 'success')
        }

        this.review_modal_visible = false
        await this.loadMyPending()
      } catch (err) {
        Alpine.store('notification').show('审核操作失败: ' + err.message, 'error')
      }
    },

    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return dateStr
      }
    }
  }
}

document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    window.Alpine.data('approvalChainPage', approvalChainPage)
    logger.info('[ApprovalChain] Alpine 组件注册完成')
  }
})
