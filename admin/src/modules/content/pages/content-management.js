/**
 * 内容管理中心 - Alpine.js 组件
 *
 * 内容投放合并后，公告/弹窗/轮播管理已统一到 ad-management 页面（内容投放管理）
 * 本页面仅保留图片资源管理子模块
 *
 * @file admin/src/modules/content/pages/content-management.js
 * @version 5.0.0 (内容投放合并版 — 仅保留图片资源管理)
 * @date 2026-02-22
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  useImagesState,
  useImagesMethods
} from '../composables/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[ContentManagement] 注册 Alpine 组件...')

  Alpine.data('contentManagement', () => ({
    ...createPageMixin(),
    ...useImagesState(),
    ...useImagesMethods(),

    current_page: 'image-resources',
    subPages: [
      { id: 'image-resources', name: '图片资源', icon: '🖼️' }
    ],

    saving: false,
    deleting: false,
    isEditMode: false,
    deleteTarget: null,
    deleteType: null,

    init() {
      logger.info('内容管理页面初始化（图片资源管理）')
      if (!this.checkAuth()) return
      this.current_page = 'image-resources'
      this.loadPageData()
    },

    switchPage(pageId) {
      this.current_page = pageId
      this.loadPageData()
    },

    loadPageData() {
      if (this.current_page === 'image-resources') {
        this.loadImages?.()
      }
    }
  }))

  logger.info('[ContentManagement] Alpine 组件注册完成')
})
