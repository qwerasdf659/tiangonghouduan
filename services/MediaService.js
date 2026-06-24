/**
 * 媒体服务 — 统一媒体文件与多态关联管理
 *
 * @description 替代 ImageService，基于 media_files + media_attachments 架构
 *              核心职责：上传、去重、关联、清理、批量操作
 *
 * 架构定位：
 * - 存储后端：SealosStorageService（S3 兼容）
 * - URL 生成：ImageUrlHelper
 * - 去重策略：content_hash（SHA-256）建议去重
 * - 关联层：media_attachments 多态关联
 *
 * @version 1.0.0
 * @date 2026-03-16
 */

const BusinessError = require('../utils/BusinessError')
const crypto = require('crypto')
const sharp = require('sharp')
const { Op, QueryTypes } = require('sequelize')
const { sequelize } = require('../config/database')
const { getImageUrl } = require('../utils/ImageUrlHelper')
const _logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { MediaFile, MediaAttachment } = require('../models')
const models = require('../models')

/** 业务表 primary_media_id 映射（attach role='primary' 时自动更新业务表主图字段） */
const PRIMARY_MEDIA_TABLES = {
  exchange_item: { modelName: 'ExchangeItem', pk: 'exchange_item_id' },
  prize_definition: { modelName: 'PrizeDefinition', pk: 'prize_definition_id' },
  item_template: { modelName: 'ItemTemplate', pk: 'item_template_id' },
  ad_creative: { modelName: 'AdCreative', pk: 'ad_creative_id' }
}

/**
 * 全部「实体引用图」外键列清单（治本 B - 2026-06-24，连真实库 information_schema 核实共 10 处 / 8 表）
 *
 * 用途：孤儿判定 getOrphanedMedia、删除前引用校验 getReferences 必须覆盖全部引用列，
 * 否则「白名单漏列」会导致在用图被误判孤儿物理删（本次事故根因的残留风险）。
 * 旧逻辑只覆盖 4 张 primary_media_id 表，遗漏 categories/diy_templates×2/diy_works/exchange_item_skus；
 * 2026-06-24 复核又发现遗漏 diy_materials.image_media_id（DIY 素材图，模型已有 belongsTo 关联且真实库有数据），
 * 本次补入，使引用列从 9 处补齐到 10 处 / 8 表，彻底消除白名单漏列。
 *
 * 每项：[模型名, 外键列, 主键列]。模型名为 PascalCase（models 索引键），列为 snake_case（数据库字段）。
 * @constant {Array<[string, string, string]>}
 */
const MEDIA_REF_COLUMNS = Object.freeze([
  ['ExchangeItem', 'primary_media_id', 'exchange_item_id'],
  ['PrizeDefinition', 'primary_media_id', 'prize_definition_id'],
  ['ItemTemplate', 'primary_media_id', 'item_template_id'],
  ['AdCreative', 'primary_media_id', 'ad_creative_id'],
  ['Category', 'icon_media_id', 'category_id'],
  ['DiyTemplate', 'base_image_media_id', 'diy_template_id'],
  ['DiyTemplate', 'preview_media_id', 'diy_template_id'],
  ['DiyWork', 'preview_media_id', 'diy_work_id'],
  ['ExchangeItemSku', 'image_id', 'sku_id'],
  ['DiyMaterial', 'image_media_id', 'diy_material_id']
])

/** 允许的图片 MIME 类型 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** 图片大小限制（字节） */
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * 媒体服务类
 *
 * @description 统一处理媒体上传、关联、查询、清理等业务逻辑
 */
class MediaService {
  /**
   * @param {Object} serviceManager - 服务管理器实例
   */
  constructor(serviceManager) {
    this.serviceManager = serviceManager
  }

  /**
   * 获取 Sealos 存储服务实例
   * @returns {Object} SealosStorageService 实例
   */
  _getStorageService() {
    const SealosStorageServiceClass = this.serviceManager.getService('sealos_storage')
    return new SealosStorageServiceClass()
  }

  /**
   * 由衍生图清单 thumbnail_keys 构建对外 URL 集合（统一出口，避免各处重复拼装）
   *
   * 治本 D+E（2026-06-24）：档位为宽度档 w375/w750/w1080（WebP，上传时预生成）。
   * 衍生图 URL 共享主文件 content_hash，文件变→hash 变→URL 变，客户端自动失效。
   *
   * @param {Object|null} thumbnailKeys - media_files.thumbnail_keys，形如 { w375, w750, w1080 }
   * @param {string} contentHash - 主文件内容哈希（media_files.content_hash）
   * @returns {Object} 三档宽度衍生图 URL（含 w375/w750/w1080，缺档为 null）
   */
  _buildThumbnailUrls(thumbnailKeys, contentHash) {
    const tk = thumbnailKeys || {}
    return {
      w375: tk.w375 ? getImageUrl(tk.w375, contentHash) : null,
      w750: tk.w750 ? getImageUrl(tk.w750, contentHash) : null,
      w1080: tk.w1080 ? getImageUrl(tk.w1080, contentHash) : null
    }
  }

