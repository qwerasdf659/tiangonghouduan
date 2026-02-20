/**
 * 用户反馈管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/feedback-management.js
 * @description P1-5 - 用户反馈管理页面，支持反馈列表、详情查看、回复、状态更新
 * @version 1.0.0
 * @date 2026-02-17
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires feedback composable - 反馈管理状态和方法
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { useFeedbackState, useFeedbackMethods } from '../composables/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[FeedbackManagement] 注册 Alpine 组件...')

  Alpine.data('feedbackManagement', () => ({
    ...createPageMixin({
      pagination: false,
      asyncData: true,
      modal: true,
      authGuard: true
    }),

    // ==================== Composables ====================
    ...useFeedbackState(),
    ...useFeedbackMethods(),

    /**
     * 反馈总页数（getter 必须定义在组件对象上，不能放在 spread 的 composable 中，
     * 因为 spread 会立即求值 getter，此时 this 不包含其他 composable 的属性）
     */
    get feedbackTotalPages() {
      return (
        Math.ceil(
          (this.feedbackPagination?.total || 0) / (this.feedbackFilters?.page_size || 20)
        ) || 1
      )
    },

    /** 是否有选中的反馈（用于控制批量操作栏显示） */
    get hasSelectedFeedbacks() {
      return this.selectedFeedbackIds?.size > 0
    },

    /**
     * 页面初始化
     */
    async init() {
      logger.info('[FeedbackManagement] 页面初始化...')
      if (!this.checkAuth()) return

      await Promise.all([this.loadFeedbacks(), this.loadFeedbackStats()])

      logger.info('[FeedbackManagement] 页面初始化完成')
    }
  }))

  logger.info('[FeedbackManagement] Alpine 组件注册完成')
})
