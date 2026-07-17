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
    /** 媒体筛选（与后端 GET /api/v4/console/media 查询参数对齐；unused_only 用于 N5 仅看未使用） */
    mediaFilters: { folder: '', status: '', tags: '', keyword: '', unused_only: '' },
    /** 媒体统计 */
    mediaStats: { total: 0, totalSize: 0, weekly_uploads: 0, orphan_count: 0 },
    /** 选中的媒体 */
    selectedMedia: null,
    /** 删除影响预览（N4：连带删衍生数/引用数/是否被主图引用拦截） */
    deletePreview: null,
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
        if (this.mediaFilters?.unused_only) params.append('unused_only', 'true')

        // N5：统一走 usage 端点，列表项带 reference_count（引用次数），支持「仅未使用」筛选
        const response = await this.apiGet(`${SYSTEM_ADMIN_ENDPOINTS.MEDIA_USAGE}?${params}`)
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

      // 上限放宽到 20MB（与后端 multer 一致）：超过 5MB 的图交后端 sharp 自动无损压缩到 5MB 内
      if (file.size > 20 * 1024 * 1024) {
        this.showError('图片大小不能超过20MB（5MB 以内直接使用，5-20MB 将由系统自动压缩）')
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

    /** 删除预览数据（N4：打开删除弹窗时拉取，展示连带删衍生数/引用数/是否被主图引用拦截） */
    async deleteMedia(media) {
      this.deleteTarget = media
      this.deleteType = 'media'
      this.deletePreview = null
      this.showModal('deleteModal')
      // 异步拉取删除影响预览（失败不阻断弹窗，仅不展示预览明细）
      try {
        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE_PREVIEW(media.media_id),
          method: 'POST'
        })
        if (result?.success) {
          this.deletePreview = result.data
        }
      } catch (error) {
        logger.error('加载删除影响预览失败:', error)
      }
    },

    /**
     * 执行媒体删除（治本 B：被引用时后端返回 409 MEDIA_IN_USE + 引用清单，
     * 前端展示「请先在对应商品/奖品/广告换图或下架」指引，不做一键强删）
     *
     * @param {Object} media - 媒体对象（含 media_id）
     * @returns {Promise<boolean>} 是否成功移入回收站
     */
    async confirmDeleteMedia(media) {
      if (!media) return false
      this.deleting = true
      try {
        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE(media.media_id),
          method: 'DELETE'
        })
        if (result?.success) {
          this.hideModal('deleteModal')
          this.deletePreview = null
          await this.loadMedia()
          this.showSuccess('已移入回收站')
          return true
        }
        // 被引用拦截：展示引用清单 + 指引
        if (result?.code === 'MEDIA_IN_USE') {
          const refs = result?.data?.references || {}
          const primaryRefs = refs.primary_refs || []
          const lines = primaryRefs.map(r => `· ${r.table}（ID ${r.entity_id}）`).join('\n')
          this.showError(
            `该图正被以下业务引用，请先在对应业务中换图或下架后再删除：\n${lines || '（详见引用清单）'}`
          )
          return false
        }
        this.showError(result?.message || '删除失败')
        return false
      } catch (error) {
        logger.error('删除媒体失败:', error)
        this.showError('删除失败: ' + error.message)
        return false
      } finally {
        this.deleting = false
      }
    },

    searchMedia() {
      this.loadMedia()
    },

    resetMediaFilters() {
      this.mediaFilters = { folder: '', status: '', tags: '', keyword: '', unused_only: '' }
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
