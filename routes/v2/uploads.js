const express = require('express')
const multer = require('multer')
const ImageResourceService = require('../../services/ImageResourceService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化服务
const imageService = new ImageResourceService()

// 配置文件上传中间件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB for user uploads (higher resolution photos)
    files: 3 // 最多3个文件
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`用户上传不支持的文件类型: ${file.mimetype}`), false)
    }
  }
})

/**
 * @route GET /api/v2/uploads
 * @desc 获取用户上传审核业务API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'uploads',
      description: '用户上传图片审核管理API',
      version: '2.0.0',
      endpoints: {
        'POST /submit': '用户提交图片审核（需要认证）',
        'GET /pending': '获取待审核图片列表（管理员）',
        'PUT /:uploadId/approve': '批准用户上传的图片（管理员）',
        'PUT /:uploadId/reject': '拒绝用户上传的图片（管理员）',
        'GET /:uploadId': '获取特定上传记录详情',
        'GET /user/:userId': '获取特定用户的上传记录（需要认证）',
        'GET /stats/review': '获取审核统计数据（管理员）',
        'POST /batch/review': '批量审核用户上传（管理员）',
        'GET /categories': '获取上传分类信息'
      },
      businessType: 'uploads',
      supportedCategories: ['user_photo', 'review', 'feedback'],
      maxFileSize: '20MB',
      maxFiles: 3,
      reviewStates: ['pending', 'approved', 'rejected']
    })
  )
})

/**
 * @route POST /api/v2/uploads/submit
 * @desc 用户提交图片审核
 * @access 需要认证
 */
