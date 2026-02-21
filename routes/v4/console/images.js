/**
 * 通用图片上传路由
 *
 * @description 提供统一的图片上传接口，支持多种业务类型
 *              所有模块（奖品、商品、Banner）统一使用此接口上传图片
 *
 * @architecture 架构决策（2026-01-08 最终拍板）
 *   - 存储后端：Sealos 对象存储（S3 兼容）
 *   - 访问策略：不使用 CDN，直连 Sealos 公网端点
 *   - 缩略图策略：预生成 3 档尺寸（150/300/600px，cover-center）
 *   - 返回格式：image_id + object_key + public_url + thumbnails
 *   - 删除策略：Web 管理端删除时立即物理删除
 *   - 调用方式：先上传图片获取 image_id，再创建业务记录时关联
 *
 * @route /api/v4/console/images
 * @version 2.0.0
 * @date 2026-01-08
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const serviceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { asyncHandler } = require('./shared/middleware')

/**
 * 获取 ImageService 实例
 * 通过 ServiceManager 统一获取，遵循项目规范
 *
 * @returns {Object} ImageService 静态类
 */
const getImageService = () => serviceManager.getService('image')

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
 * @architecture 架构决策（2026-01-08）：
 *   - 预生成 3 档缩略图（150/300/600px，cover-center）
 *   - 文件验证：5MB 限制、最大边 4096px、jpeg/png/gif/webp
 *   - 数据库存储 object key，不存完整 URL
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @body {file} image - 图片文件（必填，5MB 限制）
 * @body {string} business_type - 业务类型：lottery|exchange|trade|uploads（必填）
 * @body {string} [category] - 资源分类（可选，如 prizes/products/banners）
 * @body {number} [business_id] - 关联的业务 ID（可选，后续可通过 API 绑定）
 *
 * @response {Object} 200 - 上传成功
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "图片上传成功",
 *   "data": {
 *     "image_id": 123,
 *     "object_key": "prizes/20260108_abc123.jpg",
 *     "public_url": "https://objectstorageapi.xxx/bucket/prizes/20260108_abc123.jpg",
 *     "thumbnails": {
 *       "small": "https://objectstorageapi.xxx/bucket/prizes/thumbnails/small/20260108_abc123.jpg",
 *       "medium": "https://objectstorageapi.xxx/bucket/prizes/thumbnails/medium/20260108_abc123.jpg",
 *       "large": "https://objectstorageapi.xxx/bucket/prizes/thumbnails/large/20260108_abc123.jpg"
 *     },
 *     "file_size": 102400,
 *     "mime_type": "image/jpeg",
 *     "original_filename": "prize.jpg"
 *   }
 * }
 *
 * @response {Object} 400 - 参数错误、文件验证失败或图片尺寸超限
 * @response {Object} 401 - 未授权
 * @response {Object} 500 - 服务器错误
 */
router.post(
  '/upload',
  authenticateToken,
  requireRoleLevel(100),
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
    const uploadResult = await getImageService().uploadImage({
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      businessType,
      category: req.body.category || null, // 可选：资源分类
      contextId: businessId ? parseInt(businessId, 10) : 0, // 上下文 ID（0 表示待绑定）
      userId: req.user.user_id,
      sourceModule: 'admin',
      ipAddress: req.ip,
      sortOrder: req.body.sort_order ? parseInt(req.body.sort_order, 10) : 0 // 多图排序序号
    })

    // 4. 返回上传结果
    return res.apiSuccess(uploadResult, '图片上传成功')
  })
)

/**
 * GET /api/v4/console/images
 *
 * @description 分页获取图片列表（管理后台用）
 *              支持按业务类型和状态筛选，返回统计信息
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=24] - 每页数量
 * @query {string} [business_type] - 业务类型筛选：lottery|exchange|trade|uploads
 * @query {string} [status] - 状态筛选：active|archived|deleted|orphan（orphan表示context_id=0的孤儿图片）
 *
 * @response {Object} 200 - 图片列表和统计
 *
 * @since 2026-01-18 路由层合规性治理：移除直接模型访问，通过 ImageService 处理
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { page, page_size: pageSize, business_type: businessType, status } = req.query

    // 通过 ImageService 获取图片列表和统计
    const result = await getImageService().getImageList(
      { business_type: businessType, status },
      { page, page_size: pageSize }
    )

    return res.apiSuccess(
      {
        images: result.images,
        statistics: {
          total: result.stats.total,
          total_size: Math.round(result.stats.total_size_mb * 1024 * 1024), // 转回字节
          weekly_uploads: result.stats.week_count,
          orphan_count: result.stats.orphan_count
        },
        pagination: {
          current_page: result.pagination.page,
          page_size: result.pagination.page_size,
          total_count: result.pagination.total,
          total_pages: result.pagination.total_pages
        }
      },
      '获取图片列表成功'
    )
  })
)

/**
 * GET /api/v4/console/images/by-business
 *
 * @description 根据业务类型和上下文 ID 获取关联图片
 *              支持可选的 category 过滤（区分主图/详情图）
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @query {string} business_type - 业务类型：lottery|exchange|trade|uploads
 * @query {number} context_id - 业务上下文 ID（如 prize_id、exchange_item_id）
 * @query {string} [category] - 图片分类过滤：primary|detail|icons（可选）
 *
 * @response {Object} 200 - 图片列表（按 sort_order ASC 排序）
 *
 * @since 2026-01-08 图片管理架构
 * @updated 2026-02-21 新增 category 过滤支持（多图功能）
 */
