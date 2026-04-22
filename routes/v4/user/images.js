/**
 * user域 - 用户端图片上传模块
 *
 * 业务范围：
 * - 普通用户（广告主）上传广告素材图片
 * - 与管理端 console/media.js 权限隔离，复用同一 MediaService
 *
 * 安全限制（比管理端更严格）：
 * - 文件大小：2MB（管理端 5MB）
 * - 文件夹：固定 uploads（管理端可选任意文件夹）
 *
 * @route POST /api/v4/user/images/upload
 * @access Private（JWT 认证，普通用户可调用）
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const { authenticateToken } = require('../../../middleware/auth')
const { logger } = require('../../../utils/logger')
const { asyncHandler } = require('../../../middleware/validation')

/**
 * 获取 MediaService（通过 ServiceManager）
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} MediaService 实例
 */
function getMediaService(req) {
  return req.app.locals.services.getService('media')
}

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
    }
  }
})

/**
 * POST /api/v4/user/images/upload
 *
 * @description 用户端图片上传接口（广告主上传广告素材）
 * @header Authorization - Bearer {token}
 * @body {file} image - 图片文件（必填，2MB 限制）
 * @response {Object} 200 - { media_id, public_url, thumbnails, ... }
 */
router.post(
  '/upload',
  authenticateToken,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.apiError('请选择要上传的图片文件', 'MISSING_FILE', null, 400)
    }

    const mediaService = getMediaService(req)
    const uploadResult = await mediaService.upload(req.file.buffer, {
      folder: 'uploads',
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      uploaded_by: req.user.user_id
    })

    logger.info('用户端图片上传成功', {
      user_id: req.user.user_id,
      media_id: uploadResult.media_id,
      file_size: req.file.size
    })

    return res.apiSuccess(uploadResult, '图片上传成功')
  })
)

module.exports = router
