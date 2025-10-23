/**
 * 图片上传和管理路由 - 集成缩略图功能
 * 支持图片上传、缩略图生成、审核管理
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs').promises
const { v4: uuidv4 } = require('uuid')
const router = express.Router()

// 导入服务和模型
const ThumbnailService = require('../../../services/ThumbnailService')
const { ImageResources, User, sequelize } = require('../../../models')

// Multer配置 - 图片上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads')
    try {
      await fs.access(uploadDir)
    } catch {
      await fs.mkdir(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
    return null
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4()
    const ext = path.extname(file.originalname)
    const filename = `${BeijingTimeHelper.generateIdTimestamp()}_${uniqueId}${ext}`
    cb(null, filename)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('只允许上传图片文件'), false)
    }
  }
})

/**
 * 用户图片上传 - 自动生成缩略图
 * POST /api/v4/photo/upload
 */
router.post('/upload', upload.single('photo'), async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const { user_id, business_type = 'user_upload_review', category = 'pending_review' } = req.body
    const file = req.file

    if (!file) {
      return res.apiError('请选择要上传的图片文件', 'MISSING_FILE', null, 400)
    }

    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    // 验证用户是否存在
    const user = await User.findByPk(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 创建图片资源记录
    const imageResource = await ImageResources.create(
      {
        business_type,
        category,
        context_id: user_id,
        user_id,
        file_path: file.filename,
        original_filename: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        review_status: 'pending',
        is_upload_review: true,
        source_module: 'user_upload',
        ip_address: req.ip || req.connection.remoteAddress
      },
      { transaction }
    )

    /*
     * 🔴 关键优化：先提交事务，快速响应用户
     * 避免缩略图生成（耗时50秒+）阻塞事务，导致503超时错误
     */
    await transaction.commit()
    console.log('✅ 图片记录已保存，image_id:', imageResource.image_id)

    /*
     * 🔄 异步生成缩略图（不阻塞响应）
     * 检查是否为支持的图片格式，如果是则生成缩略图
     */
    if (ThumbnailService.isSupportedImageType(file.mimetype)) {
      // 使用 setImmediate 异步执行，不阻塞响应
      setImmediate(async () => {
        try {
          console.log('🖼️ 异步生成缩略图... image_id:', imageResource.image_id)
          const thumbnails = await imageResource.generateThumbnails()
          console.log('✅ 缩略图生成成功:', thumbnails)
        } catch (thumbnailError) {
          console.warn('⚠️ 缩略图生成失败:', thumbnailError.message)
          // 缩略图生成失败不影响主要上传流程
        }
      })
    } else {
      console.log('ℹ️ 不支持的图片格式，跳过缩略图生成:', file.mimetype)
    }

    // 返回安全的JSON（包含缩略图信息）
    const safeData = imageResource.toSafeJSON()

    return res.apiSuccess(
      {
        ...safeData,
        uploaded_at: BeijingTimeHelper.now(),
        // 提供便于前端使用的字段
        hasThumbails: imageResource.hasThumbnails(),
        uploadStatus: 'success'
      },
      '图片上传成功'
    )
  } catch (error) {
    await transaction.rollback()
    console.error('图片上传失败:', error)

    // 清理已上传的文件
    if (req.file) {
      try {
        await fs.unlink(req.file.path)
      } catch {
        // 忽略文件删除错误
      }
    }

    return res.apiError('图片上传失败', 'UPLOAD_FAILED', { error: error.message }, 500)
  }
})

/**
 * 获取待审核图片列表 - 包含缩略图
 * GET /api/v4/photo/pending-reviews
 */
router.get('/pending-reviews', async (req, res) => {
  try {
    const { _limit = 20, _offset = 0 } = req.query

    const pendingReviews = await ImageResources.findPendingReviews(parseInt(_limit))

    // 为每个图片添加缩略图信息
    const reviewsWithThumbnails = pendingReviews.map(review => {
      const safeData = review.toSafeJSON()
      return {
        ...safeData,
        uploader: review.uploader
          ? {
            user_id: review.uploader.user_id,
            mobile: review.uploader.mobile,
            nickname: review.uploader.nickname
          }
          : null,
        hasThumbails: review.hasThumbnails()
      }
    })

    return res.apiSuccess(
      {
        reviews: reviewsWithThumbnails,
        total: reviewsWithThumbnails.length
      },
      '获取待审核图片列表成功'
    )
  } catch (error) {
    console.error('获取待审核图片失败:', error)
    return res.apiError('获取待审核图片失败', 'FETCH_PENDING_FAILED', { error: error.message }, 500)
  }
})

