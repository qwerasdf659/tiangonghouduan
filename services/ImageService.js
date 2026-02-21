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
   * @param {number|null} options.contextId - 关联的业务上下文 ID（如 lottery_prize_id、user_id）
   * @param {number} [options.userId] - 关联用户 ID（上传者）
   * @param {string} [options.sourceModule='admin'] - 来源模块：system/lottery/exchange/admin
   * @param {string} [options.ipAddress] - 客户端 IP 地址
   * @param {Object} [options.transaction] - Sequelize 事务对象
   *
   * @returns {Promise<Object>} 上传结果
   * @returns {number} result.image_resource_id - 图片资源 ID
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
      sortOrder = 0, // 多图排序序号（同一 context_id 内排序）
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
        sort_order: sortOrder, // 多图排序序号
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

    _logger.info('✅ ImageService: 图片上传成功（含预生成缩略图）', {
      image_resource_id: imageRecord.image_resource_id,
      object_key: originalKey,
      thumbnail_keys: thumbnailKeys,
      business_type: businessType,
      category: resolvedCategory,
      upload_id: uploadId
    })

    return {
      image_resource_id: imageRecord.image_resource_id,
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
   * @param {number} contextId - 业务上下文 ID（如 lottery_prize_id、exchange_item_id）
   * @param {Object} [options] - 查询选项
   * @param {string} [options.category] - 图片分类过滤（primary/detail/icons 等）
   * @returns {Promise<Array>} 图片列表
   */
  static async getImagesByBusiness(businessType, contextId, options = {}) {
    const { ImageResources } = require('../models')

    const where = {
      business_type: businessType,
      context_id: contextId,
      status: 'active'
    }

    // 可选的 category 过滤（用于区分主图和详情图）
    if (options.category) {
      where.category = options.category
    }

    const images = await ImageResources.findAll({
      where,
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC']
      ]
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
      { context_id: contextId },
      // 2026-02-01 主键命名规范化：使用正确的主键字段名 image_resource_id
      { where: { image_resource_id: imageId }, transaction }
    )
    return affectedCount > 0
  }

  /**
   * 更新图片排序序号（多图管理）
   *
   * @param {number} imageId - 图片资源 ID
   * @param {number} sortOrder - 新的排序序号
   * @param {Object} [transaction] - Sequelize 事务
   * @returns {Promise<boolean>} 更新是否成功
   */
  static async updateImageSortOrder(imageId, sortOrder, transaction = null) {
    const { ImageResources } = require('../models')
    const [affectedCount] = await ImageResources.update(
      { sort_order: sortOrder },
      { where: { image_resource_id: imageId }, transaction }
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
    const { ImageResources, ExchangeItem, LotteryPrize, ItemTemplate } = require('../models')
    const imageRecord = await ImageResources.findByPk(imageId)

    if (!imageRecord) {
      _logger.warn(`⚠️ ImageService: 尝试删除不存在的图片 image_id=${imageId}`)
      return false
    }

    // 引用保护检查：删除前验证是否被业务实体引用
    const references = []
    const exchangeCount = await ExchangeItem.count({ where: { primary_image_id: imageId } })
    if (exchangeCount > 0) references.push(`${exchangeCount} 个兑换商品`)

    const prizeCount = await LotteryPrize.count({ where: { image_resource_id: imageId } })
    if (prizeCount > 0) references.push(`${prizeCount} 个抽奖奖品`)

    if (ItemTemplate) {
      const templateCount = await ItemTemplate.count({ where: { image_resource_id: imageId } })
      if (templateCount > 0) references.push(`${templateCount} 个物品模板`)
    }

    if (references.length > 0) {
      const refDesc = references.join('、')
      _logger.warn(`⚠️ ImageService: 图片 image_id=${imageId} 正在被引用: ${refDesc}，拒绝删除`)
      throw new Error(`图片正在被 ${refDesc} 使用，无法删除。请先解除关联后再删除。`)
    }

    // 1. 物理删除 Sealos 对象（原图 + 缩略图）
    const storageService = new SealosStorageService()
    try {
      await storageService.deleteImageWithThumbnails(
        imageRecord.file_path,
        imageRecord.thumbnail_paths
      )
      _logger.info(`✅ ImageService: Sealos 对象已物理删除 image_id=${imageId}`)
    } catch (error) {
      _logger.error(
        `❌ ImageService: Sealos 对象删除失败 image_id=${imageId}, error=${error.message}`
      )
      // 即使对象存储删除失败，也尝试删除数据库记录，避免数据不一致
    }

    /*
     * 2. 物理删除数据库记录（非软删除）
     * 2026-02-01 主键命名规范化：使用正确的主键字段名 image_resource_id
     */
    const affectedCount = await ImageResources.destroy({
      where: { image_resource_id: imageId },
      transaction
    })

    if (affectedCount > 0) {
      _logger.info(`✅ ImageService: 数据库记录已物理删除 image_resource_id=${imageId}`)
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

    _logger.info(
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

      _logger.info(`📊 ImageService: 发现 ${unboundImages.length} 个待清理的未绑定图片`)

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
            where: { image_resource_id: image.image_resource_id }
          })

          cleanedCount++
          details.push({
            image_resource_id: image.image_resource_id,
            file_path: image.file_path,
            created_at: image.created_at,
            success: true
          })

          _logger.info(
            `🗑️ ImageService: 已清理 image_resource_id=${image.image_resource_id}, file_path=${image.file_path}`
          )
        } catch (error) {
          failedCount++
          details.push({
            image_resource_id: image.image_resource_id,
            file_path: image.file_path,
            success: false,
            error: error.message
          })

          _logger.error(
            `❌ ImageService: 清理失败 image_resource_id=${image.image_resource_id}, error=${error.message}`
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

      _logger.info('✅ ImageService: 未绑定图片清理完成', {
        cleaned: cleanedCount,
        failed: failedCount,
        duration: `${duration}ms`
      })

      return result
    } catch (error) {
      _logger.error('❌ ImageService: 未绑定图片清理执行异常', { error: error.message })
      throw error
    }
  }

  /**
   * 格式化图片响应数据
   *
   * @description
   * - 使用预生成的缩略图 key（存储在 thumbnail_paths 字段）
   * - 不使用 CDN，直连 Sealos 公网端点
   * - 缺失 thumbnail_paths 时：记录 ERROR 日志 + 返回占位图 URL（生产安全兜底）
   *
   * @private
   * @param {Object} imageRecord - ImageResources 模型实例
   * @returns {Object} 格式化后的响应
   */
  static _formatImageResponse(imageRecord) {
    const objectKey = imageRecord.file_path
    const storedThumbnails = imageRecord.thumbnail_paths // JSON 字段

    let thumbnails = null
    if (storedThumbnails && Object.keys(storedThumbnails).length > 0) {
      // 使用预生成的缩略图 key（正常路径）
      thumbnails = {
        small: storedThumbnails.small ? getImageUrl(storedThumbnails.small) : null,
        medium: storedThumbnails.medium ? getImageUrl(storedThumbnails.medium) : null,
        large: storedThumbnails.large ? getImageUrl(storedThumbnails.large) : null
      }
    } else {
      // 缩略图缺失时：记录 ERROR 日志 + 返回占位图（生产安全兜底）
      _logger.error(
        '❌ ImageService: 图片 ' +
          imageRecord.image_resource_id +
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

      // 使用占位图作为降级方案（生产安全兜底）
      const placeholderUrl = getPlaceholderImageUrl(imageRecord.business_type, imageRecord.category)
      thumbnails = {
        small: placeholderUrl,
        medium: placeholderUrl,
        large: placeholderUrl
      }
    }

    return {
      image_resource_id: imageRecord.image_resource_id,
      object_key: objectKey,
      public_url: getImageUrl(objectKey),
      thumbnails,
      original_filename: imageRecord.original_filename,
      file_size: imageRecord.file_size,
      mime_type: imageRecord.mime_type,
      business_type: imageRecord.business_type,
      category: imageRecord.category,
      context_id: imageRecord.context_id,
      sort_order: imageRecord.sort_order || 0,
      status: imageRecord.status,
      created_at: imageRecord.created_at
    }
  }

  /**
   * 分页获取图片列表（管理后台用）
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.business_type] - 业务类型筛选
   * @param {string} [filters.status] - 状态筛选（active/archived/deleted/orphan）
   * @param {Object} pagination - 分页参数
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=24] - 每页数量
   * @returns {Promise<Object>} 图片列表和统计信息
   *
   * @since 2026-01-18 路由层合规性治理：支持管理后台列表查询
   */
  static async getImageList(filters = {}, pagination = {}) {
    const { ImageResources } = require('../models')
    const { Op, fn, col } = require('sequelize')

    // 分页参数
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(Math.max(1, parseInt(pagination.page_size, 10) || 24), 100)
    const offset = (page - 1) * pageSize

    // 构建查询条件
    const where = {}
    const { business_type: businessType, status } = filters

    if (businessType) {
      where.business_type = businessType
    }

    // 状态筛选：orphan 表示 context_id=0 的孤儿图片
    if (status === 'orphan') {
      where.context_id = 0
      where.status = 'active'
    } else if (status) {
      where.status = status
    }

    // 查询图片列表
    const { count, rows } = await ImageResources.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      order: [['created_at', 'DESC']]
    })

    // 格式化图片数据
    const images = rows.map(img => ({
      image_resource_id: img.image_resource_id,
      url: getImageUrl(img.file_path),
      original_filename: img.original_filename,
      file_size: img.file_size,
      mime_type: img.mime_type,
      business_type: img.business_type,
      category: img.category,
      context_id: img.context_id,
      status: img.context_id === 0 ? 'orphan' : img.status,
      created_at: img.created_at
    }))

    // 计算统计数据
    const [statsResult] = await ImageResources.findAll({
      attributes: [
        [fn('COUNT', col('image_resource_id')), 'total'],
        [fn('SUM', col('file_size')), 'total_size']
      ],
      where: { status: 'active' },
      raw: true
    })

    // 本周上传数
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

    const weekCount = await ImageResources.count({
      where: {
        created_at: { [Op.gte]: oneWeekAgo }
      }
    })

    // 孤儿图片数（context_id=0）
    const orphanCount = await ImageResources.count({
      where: {
        context_id: 0,
        status: 'active'
      }
    })

    return {
      images,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      },
      stats: {
        total: parseInt(statsResult?.total, 10) || 0,
        total_size_mb:
          Math.round(((parseInt(statsResult?.total_size, 10) || 0) / 1024 / 1024) * 100) / 100,
        week_count: weekCount,
        orphan_count: orphanCount
      }
    }
  }

  /**
   * 检测图片存储一致性（数据库记录 vs Sealos 物理文件）
   *
   * @description
   *   遍历 image_resources 表中 status='active' 的记录，
   *   通过 S3 HEAD 请求验证对应文件是否真实存在于 Sealos 对象存储中。
   *   供定时任务 DailyImageStorageConsistencyCheck 调用。
   *
   * @param {Object} [options] - 检测选项
   * @param {number} [options.batchSize=50] - 每批检测数量
   * @param {number} [options.concurrency=5] - 并发 HEAD 请求数
   * @returns {Promise<Object>} 检测报告
   */
  static async checkStorageConsistency(options = {}) {
    const DailyImageStorageConsistencyCheck = require('../jobs/daily-image-storage-consistency-check')
    return DailyImageStorageConsistencyCheck.execute(options)
  }
}

module.exports = ImageService
