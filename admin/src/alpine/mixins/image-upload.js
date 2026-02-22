/**
 * 统一图片上传 Mixin
 *
 * @description 封装图片上传的通用逻辑：文件校验、FormData 构建、API 请求、状态管理
 *              消除各模块（exchange-items/item-templates/images/material-conversion）中
 *              重复的上传代码（6 处 80% 重复逻辑）
 *
 * @version 1.0.0
 * @date 2026-02-21
 * @see docs/图片管理体系设计方案.md §十四 步骤11
 *
 * @example
 * import { imageUploadMixin } from '@/alpine/mixins/image-upload.js'
 *
 * function exchangeMarketPage() {
 *   return {
 *     ...imageUploadMixin(),
 *
 *     async handleUpload(event) {
 *       const result = await this.uploadImage(event.target.files[0], {
 *         business_type: 'exchange',
 *         category: 'products'
 *       })
 *       if (result) {
 *         this.itemForm.primary_image_id = result.image_resource_id
 *         this.imagePreviewUrl = result.public_url
 *       }
 *     }
 *   }
 * }
 */

import { SYSTEM_ADMIN_ENDPOINTS } from '../../api/system/admin.js'
import { buildURL, request } from '../../api/base.js'
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
  const {
    allowed_types = DEFAULT_ALLOWED_TYPES,
    max_size = DEFAULT_MAX_SIZE
  } = config

  return {
    /** @type {boolean} 图片是否正在上传中 */
    image_uploading: false,

    /**
     * 上传单张图片到后端图片管理服务
     *
     * @param {File} file - 要上传的文件对象
     * @param {Object} options - 上传选项
     * @param {string} options.business_type - 业务类型（exchange/lottery/uploads 等）
     * @param {string} options.category - 图片分类（products/items/icons/general 等）
     * @param {number} [options.context_id] - 关联的业务实体 ID
     * @param {number} [options.sort_order] - 排序序号（多图场景使用）
     * @returns {Promise<Object|null>} 上传成功返回图片数据，失败返回 null
     * @returns {number} return.image_resource_id - 图片资源 ID
     * @returns {string} return.object_key - 对象存储 key
     * @returns {string} return.public_url - 公开访问 URL
     * @returns {Object} return.thumbnail_urls - 缩略图 URL 集合
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

        if (options.business_type) formData.append('business_type', options.business_type)
        if (options.category) formData.append('category', options.category)
        if (options.context_id) formData.append('context_id', String(options.context_id))
        if (options.sort_order != null) formData.append('sort_order', String(options.sort_order))

        const result = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (result.success && result.data) {
          logger.info('图片上传成功', {
            image_resource_id: result.data.image_resource_id,
            business_type: options.business_type
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
     * 更新图片排序序号
     *
     * @param {number} imageId - 图片资源 ID
     * @param {number} sortOrder - 新的排序序号
     * @returns {Promise<boolean>} 更新是否成功
     */
    async updateImageSortOrder(imageId, sortOrder) {
      try {
        const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPDATE, { id: imageId })
        const result = await request({ url, method: 'PATCH', data: { sort_order: sortOrder } })
        return result.success === true
      } catch (error) {
        logger.error('更新图片排序失败', { image_id: imageId, error: error.message })
        return false
      }
    },

    /**
     * 删除图片资源
     *
     * @param {number} imageId - 图片资源 ID
     * @returns {Promise<boolean>} 删除是否成功
     */
    async deleteImageResource(imageId) {
      try {
        const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.IMAGE_DELETE, { id: imageId })
        const result = await request({ url, method: 'DELETE' })

        if (result.success) {
          this.showSuccess?.('图片已删除')
          return true
        }

        this.showError?.(result.message || '删除失败')
        return false
      } catch (error) {
        logger.error('删除图片失败', { image_id: imageId, error: error.message })
        this.showError?.('删除图片失败')
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
