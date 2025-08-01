const express = require('express')
const multer = require('multer')
const ImageResourceService = require('../../services/ImageResourceService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化服务
const imageService = new ImageResourceService()

// 配置multer中间件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 5 // 最多5个文件
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`), false)
    }
  }
})

/**
 * @route GET /api/v2/resources
 * @desc 获取图片资源管理API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'resources',
      description: '统一图片资源管理API',
      version: '2.0.0',
      endpoints: {
        'POST /': '上传图片资源（需要认证）',
        'GET /:resourceId': '获取特定图片资源',
        'PUT /:resourceId': '更新图片资源（需要认证）',
        'DELETE /:resourceId': '删除图片资源（需要管理员权限）',
        'GET /business/:businessType': '按业务类型获取图片资源',
        'GET /category/:category': '按分类获取图片资源',
        'POST /batch': '批量上传图片资源（需要认证）',
        'PUT /batch/update': '批量更新图片资源状态（需要管理员权限）',
        'POST /compress': '图片压缩处理（需要认证）',
        'GET /stats': '获取资源统计信息（需要管理员权限）'
      },
      supportedFormats: ['JPEG', 'JPG', 'PNG', 'WebP'],
      maxFileSize: '20MB',
      maxFiles: 5
    })
  )
})

/**
 * @route POST /api/v2/resources
 * @desc 创建图片资源（文件上传）
 * @access 需要认证
 */
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const startTime = Date.now()

    // 验证必需参数
    const { business_type, category, context_id } = req.body
    if (!business_type || !category || !context_id) {
      return res
        .status(400)
        .json(
          ApiResponse.error('缺少必需参数: businessType, category, contextId', 'MISSING_PARAMS')
        )
    }

    // 验证文件
    if (!req.file) {
      return res.status(400).json(ApiResponse.error('未上传文件', 'NO_FILE'))
    }

    // 准备资源数据
    const resourceData = {
      businessType: business_type,
      category,
      contextId: parseInt(context_id),
      userId: req.user.id,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata: {
        uploadUserAgent: req.headers['user-agent'],
        uploadIp: req.ip,
        uploadSource: 'api_v2'
      }
    }

    // 上传选项
    const uploadOptions = {
      isActive: req.body.is_active === 'true',
      priority: req.body.priority || 'normal'
    }

    // 创建资源
    const resource = await imageService.createResource(resourceData, req.file.buffer, uploadOptions)

    const duration = Date.now() - startTime
    console.log(`✅ 资源创建完成: ${resource.resource_id}, 耗时: ${duration}ms`)

    // 返回成功响应
    res.status(201).json(
      ApiResponse.success(resource, '资源创建成功', {
        processingTime: duration,
        fileSize: req.file.size,
        storageLayer: resource.storage_layer
      })
    )
  } catch (error) {
    console.error('❌ 创建资源失败:', error.message)

    // 根据错误类型返回不同状态码
    if (error.message.includes('文件大小超限')) {
      return res.status(413).json(ApiResponse.error(error.message, 'FILE_TOO_LARGE'))
    }

    if (error.message.includes('不支持的文件类型')) {
      return res.status(415).json(ApiResponse.error(error.message, 'UNSUPPORTED_FILE_TYPE'))
    }

    res.status(500).json(ApiResponse.error('创建资源失败', 'CREATE_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/resources/batch
 * @desc 批量上传图片资源
 * @access 需要认证
 */
router.post('/batch', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    const startTime = Date.now()

    // 验证必需参数
    const { business_type, category, context_id } = req.body
    if (!business_type || !category || !context_id) {
      return res
        .status(400)
        .json(
          ApiResponse.error('缺少必需参数: businessType, category, contextId', 'MISSING_PARAMS')
        )
    }

    // 验证文件
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(ApiResponse.error('未上传文件', 'NO_FILES'))
    }

    const results = {
      success: [],
      failed: [],
      total: req.files.length
    }

    // 并行处理多个文件
    const uploadPromises = req.files.map(async (file, index) => {
      try {
        const resourceData = {
          businessType: business_type,
          category,
          contextId: parseInt(context_id),
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'api_v2_batch',
            batchIndex: index
          }
        }

        const resource = await imageService.createResource(resourceData, file.buffer, {
          isActive: true,
          priority: 'normal'
        })

        results.success.push({
          index,
          resourceId: resource.resource_id,
          filename: file.originalname,
          size: file.size,
          url: resource.imageUrl
        })
      } catch (error) {
        results.failed.push({
          index,
          filename: file.originalname,
          error: error.message
        })
      }
    })

    await Promise.all(uploadPromises)

    const duration = Date.now() - startTime
    const successRate = ((results.success.length / results.total) * 100).toFixed(1)

    console.log(
      `✅ 批量上传完成: ${results.success.length}/${results.total} (${successRate}%), 耗时: ${duration}ms`
    )

    res.status(201).json(
      ApiResponse.success(results, '批量上传完成', {
        processingTime: duration,
        successRate: `${successRate}%`,
        totalFiles: results.total
      })
    )
  } catch (error) {
    console.error('❌ 批量上传失败:', error.message)
    res.status(500).json(ApiResponse.error('批量上传失败', 'BATCH_UPLOAD_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/resources
 * @desc 查询图片资源列表
 * @access 需要认证
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const queryParams = {
      businessType: req.query.businessType,
      category: req.query.category,
      contextId: req.query.contextId,
      userId: req.query.userId,
      status: req.query.status || 'active',
      reviewStatus: req.query.reviewStatus,
      storageLayer: req.query.storageLayer,
      page: parseInt(req.query.page) || 1,
      limit: Math.min(parseInt(req.query.limit) || 20, 100), // 最多100条
      orderBy: req.query.orderBy || 'created_at',
      order: req.query.order || 'DESC',
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    }

    // 权限检查：普通用户只能查看自己的资源
    if (!req.user.is_admin && !queryParams.userId) {
      queryParams.userId = req.user.id
    }

    const result = await imageService.queryResources(queryParams)

    res.json(
      ApiResponse.success(result.resources, '查询成功', {
        pagination: result.pagination,
        queryParams
      })
    )
  } catch (error) {
    console.error('❌ 查询资源失败:', error.message)
    res.status(500).json(ApiResponse.error('查询资源失败', 'QUERY_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/resources/:resourceId
 * @desc 获取单个资源详情
 * @access 需要认证
 */
router.get('/:resourceId', authenticateToken, async (req, res) => {
  try {
    const { resourceId } = req.params
    const { includeMetadata = 'false', trackAccess = 'false' } = req.query

    const options = {
      includeMetadata: includeMetadata === 'true' && req.user.is_admin,
      trackAccess: trackAccess === 'true'
    }

    const resource = await imageService.getResourceById(resourceId, options)

    // 权限检查：普通用户只能查看自己的资源
    if (!req.user.is_admin && resource.user_id !== req.user.id) {
      return res.status(403).json(ApiResponse.error('无权访问此资源', 'ACCESS_DENIED'))
    }

    res.json(
      ApiResponse.success(resource, '获取成功', {
        trackAccess: options.trackAccess,
        includeMetadata: options.includeMetadata
      })
    )
  } catch (error) {
    console.error('❌ 获取资源详情失败:', error.message)

    if (error.message.includes('资源不存在')) {
      return res.status(404).json(ApiResponse.error('资源不存在', 'RESOURCE_NOT_FOUND'))
    }

    res.status(500).json(ApiResponse.error('获取资源详情失败', 'GET_FAILED', error.message))
  }
})

/**
 * @route PUT /api/v2/resources/:resourceId
 * @desc 更新资源信息
 * @access 需要认证，管理员或资源所有者
 */
router.put('/:resourceId', authenticateToken, async (req, res) => {
  try {
    const { resourceId } = req.params
    const updateData = req.body

    // 获取资源信息进行权限检查
    const resource = await imageService.getResourceById(resourceId)

    // 权限检查：管理员或资源所有者
    if (!req.user.is_admin && resource.user_id !== req.user.id) {
      return res.status(403).json(ApiResponse.error('无权修改此资源', 'ACCESS_DENIED'))
    }

    // 审核操作只允许管理员
    if (updateData.reviewStatus && !req.user.is_admin) {
      return res.status(403).json(ApiResponse.error('无权进行审核操作', 'ADMIN_REQUIRED'))
    }

    const updatedResource = await imageService.updateResource(resourceId, updateData, req.user.id)

    res.json(
      ApiResponse.success(updatedResource, '更新成功', {
        operatedBy: req.user.id,
        timestamp: new Date().toISOString()
      })
    )
  } catch (error) {
    console.error('❌ 更新资源失败:', error.message)

    if (error.message.includes('资源不存在')) {
      return res.status(404).json(ApiResponse.error('资源不存在', 'RESOURCE_NOT_FOUND'))
    }

    res.status(500).json(ApiResponse.error('更新资源失败', 'UPDATE_FAILED', error.message))
  }
})

/**
 * @route DELETE /api/v2/resources/:resourceId
 * @desc 删除资源（软删除）
 * @access 需要认证，管理员或资源所有者
 */
router.delete('/:resourceId', authenticateToken, async (req, res) => {
  try {
    const { resourceId } = req.params

    // 获取资源信息进行权限检查
    const resource = await imageService.getResourceById(resourceId)

    // 权限检查：管理员或资源所有者
    if (!req.user.is_admin && resource.user_id !== req.user.id) {
      return res.status(403).json(ApiResponse.error('无权删除此资源', 'ACCESS_DENIED'))
    }

    const success = await imageService.deleteResource(resourceId, req.user.id)

    if (success) {
      res.json(
        ApiResponse.success(null, '删除成功', {
          resourceId,
          deletedBy: req.user.id,
          timestamp: new Date().toISOString()
        })
      )
    } else {
      throw new Error('删除操作失败')
    }
  } catch (error) {
    console.error('❌ 删除资源失败:', error.message)

    if (error.message.includes('资源不存在')) {
      return res.status(404).json(ApiResponse.error('资源不存在', 'RESOURCE_NOT_FOUND'))
    }

    res.status(500).json(ApiResponse.error('删除资源失败', 'DELETE_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/resources/reviews/pending
 * @desc 获取待审核资源列表
 * @access 管理员
 */
router.get('/reviews/pending', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, businessType = 'uploads' } = req.query

    const resources = await imageService.getPendingReviews({
      limit: parseInt(limit),
      businessType
    })

    res.json(
      ApiResponse.success(resources, '获取待审核资源成功', {
        count: resources.length,
        businessType
      })
    )
  } catch (error) {
    console.error('❌ 获取待审核资源失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取待审核资源失败', 'GET_PENDING_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/resources/reviews/batch
 * @desc 批量审核资源
 * @access 管理员
 */
router.post('/reviews/batch', requireAdmin, async (req, res) => {
  try {
    const { reviews } = req.body

    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json(ApiResponse.error('审核数据格式错误', 'INVALID_REVIEWS_DATA'))
    }

    // 验证审核数据格式
    for (const review of reviews) {
      if (
        !review.resourceId ||
        !review.action ||
        !['approved', 'rejected'].includes(review.action)
      ) {
        return res
          .status(400)
          .json(
            ApiResponse.error(
              '审核数据格式错误: 需要resourceId和action字段',
              'INVALID_REVIEW_FORMAT'
            )
          )
      }
    }

    const results = await imageService.batchReview(reviews, req.user.id)

    res.json(
      ApiResponse.success(results, '批量审核完成', {
        reviewedBy: req.user.id,
        timestamp: new Date().toISOString()
      })
    )
  } catch (error) {
    console.error('❌ 批量审核失败:', error.message)
    res.status(500).json(ApiResponse.error('批量审核失败', 'BATCH_REVIEW_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/resources/stats/storage
 * @desc 获取存储统计信息
 * @access 管理员
 */
router.get('/stats/storage', requireAdmin, async (req, res) => {
  try {
    const { businessType, dateFrom, dateTo } = req.query

    const stats = await imageService.getStorageStats({
      businessType,
      dateFrom,
      dateTo
    })

    res.json(
      ApiResponse.success(stats, '获取存储统计成功', {
        queryParams: { businessType, dateFrom, dateTo }
      })
    )
  } catch (error) {
    console.error('❌ 获取存储统计失败:', error.message)
    res.status(500).json(ApiResponse.error('获取存储统计失败', 'GET_STATS_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/resources/health
 * @desc 健康检查和服务状态
 * @access 公开
 */
router.get('/health', async (req, res) => {
  try {
    const serviceStats = imageService.getServiceStats()

    res.json(
      ApiResponse.success(serviceStats, '服务运行正常', {
        timestamp: new Date().toISOString(),
        version: 'v2.0'
      })
    )
  } catch (error) {
    console.error('❌ 健康检查失败:', error.message)
    res.status(500).json(ApiResponse.error('服务异常', 'SERVICE_ERROR', error.message))
  }
})

// 错误处理中间件
router.use((error, req, res, _next) => {
  console.error('❌ 路由错误:', error.message)

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(ApiResponse.error('文件大小超过限制', 'FILE_SIZE_LIMIT'))
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json(ApiResponse.error('文件数量超过限制', 'FILE_COUNT_LIMIT'))
    }
  }

  res.status(500).json(ApiResponse.error('内部服务器错误', 'INTERNAL_ERROR', error.message))
})

module.exports = router
