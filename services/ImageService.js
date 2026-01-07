/**
 * 通用图片管理服务
 *
 * @description 统一处理图片上传、存储、查询、删除等业务逻辑
 *              核心职责：协调 SealosStorageService 和 image_resources 模型
 *
 * @architecture 架构决策（2026-01-07）
 *   - 存储后端：Sealos 对象存储（S3 兼容）
 *   - 访问策略：全部 public-read
 *   - 数据库存储：仅存对象 key（如 prizes/xxx.jpg），不存完整 URL
 *   - URL 生成：API 层动态拼接 CDN 域名
 *   - 缩略图策略：URL 参数化（前端请求时带 size 参数）
 *
 * @version 1.0.0
 * @date 2026-01-08
 */

const SealosStorageService = require('./sealosStorage')
const { getImageUrl, getThumbnailUrl } = require('../utils/ImageUrlHelper')

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
   * @returns {string} result.object_key - 对象存储 key
   * @returns {string} result.cdn_url - CDN 完整访问 URL
   * @returns {Object} result.thumbnails - 缩略图 URL 对象
   *
   * @throws {Error} 文件验证失败或上传失败时抛出错误
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

    // 1. 文件验证
    ImageService._validateFile(mimeType, fileSize)

    // 2. 确定存储文件夹
    const folder = BUSINESS_TYPE_FOLDER_MAP[businessType]
    if (!folder) {
      throw new Error(
        `不支持的业务类型：${businessType}，允许值：${Object.keys(BUSINESS_TYPE_FOLDER_MAP).join('/')}`
      )
    }

    // 3. 确定资源分类（category）- 如未传入则使用默认映射
    const resolvedCategory = category || folder

    // 4. 上传到 Sealos 对象存储
    const storageService = new SealosStorageService()
    const objectKey = await storageService.uploadImage(fileBuffer, originalName, folder)

    // 5. 创建 image_resources 记录（字段与真实表结构一致）
    const { ImageResources } = require('../models')
    const imageRecord = await ImageResources.create(
      {
        file_path: objectKey, // 核心：仅存对象 key
        original_filename: originalName, // 🔴 修复：original_name → original_filename
        file_size: fileSize,
        mime_type: mimeType,
        business_type: businessType,
        category: resolvedCategory, // 🔴 修复：新增必填字段
        context_id: contextId, // 🔴 修复：business_id → context_id
        user_id: userId, // 🔴 修复：uploader_id → user_id
        source_module: sourceModule,
        ip_address: ipAddress,
        status: 'active'
      },
      { transaction }
    )

    // 6. 生成 CDN URL 和缩略图 URL
    const cdnUrl = getImageUrl(objectKey)
    const thumbnails = {
      small: getThumbnailUrl(objectKey, 'small'),
      medium: getThumbnailUrl(objectKey, 'medium'),
      large: getThumbnailUrl(objectKey, 'large')
    }

    console.log('✅ ImageService: 图片上传成功', {
      image_id: imageRecord.image_id,
      object_key: objectKey,
      business_type: businessType,
      category: resolvedCategory,
      user_id: userId
    })

    return {
      image_id: imageRecord.image_id,
      object_key: objectKey,
      cdn_url: cdnUrl,
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
   * 软删除图片（标记为 deleted 状态）
   *
   * @param {number} imageId - 图片资源 ID
   * @param {Object} [transaction] - Sequelize 事务
   * @returns {Promise<boolean>} 删除是否成功
   */
  static async deleteImage(imageId, transaction = null) {
    const { ImageResources } = require('../models')
    const [affectedCount] = await ImageResources.update(
      { status: 'deleted' },
      { where: { image_id: imageId }, transaction }
    )

    if (affectedCount > 0) {
      console.log(`✅ ImageService: 图片已软删除 image_id=${imageId}`)
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
   * 验证文件是否符合上传要求
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
   * 格式化图片响应数据
   *
   * @private
   * @param {Object} imageRecord - ImageResources 模型实例
   * @returns {Object} 格式化后的响应
   */
  static _formatImageResponse(imageRecord) {
    const objectKey = imageRecord.file_path

    return {
      image_id: imageRecord.image_id,
      object_key: objectKey,
      cdn_url: getImageUrl(objectKey),
      thumbnails: {
        small: getThumbnailUrl(objectKey, 'small'),
        medium: getThumbnailUrl(objectKey, 'medium'),
        large: getThumbnailUrl(objectKey, 'large')
      },
      original_filename: imageRecord.original_filename, // 🔴 修复字段名
      file_size: imageRecord.file_size,
      mime_type: imageRecord.mime_type,
      business_type: imageRecord.business_type,
      category: imageRecord.category,
      context_id: imageRecord.context_id, // 🔴 修复字段名
      status: imageRecord.status,
      created_at: imageRecord.created_at
    }
  }
}

module.exports = ImageService
