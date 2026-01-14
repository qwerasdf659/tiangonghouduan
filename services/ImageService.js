/**
 * 通用图片管理服务
 *
 * @description 统一处理图片上传、存储、查询、删除等业务逻辑
 *              核心职责：协调 SealosStorageService 和 image_resources 模型
 *
 * @architecture 架构决策（2026-01-08 最终拍板）
 *   - 存储后端：Sealos 对象存储（S3 兼容）
 *   - 访问策略：全部 public-read，不使用 CDN
 *   - 数据库存储：仅存对象 key（如 prizes/xxx.jpg），不存完整 URL
 *   - URL 生成：API 层动态拼接 Sealos 公网端点
 *   - 缩略图策略：预生成 3 档尺寸（150/300/600px），上传时生成并存储
 *   - 删除策略：Web 管理端删除时立即物理删除（数据库 + 对象存储）
 *
 * @version 2.0.0
 * @date 2026-01-08
 */

const crypto = require('crypto')
const SealosStorageService = require('./sealosStorage')
const { getImageUrl, getThumbnailUrl, getPlaceholderImageUrl } = require('../utils/ImageUrlHelper')
const _logger = require('../utils/logger').logger

/**
 * 业务类型与文件夹映射
 * 用于确定上传文件在对象存储中的存储路径
 */
const BUSINESS_TYPE_FOLDER_MAP = {
  lottery: 'prizes', // 抽奖奖品图片
  exchange: 'products', // 兑换商品图片
  trade: 'trade', // 交易相关图片
  uploads: 'uploads' // 通用上传（如 Banner）
}

/**
 * 允许的图片 MIME 类型
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/**
 * 图片大小限制（字节）
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * 图片管理服务类
 *
 * @description 统一处理图片上传、存储、查询、删除等业务逻辑
 */
