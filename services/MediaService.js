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

const crypto = require('crypto')
const sharp = require('sharp')
const { Op } = require('sequelize')
const { sequelize } = require('../config/database')
const { getImageUrl } = require('../utils/ImageUrlHelper')
const _logger = require('../utils/logger').logger

/** 业务表 primary_media_id 映射（attach role='primary' 时自动更新） */
const PRIMARY_MEDIA_TABLES = {
  exchange_item: { modelName: 'ExchangeItem', pk: 'exchange_item_id' },
  lottery_prize: { modelName: 'LotteryPrize', pk: 'lottery_prize_id' },
  item_template: { modelName: 'ItemTemplate', pk: 'item_template_id' },
  ad_creative: { modelName: 'AdCreative', pk: 'ad_creative_id' }
}

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
   * 验证文件（MIME、大小）
   * @private
   * @param {string} mimeType - MIME 类型
   * @param {number} fileSize - 文件大小（字节）
   * @returns {void}
   */
  _validateFile(mimeType, fileSize) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`不支持的图片格式：${mimeType}，允许：${ALLOWED_MIME_TYPES.join('/')}`)
    }
    if (fileSize > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / 1024 / 1024
      const actualMB = (fileSize / 1024 / 1024).toFixed(2)
      throw new Error(`文件过大：${actualMB}MB，最大允许：${maxMB}MB`)
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
    const mimeType = options.mime_type || 'image/jpeg'
    const uploadedBy = options.uploaded_by ?? null

    this._validateFile(mimeType, fileBuffer.length)

    // 1. 计算 content_hash（SHA-256）
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

    const { MediaFile } = require('../models')

    // 2. 检查重复（按 content_hash）
    const existing = await MediaFile.findOne({
      where: { content_hash: contentHash, status: 'active' }
    })

    if (existing) {
      const publicUrl = getImageUrl(existing.object_key)
      const thumbnailKeys = existing.thumbnail_keys || {}
      const thumbnails = {
        small: thumbnailKeys.small ? getImageUrl(thumbnailKeys.small) : null,
        medium: thumbnailKeys.medium ? getImageUrl(thumbnailKeys.medium) : null,
        large: thumbnailKeys.large ? getImageUrl(thumbnailKeys.large) : null
      }
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

    // 3. 上传到 Sealos（含缩略图）
    const storage = this._getStorageService()
    const { original_key: objectKey, thumbnail_keys: thumbnailKeys } =
      await storage.uploadImageWithThumbnails(fileBuffer, originalName, folder)

    // 4. 获取 width/height（sharp.metadata）
    let width = null
    let height = null
    try {
      const metadata = await sharp(fileBuffer).metadata()
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
      file_size: fileBuffer.length,
      mime_type: mimeType,
      width,
      height,
      content_hash: contentHash,
      folder,
      uploaded_by: uploadedBy,
      status: 'active'
    })

    const publicUrl = getImageUrl(objectKey)
    const thumbnails = {
      small: thumbnailKeys?.small ? getImageUrl(thumbnailKeys.small) : null,
      medium: thumbnailKeys?.medium ? getImageUrl(thumbnailKeys.medium) : null,
      large: thumbnailKeys?.large ? getImageUrl(thumbnailKeys.large) : null
    }

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
      file_size: fileBuffer.length,
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
    const { MediaFile, MediaAttachment } = require('../models')
    const models = require('../models')
    const opts = transaction ? { transaction } : {}

    const media = await MediaFile.findByPk(mediaId, opts)
    if (!media) {
      throw new Error(`媒体文件不存在: media_id=${mediaId}`)
    }
    if (media.status !== 'active') {
      throw new Error(`媒体文件状态异常，无法关联: status=${media.status}`)
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
    const { MediaAttachment, MediaFile } = require('../models')
    const models = require('../models')
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
    const { MediaAttachment, MediaFile } = require('../models')

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
      const thumbKeys = m.thumbnail_keys || {}
      return {
        attachment_id: att.attachment_id,
        media_id: m.media_id,
        role: att.role,
        sort_order: att.sort_order,
        meta: att.meta,
        public_url: getImageUrl(m.object_key),
        thumbnails: {
          small: thumbKeys.small ? getImageUrl(thumbKeys.small) : null,
          medium: thumbKeys.medium ? getImageUrl(thumbKeys.medium) : null,
          large: thumbKeys.large ? getImageUrl(thumbKeys.large) : null
        },
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
   * @param {Object} pagination - 分页
   * @param {number} [pagination.page=1] - 页码
   * @param {number} [pagination.page_size=24] - 每页数量
   *
   * @returns {Promise<Object>} { items, pagination, stats }
   */
  async listMedia(filters = {}, pagination = {}) {
    const { MediaFile } = require('../models')
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 24))

    const where = {}
    if (filters.folder) where.folder = filters.folder
    if (filters.status) where.status = filters.status
    if (filters.tags) {
      const tags = Array.isArray(filters.tags)
        ? filters.tags
        : String(filters.tags)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
      if (tags.length > 0) {
        where.tags = { [Op.ne]: null }
        where[Op.or] = tags.map(tag => {
          const jsonVal = JSON.stringify(tag).replace(/'/g, "''")
          return sequelize.literal(`JSON_CONTAINS(COALESCE(tags,'[]'), '${jsonVal}', '$')`)
        })
      }
    }

    const { count, rows } = await MediaFile.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['created_at', 'DESC']]
    })

    const items = rows.map(m => {
      const thumbKeys = m.thumbnail_keys || {}
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
        public_url: getImageUrl(m.object_key),
        thumbnails: {
          small: thumbKeys.small ? getImageUrl(thumbKeys.small) : null,
          medium: thumbKeys.medium ? getImageUrl(thumbKeys.medium) : null,
          large: thumbKeys.large ? getImageUrl(thumbKeys.large) : null
        }
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
    const { MediaFile, MediaAttachment } = require('../models')
    const media = await MediaFile.findByPk(mediaId, {
      include: [{ model: MediaAttachment, as: 'attachments', required: false }]
    })
    if (!media) return null

    const plain = media.get({ plain: true })
    const thumbKeys = plain.thumbnail_keys || {}
    return {
      ...plain,
      public_url: getImageUrl(plain.object_key),
      thumbnails: {
        small: thumbKeys.small ? getImageUrl(thumbKeys.small) : null,
        medium: thumbKeys.medium ? getImageUrl(thumbKeys.medium) : null,
        large: thumbKeys.large ? getImageUrl(thumbKeys.large) : null
      },
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
   * @param {number} mediaId - 媒体 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async moveToTrash(mediaId) {
    const { MediaFile } = require('../models')
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
    const { MediaFile } = require('../models')
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
    const { MediaFile } = require('../models')
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
    const { MediaAttachment, MediaFile } = require('../models')
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
    const { MediaFile, MediaAttachment } = require('../models')
    const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)

    const attachedMediaIds = await MediaAttachment.findAll({
      attributes: ['media_id'],
      raw: true
    }).then(rows => [...new Set(rows.map(r => r.media_id))])

    const orphans = await MediaFile.findAll({
      where: {
        media_id: { [Op.notIn]: attachedMediaIds.length > 0 ? attachedMediaIds : [0] },
        status: 'active',
        created_at: { [Op.lt]: threshold }
      },
      order: [['created_at', 'ASC']]
    })

    return orphans
  }

  /**
   * 清理孤立媒体（无关联且创建超过阈值小时数）
   * 等价于 ImageService.cleanupUnboundImages，针对 media_files 表
   *
   * @param {number} [olderThanHours=24] - 超过多少小时未绑定
   * @returns {Promise<Object>} { cleaned_count, failed_count, total_found, details, timestamp }
   */
  async cleanupOrphanedMedia(olderThanHours = 24) {
    const BeijingTimeHelper = require('../utils/timeHelper')
    const orphans = await this.getOrphanedMedia(olderThanHours)

    if (orphans.length === 0) {
      return {
        cleaned_count: 0,
        failed_count: 0,
        total_found: 0,
        details: [],
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    }

    const storage = this._getStorageService()
    const { MediaFile } = require('../models')
    let cleanedCount = 0
    let failedCount = 0
    const details = []

    for (const m of orphans) {
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
        _logger.error('MediaService: 孤立媒体清理失败', {
          media_id: m.media_id,
          error: err.message
        })
      }
    }

    return {
      cleaned_count: cleanedCount,
      failed_count: failedCount,
      total_found: orphans.length,
      details,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 物理清理（回收站中超过阈值的文件）
   *
   * @param {number} [olderThanDays=7] - 回收站超过多少天
   *
   * @returns {Promise<Object>} { cleaned_count, failed_count, details }
   */
  async cleanup(olderThanDays = 7) {
    const { MediaFile } = require('../models')
    const BeijingTimeHelper = require('../utils/timeHelper')
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
    const { MediaFile } = require('../models')
    const { QueryTypes } = require('sequelize')
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
    const { MediaFile } = require('../models')
    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 24))

    const { count, rows } = await MediaFile.findAndCountAll({
      where: { status: 'trashed' },
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['trashed_at', 'DESC']]
    })

    const items = rows.map(m => {
      const thumbKeys = m.thumbnail_keys || {}
      return {
        media_id: m.media_id,
        original_name: m.original_name,
        file_size: m.file_size,
        folder: m.folder,
        trashed_at: m.trashed_at,
        public_url: getImageUrl(m.object_key),
        thumbnails: {
          small: thumbKeys.small ? getImageUrl(thumbKeys.small) : null,
          medium: thumbKeys.medium ? getImageUrl(thumbKeys.medium) : null,
          large: thumbKeys.large ? getImageUrl(thumbKeys.large) : null
        }
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
    const { MediaFile } = require('../models')
    const { QueryTypes } = require('sequelize')
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
}

module.exports = MediaService