  /**
   * 验证文件（MIME、大小）
   * @private
   * @param {string} mimeType - MIME 类型
   * @param {number} fileSize - 文件大小（字节）
   * @returns {void}
   */
  _validateFile(mimeType, fileSize) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BusinessError(
        `不支持的图片格式：${mimeType}，允许：${ALLOWED_MIME_TYPES.join('/')}`,
        'SERVICE_NOT_ALLOWED',
        400
      )
    }
    if (fileSize > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / 1024 / 1024
      const actualMB = (fileSize / 1024 / 1024).toFixed(2)
      throw new BusinessError(`文件过大：${actualMB}MB，最大允许：${maxMB}MB`, 'SERVICE_ERROR', 400)
    }
  }

  /**
   * 超限自动压缩：图片超过 MAX_FILE_SIZE 时用 sharp 渐进式降质/限宽，压到限制内。
   *
   * 复用项目已有的 sharp 依赖，零新依赖。策略（与存储层 uploadImageWithThumbnails 的格式约定保持一致）：
   * - 仅处理可重编码的位图（jpeg/png/webp）；gif（可能为动图）不压缩，超限仍按原校验拒绝。
   * - 限制最大边到 2000px（资产图标/商品图远用不到更大），再逐级降质直到 ≤ 限制。
   * - 保留原格式族：有透明通道走 png（保留透明），否则走 jpeg；不改变 mimeType 语义，
   *   避免与存储层"按 hasAlpha 决定 png/jpeg"产生 mime 与实际格式不一致。
   * - 任一步失败则返回原图（交由 _validateFile 按原逻辑处理），不阻断主流程。
   *
   * @param {Buffer} fileBuffer - 原始图片 buffer
   * @param {string} mimeType - 原始 MIME 类型
   * @returns {Promise<{ buffer: Buffer, mimeType: string, compressed: boolean }>} 压缩结果
   */
  async _compressIfOversized(fileBuffer, mimeType) {
    const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp']
    if (fileBuffer.length <= MAX_FILE_SIZE || !COMPRESSIBLE.includes(mimeType)) {
      return { buffer: fileBuffer, mimeType, compressed: false }
    }
    try {
      const meta = await sharp(fileBuffer).metadata()
      const hasAlpha = !!meta.hasAlpha
      const outMime = hasAlpha ? 'image/png' : 'image/jpeg'
      const qualities = [85, 75, 65, 55]
      let out = null
      for (const quality of qualities) {
        const pipeline = sharp(fileBuffer).resize({
          width: 2000,
          height: 2000,
          fit: 'inside',
          withoutEnlargement: true
        })
        // eslint-disable-next-line no-await-in-loop
        out = await (hasAlpha
          ? pipeline.png({ compressionLevel: 9, quality }).toBuffer()
          : pipeline.jpeg({ quality }).toBuffer())
        if (out.length <= MAX_FILE_SIZE) {
          break
        }
      }
      if (out && out.length <= MAX_FILE_SIZE) {
        _logger.info('MediaService: 图片超限已自动压缩', {
          original_size: fileBuffer.length,
          compressed_size: out.length,
          original_mime: mimeType,
          output_mime: outMime
        })
        return { buffer: out, mimeType: outMime, compressed: true }
      }
      _logger.warn('MediaService: 自动压缩后仍超限，回退原图按校验处理', {
        original_size: fileBuffer.length,
        best_size: out ? out.length : null
      })
      return { buffer: fileBuffer, mimeType, compressed: false }
    } catch (err) {
      _logger.warn('MediaService: 自动压缩失败，回退原图', { error: err.message })
      return { buffer: fileBuffer, mimeType, compressed: false }
    }
  }

  /**
   * 核心上传方法
   *
   * @param {Buffer} fileBuffer - 文件内容
   * @param {Object} options - 上传选项
   * @param {string} [options.folder='uploads'] - 存储文件夹
   * @param {string} [options.original_name] - 原始文件名
   * @param {string} [options.mime_type='image/jpeg'] - MIME 类型
   * @param {number} [options.uploaded_by] - 上传用户 ID
   * @param {boolean} [options.trim_transparent=false] - 是否裁剪透明边距（DIY 素材图场景）
   *
   * @returns {Promise<Object>} 上传结果
   * @returns {boolean} result.duplicate - 是否为重复文件
   * @returns {number} result.media_id - 媒体文件 ID
   * @returns {string} result.object_key - 原图对象 key
   * @returns {Object} result.thumbnail_keys - 缩略图 keys
   * @returns {string} result.public_url - 公网 URL
   */
  async upload(fileBuffer, options = {}) {
    const folder = options.folder || 'uploads'
    const originalName = options.original_name || 'image.jpg'
    let mimeType = options.mime_type || 'image/jpeg'
    const uploadedBy = options.uploaded_by ?? null
    const trimTransparent = options.trim_transparent ?? false

    /*
     * 超限自动压缩（2026-06-13）：图片超过 5MB 时先用 sharp 压缩到限制内，
     * 而非直接拒绝。压缩后再走原有格式/大小校验。复用现有 sharp，惠及所有上传入口。
     */
    const compressResult = await this._compressIfOversized(fileBuffer, mimeType)
    const workingBuffer = compressResult.buffer
    mimeType = compressResult.mimeType

    this._validateFile(mimeType, workingBuffer.length)

    /*
     * 0. 裁剪透明边距（DIY 素材图等场景）
     *    上传时一次性处理，下游消费端拿到的永远是可直接使用的图
     */
    let processedBuffer = workingBuffer
    if (trimTransparent && (mimeType === 'image/png' || mimeType === 'image/webp')) {
      try {
        const trimResult = await sharp(workingBuffer)
          .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 30 })
          .toBuffer({ resolveWithObject: true })
        processedBuffer = trimResult.data
        _logger.info('MediaService: 已裁剪透明边距', {
          original_size: workingBuffer.length,
          trimmed_size: processedBuffer.length,
          trimmed_width: trimResult.info.width,
          trimmed_height: trimResult.info.height
        })
      } catch (trimErr) {
        _logger.warn('MediaService: 裁剪透明边距失败，使用原图', { error: trimErr.message })
        processedBuffer = workingBuffer
      }
    }

    // 1. 计算 content_hash（SHA-256）— 基于处理后的 buffer
    const contentHash = crypto.createHash('sha256').update(processedBuffer).digest('hex')

    // 2. 检查重复（按 content_hash）
    const existing = await MediaFile.findOne({
      where: { content_hash: contentHash, status: 'active' }
    })

    if (existing) {
      const publicUrl = getImageUrl(existing.object_key, existing.content_hash)
      const thumbnails = this._buildThumbnailUrls(existing.thumbnail_keys, existing.content_hash)
      _logger.info('MediaService: 发现重复文件，返回已有记录', {
        existing_media_id: existing.media_id,
        content_hash: contentHash
      })
      return {
        duplicate: true,
        existing_media_id: existing.media_id,
        media_id: existing.media_id,
        object_key: existing.object_key,
        thumbnail_keys: existing.thumbnail_keys,
        public_url: publicUrl,
        thumbnails,
        width: existing.width,
        height: existing.height
      }
    }

    // 3. 上传到 Sealos（含缩略图）— 使用处理后的 buffer
    const storage = this._getStorageService()
    const { original_key: objectKey, thumbnail_keys: thumbnailKeys } =
      await storage.uploadImageWithThumbnails(processedBuffer, originalName, folder)

    // 4. 获取 width/height（sharp.metadata）— 基于处理后的 buffer
    let width = null
    let height = null
    try {
      const metadata = await sharp(processedBuffer).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null
    } catch (err) {
      _logger.warn('MediaService: 无法解析图片尺寸', { error: err.message })
    }

    // 5. 创建 media_files 记录
    const mediaRecord = await MediaFile.create({
      object_key: objectKey,
      thumbnail_keys: thumbnailKeys,
      original_name: originalName,
      file_size: processedBuffer.length,
      mime_type: mimeType,
      width,
      height,
      content_hash: contentHash,
      folder,
      uploaded_by: uploadedBy,
      status: 'active'
    })

    const publicUrl = getImageUrl(objectKey, contentHash)
    const thumbnails = this._buildThumbnailUrls(thumbnailKeys, contentHash)

    _logger.info('MediaService: 上传成功', {
      media_id: mediaRecord.media_id,
      object_key: objectKey,
      content_hash: contentHash
    })

    return {
      duplicate: false,
      media_id: mediaRecord.media_id,
      object_key: objectKey,
      thumbnail_keys: thumbnailKeys,
      public_url: publicUrl,
      thumbnails,
      width,
      height,
      file_size: processedBuffer.length,
      mime_type: mimeType,
      original_name: originalName
    }
  }

  /**
   * 创建媒体关联（media_attachment）
   *
   * @param {number} mediaId - 媒体文件 ID
   * @param {string} attachableType - 业务实体类型（exchange_item/lottery_prize/item_template/ad_creative 等）
   * @param {number} attachableId - 业务实体 ID
   * @param {string} [role='primary'] - 用途（primary/icon/banner/background/gallery）
   * @param {number} [sortOrder=0] - 排序
   * @param {Object} [meta] - 关联元数据（alt_text/crop_rect 等）
   * @param {Object} [transaction] - Sequelize 事务
   *
   * @returns {Promise<Object>} 创建的 attachment 记录
   */
  async attach(
    mediaId,
    attachableType,
    attachableId,
    role = 'primary',
    sortOrder = 0,
    meta = null,
    transaction = null
  ) {
    const opts = transaction ? { transaction } : {}

    const media = await MediaFile.findByPk(mediaId, opts)
    if (!media) {
      throw new BusinessError(`媒体文件不存在: media_id=${mediaId}`, 'SERVICE_NOT_FOUND', 404)
    }
    if (media.status !== 'active') {
      throw new BusinessError(
        `媒体文件状态异常，无法关联: status=${media.status}`,
        'SERVICE_ERROR',
        400
      )
    }

    const attachment = await MediaAttachment.create(
      {
        media_id: mediaId,
        attachable_type: attachableType,
        attachable_id: attachableId,
        role,
        sort_order: sortOrder,
        meta
      },
      opts
    )

    // role='primary' 时自动更新业务表 primary_media_id
    if (role === 'primary') {
      const mapping = PRIMARY_MEDIA_TABLES[attachableType]
      if (mapping) {
        const Model = models[mapping.modelName]
        if (Model && Model.rawAttributes?.primary_media_id) {
          await Model.update(
            { primary_media_id: mediaId },
            { where: { [mapping.pk]: attachableId }, ...opts }
          )
          _logger.info('MediaService: 已更新业务表 primary_media_id', {
            attachable_type: attachableType,
            attachable_id: attachableId,
            media_id: mediaId
          })
        }
      }
    }

    return attachment
  }

  /**
   * 移除媒体关联
   *
   * @param {string} attachableType - 业务实体类型
   * @param {number} attachableId - 业务实体 ID
   * @param {string} [role] - 可选，指定 role 时只删除该 role 的关联
   * @param {Object} [transaction] - Sequelize 事务
   *
   * @returns {Promise<number>} 删除的 attachment 数量
   */
  async detach(attachableType, attachableId, role = null, transaction = null) {
    const opts = transaction ? { transaction } : {}

    const where = {
      attachable_type: attachableType,
      attachable_id: attachableId
    }
    if (role) {
      where.role = role
    }

    const attachments = await MediaAttachment.findAll({ where, ...opts })
    if (attachments.length === 0) {
      return 0
    }

    const mediaIds = [...new Set(attachments.map(a => a.media_id))]
    const deletedCount = await MediaAttachment.destroy({ where, ...opts })

    // 若 role='primary'，清除业务表 primary_media_id
    if (role === 'primary' || !role) {
      const mapping = PRIMARY_MEDIA_TABLES[attachableType]
      if (mapping) {
        const Model = models[mapping.modelName]
        if (Model && Model.rawAttributes?.primary_media_id) {
          await Model.update(
            { primary_media_id: null },
            { where: { [mapping.pk]: attachableId }, ...opts }
          )
        }
      }
    }

    // 检查引用计数，若为 0 则移入回收站
    for (const mediaId of mediaIds) {
      // eslint-disable-next-line no-await-in-loop
      const refCount = await MediaAttachment.count({ where: { media_id: mediaId }, ...opts })
      if (refCount === 0) {
        // eslint-disable-next-line no-await-in-loop
        await MediaFile.update(
          { status: 'trashed', trashed_at: new Date() },
          { where: { media_id: mediaId }, ...opts }
        )
        _logger.info('MediaService: 媒体无引用，已移入回收站', { media_id: mediaId })
      }
    }

    return deletedCount
  }

  /**
   * 获取实体的媒体列表（含 public_url、thumbnails）
   *
   * @param {string} attachableType - 业务实体类型
   * @param {number} attachableId - 业务实体 ID
   * @param {string} [role] - 可选，按 role 过滤
   *
   * @returns {Promise<Array>} 媒体列表
   */
  async getMediaForEntity(attachableType, attachableId, role = null) {
    const where = {
      attachable_type: attachableType,
      attachable_id: attachableId
    }
    if (role) {
      where.role = role
    }

    const attachments = await MediaAttachment.findAll({
      where,
      include: [{ model: MediaFile, as: 'media', required: true }],
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC']
      ]
    })

    return attachments.map(att => {
      const m = att.media
      return {
        attachment_id: att.attachment_id,
        media_id: m.media_id,
        role: att.role,
        sort_order: att.sort_order,
        meta: att.meta,
        public_url: getImageUrl(m.object_key, m.content_hash),
        thumbnails: this._buildThumbnailUrls(m.thumbnail_keys, m.content_hash),
        width: m.width,
        height: m.height,
        original_name: m.original_name,
        file_size: m.file_size,
        mime_type: m.mime_type
      }
    })
  }

  /**
   * 原子替换媒体（detach 旧 + attach 新）
   *
   * @param {string} attachableType - 业务实体类型
   * @param {number} attachableId - 业务实体 ID
   * @param {string} role - 用途（通常为 primary）
   * @param {number} newMediaId - 新媒体 ID
   *
   * @returns {Promise<Object>} { detached, attached }
   */
  async replaceMedia(attachableType, attachableId, role, newMediaId) {
    const transaction = await sequelize.transaction()
    try {
      const detached = await this.detach(attachableType, attachableId, role, transaction)
      const attachment = await this.attach(
        newMediaId,
        attachableType,
        attachableId,
        role,
        0,
        null,
        transaction
      )
      await transaction.commit()
      return { detached, attached: attachment }
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }

  /**
   * 媒体库列表（分页、筛选）
   *
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.folder] - 文件夹
   * @param {string} [filters.status] - 状态：active|archived|trashed
   * @param {string|string[]} [filters.tags] - 标签（逗号分隔或数组）
   * @param {string} [filters.keyword] - 关键词（模糊匹配 original_name 文件名）
   * @param {Object} pagination - 分页
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=24] - 每页数量
   *
   * @returns {Promise<Object>} { items, pagination, stats }
   */
  async listMedia(filters = {}, pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 24))

    const where = {}
    if (filters.folder) where.folder = filters.folder
    if (filters.status) where.status = filters.status

    // 关键词：模糊匹配文件名 original_name（前端「搜索文件名」框对应字段）
    if (filters.keyword && String(filters.keyword).trim()) {
      where.original_name = { [Op.like]: `%${String(filters.keyword).trim()}%` }
    }

    if (filters.tags) {
      const tags = Array.isArray(filters.tags)
        ? filters.tags
        : String(filters.tags)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
      if (tags.length > 0) {
        where.tags = { [Op.ne]: null }
        // 标签为「任一命中」语义，用 Op.and 包裹避免与其他顶层条件的 Op.or 冲突
        where[Op.and] = [
          {
            [Op.or]: tags.map(tag => {
              const jsonVal = JSON.stringify(tag).replace(/'/g, "''")
              return sequelize.literal(`JSON_CONTAINS(COALESCE(tags,'[]'), '${jsonVal}', '$')`)
            })
          }
        ]
      }
    }

    const { count, rows } = await MediaFile.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['created_at', 'DESC']]
    })

    const items = rows.map(m => {
      return {
        media_id: m.media_id,
        object_key: m.object_key,
        original_name: m.original_name,
        file_size: m.file_size,
        mime_type: m.mime_type,
        width: m.width,
        height: m.height,
        folder: m.folder,
        tags: m.tags,
        status: m.status,
        trashed_at: m.trashed_at,
        uploaded_by: m.uploaded_by,
        created_at: m.created_at,
        public_url: getImageUrl(m.object_key, m.content_hash),
        thumbnails: this._buildThumbnailUrls(m.thumbnail_keys, m.content_hash)
      }
    })

    return {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      },
      stats: { total: count }
    }
  }

  /**
   * 获取媒体详情（含关联）
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<Object|null>} 媒体详情
   */
  async getMediaById(mediaId) {
    const media = await MediaFile.findByPk(mediaId, {
      include: [{ model: MediaAttachment, as: 'attachments', required: false }]
    })
    if (!media) return null

    const plain = media.get({ plain: true })
    return {
      ...plain,
      public_url: getImageUrl(plain.object_key, plain.content_hash),
      thumbnails: this._buildThumbnailUrls(plain.thumbnail_keys, plain.content_hash),
      attachments: (plain.attachments || []).map(a => ({
        attachment_id: a.attachment_id,
        attachable_type: a.attachable_type,
        attachable_id: a.attachable_id,
        role: a.role,
        sort_order: a.sort_order,
        meta: a.meta,
        created_at: a.created_at
      }))
    }
  }

  /**
   * 移入回收站（软删除）
   *
   * 治本 B+C（2026-06-24）：删除前先做引用完整性校验（RESTRICT）。
   * 只要该图仍被任一「实体引用图」外键列引用（primary_refs，见 MEDIA_REF_COLUMNS），
   * 即拒绝软删并抛 MEDIA_IN_USE（409），强制运营先在业务侧换图/下架——制度性根治「在用主图被误删」。
   * media_attachments 多态关联走 DB 层 CASCADE（删图连带删专属挂载），不在此拦截。
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<boolean>} 是否成功（true=已移入回收站）
   * @throws {BusinessError} MEDIA_IN_USE - 图片仍被业务实体引用，禁止删除
   */
  async moveToTrash(mediaId) {
    // 引用完整性校验：被任一外键直引时禁止删除（RESTRICT）
    const refs = await this.getReferences(mediaId)
    if (refs.primary_refs.length > 0) {
      throw new BusinessError(
        '图片正被商品/奖品/广告等引用，请先在对应业务中换图或下架后再删除',
        'MEDIA_IN_USE',
        409
      )
    }

    const [affected] = await MediaFile.update(
      { status: 'trashed', trashed_at: new Date() },
      { where: { media_id: mediaId, status: { [Op.ne]: 'trashed' } } }
    )
    return affected > 0
  }

  /**
   * 从回收站恢复
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async restore(mediaId) {
    const [affected] = await MediaFile.update(
      { status: 'active', trashed_at: null },
      { where: { media_id: mediaId, status: 'trashed' } }
    )
    return affected > 0
  }

  /**
   * 更新媒体元数据（tags、folder）
   *
   * @param {number} mediaId - 媒体 ID
   * @param {Object} updates - 更新字段
   * @param {string|string[]} [updates.tags] - 标签
   * @param {string} [updates.folder] - 文件夹
   * @returns {Promise<boolean>} 是否成功
   */
  async updateMetadata(mediaId, updates = {}) {
    const toUpdate = {}
    if (updates.tags !== undefined) {
      toUpdate.tags = Array.isArray(updates.tags)
        ? updates.tags
        : updates.tags
          ? [updates.tags]
          : null
    }
    if (updates.folder !== undefined) toUpdate.folder = updates.folder
    if (Object.keys(toUpdate).length === 0) return false
    const [affected] = await MediaFile.update(toUpdate, { where: { media_id: mediaId } })
    return affected > 0
  }

  /**
   * 移除指定媒体与实体的关联（单条 attachment）
   *
   * @param {number} mediaId - 媒体 ID
   * @param {string} attachableType - 业务实体类型
   * @param {number} attachableId - 业务实体 ID
   * @param {string} [role] - 用途（可选）
   * @returns {Promise<number>} 删除的 attachment 数量
   */
  async detachMediaFromEntity(mediaId, attachableType, attachableId, role = null) {
    const where = {
      media_id: mediaId,
      attachable_type: attachableType,
      attachable_id: attachableId
    }
    if (role) where.role = role

    const deleted = await MediaAttachment.destroy({ where })
    if (deleted > 0) {
      const refCount = await MediaAttachment.count({ where: { media_id: mediaId } })
      if (refCount === 0) {
        await MediaFile.update(
          { status: 'trashed', trashed_at: new Date() },
          { where: { media_id: mediaId } }
        )
      }
    }
    return deleted
  }

  /**
   * 查找孤立媒体（无关联且创建时间超过阈值）
   *
   * @param {number} [olderThanHours=24] - 超过多少小时
   *
   * @returns {Promise<Array>} 孤立的 media_files
   */
  async getOrphanedMedia(olderThanHours = 24) {
    const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)

    // 引用来源1：media_attachments 多态关联（gallery/icon/banner 等）
    const attachedMediaIds = await MediaAttachment.findAll({
      attributes: ['media_id'],
      raw: true
    }).then(rows => rows.map(r => r.media_id))

    /*
     * 引用来源2（治本 B - 2026-06-24）：全部「实体引用图」外键列直引。
     * 连真实库核实共 10 处 / 8 表（见 MEDIA_REF_COLUMNS）：除 4 张 primary_media_id 外，
     * 还有 categories.icon_media_id、diy_templates.{base_image,preview}_media_id、
     * diy_works.preview_media_id、exchange_item_skus.image_id、diy_materials.image_media_id。
     * 旧逻辑仅覆盖 4 张 primary 表，遗漏其余 6 处 → 仍存在「白名单漏列误删在用图」高危。
     * 此处统一用 MEDIA_REF_COLUMNS 驱动，把全部引用列纳入「已引用」集合，杜绝误删。
     */
    const referencedMediaIds = []
    for (const [modelName, column] of MEDIA_REF_COLUMNS) {
      const Model = models[modelName]
      if (!Model || !Model.rawAttributes?.[column]) continue
      // eslint-disable-next-line no-await-in-loop
      const rows = await Model.findAll({
        attributes: [column],
        where: { [column]: { [Op.ne]: null } },
        raw: true
      })
      rows.forEach(r => referencedMediaIds.push(r[column]))
    }

    // 合并所有引用来源，得到"在用 media_id"全集
    const usedMediaIds = [...new Set([...attachedMediaIds, ...referencedMediaIds])]

    const orphans = await MediaFile.findAll({
      where: {
        media_id: { [Op.notIn]: usedMediaIds.length > 0 ? usedMediaIds : [0] },
        status: 'active',
        created_at: { [Op.lt]: threshold }
      },
      order: [['created_at', 'ASC']]
    })

    return orphans
  }

  /**
   * 查询某张图被哪些业务实体引用（治本 B - 2026-06-24，删除前 RESTRICT 校验 + 后台引用清单）
   *
   * 聚合两类引用来源：
   * - 多态关联：media_attachments（按 attachable_type/attachable_id/role 列出）
   * - 外键直引：MEDIA_REF_COLUMNS 全 10 处「实体引用图」列
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<Object>} { media_id, attachments:[], primary_refs:[], total }
   */
  async getReferences(mediaId) {
    // 1. 多态关联引用
    const attachments = await MediaAttachment.findAll({
      where: { media_id: mediaId },
      attributes: ['attachment_id', 'attachable_type', 'attachable_id', 'role'],
      raw: true
    })

    // 2. 外键直引（遍历全 10 处引用列）
    const primaryRefs = []
    for (const [modelName, column, pk] of MEDIA_REF_COLUMNS) {
      const Model = models[modelName]
      if (!Model || !Model.rawAttributes?.[column]) continue
      // eslint-disable-next-line no-await-in-loop
      const rows = await Model.findAll({
        attributes: [pk],
        where: { [column]: mediaId },
        raw: true
      })
      rows.forEach(r => primaryRefs.push({ table: Model.tableName, column, entity_id: r[pk] }))
    }

    return {
      media_id: mediaId,
      attachments: attachments.map(a => ({
        attachment_id: a.attachment_id,
        attachable_type: a.attachable_type,
        attachable_id: a.attachable_id,
        role: a.role
      })),
      primary_refs: primaryRefs,
      total: attachments.length + primaryRefs.length
    }
  }

  /**
   * 清理孤立媒体（治本 C - 2026-06-24：只软删进回收站，不再自动物理删）
   *
   * 制度性根治本次事故：定时任务永不直接物理删「在用资源」。
   * 孤儿（无任何引用 + 创建超过阈值）只置 status='trashed'，进 30 天回收站；
   * 真正物理删只由 cleanup() 对「已软删且过期 30 天」的项执行。
   * 即便 getOrphanedMedia 判断有误，最坏后果也只是「图被移入回收站」，30 天内可恢复，绝不丢原图。
   *
   * @param {number} [olderThanHours=24] - 超过多少小时未绑定才视为孤儿
   * @returns {Promise<Object>} { trashed_count, total_found, details, timestamp }
   */
  async cleanupOrphanedMedia(olderThanHours = 24) {
    const orphans = await this.getOrphanedMedia(olderThanHours)

    if (orphans.length === 0) {
      return {
        trashed_count: 0,
        total_found: 0,
        details: [],
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    }

    // 只软删进回收站（不碰对象存储、不物理删 DB 记录）
    const orphanIds = orphans.map(m => m.media_id)
    const [trashedCount] = await MediaFile.update(
      { status: 'trashed', trashed_at: new Date() },
      { where: { media_id: { [Op.in]: orphanIds }, status: 'active' } }
    )

    _logger.info('MediaService: 孤立媒体已软删进回收站（不物理删）', {
      total_found: orphans.length,
      trashed_count: trashedCount
    })

    return {
      trashed_count: trashedCount,
      total_found: orphans.length,
      details: orphanIds.map(media_id => ({ media_id, action: 'moved_to_trash' })),
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 物理清理（回收站中超过保留期的文件，治本 C - 2026-06-24 保留期定稿 30 天）
   *
   * @param {number} [olderThanDays=30] - 回收站保留期（天）；交易平台举证窗口，覆盖售后周期
   *
   * @returns {Promise<Object>} { cleaned_count, failed_count, details }
   */
  async cleanup(olderThanDays = 30) {
    const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const trashed = await MediaFile.findAll({
      where: {
        status: 'trashed',
        trashed_at: { [Op.lt]: threshold }
      }
    })

    const storage = this._getStorageService()
    let cleanedCount = 0
    let failedCount = 0
    const details = []

    for (const m of trashed) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await storage.deleteImageWithThumbnails(m.object_key, m.thumbnail_keys)
        // eslint-disable-next-line no-await-in-loop
        await MediaFile.destroy({ where: { media_id: m.media_id } })
        cleanedCount++
        details.push({ media_id: m.media_id, success: true })
      } catch (err) {
        failedCount++
        details.push({ media_id: m.media_id, success: false, error: err.message })
        _logger.error('MediaService: 物理清理失败', { media_id: m.media_id, error: err.message })
      }
    }

    return {
      cleaned_count: cleanedCount,
      failed_count: failedCount,
      total_found: trashed.length,
      details,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 存储概览（按文件夹统计）
   *
   * @returns {Promise<Array>} 文件夹统计列表
   */
  async getStorageOverview() {
    const rows = await MediaFile.sequelize.query(
      `
      SELECT folder, COUNT(*) as file_count, COALESCE(SUM(file_size), 0) as total_size
      FROM media_files
      WHERE status = 'active'
      GROUP BY folder
      ORDER BY total_size DESC
    `,
      { type: QueryTypes.SELECT }
    )
    return (rows || []).map(r => ({
      folder: r.folder,
      file_count: Number(r.file_count),
      total_size: Number(r.total_size)
    }))
  }

  /**
   * 回收站列表
   *
   * @param {Object} [pagination] - 分页
   * @returns {Promise<Object>} { items, pagination }
   */
  async getTrashList(pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 24))

    const { count, rows } = await MediaFile.findAndCountAll({
      where: { status: 'trashed' },
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['trashed_at', 'DESC']]
    })

    const items = rows.map(m => {
      return {
        media_id: m.media_id,
        original_name: m.original_name,
        file_size: m.file_size,
        folder: m.folder,
        trashed_at: m.trashed_at,
        public_url: getImageUrl(m.object_key, m.content_hash),
        thumbnails: this._buildThumbnailUrls(m.thumbnail_keys, m.content_hash)
      }
    })

    return {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total: count,
        total_pages: Math.ceil(count / pageSize)
      }
    }
  }

  /**
   * 查找重复文件（相同 content_hash）
   *
   * @returns {Promise<Array>} 重复组列表
   */
  async getDuplicates() {
    const rows = await MediaFile.sequelize.query(
      `
      SELECT content_hash, COUNT(*) as cnt, GROUP_CONCAT(media_id) as media_ids
      FROM media_files
      WHERE content_hash IS NOT NULL AND status = 'active'
      GROUP BY content_hash
      HAVING cnt > 1
    `,
      { type: QueryTypes.SELECT }
    )

    return (rows || []).map(r => ({
      content_hash: r.content_hash,
      count: Number(r.cnt),
      media_ids: (r.media_ids || '')
        .split(',')
        .map(id => parseInt(id, 10))
        .filter(Boolean)
    }))
  }

  /**
   * 批量上传
   *
   * @param {Array<{buffer: Buffer, options: Object}>} files - 文件列表
   *
   * @returns {Promise<Array>} 上传结果列表
   */
  async batchUpload(files) {
    const results = []
    for (const { buffer, options = {} } of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await this.upload(buffer, options)
        results.push({ success: true, ...result })
      } catch (err) {
        results.push({ success: false, error: err.message })
      }
    }
    return results
  }

  /**
   * 批量创建关联
   *
   * @param {Array<Object>} attachments - 关联列表 {mediaId, attachableType, attachableId, role?, sortOrder?, meta?}
   * @returns {Promise<Array>} 创建的 attachment 列表
   */
  async batchAttach(attachments) {
    const results = []
    for (const att of attachments) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const a = await this.attach(
          att.mediaId,
          att.attachableType,
          att.attachableId,
          att.role ?? 'primary',
          att.sortOrder ?? 0,
          att.meta ?? null
        )
        results.push({ success: true, attachment: a })
      } catch (err) {
        results.push({ success: false, error: err.message })
      }
    }
    return results
  }

  /**
   * 批量移除关联
   *
   * @param {string} attachableType - 业务实体类型
   * @param {number[]} attachableIds - 业务实体 ID 列表
   *
   * @returns {Promise<number>} 删除的 attachment 总数
   */
  async batchDetach(attachableType, attachableIds) {
    let total = 0
    for (const id of attachableIds) {
      // eslint-disable-next-line no-await-in-loop
      const count = await this.detach(attachableType, id)
      total += count
    }
    return total
  }

  /**
   * 立即彻底删除单条（N1 - 仅限回收站内的项；物理删原图 + 全衍生 + DB 记录）
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<Object>} { media_id, deleted_objects, freed_bytes }
   * @throws {BusinessError} MEDIA_NOT_IN_TRASH - 不在回收站，禁止直接彻底删
   */
  async purgeOne(mediaId) {
    const media = await MediaFile.findByPk(mediaId)
    if (!media) {
      throw new BusinessError(`媒体不存在: media_id=${mediaId}`, 'SERVICE_NOT_FOUND', 404)
    }
    if (media.status !== 'trashed') {
      throw new BusinessError('只能彻底删除回收站内的项，请先移入回收站', 'MEDIA_NOT_IN_TRASH', 409)
    }
    const storage = this._getStorageService()
    const deletedObjects = [media.object_key, ...Object.values(media.thumbnail_keys || {})].filter(
      Boolean
    )
    await storage.deleteImageWithThumbnails(media.object_key, media.thumbnail_keys)
    const freedBytes = media.file_size || 0
    await MediaFile.destroy({ where: { media_id: mediaId } })
    _logger.info('MediaService: 已彻底删除媒体', { media_id: mediaId, freed_bytes: freedBytes })
    return { media_id: mediaId, deleted_objects: deletedObjects, freed_bytes: freedBytes }
  }

  /**
   * 缺原图核对（N3 - 连对象存储校验 active 图原图是否真实存在）
   *
   * 直接预防本次「DB 有记录但对象存储缺原图」事故复发。规模小（实测 26 文件）实时逐个 headObject。
   *
   * @param {Object} [filters] - 筛选
   * @param {string} [filters.folder] - 限定文件夹
   * @param {number} [filters.limit=500] - 最多核对条数（护栏）
   * @returns {Promise<Object>} { items:[{media_id,object_key,missing:true}], total }
   */
  async getDamagedMedia(filters = {}) {
    const where = { status: 'active' }
    if (filters.folder) where.folder = filters.folder
    const limit = Math.min(2000, parseInt(filters.limit, 10) || 500)
    const rows = await MediaFile.findAll({ where, limit, order: [['created_at', 'DESC']] })
    const storage = this._getStorageService()
    const items = []
    for (const m of rows) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await storage.fileExists(m.object_key)
      if (!exists) {
        items.push({
          media_id: m.media_id,
          object_key: m.object_key,
          original_name: m.original_name,
          folder: m.folder,
          missing: true
        })
      }
    }
    return { items, total: items.length }
  }

  /**
   * 删除影响预览（N4 - 删图前预告连带删多少衍生 / 解除多少关联 / 释放多少空间）
   *
   * 复用 getReferences 聚合引用；blocked_by_primary=true 时前端应禁用删除并提示先换图/下架。
   *
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<Object>} 影响预览
   * @throws {BusinessError} SERVICE_NOT_FOUND - 媒体不存在
   */
  async previewDelete(mediaId) {
    const media = await MediaFile.findByPk(mediaId)
    if (!media) {
      throw new BusinessError(`媒体不存在: media_id=${mediaId}`, 'SERVICE_NOT_FOUND', 404)
    }
    const refs = await this.getReferences(mediaId)
    const derivedKeys = Object.values(media.thumbnail_keys || {}).filter(Boolean)
    return {
      media_id: mediaId,
      derived_keys: derivedKeys,
      derived_count: derivedKeys.length,
      reference_count: refs.total,
      attachments_to_cascade: refs.attachments.length,
      primary_refs: refs.primary_refs,
      blocked_by_primary: refs.primary_refs.length > 0,
      freed_bytes_estimate: media.file_size || 0
    }
  }

  /**
   * 媒体引用率/使用情况列表（N5 - 在 listMedia 基础上标注每张图被引用次数，支持「仅未使用」筛选）
   *
   * 引用次数 = media_attachments 计数 + 全 10 处外键直引计数（MEDIA_REF_COLUMNS）。
   *
   * @param {Object} [filters] - 筛选（含 listMedia 的 folder/status/tags + unused_only）
   * @param {Object} [pagination] - 分页 { page, page_size }
   * @returns {Promise<Object>} { items, pagination }（items 每项含 reference_count）
   */
  async listMediaWithUsage(filters = {}, pagination = {}) {
    const base = await this.listMedia(filters, pagination)
    // 批量统计本页 media 的引用次数（避免 N+1：一次性查 attachments + 各外键表）
    const ids = base.items.map(i => i.media_id)
    const refCount = new Map(ids.map(id => [id, 0]))
    if (ids.length > 0) {
      const atts = await MediaAttachment.findAll({
        where: { media_id: { [Op.in]: ids } },
        attributes: ['media_id'],
        raw: true
      })
      atts.forEach(a => refCount.set(a.media_id, (refCount.get(a.media_id) || 0) + 1))
      for (const [modelName, column] of MEDIA_REF_COLUMNS) {
        const Model = models[modelName]
        if (!Model || !Model.rawAttributes?.[column]) continue
        // eslint-disable-next-line no-await-in-loop
        const rows = await Model.findAll({
          where: { [column]: { [Op.in]: ids } },
          attributes: [column],
          raw: true
        })
        rows.forEach(r => refCount.set(r[column], (refCount.get(r[column]) || 0) + 1))
      }
    }
    let items = base.items.map(i => ({ ...i, reference_count: refCount.get(i.media_id) || 0 }))
    if (filters.unused_only === true || filters.unused_only === 'true') {
      items = items.filter(i => i.reference_count === 0)
    }
    return { items, pagination: base.pagination }
  }

  /**
   * 存量批量优化（N6 - 对存量 media 重新预生成 w375/w750/w1080 衍生图并回写 thumbnail_keys）
   *
   * 用于 D+E 上线后回填存量：读原图 → 走 SealosStorageService 同款 sharp 预生成链 → 更新 thumbnail_keys。
   * 仅处理 active 且原图存在的项；原图缺失的跳过（由 N3 缺原图核对引导运营重传）。
   *
   * @param {Object} [options] - 选项
   * @param {string} [options.folder] - 限定文件夹
   * @param {number[]} [options.media_ids] - 指定 media_id 列表（优先于 folder）
   * @param {boolean} [options.dry_run=false] - 只统计不实际处理
   * @returns {Promise<Object>} { processed, succeeded, failed, skipped, details }
   */
  async batchOptimize(options = {}) {
    const where = { status: 'active' }
    if (Array.isArray(options.media_ids) && options.media_ids.length > 0) {
      where.media_id = { [Op.in]: options.media_ids }
    } else if (options.folder) {
      where.folder = options.folder
    }
    const rows = await MediaFile.findAll({ where, order: [['media_id', 'ASC']] })
    const dryRun = options.dry_run === true || options.dry_run === 'true'
    const storage = this._getStorageService()
    const details = []
    let succeeded = 0
    let failed = 0
    let skipped = 0

    for (const m of rows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const exists = await storage.fileExists(m.object_key)
        if (!exists) {
          skipped++
          details.push({ media_id: m.media_id, skipped: true, reason: 'original_missing' })
          continue
        }
        if (dryRun) {
          succeeded++
          details.push({ media_id: m.media_id, dry_run: true })
          continue
        }
        // 为已存在原图重新预生成全部宽度档衍生（保持 object_key 稳定，不重传原图）
        // eslint-disable-next-line no-await-in-loop
        const newKeys = await storage.generateDerivativesForExisting(m.object_key)
        // eslint-disable-next-line no-await-in-loop
        await MediaFile.update({ thumbnail_keys: newKeys }, { where: { media_id: m.media_id } })
        succeeded++
        details.push({ media_id: m.media_id, thumbnail_keys: newKeys })
      } catch (err) {
        failed++
        details.push({ media_id: m.media_id, error: err.message })
        _logger.error('MediaService: 存量优化失败', { media_id: m.media_id, error: err.message })
      }
    }

    return { processed: rows.length, succeeded, failed, skipped, details }
  }
}

module.exports = MediaService
