/**
 * 用户反馈管理模块
 *
 * @file admin/src/modules/content/composables/feedback.js
 * @description P1-5 - 用户反馈管理状态和方法（复用客服工作台交互模式）
 * @version 1.0.0
 * @date 2026-02-17
 */

import { logger } from '../../../utils/logger.js'
import { CONTENT_ENDPOINTS, ContentAPI } from '../../../api/content.js'
import { request } from '../../../api/base.js'

// ========== 反馈状态字典 ==========
const FEEDBACK_STATUS_MAP = {
  pending: { label: '待处理', color: 'yellow', icon: '⏳' },
  processing: { label: '处理中', color: 'blue', icon: '🔄' },
  replied: { label: '已回复', color: 'green', icon: '💬' },
  closed: { label: '已关闭', color: 'gray', icon: '✅' }
}

const FEEDBACK_CATEGORY_MAP = {
  technical: { label: '技术问题', color: 'red', icon: '🔧' },
  feature: { label: '功能建议', color: 'purple', icon: '💡' },
  bug: { label: '错误报告', color: 'red', icon: '🐛' },
  complaint: { label: '投诉', color: 'orange', icon: '⚠️' },
  suggestion: { label: '建议', color: 'blue', icon: '💭' },
  other: { label: '其他', color: 'gray', icon: '📝' }
}

const FEEDBACK_PRIORITY_MAP = {
  low: { label: '低', color: 'gray', icon: '🔽' },
  medium: { label: '中', color: 'yellow', icon: '➡️' },
  high: { label: '高', color: 'red', icon: '🔺' }
}

/**
 * 反馈管理状态
 * @returns {Object} 状态对象
 */
export function useFeedbackState() {
  return {
    /** @type {Array} 反馈列表 */
    feedbacks: [],
    /** @type {Object|null} 当前选中的反馈详情 */
    currentFeedback: null,
    /** @type {boolean} 加载状态 */
    loadingFeedbacks: false,
    /** @type {Object} 反馈统计 */
    feedbackStats: {
      total: 0,
      pending: 0,
      processing: 0,
      replied: 0,
      closed: 0
    },
    /** @type {Object} 筛选条件 */
    feedbackFilters: {
      status: '',
      category: '',
      priority: '',
      page: 1,
      page_size: 20
    },
    /** @type {Object} 分页信息 */
    feedbackPagination: {
      total: 0,
      page: 1,
      page_size: 20
    },
    /** @type {boolean} 显示回复弹窗 */
    showReplyModal: false,
    /** @type {string} 回复内容 */
    replyContent: '',
    /** @type {string} 内部备注 */
    replyInternalNotes: '',
    /** @type {boolean} 回复提交中 */
    submittingReply: false,
    /** @type {boolean} 显示详情面板 */
    showFeedbackDetail: false,
    /** @type {boolean} 显示状态更新弹窗 */
    showStatusModal: false,
    /** @type {string} 新状态 */
    newStatus: '',
    /** @type {string} 状态备注 */
    statusNotes: '',

    // ========== 批量操作状态 ==========
    /** @type {Set<number>} 已选中的反馈ID集合 */
    selectedFeedbackIds: new Set(),
    /** @type {boolean} 显示批量状态更新弹窗 */
    showBatchStatusModal: false,
    /** @type {string} 批量更新的目标状态 */
    batchStatus: '',
    /** @type {string} 批量更新的备注 */
    batchNotes: '',
    /** @type {boolean} 批量操作提交中 */
    submittingBatch: false,

    // ========== 批量回复状态 ==========
    /** @type {boolean} 显示批量回复弹窗 */
    showBatchReplyModal: false,
    /** @type {string} 批量回复内容 */
    batchReplyContent: '',
    /** @type {string} 批量回复的内部备注 */
    batchReplyNotes: '',
    /** @type {boolean} 批量回复提交中 */
    submittingBatchReply: false,

    /** @type {Object} 状态字典 */
    FEEDBACK_STATUS_MAP,
    /** @type {Object} 分类字典 */
    FEEDBACK_CATEGORY_MAP,
    /** @type {Object} 优先级字典 */
    FEEDBACK_PRIORITY_MAP
  }
}

/**
 * 反馈管理方法
 * @returns {Object} 方法对象
 */
