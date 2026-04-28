/**
 * 统一图片上传 Mixin（媒体 API 版本）
 *
 * @description 封装图片上传的通用逻辑：文件校验、FormData 构建、API 请求、状态管理
 *              消除各模块（exchange-items/item-templates/images/conversion-rules）中
 *              重复的上传代码（6 处 80% 重复逻辑）
 *              使用新媒体 API：upload 仅上传文件，attach 单独绑定实体
 *
 * @version 2.0.0
 * @date 2026-03-16
 *
 * @example
 * import { imageUploadMixin } from '@/alpine/mixins/image-upload.js'
 *
 * function exchangeMarketPage() {
 *   return {
 *     ...imageUploadMixin(),
 *
 *     async handleUpload(event) {
 *       const result = await this.uploadImage(event.target.files[0])
 *       if (result) {
 *         this.itemForm.primary_media_id = result.media_id
 *         this.imagePreviewUrl = result.public_url
 *         // 可选：绑定到业务实体
 *         await this.attachMedia(result.media_id, 'ExchangeItem', this.itemId, 'primary', 0)
 *       }
 *     }
 *   }
 * }
 *
 * @typedef {Object} MediaUploadResult
 * @property {number} media_id - 媒体 ID
 * @property {string} public_url - 公开访问 URL
 * @property {Object} thumbnails - 缩略图 URL 集合（来自 MediaFile.getThumbnailUrls()）
 */

import { SYSTEM_ADMIN_ENDPOINTS } from '../../api/system/admin.js'
import { request } from '../../api/base.js'
import { logger } from '../../utils/logger.js'

/**
 * 默认文件类型白名单
 * @constant {string[]}
 */
const DEFAULT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * 默认最大文件大小（5MB）
 * @constant {number}
 */
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024

/**
 * 图片上传 Mixin 工厂函数
 *
 * @param {Object} [config] - 上传配置
 * @param {string[]} [config.allowed_types] - 允许的 MIME 类型
 * @param {number} [config.max_size] - 最大文件大小（字节）
 * @returns {Object} Alpine.js mixin 数据和方法
 */