router.get(
  '/by-business',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { business_type: businessType, context_id: contextId, category } = req.query

    if (!businessType || !contextId) {
      return res.apiError('缺少必填参数：business_type 和 context_id', 'MISSING_PARAMS', null, 400)
    }

    const options = {}
    if (category) options.category = category

    const images = await getImageService().getImagesByBusiness(
      businessType,
      parseInt(contextId, 10),
      options
    )

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
 * GET /api/v4/console/images/:id
 *
 * @description 获取图片详情
 *              注意：此路由必须放在 /by-business 之后，避免 Express 将 "by-business" 匹配为 :id
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} id - 图片资源 ID（image_resource_id）
 *
 * @response {Object} 200 - 图片详情
 * @response {Object} 404 - 图片不存在
 *
 * @since 2026-02-01 主键命名规范化：事务实体路由参数使用 :id（混合策略）
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.id, 10)
    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    const image = await getImageService().getImageById(imageId)
    if (!image) {
      return res.apiError('图片不存在', 'IMAGE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(image, '获取图片详情成功')
  })
)

/**
 * PATCH /api/v4/console/images/:id/bind
 *
 * @description 绑定图片到业务记录（上传后再绑定场景）
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} id - 图片资源 ID（image_resource_id）
 * @body {number} context_id - 要绑定的业务上下文 ID（如 prize_id、product_id）
 *
 * @response {Object} 200 - 绑定成功
 *
 * @since 2026-02-01 主键命名规范化：事务实体路由参数使用 :id（混合策略）
 */
router.patch(
  '/:id/bind',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.id, 10)
    // 使用 context_id（与表结构一致）
    const { context_id: contextId } = req.body

    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    if (!contextId) {
      return res.apiError('缺少必填参数：context_id', 'MISSING_PARAM', null, 400)
    }

    const success = await getImageService().updateImageContextId(imageId, parseInt(contextId, 10))

    if (!success) {
      return res.apiError('图片不存在或更新失败', 'UPDATE_FAILED', null, 404)
    }

    // 2026-02-01 主键命名规范化：API响应字段使用完整前缀 image_resource_id
    return res.apiSuccess({ image_resource_id: imageId, context_id: contextId }, '图片绑定成功')
  })
)

/**
 * PATCH /api/v4/console/images/:id
 *
 * @description 更新图片属性（排序序号等）
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} id - 图片资源 ID（image_resource_id）
 * @body {number} [sort_order] - 排序序号（同一 context_id 内排序，数字越小越靠前）
 *
 * @response {Object} 200 - 更新成功
 * @response {Object} 400 - 参数错误
 * @response {Object} 404 - 图片不存在
 */
router.patch(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.id, 10)
    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    const { sort_order: sortOrder } = req.body
    if (sortOrder === undefined) {
      return res.apiError('缺少可更新的参数（支持：sort_order）', 'MISSING_PARAM', null, 400)
    }

    const success = await getImageService().updateImageSortOrder(imageId, parseInt(sortOrder, 10))

    if (!success) {
      return res.apiError('图片不存在或更新失败', 'UPDATE_FAILED', null, 404)
    }

    return res.apiSuccess(
      { image_resource_id: imageId, sort_order: parseInt(sortOrder, 10) },
      '图片排序更新成功'
    )
  })
)

/**
 * DELETE /api/v4/console/images/:id
 *
 * @description 物理删除图片（从数据库和 Sealos 对象存储中删除）
 *
 * @architecture 架构决策（2026-01-08）：
 *   - Web 管理端删除时立即物理删除（非软删除）
 *   - 同时删除原图和所有预生成缩略图
 *   - 数据库记录物理删除，不保留历史
 *
 * @header Authorization - Bearer {token} 管理员认证
 * @param {number} id - 图片资源 ID（image_resource_id）
 *
 * @response {Object} 200 - 删除成功
 * @response {Object} 404 - 图片不存在
 *
 * @since 2026-02-01 主键命名规范化：事务实体路由参数使用 :id（混合策略）
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const imageId = parseInt(req.params.id, 10)
    if (isNaN(imageId)) {
      return res.apiError('无效的图片 ID', 'INVALID_IMAGE_ID', null, 400)
    }

    const success = await getImageService().deleteImage(imageId)

    if (!success) {
      return res.apiError('图片不存在或删除失败', 'DELETE_FAILED', null, 404)
    }

    // 2026-02-01 主键命名规范化：API响应字段使用完整前缀 image_resource_id
    return res.apiSuccess({ image_resource_id: imageId }, '图片删除成功')
  })
)

module.exports = router
