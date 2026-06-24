/**
 * 存储管理路由
 *
 * @description 存储概览、孤儿文件、回收站、清理、重复检测
 * @route /api/v4/console/storage
 * @version 1.0.0
 * @date 2026-03-16
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../shared/middleware')
const { getImageUrl } = require('../../../../utils/ImageUrlHelper')

/**
 * GET /api/v4/console/storage/overview
 */
router.get(
  '/overview',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaService = req.app.locals.services.getService('media')
    const folders = await mediaService.getStorageOverview()
    const total_files = folders.reduce((s, f) => s + f.file_count, 0)
    const total_size = folders.reduce((s, f) => s + f.total_size, 0)
    return res.apiSuccess(
      {
        folders,
        total_files,
        total_size
      },
      '获取存储概览成功'
    )
  })
)

/**
 * GET /api/v4/console/storage/orphans
 */
router.get(
  '/orphans',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const olderThanHours = parseInt(req.query.older_than_hours, 10) || 24
    const mediaService = req.app.locals.services.getService('media')
    const orphans = await mediaService.getOrphanedMedia(olderThanHours)
    const items = orphans.map(m => {
      const thumbKeys = m.thumbnail_keys || {}
      return {
        media_id: m.media_id,
        original_name: m.original_name,
        file_size: m.file_size,
        folder: m.folder,
        created_at: m.created_at,
        public_url: getImageUrl(m.object_key, m.content_hash),
        thumbnails: {
          w375: thumbKeys.w375 ? getImageUrl(thumbKeys.w375, m.content_hash) : null,
          w750: thumbKeys.w750 ? getImageUrl(thumbKeys.w750, m.content_hash) : null,
          w1080: thumbKeys.w1080 ? getImageUrl(thumbKeys.w1080, m.content_hash) : null
        }
      }
    })
    return res.apiSuccess({ items, total: items.length }, '获取孤儿文件列表成功')
  })
)

/**
 * GET /api/v4/console/storage/trash
 */
router.get(
  '/trash',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { page, page_size: pageSize } = req.query
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.getTrashList({ page, page_size: pageSize })
    return res.apiSuccess(result, '获取回收站列表成功')
  })
)

/**
 * POST /api/v4/console/storage/cleanup
 */
router.post(
  '/cleanup',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const olderThanDays = parseInt(req.body.older_than_days, 10) || 30
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.cleanup(olderThanDays)
    return res.apiSuccess(result, '清理完成')
  })
)

/**
 * GET /api/v4/console/storage/duplicates
 */
router.get(
  '/duplicates',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const mediaService = req.app.locals.services.getService('media')
    const duplicates = await mediaService.getDuplicates()
    return res.apiSuccess({ items: duplicates, total: duplicates.length }, '获取重复文件列表成功')
  })
)

/**
 * GET /api/v4/console/storage/damaged
 *
 * @description 缺原图核对（N3）：连对象存储校验 active 图原图是否真实存在，
 *              列出「DB 有记录但对象存储缺原图」的受损图，直接预防本次事故复发。
 */
router.get(
  '/damaged',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { folder, limit } = req.query
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.getDamagedMedia({ folder, limit })
    return res.apiSuccess(result, '缺原图核对完成')
  })
)

/**
 * POST /api/v4/console/storage/optimize
 *
 * @description 存量批量优化（N6）：对存量图重新预生成 w375/w750/w1080 衍生并回写 thumbnail_keys。
 * @body {string} [folder] - 限定文件夹
 * @body {number[]} [media_ids] - 指定 media_id 列表（优先于 folder）
 * @body {boolean} [dry_run=false] - 只统计不实际处理
 */
router.post(
  '/optimize',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { folder, media_ids: mediaIds, dry_run: dryRun } = req.body
    const mediaService = req.app.locals.services.getService('media')
    const result = await mediaService.batchOptimize({
      folder,
      media_ids: mediaIds,
      dry_run: dryRun
    })
    // 危险/批量操作留痕（非 dry_run 时）
    if (!(dryRun === true || dryRun === 'true')) {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'media_optimize',
        target_type: 'media_file',
        target_id: null,
        action: 'batch_optimize',
        after_data: {
          processed: result.processed,
          succeeded: result.succeeded,
          failed: result.failed,
          skipped: result.skipped
        },
        reason: '管理员对存量图批量补齐宽度档衍生',
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }).catch(() => {})
    }
    return res.apiSuccess(result, '存量批量优化完成')
  })
)

module.exports = router