export function imageUploadMixin(config = {}) {
  const { allowed_types = DEFAULT_ALLOWED_TYPES, max_size = DEFAULT_MAX_SIZE } = config

  return {
    /** @type {boolean} 图片是否正在上传中 */
    image_uploading: false,

    /**
     * 上传单张图片到后端媒体管理服务
     *
     * @param {File} file - 要上传的文件对象
     * @param {Object} [options={}] - 上传选项
     * @param {boolean} [options.trim_transparent=false] - 是否裁剪透明边距（DIY 素材图场景）
     * @param {string} [options.folder] - 存储文件夹（默认 uploads）
     * @returns {Promise<MediaUploadResult|null>} 上传成功返回媒体数据，失败返回 null
     * @returns {number} return.media_id - 媒体 ID
     * @returns {string} return.public_url - 公开访问 URL
     * @returns {Object} return.thumbnails - 缩略图 URL 集合（来自 MediaFile.getThumbnailUrls()）
     */
    async uploadImage(file, options = {}) {
      if (!file) {
        this.showError?.('请选择图片文件')
        return null
      }

      // 文件类型校验
      if (!allowed_types.includes(file.type)) {
        const typeNames = allowed_types.map(t => t.split('/')[1].toUpperCase()).join('/')
        this.showError?.(`仅支持 ${typeNames} 格式`)
        return null
      }

      // 文件大小校验
      if (file.size > max_size) {
        const maxMB = (max_size / 1024 / 1024).toFixed(0)
        this.showError?.(`图片大小不能超过 ${maxMB}MB`)
        return null
      }

      this.image_uploading = true

      try {
        const formData = new FormData()
        formData.append('image', file)
        if (options.trim_transparent) formData.append('trim_transparent', 'true')
        if (options.folder) formData.append('folder', options.folder)

        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (result.success && result.data) {
          logger.info('图片上传成功', {
            media_id: result.data.media_id
          })
          this.showSuccess?.('图片上传成功')
          return result.data
        }

        const errorMsg = result.message || '图片上传失败'
        logger.warn('图片上传失败', { message: errorMsg })
        this.showError?.(errorMsg)
        return null
      } catch (error) {
        logger.error('图片上传异常', { error: error.message })
        this.showError?.('图片上传失败，请稍后重试')
        return null
      } finally {
        this.image_uploading = false
      }
    },

    /**
     * 更新媒体排序序号
     *
     * @param {number} mediaId - 媒体 ID
     * @param {number} sortOrder - 新的排序序号
     * @returns {Promise<boolean>} 更新是否成功
     */
    async updateImageSortOrder(mediaId, sortOrder) {
      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPDATE(mediaId)
        const result = await request({ url, method: 'PATCH', data: { sort_order: sortOrder } })
        return result.success === true
      } catch (error) {
        logger.error('更新媒体排序失败', { media_id: mediaId, error: error.message })
        return false
      }
    },

    /**
     * 删除媒体资源
     *
     * @param {number} mediaId - 媒体 ID
     * @returns {Promise<boolean>} 删除是否成功
     */
    async deleteImageResource(mediaId) {
      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE(mediaId)
        const result = await request({ url, method: 'DELETE' })

        if (result.success) {
          this.showSuccess?.('图片已删除')
          return true
        }

        this.showError?.(result.message || '删除失败')
        return false
      } catch (error) {
        logger.error('删除媒体失败', { media_id: mediaId, error: error.message })
        this.showError?.('删除图片失败')
        return false
      }
    },

    /**
     * 将媒体绑定到业务实体
     *
     * @param {number} mediaId - 媒体 ID
     * @param {string} attachableType - 可挂载实体类型（如 ExchangeItem、AdCreative）
     * @param {number|string} attachableId - 可挂载实体 ID
     * @param {string} [role='attachment'] - 附件角色（如 primary、thumbnail、gallery）
     * @param {number} [sortOrder=0] - 排序序号
     * @returns {Promise<boolean>} 绑定是否成功
     */
    async attachMedia(mediaId, attachableType, attachableId, role = 'attachment', sortOrder = 0) {
      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(mediaId)
        const result = await request({
          url,
          method: 'POST',
          data: {
            attachable_type: attachableType,
            attachable_id: attachableId,
            role,
            sort_order: sortOrder
          }
        })
        return result.success === true
      } catch (error) {
        logger.error('绑定媒体失败', {
          media_id: mediaId,
          attachable_type: attachableType,
          error: error.message
        })
        return false
      }
    },

    /**
     * 将媒体从业务实体解绑
     *
     * @param {number} mediaId - 媒体 ID
     * @param {string} attachableType - 可挂载实体类型
     * @param {number|string} attachableId - 可挂载实体 ID
     * @param {string} [role] - 附件角色（可选，不传则解绑该实体的全部该媒体）
     * @returns {Promise<boolean>} 解绑是否成功
     */
    async detachMedia(mediaId, attachableType, attachableId, role) {
      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_DETACH(mediaId)
        const data = { attachable_type: attachableType, attachable_id: attachableId }
        if (role != null) data.role = role
        const result = await request({ url, method: 'POST', data })
        return result.success === true
      } catch (error) {
        logger.error('解绑媒体失败', {
          media_id: mediaId,
          attachable_type: attachableType,
          error: error.message
        })
        return false
      }
    },

    /**
     * 从 input[type=file] change 事件获取文件并生成本地预览 URL
     *
     * @param {Event} event - input change 事件
     * @returns {{ file: File, preview_url: string } | null}
     */
    getFileFromEvent(event) {
      const file = event.target?.files?.[0]
      if (!file) return null

      const preview_url = URL.createObjectURL(file)
      return { file, preview_url }
    }
  }
}