router.post('/submit', authenticateToken, upload.array('images', 3), async (req, res) => {
  try {
    const { description } = req.body

    // 验证文件
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(ApiResponse.error('未上传图片文件', 'NO_FILES'))
    }

    const uploadResults = []

    // 处理多个文件
    for (const file of req.files) {
      try {
        const resourceData = {
          businessType: 'uploads',
          category: 'pending_review',
          contextId: req.user.id, // 使用用户ID作为上下文
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'user_submission',
            description: description || '',
            submissionTime: new Date().toISOString()
          }
        }

        const uploadOptions = {
          isActive: true,
          priority: 'high' // 待审核图片优先处理
        }

        const resource = await imageService.createResource(resourceData, file.buffer, uploadOptions)

        uploadResults.push(resource)
      } catch (error) {
        console.error(`❌ 用户上传图片失败 ${file.originalname}:`, error.message)
      }
    }

    res
      .status(201)
      .json(
        ApiResponse.success(uploadResults, `图片提交成功: ${uploadResults.length}个文件，等待审核`)
      )
  } catch (error) {
    console.error('❌ 用户图片提交失败:', error.message)
    res.status(500).json(ApiResponse.error('图片提交失败', 'SUBMIT_IMAGES_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/uploads/my-submissions
 * @desc 获取当前用户的提交记录
 * @access 需要认证
 */
router.get('/my-submissions', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query

    const queryParams = {
      businessType: 'uploads',
      userId: req.user.id,
      limit: parseInt(limit),
      page: parseInt(page),
      orderBy: 'created_at',
      order: 'DESC'
    }

    if (status) {
      queryParams.review_status = status
    }

    const result = await imageService.queryResources(queryParams)

    res.json(
      ApiResponse.success(result, '获取提交记录成功', {
        userId: req.user.id,
        count: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取用户提交记录失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取提交记录失败', 'GET_USER_SUBMISSIONS_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/uploads/pending-reviews
 * @desc 获取待审核图片列表
 * @access 管理员
 */
router.get('/pending-reviews', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query

    const result = await imageService.queryResources({
      businessType: 'uploads',
      category: 'pending_review',
      review_status: 'pending',
      status: 'active',
      limit: parseInt(limit),
      page: parseInt(page),
      orderBy: 'created_at',
      order: 'ASC' // 先处理较早提交的
    })

    res.json(
      ApiResponse.success(result, '获取待审核列表成功', {
        pendingCount: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取待审核列表失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取待审核列表失败', 'GET_PENDING_REVIEWS_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/uploads/review/:resourceId
 * @desc 审核单个图片
 * @access 管理员
 */
router.post('/review/:resourceId', requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.params
    const { action, reason, points } = req.body

    if (!['approve', 'reject'].includes(action)) {
      return res
        .status(400)
        .json(ApiResponse.error('审核动作必须是 approve 或 reject', 'INVALID_ACTION'))
    }

    const updateData = {
      review_status: action === 'approve' ? 'approved' : 'rejected',
      reviewer_id: req.user.id,
      review_reason: reason || '',
      reviewed_at: new Date(),
      category: action === 'approve' ? 'approved' : 'rejected',
      metadata: {
        reviewAction: action,
        reviewTime: new Date().toISOString(),
        reviewerId: req.user.id,
        reviewReason: reason || ''
      }
    }

    // 如果是批准且提供了积分
    if (action === 'approve' && points && parseInt(points) > 0) {
      updateData.metadata.pointsAwarded = parseInt(points)
    }

    const resource = await imageService.updateResource(resourceId, updateData)

    res.json(ApiResponse.success(resource, `图片${action === 'approve' ? '审核通过' : '审核拒绝'}`))
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json(ApiResponse.error('图片资源不存在', 'RESOURCE_NOT_FOUND'))
    }

    console.error('❌ 审核图片失败:', error.message)
    res.status(500).json(ApiResponse.error('审核图片失败', 'REVIEW_IMAGE_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/uploads/batch-review
 * @desc 批量审核图片
 * @access 管理员
 */
router.post('/batch-review', requireAdmin, async (req, res) => {
  try {
    const { resourceIds, action, reason } = req.body

    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return res
        .status(400)
        .json(ApiResponse.error('resourceIds必须是非空数组', 'INVALID_RESOURCE_IDS'))
    }

    if (!['approve', 'reject'].includes(action)) {
      return res
        .status(400)
        .json(ApiResponse.error('审核动作必须是 approve 或 reject', 'INVALID_ACTION'))
    }

    const results = []
    const errors = []

    // 并行处理批量审核
    const reviewPromises = resourceIds.map(async resourceId => {
      try {
        const updateData = {
          review_status: action === 'approve' ? 'approved' : 'rejected',
          reviewer_id: req.user.id,
          review_reason: reason || '',
          reviewed_at: new Date(),
          category: action === 'approve' ? 'approved' : 'rejected',
          metadata: {
            reviewAction: action,
            reviewTime: new Date().toISOString(),
            reviewerId: req.user.id,
            reviewReason: reason || '',
            batchReview: true
          }
        }

        const resource = await imageService.updateResource(resourceId, updateData)
        return { success: true, resourceId, resource }
      } catch (error) {
        console.error(`❌ 批量审核失败 ${resourceId}:`, error.message)
        return { success: false, resourceId, error: error.message }
      }
    })

    const reviewResults = await Promise.all(reviewPromises)

    reviewResults.forEach(result => {
      if (result.success) {
        results.push(result.resource)
      } else {
        errors.push({ resourceId: result.resourceId, error: result.error })
      }
    })

    res.json(
      ApiResponse.success(
        {
          reviewed: results,
          errors,
          summary: {
            total: resourceIds.length,
            success: results.length,
            failed: errors.length,
            action
          }
        },
        `批量审核完成: ${results.length}成功, ${errors.length}失败`
      )
    )
  } catch (error) {
    console.error('❌ 批量审核失败:', error.message)
    res.status(500).json(ApiResponse.error('批量审核失败', 'BATCH_REVIEW_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/uploads/review-history
 * @desc 获取审核历史
 * @access 管理员
 */
router.get('/review-history', requireAdmin, async (req, res) => {
  try {
    const { reviewerId, status, limit = 50, page = 1 } = req.query

    const queryParams = {
      businessType: 'uploads',
      status: 'active',
      limit: parseInt(limit),
      page: parseInt(page),
      orderBy: 'reviewed_at',
      order: 'DESC'
    }

    if (reviewerId) {
      queryParams.reviewer_id = parseInt(reviewerId)
    }

    if (status) {
      queryParams.review_status = status
    }

    // 只查询已审核的记录
    queryParams.review_status_not = 'pending'

    const result = await imageService.queryResources(queryParams)

    res.json(
      ApiResponse.success(result, '获取审核历史成功', {
        reviewerId: reviewerId || 'all',
        status: status || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取审核历史失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取审核历史失败', 'GET_REVIEW_HISTORY_FAILED', error.message))
  }
})

/**
 * @route GET /api/v2/uploads/stats
 * @desc 获取上传审核统计
 * @access 管理员
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await imageService.getBusinessStats('uploads')

    // 添加审核相关统计
    const reviewStats = await imageService.getReviewStats()

    res.json(
      ApiResponse.success(
        {
          ...stats,
          review: reviewStats
        },
        '获取上传审核统计成功'
      )
    )
  } catch (error) {
    console.error('❌ 获取上传审核统计失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取统计信息失败', 'GET_UPLOAD_STATS_FAILED', error.message))
  }
})

/**
 * @route DELETE /api/v2/uploads/:resourceId
 * @desc 删除用户上传的图片（用户只能删除自己的）
 * @access 需要认证
 */
router.delete('/:resourceId', authenticateToken, async (req, res) => {
  try {
    const { resourceId } = req.params

    // 检查资源是否属于当前用户
    const resource = await imageService.getResourceById(resourceId)

    if (!resource) {
      return res.status(404).json(ApiResponse.error('图片资源不存在', 'RESOURCE_NOT_FOUND'))
    }

    if (resource.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json(ApiResponse.error('无权删除此图片', 'FORBIDDEN'))
    }

    await imageService.deleteResource(resourceId)

    res.json(ApiResponse.success(null, '图片删除成功'))
  } catch (error) {
    console.error('❌ 删除用户上传图片失败:', error.message)
    res.status(500).json(ApiResponse.error('删除图片失败', 'DELETE_UPLOAD_FAILED', error.message))
  }
})

module.exports = router