class ImageService {
  /**
   * 上传图片到 Sealos 并创建 image_resources 记录
   *
   * @description
   *   架构决策（2026-01-08 最终拍板）：
   *   - 预生成 3 档缩略图（150/300/600px，cover-center）
   *   - 原图和缩略图均上传到 Sealos
   *   - 数据库存储 file_path（原图 key）和 thumbnail_paths（缩略图 key JSON）
   *   - 不使用 CDN，直连 Sealos 公网端点
   *
   * @param {Object} options - 上传选项
   * @param {Buffer} options.fileBuffer - 文件内容（Buffer）
   * @param {string} options.originalName - 原始文件名
   * @param {string} options.mimeType - MIME 类型
   * @param {number} options.fileSize - 文件大小（字节）
   * @param {string} options.businessType - 业务类型：lottery|exchange|trade|uploads
   * @param {string} [options.category] - 资源分类（如 prizes/products/banners）
   * @param {number|null} options.contextId - 关联的业务上下文 ID（如 prize_id、user_id）
   * @param {number} [options.userId] - 关联用户 ID（上传者）
   * @param {string} [options.sourceModule='admin'] - 来源模块：system/lottery/exchange/admin
   * @param {string} [options.ipAddress] - 客户端 IP 地址
   * @param {Object} [options.transaction] - Sequelize 事务对象
   *
   * @returns {Promise<Object>} 上传结果
   * @returns {number} result.image_id - 图片资源 ID
   * @returns {string} result.object_key - 原图对象存储 key
   * @returns {string} result.public_url - 原图公网访问 URL
   * @returns {Object} result.thumbnails - 缩略图 URL 对象（small/medium/large）
   *
   * @throws {Error} 文件验证失败、尺寸超限或上传失败时抛出错误
   */
  static async uploadImage(options) {
    const {
      fileBuffer,
      originalName,
      mimeType,
      fileSize,
      businessType,
      category = null,
      contextId = 0, // 默认 0（表示待绑定），符合 NOT NULL 约束
      userId = null,
      sourceModule = 'admin',
      ipAddress = null,
      transaction
    } = options

    // 1. 文件基础验证（MIME 类型、文件大小）
    ImageService._validateFile(mimeType, fileSize)

    // 2. 图片尺寸验证（最大边不超过 4096px）
    await ImageService._validateImageDimensions(fileBuffer)

    // 3. 确定存储文件夹
    const folder = BUSINESS_TYPE_FOLDER_MAP[businessType]
    if (!folder) {
      throw new Error(
        `不支持的业务类型：${businessType}，允许值：${Object.keys(BUSINESS_TYPE_FOLDER_MAP).join('/')}`
      )
    }

    // 4. 确定资源分类（category）- 如未传入则使用默认映射
    const resolvedCategory = category || folder

    /**
     * 5. 上传到 Sealos 对象存储（含预生成缩略图）
     *    返回 { original_key, thumbnail_keys: { small, medium, large } }
     */
    const storageService = new SealosStorageService()
    const { original_key: originalKey, thumbnail_keys: thumbnailKeys } =
      await storageService.uploadImageWithThumbnails(fileBuffer, originalName, folder)

    // 6. 生成 upload_id 用于垃圾回收追踪（24小时未绑定清理）
    const uploadId = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`

    // 7. 创建 image_resources 记录（字段与真实表结构一致）
    const { ImageResources } = require('../models')
    const imageRecord = await ImageResources.create(
      {
        file_path: originalKey, // 存储原图 object key
        thumbnail_paths: thumbnailKeys, // 存储缩略图 object keys（JSON）
        original_filename: originalName,
        file_size: fileSize,
        mime_type: mimeType,
        business_type: businessType,
        category: resolvedCategory,
        context_id: contextId,
        user_id: userId,
        source_module: sourceModule,
        ip_address: ipAddress,
        upload_id: uploadId, // 用于垃圾回收追踪
        status: 'active'
      },
      { transaction }
    )

    // 8. 生成公网访问 URL（不使用 CDN）
    const publicUrl = getImageUrl(originalKey)
    const thumbnails = {
      small: getImageUrl(thumbnailKeys.small),
      medium: getImageUrl(thumbnailKeys.medium),
      large: getImageUrl(thumbnailKeys.large)
    }

    console.log('✅ ImageService: 图片上传成功（含预生成缩略图）', {
      image_id: imageRecord.image_id,
      object_key: originalKey,
      thumbnail_keys: thumbnailKeys,
      business_type: businessType,
      category: resolvedCategory,
      upload_id: uploadId
    })

    return {
      image_id: imageRecord.image_id,
      object_key: originalKey,
      public_url: publicUrl, // 🔴 重命名：cdn_url → public_url（架构决策：不使用 CDN）
      thumbnails,
      file_size: fileSize,
      mime_type: mimeType,
      original_filename: originalName
    }
  }

  /**
   * 根据 image_id 获取图片详情
   *
   * @param {number} imageId - 图片资源 ID
   * @returns {Promise<Object|null>} 图片详情（含 CDN URL）或 null
   */
  static async getImageById(imageId) {
    if (!imageId) return null

    const { ImageResources } = require('../models')
    const image = await ImageResources.findByPk(imageId)

    if (!image) return null

    return ImageService._formatImageResponse(image)
  }

  /**
   * 根据业务类型和上下文 ID 获取关联图片列表
   *
   * @param {string} businessType - 业务类型：lottery|exchange|trade|uploads
   * @param {number} contextId - 业务上下文 ID（如 prize_id、product_id）
   * @returns {Promise<Array>} 图片列表
   */
  static async getImagesByBusiness(businessType, contextId) {
    const { ImageResources } = require('../models')
    const images = await ImageResources.findAll({
      where: {
        business_type: businessType,
        context_id: contextId, // 🔴 修复：business_id → context_id
        status: 'active'
      },
      order: [['created_at', 'ASC']]
    })

    return images.map(img => ImageService._formatImageResponse(img))
  }

  /**
   * 更新图片的业务上下文关联
   *
   * @param {number} imageId - 图片资源 ID
   * @param {number} contextId - 新的业务上下文 ID（如 prize_id、product_id）
   * @param {Object} [transaction] - Sequelize 事务
   * @returns {Promise<boolean>} 更新是否成功
   */
  static async updateImageContextId(imageId, contextId, transaction = null) {
    const { ImageResources } = require('../models')
    const [affectedCount] = await ImageResources.update(
      { context_id: contextId }, // 🔴 修复：business_id → context_id
      { where: { image_id: imageId }, transaction }
    )
    return affectedCount > 0
  }

  /**
   * 物理删除图片（从 Sealos 和数据库中删除）
   *
   * @description
   *   架构决策（2026-01-08 最终拍板）：
   *   - Web 管理端删除时立即物理删除
   *   - 同时删除原图和所有缩略图
   *   - 从数据库物理删除记录（非软删除）
   *
   * @param {number} imageId - 图片资源 ID
   * @param {Object} [transaction] - Sequelize 事务
   * @returns {Promise<boolean>} 删除是否成功
   */
  static async deleteImage(imageId, transaction = null) {
    const { ImageResources } = require('../models')
    const imageRecord = await ImageResources.findByPk(imageId)

    if (!imageRecord) {
      console.warn(`⚠️ ImageService: 尝试删除不存在的图片 image_id=${imageId}`)
      return false
    }

    // 1. 物理删除 Sealos 对象（原图 + 缩略图）
    const storageService = new SealosStorageService()
    try {
      await storageService.deleteImageWithThumbnails(
        imageRecord.file_path,
        imageRecord.thumbnail_paths
      )
      console.log(`✅ ImageService: Sealos 对象已物理删除 image_id=${imageId}`)
    } catch (error) {
      console.error(
        `❌ ImageService: Sealos 对象删除失败 image_id=${imageId}, error=${error.message}`
      )
      // 即使对象存储删除失败，也尝试删除数据库记录，避免数据不一致
    }

    // 2. 物理删除数据库记录（非软删除）
    const affectedCount = await ImageResources.destroy({
      where: { image_id: imageId },
      transaction
    })

    if (affectedCount > 0) {
      console.log(`✅ ImageService: 数据库记录已物理删除 image_id=${imageId}`)
    }

    return affectedCount > 0
  }

  /**
   * 获取对象存储中图片的公开访问 URL
   *
   * @param {string} objectKey - 对象 key
   * @param {Object} [options] - 选项
   * @param {string} [options.size] - 缩略图尺寸：small|medium|large
   * @returns {string|null} 完整 CDN URL
   */
  static getPublicUrl(objectKey, options = {}) {
    if (!objectKey) return null

    if (options.size) {
      return getThumbnailUrl(objectKey, options.size)
    }

    return getImageUrl(objectKey)
  }

  /**
   * 验证文件是否符合上传要求（MIME 类型、文件大小）
   *
   * @private
   * @param {string} mimeType - MIME 类型
   * @param {number} fileSize - 文件大小
   * @returns {void}
   * @throws {Error} 验证失败时抛出错误
   */
  static _validateFile(mimeType, fileSize) {
    // 验证 MIME 类型
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`不支持的图片格式：${mimeType}，允许：${ALLOWED_MIME_TYPES.join('/')}`)
    }

    // 验证文件大小
    if (fileSize > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / 1024 / 1024
      const actualMB = (fileSize / 1024 / 1024).toFixed(2)
      throw new Error(`文件过大：${actualMB}MB，最大允许：${maxMB}MB`)
    }
  }

  /**
   * 验证图片尺寸是否符合要求（最大边不超过 4096px）
   *
   * @private
   * @param {Buffer} fileBuffer - 文件内容（Buffer）
   * @returns {Promise<void>} 验证通过返回 void，否则抛出错误
   * @throws {Error} 图片尺寸超限时抛出错误
   */
  static async _validateImageDimensions(fileBuffer) {
    const sharp = require('sharp')

    try {
      const metadata = await sharp(fileBuffer).metadata()
      const maxDimension = Math.max(metadata.width || 0, metadata.height || 0)
      const MAX_DIMENSION = 4096 // 架构决策：最大边不超过 4096px

      if (maxDimension > MAX_DIMENSION) {
        throw new Error(
          `图片尺寸过大：${metadata.width}×${metadata.height}px，最大边不能超过 ${MAX_DIMENSION}px`
        )
      }
    } catch (error) {
      if (error.message.includes('图片尺寸过大')) {
        throw error
      }
      // sharp 解析失败可能是文件损坏或格式不支持
      throw new Error(`图片文件无法解析：${error.message}`)
    }
  }

  /**
   * 清理未绑定的孤立图片（context_id=0 超过指定小时数）
   *
   * @description
   *   架构决策（2026-01-08 最终拍板）：
   *   - context_id=0 表示图片已上传但未绑定到任何业务实体
   *   - 超过 24 小时未绑定的图片视为孤立资源，应自动清理
   *   - 同时删除 Sealos 对象存储中的文件和数据库记录
   *   - 定时任务每小时执行一次
   *
   * @param {number} [hours=24] - 未绑定超过多少小时才清理
   * @returns {Promise<Object>} 清理结果
   * @returns {number} result.cleaned_count - 清理的图片数量
   * @returns {number} result.failed_count - 清理失败的数量
   * @returns {Array} result.details - 清理详情
   * @returns {string} result.timestamp - 清理时间
   */
  static async cleanupUnboundImages(hours = 24) {
    const { ImageResources } = require('../models')
    const { Op } = require('sequelize')
    const BeijingTimeHelper = require('../utils/timeHelper')
    const storageService = new SealosStorageService()

    const startTime = Date.now()

    // 计算清理阈值时间（当前时间 - hours 小时）
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000)

    console.log(
      `🔍 ImageService: 开始清理未绑定图片（context_id=0 且 created_at < ${threshold.toISOString()}）`
    )

    try {
      // 1. 查询符合条件的孤立图片
      const unboundImages = await ImageResources.findAll({
        where: {
          context_id: 0, // 未绑定
          status: 'active',
          created_at: {
            [Op.lt]: threshold // 超过指定小时数
          }
        },
        order: [['created_at', 'ASC']]
      })

      console.log(`📊 ImageService: 发现 ${unboundImages.length} 个待清理的未绑定图片`)

      if (unboundImages.length === 0) {
        return {
          cleaned_count: 0,
          failed_count: 0,
          details: [],
          timestamp: BeijingTimeHelper.apiTimestamp()
        }
      }

      // 2. 逐个清理（删除 Sealos 对象 + 数据库记录）
      let cleanedCount = 0
      let failedCount = 0
      const details = []

      for (const image of unboundImages) {
        try {
          // 删除 Sealos 对象（原图 + 缩略图）
          // eslint-disable-next-line no-await-in-loop -- 批量清理需要逐个处理，错误隔离
          await storageService.deleteImageWithThumbnails(image.file_path, image.thumbnail_paths)

          // 物理删除数据库记录
          // eslint-disable-next-line no-await-in-loop -- 批量清理需要逐个删除
          await ImageResources.destroy({
            where: { image_id: image.image_id }
          })

          cleanedCount++
          details.push({
            image_id: image.image_id,
            file_path: image.file_path,
            created_at: image.created_at,
            success: true
          })

          console.log(
            `🗑️ ImageService: 已清理 image_id=${image.image_id}, file_path=${image.file_path}`
          )
        } catch (error) {
          failedCount++
          details.push({
            image_id: image.image_id,
            file_path: image.file_path,
            success: false,
            error: error.message
          })

          console.error(
            `❌ ImageService: 清理失败 image_id=${image.image_id}, error=${error.message}`
          )
        }
      }

      const duration = Date.now() - startTime
      const result = {
        cleaned_count: cleanedCount,
        failed_count: failedCount,
        total_found: unboundImages.length,
        details,
        timestamp: BeijingTimeHelper.apiTimestamp(),
        duration_ms: duration
      }

      console.log('✅ ImageService: 未绑定图片清理完成', {
        cleaned: cleanedCount,
        failed: failedCount,
        duration: `${duration}ms`
      })

      return result
    } catch (error) {
      console.error('❌ ImageService: 未绑定图片清理执行异常', { error: error.message })
      throw error
    }
  }

  /**
   * 格式化图片响应数据
   *
   * @description
   *   架构决策（2026-01-08 / 2026-01-13 清理兼容代码）：
   *   - 使用预生成的缩略图 key（存储在 thumbnail_paths 字段）
   *   - 不使用 CDN，直连 Sealos 公网端点
   *
   *   架构决策（2026-01-14 图片缩略图架构兼容残留核查报告）：
   *   - 移除兼容旧数据的推断缩略图逻辑
   *   - 缺失 thumbnail_paths 时记录 ERROR 日志
   *   - 降级策略由 ENABLE_THUMBNAIL_FALLBACK 环境变量控制
   *
   * @private
   * @param {Object} imageRecord - ImageResources 模型实例
   * @returns {Object} 格式化后的响应
   */
  static _formatImageResponse(imageRecord) {
    const objectKey = imageRecord.file_path
    const storedThumbnails = imageRecord.thumbnail_paths // JSON 字段
    const enableFallback = process.env.ENABLE_THUMBNAIL_FALLBACK === 'true'

    let thumbnails = null
    if (storedThumbnails && Object.keys(storedThumbnails).length > 0) {
      // 使用预生成的缩略图 key
      thumbnails = {
        small: storedThumbnails.small ? getImageUrl(storedThumbnails.small) : null,
        medium: storedThumbnails.medium ? getImageUrl(storedThumbnails.medium) : null,
        large: storedThumbnails.large ? getImageUrl(storedThumbnails.large) : null
      }
    } else {
      // 2026-01-14 决策：告警优先降级逻辑（移除兼容旧数据的推断缩略图逻辑）
      console.error(
        '❌ ImageService: 图片 ' +
          imageRecord.image_id +
          ' 缺少预生成缩略图。' +
          'file_path: ' +
          imageRecord.file_path +
          ', business_type: ' +
          imageRecord.business_type +
          ', category: ' +
          imageRecord.category +
          ', context_id: ' +
          imageRecord.context_id
      )

      if (enableFallback) {
        // 降级方案 A: 使用原图作为缩略图（如果 ENABLE_THUMBNAIL_FALLBACK 为 true）
        const originalImageUrl = getImageUrl(objectKey)
        thumbnails = {
          small: originalImageUrl,
          medium: originalImageUrl,
          large: originalImageUrl
        }
        console.warn(
          '⚠️ ImageService: 图片 ' +
            imageRecord.image_id +
            ' 缩略图降级为原图 URL (ENABLE_THUMBNAIL_FALLBACK=true)'
        )
      } else {
        // 降级方案 B: 使用占位图（生产环境默认）
        const placeholderUrl = getPlaceholderImageUrl(
          imageRecord.business_type,
          imageRecord.category
        )
        thumbnails = {
          small: placeholderUrl,
          medium: placeholderUrl,
          large: placeholderUrl
        }
        console.warn(
          '⚠️ ImageService: 图片 ' +
            imageRecord.image_id +
            ' 缩略图降级为占位图 URL (ENABLE_THUMBNAIL_FALLBACK=false)'
        )
      }
    }

    return {
      image_id: imageRecord.image_id,
      object_key: objectKey,
      public_url: getImageUrl(objectKey),
      thumbnails,
      original_filename: imageRecord.original_filename,
      file_size: imageRecord.file_size,
      mime_type: imageRecord.mime_type,
      business_type: imageRecord.business_type,
      category: imageRecord.category,
      context_id: imageRecord.context_id,
      status: imageRecord.status,
      created_at: imageRecord.created_at
    }
  }
}

module.exports = ImageService
