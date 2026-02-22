/**
 * 图片资源管理 - Composable
 *
 * @file admin/src/modules/content/composables/images.js
 * @description 从 content-management.js 提取的图片资源管理状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

/**
 * 图片资源管理状态
 * @returns {Object} 状态对象
 */
export function useImagesState() {
  return {
    /** 图片列表 */
    images: [],
    /** 图片筛选 */
    imageFilters: { type: '', keyword: '' },
    /** 图片统计 */
    imageStats: { total: 0, totalSize: 0, weekly_uploads: 0, orphan_count: 0 },
    /** 选中的图片 */
    selectedImage: null,
    /** 上传状态 */
    uploading: false
  }
}

/**
 * 图片资源管理方法
 * @returns {Object} 方法对象
 */
export function useImagesMethods() {
  return {
    async loadImages() {
      try {
        logger.info('[ContentManagement] 加载图片列表...')
        const params = new URLSearchParams()
        if (this.imageFilters?.type) params.append('type', this.imageFilters.type)
        if (this.imageFilters?.keyword) params.append('keyword', this.imageFilters.keyword)

        const response = await this.apiGet(`${SYSTEM_ENDPOINTS.IMAGE_LIST}?${params}`)
        if (response?.success) {
          this.images = response.data?.list || response.data?.images || []
          logger.info('[ContentManagement] 图片数量:', this.images.length)
          this.imageStats = {
            total: this.images.length,
            totalSize: this.images.reduce((sum, img) => sum + (img.size || img.file_size || 0), 0)
          }
        }
      } catch (error) {
        logger.error('加载图片失败:', error)
        this.images = []
      }
    },

    openUploadImageModal() {
      this.showModal('uploadImageModal')
    },

    handleImageUpload(event) {
      const file = event.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        this.showError('请选择图片文件')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过5MB')
        return
      }

      this.uploadImage(file)
    },

    async uploadImage(file) {
      this.uploading = true
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'uploads')
        formData.append('category', 'general')

        const result = await request({
          url: SYSTEM_ENDPOINTS.IMAGE_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (result?.success) {
          this.hideModal('uploadImageModal')
          await this.loadImages()
          this.showSuccess('图片上传成功')
        } else {
          this.showError(result?.message || '上传失败')
        }
      } catch (error) {
        logger.error('上传图片失败:', error)
        this.showError('上传失败: ' + error.message)
      } finally {
        this.uploading = false
      }
    },

    viewImage(image) {
      this.selectedImage = image
      this.showModal('imageDetailModal')
    },

    openImageInNewTab(image) {
      if (image.url) window.open(image.url, '_blank')
    },

    async copyImageUrl(image) {
      if (image.url) {
        try {
          await navigator.clipboard.writeText(image.url)
          this.showSuccess('链接已复制')
        } catch {
          this.showError('复制失败，请手动复制')
        }
      }
    },

    async deleteImage(image) {
      this.deleteTarget = image
      this.deleteType = 'image'
      this.showModal('deleteModal')
    },

    searchImages() {
      this.loadImages()
    },

    resetImageFilters() {
      this.imageFilters = { business_type: '', status: '' }
      this.loadImages()
    },

    formatFileSize(bytes) {
      if (!bytes) return '0 B'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
  }
}

