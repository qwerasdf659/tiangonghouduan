/**
 * 客服工作台 - 工单管理 Composable
 *
 * @file admin/src/modules/content/composables/cs-issues.js
 * @description 来自大厂模型，解决问题生命周期管理
 * 工单独立于会话存在，支持跨会话跨班次跟踪
 */

import { logger } from '../../../utils/logger.js'
import { ContentAPI } from '../../../api/content.js'
import Alpine from 'alpinejs'

/** 工单类型中文映射 */
const ISSUE_TYPE_LABELS = {
  asset: '资产问题',
  trade: '交易纠纷',
  lottery: '抽奖异常',
  item: '物品问题',
  account: '账号问题',
  consumption: '消费核销',
  feedback: '反馈升级',
  other: '其他'
}

/** 工单优先级中文映射 */
const PRIORITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
}

/** 工单状态中文映射 */
const STATUS_LABELS = {
  open: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭'
}

/**
 * 工单管理状态
 * @returns {Object} 状态对象
 */
export function useCsIssuesState() {
  return {
    showIssueModal: false,
    issueModalMode: 'create',
    issueSubmitting: false,
    issueForm: {
      user_id: null,
      session_id: null,
      issue_type: 'other',
      priority: 'medium',
      title: '',
      description: ''
    },
    issueDetail: null,
    issueNotes: [],
    issueNoteInput: ''
  }
}

/**
 * 工单管理方法
 * @returns {Object} 方法对象
 */
export function useCsIssuesMethods() {
  return {
    /**
     * 打开创建工单弹窗
     * @param {number} userId - 关联用户ID
     * @param {number} [sessionId] - 关联会话ID
     */
    openCreateIssueModal(userId, sessionId) {
      this.issueModalMode = 'create'
      this.issueForm = {
        user_id: userId,
        session_id: sessionId || null,
        issue_type: 'other',
        priority: 'medium',
        title: '',
        description: ''
      }
      this.showIssueModal = true
    },

    /** 关闭工单弹窗 */
    closeIssueModal() {
      this.showIssueModal = false
      this.issueForm = {
        user_id: null,
        session_id: null,
        issue_type: 'other',
        priority: 'medium',
        title: '',
        description: ''
      }
    },

    /** 提交创建工单 */
    async submitCreateIssue() {
      const { user_id, title, issue_type, priority, description, session_id } = this.issueForm

      if (!user_id) {
        Alpine.store('notification').show('用户ID不能为空', 'error')
        return
      }
      if (!title.trim()) {
        Alpine.store('notification').show('请填写问题标题', 'error')
        return
      }

      this.issueSubmitting = true
      try {
        const response = await ContentAPI.createIssue({
          user_id,
          session_id,
          issue_type,
          priority,
          title: title.trim(),
          description: description.trim()
        })

        if (response?.success) {
          Alpine.store('notification').show('工单创建成功', 'success')
          this.closeIssueModal()
        } else {
          Alpine.store('notification').show(response?.message || '工单创建失败', 'error')
        }
      } catch (error) {
        logger.error('创建工单失败:', error)
        Alpine.store('notification').show(error.message || '创建工单失败', 'error')
      } finally {
        this.issueSubmitting = false
      }
    },

    /**
     * 查看工单详情
     * @param {number} issueId - 工单ID
     */
    async viewIssueDetail(issueId) {
      try {
        const response = await ContentAPI.getIssueDetail(issueId)
        if (response?.success) {
          this.issueDetail = response.data
          const notesResp = await ContentAPI.getIssueNotes(issueId)
          this.issueNotes = notesResp?.success ? notesResp.data?.list || [] : []
        }
      } catch (error) {
        logger.error('获取工单详情失败:', error)
        Alpine.store('notification').show(error.message || '获取工单详情失败', 'error')
      }
    },

    /**
     * 更新工单状态
     * @param {number} issueId - 工单ID
     * @param {string} status - 目标状态
     * @param {string} [resolution] - 处理结果描述
     */
    async updateIssueStatus(issueId, status, resolution) {
      try {
        const data = { status }
        if (resolution) data.resolution = resolution
        const response = await ContentAPI.updateIssue(issueId, data)
        if (response?.success) {
          Alpine.store('notification').show(
            `工单状态已更新为${STATUS_LABELS[status] || status}`,
            'success'
          )
          if (this.issueDetail?.issue_id === issueId) {
            this.issueDetail.status = status
          }
        } else {
          Alpine.store('notification').show(response?.message || '更新失败', 'error')
        }
      } catch (error) {
        logger.error('更新工单状态失败:', error)
        Alpine.store('notification').show(error.message || '更新失败', 'error')
      }
    },

    /**
     * 添加工单备注
     * @param {number} issueId - 工单ID
     */
    async addIssueNote(issueId) {
      if (!this.issueNoteInput.trim()) return

      try {
        const response = await ContentAPI.addIssueNote(issueId, {
          content: this.issueNoteInput.trim()
        })
        if (response?.success) {
          this.issueNoteInput = ''
          const notesResp = await ContentAPI.getIssueNotes(issueId)
          this.issueNotes = notesResp?.success ? notesResp.data?.list || [] : []
          Alpine.store('notification').show('备注添加成功', 'success')
        }
      } catch (error) {
        logger.error('添加备注失败:', error)
        Alpine.store('notification').show(error.message || '添加备注失败', 'error')
      }
    },

    /**
     * 获取工单类型中文标签
     * @param {string} type - issue_type 枚举值
     * @returns {string} 中文标签
     */
    getIssueTypeLabel(type) {
      return ISSUE_TYPE_LABELS[type] || type
    },

    /**
     * 获取优先级中文标签
     * @param {string} priority - priority 枚举值
     * @returns {string} 中文标签
     */
    getPriorityLabel(priority) {
      return PRIORITY_LABELS[priority] || priority
    },

    /**
     * 获取工单状态标签
     * @param {string} status - status 枚举值
     * @returns {Object} { text, class }
     */
    getIssueStatusBadge(status) {
      const badges = {
        open: { text: '待处理', class: 'bg-yellow-100 text-yellow-800' },
        processing: { text: '处理中', class: 'bg-blue-100 text-blue-800' },
        resolved: { text: '已解决', class: 'bg-green-100 text-green-800' },
        closed: { text: '已关闭', class: 'bg-gray-100 text-gray-600' }
      }
      return badges[status] || { text: status, class: 'bg-gray-100 text-gray-600' }
    },

    /**
     * 获取优先级标签样式
     * @param {string} priority - 优先级
     * @returns {Object} { text, class }
     */
    getPriorityBadge(priority) {
      const badges = {
        low: { text: '低', class: 'bg-gray-100 text-gray-600' },
        medium: { text: '中', class: 'bg-blue-100 text-blue-800' },
        high: { text: '高', class: 'bg-orange-100 text-orange-800' },
        urgent: { text: '紧急', class: 'bg-red-100 text-red-800' }
      }
      return badges[priority] || { text: priority, class: 'bg-gray-100 text-gray-600' }
    }
  }
}