/**
 * 审核图片 - 通过/拒绝
 * POST /api/v4/photo/review/:resourceId
 */
router.post('/review/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params
    const { action, reason, points = 0, reviewer_id } = req.body

    if (!['approve', 'reject'].includes(action)) {
      return res.apiError('无效的审核操作，只能是approve或reject', 'INVALID_ACTION', null, 400)
    }

    const imageResource = await ImageResources.findByPk(resourceId, {
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ]
    })

    if (!imageResource) {
      return res.apiError('图片资源不存在', 'RESOURCE_NOT_FOUND', null, 404)
    }

    if (!imageResource.isPending()) {
      return res.apiError('该图片已经审核过了', 'ALREADY_REVIEWED', null, 400)
    }

    // 执行审核操作
    if (action === 'approve') {
      await imageResource.approve(reviewer_id, points, reason)
    } else {
      await imageResource.reject(reviewer_id, reason)
    }

    const safeData = imageResource.toSafeJSON()

    return res.apiSuccess(
      {
        ...safeData,
        hasThumbails: imageResource.hasThumbnails()
      },
      `图片${action === 'approve' ? '审核通过' : '审核拒绝'}`
    )
  } catch (error) {
    console.error('图片审核失败:', error)
    return res.apiError('图片审核失败', 'REVIEW_FAILED', { error: error.message }, 500)
  }
})

/**
 * 批量生成缩略图 - 管理员功能
 * POST /api/v4/photo/generate-thumbnails
 */
router.post('/generate-thumbnails', async (req, res) => {
  try {
    const { resourceIds } = req.body

    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return res.apiError('请提供要生成缩略图的资源ID数组', 'INVALID_RESOURCE_IDS', null, 400)
    }

    const resources = await ImageResources.findAll({
      where: {
        resource_id: resourceIds,
        status: 'active'
      }
    })

    const results = []

    for (const resource of resources) {
      try {
        if (
          !resource.hasThumbnails() &&
          ThumbnailService.isSupportedImageType(resource.mime_type)
        ) {
          const thumbnails = await resource.generateThumbnails()
          results.push({
            resource_id: resource.resource_id,
            success: true,
            thumbnails,
            message: '缩略图生成成功'
          })
        } else {
          results.push({
            resource_id: resource.resource_id,
            success: false,
            message: resource.hasThumbnails() ? '缩略图已存在' : '不支持的图片格式'
          })
        }
      } catch (error) {
        results.push({
          resource_id: resource.resource_id,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length

    return res.apiSuccess(
      {
        results,
        success_count: successCount,
        total_count: results.length
      },
      `批量生成缩略图完成，成功：${successCount}/${results.length}`
    )
  } catch (error) {
    console.error('批量生成缩略图失败:', error)
    return res.apiError(
      '批量生成缩略图失败',
      'BATCH_THUMBNAIL_FAILED',
      { error: error.message },
      500
    )
  }
})

/**
 * 获取缩略图统计信息
 * GET /api/v4/photo/thumbnail-stats
 */
router.get('/thumbnail-stats', async (req, res) => {
  try {
    const stats = await ThumbnailService.getThumbnailStats()

    return res.apiSuccess(stats, '获取缩略图统计成功')
  } catch (error) {
    console.error('获取缩略图统计失败:', error)
    return res.apiError('获取缩略图统计失败', 'STATS_FAILED', { error: error.message }, 500)
  }
})

/**
 * 获取用户上传记录列表 - 支持分页和筛选
 * GET /api/v4/photo/my-uploads
 */
router.get('/my-uploads', async (req, res) => {
  try {
    const {
      user_id,
      page = 1,
      limit = 20,
      review_status, // pending/approved/rejected/reviewing
      sort_by = 'created_at',
      order = 'DESC'
    } = req.query

    // 验证user_id参数
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    // 验证用户是否存在
    const user = await User.findByPk(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    // 构建查询条件
    const whereConditions = {
      user_id: parseInt(user_id),
      source_module: 'user_upload',
      status: 'active'
    }

    // 添加审核状态筛选
    if (review_status && ['pending', 'approved', 'rejected', 'reviewing'].includes(review_status)) {
      whereConditions.review_status = review_status
    }

    // 计算分页
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))) // 限制最多100条
    const offset = (pageNum - 1) * limitNum

    // 查询上传记录
    const { rows: uploads, count: total } = await ImageResources.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'reviewer',
          attributes: ['user_id', 'mobile', 'nickname'],
          required: false
        }
      ],
      limit: limitNum,
      offset,
      order: [[sort_by, order.toUpperCase()]],
      distinct: true,
      raw: false
    })

    // 格式化返回数据
    const uploadsData = uploads.map(upload => {
      const safeData = upload.toSafeJSON()
      return {
        ...safeData,
        reviewer: upload.reviewer
          ? {
            user_id: upload.reviewer.user_id,
            mobile: upload.reviewer.mobile,
            nickname: upload.reviewer.nickname
          }
          : null,
        has_thumbnails: upload.hasThumbnails(),
        // 添加上传状态描述
        status_text: getReviewStatusText(upload.review_status),
        // 是否可以重新上传（被拒绝的可以重新上传）
        can_reupload: upload.review_status === 'rejected'
      }
    })

    // 计算分页信息
    const totalPages = Math.ceil(total / limitNum)

    return res.apiSuccess(
      {
        uploads: uploadsData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_prev: pageNum > 1
        }
      },
      '获取上传记录成功'
    )
  } catch (error) {
    console.error('获取用户上传记录失败:', error)
    return res.apiError('获取上传记录失败', 'FETCH_UPLOADS_FAILED', { error: error.message }, 500)
  }
})

