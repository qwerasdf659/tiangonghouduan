/**
 * 内容管理中心 - Alpine.js 组件
 *
 * 子模块：
 *   - 图片资源管理（媒体库浏览/上传/删除）
 *   - 存储管理（存储概览/孤儿检测/回收站/重复文件）
 *
 * @file admin/src/modules/content/pages/content-management.js
 * @version 6.0.0 (媒体体系 D+ 完整版)
 * @date 2026-03-17
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  useImagesState,
  useImagesMethods,
  useStorageState,
  useStorageMethods
} from '../composables/index.js'

document.addEventListener('alpine:init', () => {
  logger.info('[ContentManagement] 注册 Alpine 组件...')

  Alpine.data('contentManagement', () => ({
    ...createPageMixin(),
    ...useImagesState(),
    ...useImagesMethods(),
    ...useStorageState(),
    ...useStorageMethods(),

    current_page: 'image-resources',
    subPages: [
      { id: 'image-resources', name: '媒体库', icon: '🖼️' },
      { id: 'storage-management', name: '存储管理', icon: '💾' }
    ],

    saving: false,
    deleting: false,
    isEditMode: false,
    deleteTarget: null,
    deleteType: null,

    init() {
      logger.info('内容管理页面初始化（媒体库 + 存储管理）')
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
      } else if (this.current_page === 'storage-management') {
        this.loadStorageData?.()
      }
    },

    /**
     * 确认删除图片（移入回收站）
     */
    async confirmDelete() {
      if (!this.deleteTarget) return
      this.deleting = true
      try {
        const mediaId = this.deleteTarget.media_id
        const response = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE(mediaId),
          method: 'DELETE'
        })
        if (response?.success) {
          this.hideModal('deleteModal')
          this.showSuccess('图片已移入回收站')
          await this.loadImages()
        } else {
          this.showError(response?.message || '删除失败')
        }
      } catch (error) {
        logger.error('删除图片失败:', error)
        this.showError('删除失败: ' + error.message)
      } finally {
        this.deleting = false
        this.deleteTarget = null
      }
    }
  }))

  logger.info('[ContentManagement] Alpine 组件注册完成')
})
