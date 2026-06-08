/**
 * 工单管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/cs-issues.js
 * @description 独立工单管理页面，支持列表查询、筛选、详情查看、状态更新
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ContentAPI } from '../../../api/content.js'

/** 工单类型中文映射 */
const ISSUE_TYPE_LABELS = {
  asset: '资产问题',
  trade: '交易纠纷',
  lottery: '回馈异常',
  item: '物品问题',
  account: '账号问题',
  consumption: '消费核销',
  feedback: '反馈升级',
  other: '其他'
}

/** 工单优先级配置 */
const PRIORITY_CONFIG = {
  low: { text: '低', class: 'bg-gray-100 text-gray-600' },
  medium: { text: '中', class: 'bg-blue-100 text-blue-800' },
  high: { text: '高', class: 'bg-orange-100 text-orange-800' },
  urgent: { text: '紧急', class: 'bg-red-100 text-red-800' }
}

/** 工单状态配置 */
const STATUS_CONFIG = {
  open: { text: '待处理', class: 'bg-yellow-100 text-yellow-800' },
  processing: { text: '处理中', class: 'bg-blue-100 text-blue-800' },
  resolved: { text: '已解决', class: 'bg-green-100 text-green-800' },
  closed: { text: '已关闭', class: 'bg-gray-100 text-gray-600' }
}

function csIssuesPage() {
  return {
    ...createPageMixin({ pagination: true, asyncData: true, modal: true, authGuard: true }),

    /* ===== 列表数据 ===== */
    issues: [],
    loading: false,

    /* ===== 筛选条件 ===== */
    filters: {
      status: '',
      issue_type: '',
      priority: '',
      keyword: ''
    },

    /* ===== 详情 ===== */
    show_detail: false,
    detail: null,
    detail_loading: false,
    notes: [],
    note_input: '',
    note_submitting: false,

    /* ===== 状态更新 ===== */
    show_status_modal: false,
    status_form: { issue_id: null, status: '', resolution_note: '' },

    /* ===== 字典数据 ===== */
    issue_type_options: Object.entries(ISSUE_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    priority_options: Object.entries(PRIORITY_CONFIG).map(([value, { text }]) => ({ value, label: text })),
    status_options: Object.entries(STATUS_CONFIG).map(([value, { text }]) => ({ value, label: text })),

    async init() {
      logger.info('[CsIssues] 工单管理页面初始化')
      if (!this.checkAuth()) return
      await this.loadIssues()
    },

    /** 加载工单列表 */
    async loadIssues() {
      this.loading = true
      try {
        const params = {
          page: this.current_page,
          page_size: this.page_size
        }
        if (this.filters.status) params.status = this.filters.status
        if (this.filters.issue_type) params.issue_type = this.filters.issue_type
        if (this.filters.priority) params.priority = this.filters.priority
        if (this.filters.keyword) params.keyword = this.filters.keyword

        const res = await ContentAPI.getIssues(params)
        if (res.success) {
          this.issues = res.data.rows || res.data.items || []
          this.total_records = res.data.count || res.data.total || 0
        }
      } catch (error) {
        logger.error('[CsIssues] 加载工单列表失败:', error)
        Alpine.store('notification').show('加载工单列表失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /** 搜索 */
    async handleSearch() {
      this.current_page = 1
      await this.loadIssues()
    },

    /** 重置筛选 */
    async resetFilters() {
      this.filters = { status: '', issue_type: '', priority: '', keyword: '' }
      this.current_page = 1
      await this.loadIssues()
    },

    /** 翻页 */
    async handlePageChange(page) {
      this.current_page = page
      await this.loadIssues()
    },

    /** 查看工单详情 */
    async viewDetail(issue) {
      this.detail_loading = true
      this.show_detail = true
      try {
        const res = await ContentAPI.getIssueDetail(issue.issue_id)
        if (res.success) {
          this.detail = res.data
        }
        const notesRes = await ContentAPI.getIssueNotes(issue.issue_id)
        if (notesRes.success) {
          this.notes = notesRes.data?.rows || notesRes.data?.notes || []
        }
      } catch (error) {
        logger.error('[CsIssues] 获取工单详情失败:', error)
        Alpine.store('notification').show('获取详情失败: ' + error.message, 'error')
      } finally {
        this.detail_loading = false
      }
    },

    /** 关闭详情 */
    closeDetail() {
      this.show_detail = false
      this.detail = null
      this.notes = []
      this.note_input = ''
    },

    /** 添加备注 */
    async submitNote() {
      if (!this.note_input.trim() || !this.detail) return
      this.note_submitting = true
      try {
        const res = await ContentAPI.addIssueNote(this.detail.issue_id, { content: this.note_input.trim() })
        if (res.success) {
          this.note_input = ''
          const notesRes = await ContentAPI.getIssueNotes(this.detail.issue_id)
          if (notesRes.success) {
            this.notes = notesRes.data?.rows || notesRes.data?.notes || []
          }
          Alpine.store('notification').show('备注添加成功', 'success')
        }
      } catch (error) {
        logger.error('[CsIssues] 添加备注失败:', error)
        Alpine.store('notification').show('添加备注失败: ' + error.message, 'error')
      } finally {
        this.note_submitting = false
      }
    },

    /** 打开状态更新弹窗 */
    openStatusModal(issue) {
      this.status_form = { issue_id: issue.issue_id, status: issue.status, resolution_note: '' }
      this.show_status_modal = true
    },

    /** 提交状态更新 */
    async submitStatusUpdate() {
      try {
        const data = { status: this.status_form.status }
        if (this.status_form.resolution_note) data.resolution_note = this.status_form.resolution_note
        const res = await ContentAPI.updateIssue(this.status_form.issue_id, data)
        if (res.success) {
          Alpine.store('notification').show('工单状态更新成功', 'success')
          this.show_status_modal = false
          await this.loadIssues()
          if (this.detail && this.detail.issue_id === this.status_form.issue_id) {
            this.detail.status = this.status_form.status
          }
        }
      } catch (error) {
        logger.error('[CsIssues] 更新状态失败:', error)
        Alpine.store('notification').show('更新失败: ' + error.message, 'error')
      }
    },

    /** 获取类型中文 */
    getTypeLabel(type) {
      return ISSUE_TYPE_LABELS[type] || type
    },

    /** 获取优先级徽章 */
    getPriorityBadge(priority) {
      return PRIORITY_CONFIG[priority] || { text: priority, class: 'bg-gray-100 text-gray-600' }
    },

    /** 获取状态徽章 */
    getStatusBadge(status) {
      return STATUS_CONFIG[status] || { text: status, class: 'bg-gray-100 text-gray-600' }
    }
  }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('csIssuesPage', csIssuesPage)
  logger.info('[CsIssues] Alpine 组件已注册')
})