/**
 * 获取用户上传统计信息
 * GET /api/v4/photo/my-stats
 */
router.get('/my-stats', async (req, res) => {
  try {
    const { user_id } = req.query

    // 验证user_id参数
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    // 验证用户是否存在
    const user = await User.findByPk(user_id)
    if (!user) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
    }

    const userId = parseInt(user_id)
    const { Op } = require('sequelize')

    // 并行查询各种统计数据
    const [
      totalCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      reviewingCount,
      thisMonthCount,
      thisWeekCount,
      todayCount,
      totalPointsAwarded,
      latestUpload
    ] = await Promise.all([
      // 总上传数
      ImageResources.count({
        where: { user_id: userId, source_module: 'user_upload', status: 'active' }
      }),
      // 待审核数
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          review_status: 'pending',
          status: 'active'
        }
      }),
      // 已通过数
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          review_status: 'approved',
          status: 'active'
        }
      }),
      // 已拒绝数
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          review_status: 'rejected',
          status: 'active'
        }
      }),
      // 审核中数
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          review_status: 'reviewing',
          status: 'active'
        }
      }),
      // 本月上传数
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          status: 'active',
          created_at: {
            [Op.gte]: new Date(
              BeijingTimeHelper.createDatabaseTime().getFullYear(),
              BeijingTimeHelper.createDatabaseTime().getMonth(),
              1
            )
          }
        }
      }),
      // 本周上传数（从周一00:00开始）
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          status: 'active',
          created_at: {
            [Op.gte]: (() => {
              const now = BeijingTimeHelper.createDatabaseTime()
              const dayOfWeek = now.getDay() || 7 // 周日=0转为7
              const monday = new Date(now)
              monday.setDate(now.getDate() - (dayOfWeek - 1))
              monday.setHours(0, 0, 0, 0)
              return monday
            })()
          }
        }
      }),
      // 今日上传数（从今天00:00开始）
      ImageResources.count({
        where: {
          user_id: userId,
          source_module: 'user_upload',
          status: 'active',
          created_at: {
            [Op.gte]: (() => {
              const today = BeijingTimeHelper.createDatabaseTime()
              today.setHours(0, 0, 0, 0)
              return today
            })()
          }
        }
      }),
      // 总获得积分
      ImageResources.sum('points_awarded', {
        where: {
          user_id: userId,
          source_module: 'user_upload',
          review_status: 'approved',
          status: 'active'
        }
      }),
      // 最近一次上传
      ImageResources.findOne({
        where: { user_id: userId, source_module: 'user_upload', status: 'active' },
        order: [['created_at', 'DESC']],
        attributes: ['image_id', 'review_status', 'created_at', 'reviewed_at']
      })
    ])

    // 计算审核通过率
    const approvalRate = totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(1) : '0.0'

    // 计算平均每张获得积分
    const avgPointsPerUpload =
      approvedCount > 0 ? (totalPointsAwarded / approvedCount).toFixed(1) : '0.0'

    return res.apiSuccess(
      {
        // 总体统计
        total_uploads: totalCount,
        pending_count: pendingCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        reviewing_count: reviewingCount,

        // 审核率统计
        approval_rate: parseFloat(approvalRate),
        rejection_rate: totalCount > 0 ? ((rejectedCount / totalCount) * 100).toFixed(1) : '0.0',

        // 时间维度统计
        this_month_count: thisMonthCount,
        this_week_count: thisWeekCount,
        today_count: todayCount,

        // 积分统计
        total_points_awarded: totalPointsAwarded || 0,
        avg_points_per_upload: parseFloat(avgPointsPerUpload),

        // 最近上传信息
        latest_upload: latestUpload
          ? {
            image_id: latestUpload.image_id,
            review_status: latestUpload.review_status,
            status_text: getReviewStatusText(latestUpload.review_status),
            uploaded_at: latestUpload.created_at,
            reviewed_at: latestUpload.reviewed_at
          }
          : null,

        // 用户等级评估（基于上传数和通过率）
        user_level: getUserUploadLevel(totalCount, approvalRate),

        // 提示信息
        tips: generateUploadTips(pendingCount, rejectedCount, approvalRate)
      },
      '获取上传统计成功'
    )
  } catch (error) {
    console.error('获取用户上传统计失败:', error)
    return res.apiError('获取上传统计失败', 'FETCH_STATS_FAILED', { error: error.message }, 500)
  }
})