export function useFeedbackMethods() {
  return {
    /**
     * 加载反馈列表
     */
    async loadFeedbacks() {
      this.loadingFeedbacks = true
      try {
        const params = {}
        if (this.feedbackFilters.status) params.status = this.feedbackFilters.status
        if (this.feedbackFilters.category) params.category = this.feedbackFilters.category
        if (this.feedbackFilters.priority) params.priority = this.feedbackFilters.priority
        params.page_size = this.feedbackFilters.page_size
        params.page = this.feedbackFilters.page

        const response = await ContentAPI.getFeedbacks(params)

        if (response?.success) {
          this.feedbacks = response.data?.feedbacks || response.data?.list || []
          // 后端 FeedbackService.getFeedbackList 返回 { feedbacks, total, limit, offset }
          // total 在 response.data 顶层，不在 pagination 对象中
          this.feedbackPagination = {
            total:
              response.data?.total || response.data?.pagination?.total || this.feedbacks.length,
            page: this.feedbackFilters.page,
            page_size: this.feedbackFilters.page_size
          }
          logger.info('[Feedback] 反馈列表加载成功', {
            count: this.feedbacks.length,
            total: this.feedbackPagination.total
          })
        } else {
          this.showError?.('加载反馈列表失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Feedback] 加载反馈列表失败:', error)
        this.showError?.('加载反馈列表失败: ' + (error.message || '网络错误'))
      } finally {
        this.loadingFeedbacks = false
      }
    },

    /**
     * 加载反馈统计
     */
    async loadFeedbackStats() {
      try {
        const url = CONTENT_ENDPOINTS.FEEDBACK_STATS
        const response = await request({ url, method: 'GET' })

        if (response?.success) {
          this.feedbackStats = response.data || this.feedbackStats
          logger.info('[Feedback] 反馈统计加载成功', this.feedbackStats)
        }
      } catch (error) {
        logger.warn('[Feedback] 加载反馈统计失败:', error.message)
      }
    },

    /**
     * 查看反馈详情
     * @param {Object} feedback - 反馈对象
     */
    async viewFeedbackDetail(feedback) {
      try {
        const response = await ContentAPI.getFeedbackDetail(feedback.feedback_id)
        if (response?.success) {
          this.currentFeedback = response.data?.feedback || response.data
          this.showFeedbackDetail = true
        } else {
          this.showError?.('获取反馈详情失败')
        }
      } catch (error) {
        logger.error('[Feedback] 获取反馈详情失败:', error)
        this.showError?.('获取反馈详情失败: ' + error.message)
      }
    },

    /**
     * 打开回复弹窗
     * @param {Object} feedback - 反馈对象
     */
    openReplyModal(feedback) {
      this.currentFeedback = feedback
      this.replyContent = ''
      this.replyInternalNotes = ''
      this.showReplyModal = true
    },

    /**
     * 提交回复
     */
    async submitReply() {
      if (!this.replyContent.trim()) {
        this.showError?.('回复内容不能为空')
        return
      }

      this.submittingReply = true
      try {
        const feedbackId = this.currentFeedback?.feedback_id
        const response = await ContentAPI.replyFeedback(feedbackId, {
          reply_content: this.replyContent.trim(),
          internal_notes: this.replyInternalNotes.trim() || null
        })

        if (response?.success) {
          this.showReplyModal = false
          this.replyContent = ''
          this.replyInternalNotes = ''
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success('回复成功')
          }
          // 刷新列表和统计
          await Promise.all([this.loadFeedbacks(), this.loadFeedbackStats()])
        } else {
          this.showError?.('回复失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Feedback] 回复反馈失败:', error)
        this.showError?.('回复失败: ' + (error.message || '网络错误'))
      } finally {
        this.submittingReply = false
      }
    },

    /**
     * 打开状态更新弹窗
     * @param {Object} feedback - 反馈对象
     */
    openStatusModal(feedback) {
      this.currentFeedback = feedback
      this.newStatus = ''
      this.statusNotes = ''
      this.showStatusModal = true
    },

    /**
     * 提交状态更新
     */
    async submitStatusUpdate() {
      if (!this.newStatus) {
        this.showError?.('请选择新状态')
        return
      }

      try {
        const feedbackId = this.currentFeedback?.feedback_id
        const response = await ContentAPI.updateFeedbackStatus(feedbackId, {
          status: this.newStatus,
          internal_notes: this.statusNotes.trim() || null
        })

        if (response?.success) {
          this.showStatusModal = false
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success('状态更新成功')
          }
          await Promise.all([this.loadFeedbacks(), this.loadFeedbackStats()])
        } else {
          this.showError?.('状态更新失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Feedback] 更新状态失败:', error)
        this.showError?.('状态更新失败: ' + (error.message || '网络错误'))
      }
    },

    /**
     * 筛选反馈
     */
    filterFeedbacks() {
      this.feedbackFilters.page = 1
      this.loadFeedbacks()
    },

    /**
     * 重置筛选
     */
    resetFeedbackFilters() {
      this.feedbackFilters = {
        status: '',
        category: '',
        priority: '',
        page: 1,
        page_size: 20
      }
      this.loadFeedbacks()
    },

    /**
     * 反馈分页切换
     * @param {number} page - 页码
     */
    goToFeedbackPage(page) {
      const totalPages =
        Math.ceil(
          (this.feedbackPagination?.total || 0) / (this.feedbackFilters?.page_size || 20)
        ) || 1
      if (page < 1 || page > totalPages) return
      this.feedbackFilters.page = page
      this.loadFeedbacks()
    },

    /**
     * 获取状态标签
     * @param {string} status - 状态值
     * @returns {Object} 状态显示信息
     */
    getFeedbackStatusInfo(status) {
      return FEEDBACK_STATUS_MAP[status] || { label: status, color: 'gray', icon: '❓' }
    },

    /**
     * 获取分类标签
     * @param {string} category - 分类值
     * @returns {Object} 分类显示信息
     */
    getFeedbackCategoryInfo(category) {
      return FEEDBACK_CATEGORY_MAP[category] || { label: category, color: 'gray', icon: '📝' }
    },

    /**
     * 获取优先级标签
     * @param {string} priority - 优先级值
     * @returns {Object} 优先级显示信息
     */
    getFeedbackPriorityInfo(priority) {
      return FEEDBACK_PRIORITY_MAP[priority] || { label: priority, color: 'gray', icon: '➡️' }
    },

    /**
     * 获取状态 CSS 类
     * @param {string} status - 状态值
     * @returns {string} CSS 类名
     */
    getFeedbackStatusClass(status) {
      const colorMap = {
        pending: 'bg-yellow-100 text-yellow-800',
        processing: 'bg-blue-100 text-blue-800',
        replied: 'bg-green-100 text-green-800',
        closed: 'bg-gray-100 text-gray-800'
      }
      return colorMap[status] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 获取优先级 CSS 类
     * @param {string} priority - 优先级值
     * @returns {string} CSS 类名
     */
    getFeedbackPriorityClass(priority) {
      const colorMap = {
        low: 'bg-gray-100 text-gray-600',
        medium: 'bg-yellow-100 text-yellow-700',
        high: 'bg-red-100 text-red-700'
      }
      return colorMap[priority] || 'bg-gray-100 text-gray-600'
    },

    /**
     * 获取分类 CSS 类
     * @param {string} category - 分类值
     * @returns {string} CSS 类名
     */
    getFeedbackCategoryClass(category) {
      const colorMap = {
        technical: 'bg-blue-100 text-blue-700',
        feature: 'bg-purple-100 text-purple-700',
        bug: 'bg-red-100 text-red-700',
        complaint: 'bg-orange-100 text-orange-700',
        suggestion: 'bg-teal-100 text-teal-700',
        other: 'bg-gray-100 text-gray-600'
      }
      return colorMap[category] || 'bg-gray-100 text-gray-600'
    },

    // ========== 批量操作方法 ==========

    /**
     * 切换单条反馈的选中状态
     * @param {number} feedbackId - 反馈ID
     */
    toggleFeedbackSelection(feedbackId) {
      if (this.selectedFeedbackIds.has(feedbackId)) {
        this.selectedFeedbackIds.delete(feedbackId)
      } else {
        this.selectedFeedbackIds.add(feedbackId)
      }
    },

    /**
     * 当前反馈是否被选中
     * @param {number} feedbackId - 反馈ID
     * @returns {boolean}
     */
    isFeedbackSelected(feedbackId) {
      return this.selectedFeedbackIds.has(feedbackId)
    },

    /**
     * 全选/取消全选当前页的反馈
     */
    toggleSelectAllFeedbacks() {
      const currentPageIds = this.feedbacks.map(f => f.feedback_id).filter(Boolean)

      const allSelected =
        currentPageIds.length > 0 && currentPageIds.every(id => this.selectedFeedbackIds.has(id))

      if (allSelected) {
        currentPageIds.forEach(id => this.selectedFeedbackIds.delete(id))
      } else {
        currentPageIds.forEach(id => this.selectedFeedbackIds.add(id))
      }
    },

    /**
     * 检查当前页是否全部选中
     * @returns {boolean}
     */
    isAllFeedbacksSelected() {
      const currentPageIds = this.feedbacks?.map(f => f.feedback_id).filter(Boolean) || []
      return (
        currentPageIds.length > 0 && currentPageIds.every(id => this.selectedFeedbackIds.has(id))
      )
    },

    /**
     * 获取已选中数量
     * @returns {number}
     */
    getSelectedFeedbackCount() {
      return this.selectedFeedbackIds.size
    },

    /**
     * 清空选中状态
     */
    clearFeedbackSelection() {
      this.selectedFeedbackIds = new Set()
    },

    /**
     * 打开批量状态更新弹窗
     */
    openBatchStatusModal() {
      if (this.selectedFeedbackIds.size === 0) {
        this.showError?.('请先勾选要批量操作的反馈')
        return
      }
      this.batchStatus = ''
      this.batchNotes = ''
      this.showBatchStatusModal = true
    },

    /**
     * 提交批量状态更新
     */
    async submitBatchStatusUpdate() {
      if (!this.batchStatus) {
        this.showError?.('请选择目标状态')
        return
      }

      if (this.selectedFeedbackIds.size === 0) {
        this.showError?.('没有选中的反馈')
        return
      }

      this.submittingBatch = true
      try {
        const response = await ContentAPI.batchUpdateFeedbackStatus({
          feedback_ids: Array.from(this.selectedFeedbackIds),
          status: this.batchStatus,
          internal_notes: this.batchNotes.trim() || null
        })

        if (response?.success) {
          const count = response.data?.updated_count || 0
          this.showBatchStatusModal = false
          this.clearFeedbackSelection()
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success(`批量更新成功，共更新 ${count} 条反馈`)
          }
          await Promise.all([this.loadFeedbacks(), this.loadFeedbackStats()])
        } else {
          this.showError?.('批量更新失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Feedback] 批量更新状态失败:', error)
        this.showError?.('批量更新失败: ' + (error.message || '网络错误'))
      } finally {
        this.submittingBatch = false
      }
    },

    // ========== 批量回复方法 ==========

    /**
     * 打开批量回复弹窗
     */
    openBatchReplyModal() {
      if (this.selectedFeedbackIds.size === 0) {
        this.showError?.('请先勾选要批量回复的反馈')
        return
      }
      this.batchReplyContent = ''
      this.batchReplyNotes = ''
      this.showBatchReplyModal = true
    },

    /**
     * 提交批量回复
     */
    async submitBatchReply() {
      if (!this.batchReplyContent.trim()) {
        this.showError?.('回复内容不能为空')
        return
      }

      if (this.selectedFeedbackIds.size === 0) {
        this.showError?.('没有选中的反馈')
        return
      }

      this.submittingBatchReply = true
      try {
        const response = await ContentAPI.batchReplyFeedback({
          feedback_ids: Array.from(this.selectedFeedbackIds),
          reply_content: this.batchReplyContent.trim(),
          internal_notes: this.batchReplyNotes.trim() || null
        })

        if (response?.success) {
          const count = response.data?.updated_count || 0
          this.showBatchReplyModal = false
          this.clearFeedbackSelection()
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success(`批量回复成功，共回复 ${count} 条反馈`)
          }
          await Promise.all([this.loadFeedbacks(), this.loadFeedbackStats()])
        } else {
          this.showError?.('批量回复失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[Feedback] 批量回复失败:', error)
        this.showError?.('批量回复失败: ' + (error.message || '网络错误'))
      } finally {
        this.submittingBatchReply = false
      }
    },

    /**
     * 按状态快速筛选（点击统计卡片）
     * @param {string} status - 状态值（空字符串表示全部）
     */
    filterByStatus(status) {
      this.feedbackFilters.status = status
      this.feedbackFilters.page = 1
      this.clearFeedbackSelection()
      this.loadFeedbacks()
    }
  }
}
