/**
 * 媒体管理路由
 *
 * @description 媒体库 CRUD、上传、关联、批量操作
 * @route /api/v4/console/media
 * @version 1.0.0
 * @date 2026-03-16
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')

/**
 * Multer 配置：内存存储，5MB，jpeg/png/gif/webp
 */
/*
 * multer 接收上限提高到 20MB：让超过 5MB 的原图也能到达服务器，
 * 由 MediaService.upload 内的 sharp 自动压缩到 5MB 以内（压不下去才拒绝）。
 * 20MB 是接收护栏，防止超大文件占满内存。
 */
const storage = multer.memoryStorage()
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024
const uploadSingle = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
  }
})
const uploadBatch = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
  }
})

/**
 * POST /api/v4/console/media/upload
 *
 * @description 上传单张图片到媒体库
 * @body {string} [folder='uploads'] - 存储文件夹
 * @body {string} [trim_transparent='false'] - 是否裁剪透明边距（DIY 素材图场景传 'true'）
 */
router.post(
  '/upload',
  authenticateToken,
  requireRoleLevel(100),
  uploadSingle.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.apiError('请选择要上传的图片文件', 'MISSING_FILE', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.upload(req.file.buffer, {
      folder: req.body.folder || 'uploads',
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      uploaded_by: req.user?.user_id,
      trim_transparent: req.body.trim_transparent === 'true' || req.body.trim_transparent === true
    })
    return res.apiSuccess(result, '文件上传成功')
  })
)

/**
 * POST /api/v4/console/media/batch-upload
 */
router.post(
  '/batch-upload',
  authenticateToken,
  requireRoleLevel(100),
  uploadBatch.array('images', 10),
  asyncHandler(async (req, res) => {
    const files = req.files || []
    if (files.length === 0) {
      return res.apiError('请选择要上传的图片文件', 'MISSING_FILES', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const filesPayload = files.map(f => ({
      buffer: f.buffer,
      options: {
        folder: req.body.folder || 'uploads',
        original_name: f.originalname,
        mime_type: f.mimetype,
        uploaded_by: req.user?.user_id
      }
    }))
    const results = await mediaService.batchUpload(filesPayload)
    return res.apiSuccess({ results }, '批量上传完成')
  })
)

/**
 * POST /api/v4/console/media/batch-attach
 */
router.post(
  '/batch-attach',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { attachments } = req.body
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return res.apiError('缺少 attachments 数组', 'MISSING_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const payload = attachments.map(a => ({
      mediaId: a.media_id,
      attachableType: a.attachable_type,
      attachableId: parseInt(a.attachable_id, 10),
      role: a.role || 'primary',
      sortOrder: a.sort_order ?? 0,
      meta: a.meta ?? null
    }))
    const results = await mediaService.batchAttach(payload)
    return res.apiSuccess({ results }, '批量关联完成')
  })
)

/**
 * POST /api/v4/console/media/batch-detach
 */
router.post(
  '/batch-detach',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { attachable_type: attachableType, attachable_ids: attachableIds } = req.body
    if (!attachableType || !Array.isArray(attachableIds) || attachableIds.length === 0) {
      return res.apiError('缺少 attachable_type 或 attachable_ids', 'MISSING_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const ids = attachableIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    const total = await mediaService.batchDetach(attachableType, ids)
    return res.apiSuccess({ detached_count: total }, '批量解除关联完成')
  })
)

/**
 * GET /api/v4/console/media
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { page, page_size: pageSize, folder, status, tags, keyword } = req.query
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.listMedia(
      { folder, status, tags, keyword },
      { page, page_size: pageSize }
    )
    return res.apiSuccess(result, '获取媒体库列表成功')
  })
)

/**
 * GET /api/v4/console/media/by-entity/:attachable_type/:attachable_id
 */