// ========== 辅助函数 ==========

/**
 * 获取审核状态文本描述
 * @param {string} status - 审核状态 (pending/reviewing/approved/rejected)
 * @returns {string} 审核状态的中文描述
 */
function getReviewStatusText (status) {
  const statusMap = {
    pending: '待审核',
    reviewing: '审核中',
    approved: '已通过',
    rejected: '已拒绝'
  }
  return statusMap[status] || '未知状态'
}

/**
 * 评估用户上传等级
 * @param {number} totalCount - 总上传数量
 * @param {string} approvalRate - 审核通过率百分比字符串
 * @returns {Object} 用户等级对象 {level, text, description}
 */
function getUserUploadLevel (totalCount, approvalRate) {
  const rate = parseFloat(approvalRate)

  if (totalCount >= 100 && rate >= 90) {
    return { level: 'platinum', text: '铂金用户', description: '上传达人' }
  } else if (totalCount >= 50 && rate >= 80) {
    return { level: 'gold', text: '黄金用户', description: '活跃上传者' }
  } else if (totalCount >= 20 && rate >= 70) {
    return { level: 'silver', text: '白银用户', description: '优质上传者' }
  } else if (totalCount >= 5 && rate >= 60) {
    return { level: 'bronze', text: '青铜用户', description: '新手上传者' }
  } else {
    return { level: 'beginner', text: '新手', description: '开始上传之旅' }
  }
}

/**
 * 生成上传提示信息
 * @param {number} pendingCount - 待审核数量
 * @param {number} rejectedCount - 已拒绝数量
 * @param {string} approvalRate - 审核通过率百分比字符串
 * @returns {Array<string>} 提示信息数组
 */
function generateUploadTips (pendingCount, rejectedCount, approvalRate) {
  const tips = []
  const rate = parseFloat(approvalRate)

  if (pendingCount > 0) {
    tips.push(`您有${pendingCount}张图片正在审核中，请耐心等待`)
  }

  if (rejectedCount > 3) {
    tips.push('部分图片被拒绝，建议查看拒绝原因后重新上传')
  }

  if (rate < 50 && rejectedCount > 0) {
    tips.push('审核通过率较低，建议上传清晰、符合要求的图片')
  }

  if (rate >= 90) {
    tips.push('您的审核通过率很高，继续保持！')
  }

  if (tips.length === 0) {
    tips.push('继续上传优质图片，获取更多积分奖励')
  }

  return tips
}

/**
 * 删除上传记录
 * DELETE /api/v4/photo/:id
 */
