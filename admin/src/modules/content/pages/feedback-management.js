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
      pagination: false, // 使用 composable 自带分页
      asyncData: true,
      modal: true,
      authGuard: true
    }),

    // ==================== Composables ====================
    ...useFeedbackState(),
    ...useFeedbackMethods(),

    /**
     * 页面初始化
     */
    async init() {
      logger.info('[FeedbackManagement] 页面初始化...')
      if (!this.checkAuth()) return

      // 并行加载列表和统计
      await Promise.all([
        this.loadFeedbacks(),
        this.loadFeedbackStats()
      ])

      logger.info('[FeedbackManagement] 页面初始化完成')
    }
  }))

  logger.info('[FeedbackManagement] Alpine 组件注册完成')
})