router.get(
  '/by-entity/:attachable_type/:attachable_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { attachable_type: attachableType, attachable_id: attachableId } = req.params
    const attachableIdNum = parseInt(attachableId, 10)
    if (isNaN(attachableIdNum)) {
      return res.apiError('无效的 attachable_id', 'INVALID_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const items = await mediaService.getMediaForEntity(
      attachableType,
      attachableIdNum,
      req.query.role
    )
    return res.apiSuccess({ items, total: items.length }, '获取实体媒体列表成功')
  })
)

/**
 * GET /api/v4/console/media/usage
 *
 * @description 媒体引用率/未使用筛选（N5）：列表每项附 reference_count，支持 unused_only=true 仅看未使用。
 * @note 该路由须在 /:media_id 动态路由之前声明，避免 'usage' 被当作 media_id。
 */
router.get(
  '/usage',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const {
      page,
      page_size: pageSize,
      folder,
      status,
      tags,
      keyword,
      unused_only: unusedOnly
    } = req.query
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.listMediaWithUsage(
      { folder, status, tags, keyword, unused_only: unusedOnly },
      { page, page_size: pageSize }
    )
    return res.apiSuccess(result, '获取媒体使用情况成功')
  })
)

/**
 * GET /api/v4/console/media/:media_id
 */
router.get(
  '/:media_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const media = await mediaService.getMediaById(mediaId)
    if (!media) {
      return res.apiError('媒体不存在', 'MEDIA_NOT_FOUND', null, 404)
    }
    return res.apiSuccess(media, '获取媒体详情成功')
  })
)

/**
 * DELETE /api/v4/console/media/:media_id
 *
 * @description 移入回收站（软删）。治本 B：被任一「实体引用图」外键引用时返回 409 MEDIA_IN_USE
 *              并附引用清单，前端展示「请先换图/下架」指引；media_attachments 走 DB 层 CASCADE。
 */
router.delete(
  '/:media_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    let ok
    try {
      ok = await mediaService.moveToTrash(mediaId)
    } catch (err) {
      // 被引用拦截（RESTRICT）：附引用清单，引导先换图/下架
      if (err.code === 'MEDIA_IN_USE') {
        const refs = await mediaService.getReferences(mediaId)
        return res.apiError(err.message, 'MEDIA_IN_USE', { references: refs }, 409)
      }
      throw err
    }
    if (!ok) {
      return res.apiError('媒体不存在或已移入回收站', 'MOVE_FAILED', null, 404)
    }
    // 危险操作留痕（治本配套：删图/恢复/彻底删全留痕）
    const AuditLogService = req.app.locals.services.getService('audit_log')
    await AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: 'media_delete',
      target_type: 'media_file',
      target_id: mediaId,
      action: 'move_to_trash',
      reason: '管理员将媒体移入回收站',
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    }).catch(() => {})
    return res.apiSuccess({ media_id: mediaId }, '已移入回收站')
  })
)

/**
 * PATCH /api/v4/console/media/:media_id
 */
router.patch(
  '/:media_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const { tags, folder } = req.body
    if (tags === undefined && folder === undefined) {
      return res.apiError('缺少可更新的参数（支持：tags, folder）', 'MISSING_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const ok = await mediaService.updateMetadata(mediaId, { tags, folder })
    if (!ok) {
      return res.apiError('媒体不存在或更新失败', 'UPDATE_FAILED', null, 404)
    }
    return res.apiSuccess({ media_id: mediaId }, '元数据更新成功')
  })
)

/**
 * POST /api/v4/console/media/:media_id/restore
 */
router.post(
  '/:media_id/restore',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const ok = await mediaService.restore(mediaId)
    if (!ok) {
      return res.apiError('媒体不存在或不在回收站', 'RESTORE_FAILED', null, 404)
    }
    const AuditLogService = req.app.locals.services.getService('audit_log')
    await AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: 'media_restore',
      target_type: 'media_file',
      target_id: mediaId,
      action: 'restore',
      reason: '管理员从回收站恢复媒体',
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    }).catch(() => {})
    return res.apiSuccess({ media_id: mediaId }, '已从回收站恢复')
  })
)