router.delete('/:id', async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const { id: resource_id } = req.params
    const { user_id } = req.body // 支持传入user_id或从token获取

    // 获取用户ID（优先从body，其次从token）
    const targetUserId = user_id || req.user?.user_id

    if (!targetUserId) {
      await transaction.rollback()
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    // 1. 查找图片资源记录
    const imageResource = await ImageResources.findByPk(resource_id, {
      include: [
        {
          model: User,
          as: 'uploader',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      transaction
    })

    if (!imageResource) {
      await transaction.rollback()
      return res.apiError('图片资源不存在', 'RESOURCE_NOT_FOUND', null, 404)
    }

    // 2. 权限验证：只允许删除自己上传的图片
    if (imageResource.user_id !== targetUserId) {
      await transaction.rollback()
      return res.apiError('无权限删除此图片', 'PERMISSION_DENIED', null, 403)
    }

    // 3. 检查图片状态：不允许删除已删除的记录
    if (imageResource.status === 'deleted') {
      await transaction.rollback()
      return res.apiError('图片已被删除', 'ALREADY_DELETED', null, 400)
    }

    // 记录删除前的状态，用于日志
    const originalStatus = imageResource.status
    const originalFilePath = imageResource.file_path
    const originalThumbnailPaths = imageResource.thumbnail_paths

    console.log(`🗑️ 开始删除图片资源: ${resource_id}，文件: ${originalFilePath}`)

    // 4. 删除本地原始文件
    if (originalFilePath) {
      try {
        const filePath = path.join(__dirname, '../../../uploads', originalFilePath)
        await fs.unlink(filePath)
        console.log(`✅ 删除本地原始文件成功: ${originalFilePath}`)
      } catch (fileError) {
        console.warn(`⚠️ 删除本地原始文件失败: ${originalFilePath}`, fileError.message)
        // 本地文件删除失败不阻止删除流程
      }
    }

    // 5. 删除缩略图（使用现有的ThumbnailService）
    if (originalThumbnailPaths && typeof originalThumbnailPaths === 'object') {
      try {
        const thumbnailService = new ThumbnailService()
        await thumbnailService.deleteThumbnails(originalThumbnailPaths)
        console.log('✅ 删除缩略图成功')
      } catch (thumbnailError) {
        console.warn('⚠️ 删除缩略图失败:', thumbnailError.message)
        // 缩略图删除失败不阻止删除流程
      }
    }

    // 6. 删除Sealos对象存储文件（如果存在sealos_url）
    if (imageResource.sealos_url) {
      try {
        const SealosStorageService = require('../../../services/sealosStorage')
        const sealosService = new SealosStorageService()
        const deleteSuccess = await sealosService.deleteFile(imageResource.sealos_url)

        if (deleteSuccess) {
          console.log(`✅ 删除Sealos对象存储文件成功: ${imageResource.sealos_url}`)
        } else {
          console.warn(`⚠️ 删除Sealos对象存储文件失败: ${imageResource.sealos_url}`)
        }
      } catch (sealosError) {
        console.warn('⚠️ 删除Sealos对象存储文件异常:', sealosError.message)
        // Sealos删除失败不阻止删除流程
      }
    }

    // 7. 软删除数据库记录
    await imageResource.update(
      {
        status: 'deleted',
        deleted_at: BeijingTimeHelper.createBeijingTime(),
        // 保留原始数据用于审计
        file_path: originalFilePath,
        thumbnail_paths: originalThumbnailPaths
      },
      { transaction }
    )

    await transaction.commit()

    console.log(`✅ 图片资源删除完成: ${resource_id}`)

    // 8. 返回删除结果
    return res.apiSuccess(
      {
        resource_id: parseInt(resource_id),
        original_status: originalStatus,
        deleted_at: imageResource.deleted_at,
        uploader: imageResource.uploader
          ? {
            user_id: imageResource.uploader.user_id,
            mobile: imageResource.uploader.mobile,
            nickname: imageResource.uploader.nickname
          }
          : null
      },
      '图片删除成功'
    )
  } catch (error) {
    await transaction.rollback()
    console.error('删除图片资源失败:', error)
    return res.apiError(
      '删除图片失败',
      'DELETE_FAILED',
      { error: error.message, resource_id: req.params.id },
      500
    )
  }
})

module.exports = router
