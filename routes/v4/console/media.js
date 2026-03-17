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
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { asyncHandler } = require('./shared/middleware')

/**
 * Multer 配置：内存存储，5MB，jpeg/png/gif/webp
 */
const storage = multer.memoryStorage()
const uploadSingle = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
  }
})
const uploadBatch = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
  }
})

/**
 * POST /api/v4/console/media/upload
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
      uploaded_by: req.user?.user_id
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
    const { page, page_size: pageSize, folder, status, tags } = req.query
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.listMedia(
      { folder, status, tags },
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
    const ok = await mediaService.moveToTrash(mediaId)
    if (!ok) {
      return res.apiError('媒体不存在或已移入回收站', 'MOVE_FAILED', null, 404)
    }
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
    return res.apiSuccess({ media_id: mediaId }, '已从回收站恢复')
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
