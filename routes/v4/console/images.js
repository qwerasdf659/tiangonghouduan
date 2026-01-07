/**
 * 通用图片上传路由
 *
 * @description 提供统一的图片上传接口，支持多种业务类型
 *              所有模块（奖品、商品、Banner）统一使用此接口上传图片
 *
 * @architecture 架构决策（2026-01-07）
 *   - 存储后端：Sealos 对象存储（S3 兼容）
 *   - 返回格式：image_id + object_key + cdn_url + thumbnails
 *   - 调用方式：先上传图片获取 image_id，再创建业务记录时关联
 *
 * @route /api/v4/console/images
 * @version 1.0.0
 * @date 2026-01-08
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const ImageService = require('../../../services/ImageService')
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { asyncHandler } = require('./shared/middleware')

/**
 * Multer 配置：内存存储模式
 * 文件暂存内存，直接上传到 Sealos，不落本地磁盘
 */
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 仅允许图片类型
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型：${file.mimetype}`), false)
    }
  }
})

/**
 * POST /api/v4/console/images/upload
 *
 * @description 通用图片上传接口
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @body {file} image - 图片文件（必填）
 * @body {string} business_type - 业务类型：lottery|exchange|trade|uploads（必填）
 * @body {number} [business_id] - 关联的业务 ID（可选，后续可通过 API 绑定）
 *
 * @response {Object} 200 - 上传成功
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "图片上传成功",
 *   "data": {
 *     "image_id": 123,
 *     "object_key": "prizes/1704672000000_abc123.jpg",
 *     "cdn_url": "https://cdn.example.com/bucket/prizes/1704672000000_abc123.jpg",
 *     "thumbnails": {
 *       "small": "...?w=100&h=100",
 *       "medium": "...?w=300&h=300",
 *       "large": "...?w=800&h=800"
 *     },
 *     "file_size": 102400,
 *     "mime_type": "image/jpeg",
 *     "original_name": "prize.jpg"
 *   }
 * }
 *
 * @response {Object} 400 - 参数错误或文件验证失败
 * @response {Object} 401 - 未授权
 * @response {Object} 500 - 服务器错误
 */
router.post(
  '/upload',
  authenticateToken,
  requireAdmin,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    // 1. 验证文件存在
    if (!req.file) {
      return res.apiError('请选择要上传的图片文件', 'MISSING_FILE', null, 400)
    }

    // 2. 验证业务类型
    const { business_type: businessType, business_id: businessId } = req.body
    if (!businessType) {
      return res.apiError('缺少必填参数：business_type', 'MISSING_PARAM', null, 400)
    }

    const allowedTypes = ['lottery', 'exchange', 'trade', 'uploads']
    if (!allowedTypes.includes(businessType)) {
      return res.apiError(
        `不支持的业务类型：${businessType}`,
        'INVALID_BUSINESS_TYPE',
        { allowed: allowedTypes },
        400
      )
    }

    /* 3. 调用 ImageService 上传 - 字段对齐使用与 image_resources 表一致的字段名 */
    const uploadResult = await ImageService.uploadImage({
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      businessType,
      category: req.body.category || null, // 可选：资源分类
      contextId: businessId ? parseInt(businessId, 10) : 0, // 上下文 ID（0 表示待绑定）
      userId: req.user.user_id,
      sourceModule: 'admin',
      ipAddress: req.ip
    })

    // 4. 返回上传结果
    return res.apiSuccess(uploadResult, '图片上传成功')
  })
)

/**
 * GET /api/v4/console/images/:image_id
 *
 * @description 获取图片详情
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} image_id - 图片资源 ID
 *
 * @response {Object} 200 - 图片详情
 * @response {Object} 404 - 图片不存在
 */
router.get(
  '/:image_id',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.image_id, 10)
    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    const image = await ImageService.getImageById(imageId)
    if (!image) {
      return res.apiError('图片不存在', 'IMAGE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(image, '获取图片详情成功')
  })
)

/**
 * GET /api/v4/console/images
 *
 * @description 根据业务类型和上下文 ID 获取图片列表
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @query {string} business_type - 业务类型：lottery|exchange|trade|uploads
 * @query {number} context_id - 业务上下文 ID（如 prize_id、product_id）
 *
 * @response {Object} 200 - 图片列表
 */
router.get(
  '/',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // 🔴 修复：使用 context_id（与表结构一致）
    const { business_type: businessType, context_id: contextId } = req.query

    if (!businessType || !contextId) {
      return res.apiError('缺少必填参数：business_type 和 context_id', 'MISSING_PARAMS', null, 400)
    }

    const images = await ImageService.getImagesByBusiness(businessType, parseInt(contextId, 10))

    return res.apiSuccess(
      {
        images,
        total: images.length
      },
      '获取图片列表成功'
    )
  })
)

/**
 * PATCH /api/v4/console/images/:image_id/bind
 *
 * @description 绑定图片到业务记录（上传后再绑定场景）
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} image_id - 图片资源 ID
 * @body {number} context_id - 要绑定的业务上下文 ID（如 prize_id、product_id）
 *
 * @response {Object} 200 - 绑定成功
 */
router.patch(
  '/:image_id/bind',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.image_id, 10)
    // 🔴 修复：使用 context_id（与表结构一致）
    const { context_id: contextId } = req.body

    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    if (!contextId) {
      return res.apiError('缺少必填参数：context_id', 'MISSING_PARAM', null, 400)
    }

    const success = await ImageService.updateImageContextId(imageId, parseInt(contextId, 10))

    if (!success) {
      return res.apiError('图片不存在或更新失败', 'UPDATE_FAILED', null, 404)
    }

    return res.apiSuccess({ image_id: imageId, context_id: contextId }, '图片绑定成功')
  })
)

/**
 * DELETE /api/v4/console/images/:image_id
 *
 * @description 软删除图片（标记为 deleted 状态）
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} image_id - 图片资源 ID
 *
 * @response {Object} 200 - 删除成功
 */
router.delete(
  '/:image_id',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.image_id, 10)
    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    const success = await ImageService.deleteImage(imageId)

    if (!success) {
      return res.apiError('图片不存在或删除失败', 'DELETE_FAILED', null, 404)
    }

    return res.apiSuccess({ image_id: imageId }, '图片删除成功')
  })
)

module.exports = router
