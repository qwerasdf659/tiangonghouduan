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
        public_url: getImageUrl(m.object_key),
        thumbnails: {
          small: thumbKeys.small ? getImageUrl(thumbKeys.small) : null,
          medium: thumbKeys.medium ? getImageUrl(thumbKeys.medium) : null,
          large: thumbKeys.large ? getImageUrl(thumbKeys.large) : null
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
    const olderThanDays = parseInt(req.body.older_than_days, 10) || 7
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

module.exports = router
