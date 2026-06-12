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
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ApprovalChainAPI } from '../../../api/approval-chain.js'
import { UserAPI } from '../../../api/user.js'
import { UserDataQueryAPI } from '../../../api/user-data-query.js'

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

/** 超时动作中文映射（与节点编辑下拉一致） */
const TIMEOUT_ACTION_MAP = {
  none: '不处理',
  notify: '通知提醒',
  escalate: '升级到下一级',
  auto_approve: '自动通过'
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
      template_code: '',
      template_name: '',
      auditable_type: 'consumption',
      description: '',
      priority: 0,
      match_conditions: '{}',
      is_active: 1,
      nodes: []
    },
    editing_template_id: null,

    // 角色下拉选项（动态从后端角色表拉取，运营按中文名选，不用记 role_id）
    role_options: [],
    // 触发金额下限（友好填空，与 match_conditions JSON 的 min_amount 双向同步；空=不限金额）
    match_min_amount: '',

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
      await this.loadRoleOptions()
      await this.loadTemplates()
    },

    /**
     * 加载角色下拉选项（复用 UserAPI.getRoles，运营按"角色名(等级)"选择，值为 role_id）
     * @returns {Promise<void>}
     */
    async loadRoleOptions() {
      try {
        const res = await UserAPI.getRoles()
        const list = res.data?.list || res.data?.roles || res.data || []
        // 按 role_level 降序，管理员在前；只取启用角色
        this.role_options = list
          .filter(r => r.role_id != null)
          .map(r => ({
            role_id: r.role_id,
            role_name: r.role_name,
            role_level: r.role_level,
            label: `${r.role_name}（lv${r.role_level}）`
          }))
          .sort((a, b) => (b.role_level || 0) - (a.role_level || 0))
      } catch (err) {
        logger.warn('[ApprovalChain] 加载角色选项失败:', err.message)
        this.role_options = []
      }
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


    getInstanceStatusInfo(status) {
      return INSTANCE_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
    },

    getStepStatusInfo(status) {
      return STEP_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
    },

    /**
     * 实例详情：节点"由谁审"的可读文案
     * - 角色池模式：返回"角色名（lv等级）· 角色池"
     * - 指定人模式：返回"昵称（手机号）· 指定人"
     * @param {Object} step - 审核步骤（含 node/assigned_role/assignee）
     * @returns {string} 审核人分配可读文案
     */
    getStepAssigneeText(step) {
      if (!step) return '-'
      const type = step.node?.assignee_type || (step.assignee_user_id ? 'user' : 'role')
      if (type === 'user') {
        if (step.assignee) {
          return `${step.assignee.nickname || '未命名'}（${step.assignee.mobile || step.assignee_user_id}）· 指定人`
        }
        return step.assignee_user_id ? `用户 ${step.assignee_user_id} · 指定人` : '指定人(未设置)'
      }
      if (step.assigned_role) {
        return `${step.assigned_role.role_name}（lv${step.assigned_role.role_level}）· 角色池`
      }
      return step.assignee_role_id ? `角色 ${step.assignee_role_id} · 角色池` : '角色池(未设置)'
    },

    /**
     * 超时动作中文文案
     * @param {string} action - 超时动作枚举
     * @returns {string} 中文
     */
    getTimeoutActionLabel(action) {
      return TIMEOUT_ACTION_MAP[action] || action || '-'
    },

    openCreateTemplate() {
      this.editing_template_id = null
      this.match_min_amount = ''
      this.template_form = {
        template_code: '',
        template_name: '',
        auditable_type: 'consumption',
        description: '',
        priority: 0,
        match_conditions: '{}',
        is_active: 1,
        nodes: [this._buildDefaultNode()]
      }
      this.template_form_visible = true
    },

    /**
     * 构建一个默认审核节点（终审、管理员角色池、开启当事人回避）
     * @param {Object} [overrides] - 覆盖字段
     * @returns {Object} 节点对象（含前端搜索辅助字段 assignee_user_keyword/assignee_user_options）
     */
    _buildDefaultNode(overrides = {}) {
      return {
        step_number: 9,
        node_name: '管理员终审',
        assignee_type: 'role',
        assignee_role_id: 2,
        assignee_user_id: null,
        is_final: 1,
        exclude_parties: 1,
        timeout_hours: 12,
        timeout_action: 'notify',
        // 前端辅助（不提交后端）：指定人手机号搜索框 + 候选列表 + 已选展示
        assignee_user_keyword: '',
        assignee_user_options: [],
        assignee_user_label: '',
        ...overrides
      }
    },

    async openEditTemplate(templateId) {
      try {
        const res = await ApprovalChainAPI.getTemplateDetail(templateId)
        const t = res.data
        this.editing_template_id = t.template_id
        // 从 match_conditions 解析"触发金额下限"友好填空（无则留空=不限金额）
        const mc = t.match_conditions || {}
        this.match_min_amount = mc.min_amount != null ? mc.min_amount : ''
        this.template_form = {
          template_code: t.template_code,
          template_name: t.template_name,
          auditable_type: t.auditable_type,
          description: t.description || '',
          priority: t.priority,
          match_conditions: JSON.stringify(mc),
          is_active: t.is_active,
          nodes: (t.nodes || []).map(n => ({
            step_number: n.step_number,
            node_name: n.node_name,
            assignee_type: n.assignee_type || 'role',
            assignee_role_id: n.assignee_role_id,
            assignee_user_id: n.assignee_user_id,
            is_final: n.is_final,
            exclude_parties: n.exclude_parties != null ? n.exclude_parties : 1,
            timeout_hours: n.timeout_hours != null ? n.timeout_hours : 12,
            timeout_action: n.timeout_action || 'escalate',
            assignee_user_keyword: '',
            assignee_user_options: [],
            // 指定人模式时回显已选审核人（昵称 + 脱敏手机号）
            assignee_user_label: n.assignee_user
              ? `${n.assignee_user.nickname || ''}（${n.assignee_user.mobile || n.assignee_user_id}）`
              : n.assignee_user_id
                ? `用户 ${n.assignee_user_id}`
                : ''
          }))
        }
        this.template_form_visible = true
      } catch (err) {
        Alpine.store('notification').show('加载模板详情失败: ' + err.message, 'error')
      }
    },

    addNode() {
      const maxStep = this.template_form.nodes.reduce((max, n) => Math.max(max, n.step_number), 1)
      this.template_form.nodes.push(
        this._buildDefaultNode({
          step_number: Math.min(maxStep + 1, 9),
          node_name: '',
          assignee_role_id: null,
          is_final: 0,
          timeout_action: 'escalate'
        })
      )
    },

    removeNode(index) {
      this.template_form.nodes.splice(index, 1)
    },

    /**
     * 节点上移/下移（调整审核前后顺序，自动重排 step_number）
     * @param {number} index - 当前节点下标
     * @param {number} dir - -1 上移 / 1 下移
     * @returns {void}
     */
    moveNode(index, dir) {
      const target = index + dir
      if (target < 0 || target >= this.template_form.nodes.length) return
      const nodes = this.template_form.nodes
      ;[nodes[index], nodes[target]] = [nodes[target], nodes[index]]
    },

    /**
     * 指定人模式：按手机号/昵称/user_id 搜索用户（复用 UserDataQueryAPI.searchUser）
     * @param {number} index - 节点下标
     * @returns {Promise<void>}
     */
    async searchAssigneeUser(index) {
      const node = this.template_form.nodes[index]
      const keyword = (node.assignee_user_keyword || '').trim()
      if (!keyword) {
        node.assignee_user_options = []
        return
      }
      try {
        const res = await UserDataQueryAPI.searchUser(keyword)
        const list = res.data?.list || res.data || []
        node.assignee_user_options = list.map(u => ({
          user_id: u.user_id,
          label: `${u.nickname || '未命名'}（${u.mobile || u.user_id}）`
        }))
      } catch (err) {
        Alpine.store('notification').show('搜索用户失败: ' + err.message, 'error')
        node.assignee_user_options = []
      }
    },

    /**
     * 选中某个指定审核人
     * @param {number} index - 节点下标
     * @param {Object} user - { user_id, label }
     * @returns {void}
     */
    selectAssigneeUser(index, user) {
      const node = this.template_form.nodes[index]
      node.assignee_user_id = user.user_id
      node.assignee_user_label = user.label
      node.assignee_user_options = []
      node.assignee_user_keyword = ''
    },

    async saveTemplate() {
      try {
        /*
         * 匹配条件：运营只填"触发金额下限"，这里转回后端 JSON（min_amount）。
         * 留空 = 不限金额（match_conditions 为 {}，该链作为该业务类型的兜底/默认链）。
         */
        const matchConditions = {}
        if (this.match_min_amount !== '' && this.match_min_amount != null) {
          const amt = parseInt(this.match_min_amount, 10)
          if (!isNaN(amt) && amt > 0) matchConditions.min_amount = amt
        }

        // 按节点当前顺序重排 step_number（保证前后顺序与界面一致；终审节点固定为 9）
        const orderedNodes = this.template_form.nodes.map((n, i) => {
          const isFinal = n.is_final === 1 || n.is_final === true
          // 提交后端的节点：剔除前端辅助字段（assignee_user_keyword/options/label）
          return {
            step_number: isFinal ? 9 : Math.min(i + 2, 8),
            node_name: n.node_name,
            assignee_type: n.assignee_type,
            // 角色池模式只传 role_id；指定人模式只传 user_id（互斥）
            assignee_role_id: n.assignee_type === 'role' ? n.assignee_role_id : null,
            assignee_user_id: n.assignee_type === 'user' ? n.assignee_user_id : null,
            is_final: isFinal ? 1 : 0,
            exclude_parties: n.exclude_parties === 1 || n.exclude_parties === true ? 1 : 0,
            timeout_hours: n.timeout_hours,
            timeout_action: n.timeout_action
          }
        })

        // 校验：指定人模式必须已选审核人；角色池模式必须选角色
        for (const n of orderedNodes) {
          if (n.assignee_type === 'user' && !n.assignee_user_id) {
            Alpine.store('notification').show('存在"指定人"节点未选择审核人', 'error')
            return
          }
          if (n.assignee_type === 'role' && !n.assignee_role_id) {
            Alpine.store('notification').show('存在"角色池"节点未选择角色', 'error')
            return
          }
        }

        const payload = {
          ...this.template_form,
          match_conditions: matchConditions,
          nodes: orderedNodes
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
        if (
          this.review_action === 'reject' &&
          (!this.review_reason || this.review_reason.trim().length < 5)
        ) {
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

Alpine.data('approvalChainPage', approvalChainPage)

export default approvalChainPage