/**
 * GET /api/v4/console/media/:media_id/references
 *
 * @description 查某图全部引用（治本 B）：聚合 media_attachments + 全 9 处外键直引，
 *              供删除拦截弹窗展示「被哪些商品/奖品/广告以何方式引用」。
 */
router.get(
  '/:media_id/references',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const refs = await mediaService.getReferences(mediaId)
    return res.apiSuccess(refs, '获取媒体引用清单成功')
  })
)

/**
 * POST /api/v4/console/media/:media_id/delete-preview
 *
 * @description 删除影响预览（N4）：预告连带删多少衍生、解除多少关联、释放多少空间、是否被引用拦截。
 */
router.post(
  '/:media_id/delete-preview',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const preview = await mediaService.previewDelete(mediaId)
    return res.apiSuccess(preview, '获取删除影响预览成功')
  })
)

/**
 * POST /api/v4/console/media/:media_id/purge
 *
 * @description 立即彻底删除单条（N1）：仅限回收站内的项，物理删原图 + 全衍生 + DB 记录（不可逆）。
 */
router.post(
  '/:media_id/purge',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    let result
    try {
      result = await mediaService.purgeOne(mediaId)
    } catch (err) {
      if (err.code === 'MEDIA_NOT_IN_TRASH') {
        return res.apiError(err.message, 'MEDIA_NOT_IN_TRASH', null, 409)
      }
      if (err.code === 'SERVICE_NOT_FOUND') {
        return res.apiError(err.message, 'MEDIA_NOT_FOUND', null, 404)
      }
      throw err
    }
    const AuditLogService = req.app.locals.services.getService('audit_log')
    await AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: 'media_purge',
      target_type: 'media_file',
      target_id: mediaId,
      action: 'purge',
      after_data: result,
      reason: '管理员彻底删除回收站媒体（不可逆）',
      ip_address: req.ip,
      user_agent: req.get('user-agent')
    }).catch(() => {})
    return res.apiSuccess(result, '已彻底删除')
  })
)

/**
 * POST /api/v4/console/media/:media_id/attach
 */
router.post(
  '/:media_id/attach',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    const {
      attachable_type: attachableType,
      attachable_id: attachableId,
      role,
      sort_order: sortOrder,
      meta
    } = req.body
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    if (!attachableType || !attachableId) {
      return res.apiError('缺少 attachable_type 或 attachable_id', 'MISSING_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const attachment = await mediaService.attach(
      mediaId,
      attachableType,
      parseInt(attachableId, 10),
      role || 'primary',
      sortOrder ?? 0,
      meta ?? null
    )
    return res.apiSuccess(
      {
        attachment_id: attachment.attachment_id,
        media_id: mediaId,
        attachable_type: attachableType,
        attachable_id: parseInt(attachableId, 10),
        role: role || 'primary'
      },
      '关联成功'
    )
  })
)

/**
 * DELETE /api/v4/console/media/:media_id/detach
 */
router.delete(
  '/:media_id/detach',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaId = parseInt(req.params.media_id, 10)
    const { attachable_type: attachableType, attachable_id: attachableId, role } = req.body
    if (isNaN(mediaId)) {
      return res.apiError('无效的媒体 ID', 'INVALID_MEDIA_ID', null, 400)
    }
    if (!attachableType || !attachableId) {
      return res.apiError('缺少 attachable_type 或 attachable_id', 'MISSING_PARAM', null, 400)
    }
    const mediaService = req.app.locals.services.getService('media')
    const count = await mediaService.detachMediaFromEntity(
      mediaId,
      attachableType,
      parseInt(attachableId, 10),
      role || null
    )
    return res.apiSuccess({ detached_count: count }, '解除关联成功')
  })
)

module.exports = router
