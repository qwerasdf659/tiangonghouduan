/**
 * 媒体库管理 - Composable
 *
 * @file admin/src/modules/content/composables/media-library.js
 * @description 媒体库浏览/上传/删除（基于 media_files + media_attachments 体系）
 * @version 2.1.0
 * @date 2026-03-18
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'

/**
 * 媒体资源管理状态
 * @returns {Object} 状态对象
 */
export function useMediaState() {
  return {
    /** 媒体文件列表 */
    mediaFiles: [],
    /** 媒体筛选（与后端 GET /api/v4/console/media 查询参数对齐） */
    mediaFilters: { folder: '', status: '', tags: '', keyword: '' },
    /** 媒体统计 */
    mediaStats: { total: 0, totalSize: 0, weekly_uploads: 0, orphan_count: 0 },
    /** 选中的媒体 */
    selectedMedia: null,
    /** 上传状态 */
    uploading: false
  }
}

/**
 * 媒体资源管理方法
 * @returns {Object} 方法对象
 */
export function useMediaMethods() {
  return {
    async loadMedia() {
      try {
        logger.info('[ContentManagement] 加载媒体列表...')
        const params = new URLSearchParams()
        if (this.mediaFilters?.folder) params.append('folder', this.mediaFilters.folder)
        if (this.mediaFilters?.status) params.append('status', this.mediaFilters.status)
        if (this.mediaFilters?.tags) params.append('tags', this.mediaFilters.tags)
        if (this.mediaFilters?.keyword) params.append('keyword', this.mediaFilters.keyword)

        const response = await this.apiGet(`${SYSTEM_ADMIN_ENDPOINTS.MEDIA_LIST}?${params}`)
        if (response?.success) {
          this.mediaFiles =
            response.data?.list || response.data?.images || response.data?.items || []
          logger.info('[ContentManagement] 媒体数量:', this.mediaFiles.length)
          this.mediaStats = {
            total: this.mediaFiles.length,
            totalSize: this.mediaFiles.reduce((sum, m) => sum + (m.file_size || 0), 0)
          }
        }
      } catch (error) {
        logger.error('加载媒体失败:', error)
        this.mediaFiles = []
      }
    },

    openUploadMediaModal() {
      this.showModal('uploadMediaModal')
    },

    handleMediaUpload(event) {
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

      this.uploadMedia(file)
    },

    async uploadMedia(file) {
      this.uploading = true
      try {
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'uploads')
        formData.append('category', 'general')

        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (result?.success) {
          this.hideModal('uploadMediaModal')
          await this.loadMedia()
          this.showSuccess('媒体上传成功')
        } else {
          this.showError(result?.message || '上传失败')
        }
      } catch (error) {
        logger.error('上传媒体失败:', error)
        this.showError('上传失败: ' + error.message)
      } finally {
        this.uploading = false
      }
    },

    viewMedia(media) {
      this.selectedMedia = media
      this.showModal('mediaDetailModal')
    },

    openMediaInNewTab(media) {
      const url = media.public_url || media.url
      if (url) window.open(url, '_blank')
    },

    async copyMediaUrl(media) {
      const url = media.public_url || media.url
      if (url) {
        try {
          await navigator.clipboard.writeText(url)
          this.showSuccess('链接已复制')
        } catch {
          this.showError('复制失败，请手动复制')
        }
      }
    },

    async deleteMedia(media) {
      this.deleteTarget = media
      this.deleteType = 'media'
      this.showModal('deleteModal')
    },

    searchMedia() {
      this.loadMedia()
    },

    resetMediaFilters() {
      this.mediaFilters = { folder: '', status: '', tags: '', keyword: '' }
      this.loadMedia()
    },

    formatFileSize(bytes) {
      if (!bytes) return '0 B'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }
  }
}
