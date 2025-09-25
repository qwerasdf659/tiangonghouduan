/**
 * 图片上传和管理路由 - 集成缩略图功能
 * 支持图片上传、缩略图生成、审核管理
 */

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
    const filename = `${Date.now()}_${uniqueId}${ext}`
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
    const imageResource = await ImageResources.create({
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
    }, { transaction })

    // 检查是否为支持的图片格式，如果是则生成缩略图
    if (ThumbnailService.isSupportedImageType(file.mimetype)) {
      try {
        console.log('🖼️ 开始生成缩略图...')
        const thumbnails = await imageResource.generateThumbnails()
        console.log('✅ 缩略图生成成功:', thumbnails)
      } catch (thumbnailError) {
        console.warn('⚠️ 缩略图生成失败，但上传继续:', thumbnailError.message)
        // 缩略图生成失败不影响主要上传流程
      }
    } else {
      console.log('ℹ️ 不支持的图片格式，跳过缩略图生成:', file.mimetype)
    }

    await transaction.commit()

    // 返回安全的JSON（包含缩略图信息）
    const safeData = imageResource.toSafeJSON()

    return res.apiSuccess({
      ...safeData,
      uploaded_at: new Date().toISOString(),
      // 提供便于前端使用的字段
      hasThumbails: imageResource.hasThumbnails(),
      uploadStatus: 'success'
    }, '图片上传成功')
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

    return res.apiSuccess({
      reviews: reviewsWithThumbnails,
      total: reviewsWithThumbnails.length
    }, '获取待审核图片列表成功')
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
      include: [{
        model: User,
        as: 'uploader',
        attributes: ['user_id', 'mobile', 'nickname']
      }]
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

    return res.apiSuccess({
      ...safeData,
      hasThumbails: imageResource.hasThumbnails()
    }, `图片${action === 'approve' ? '审核通过' : '审核拒绝'}`)
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
        if (!resource.hasThumbnails() && ThumbnailService.isSupportedImageType(resource.mime_type)) {
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

    return res.apiSuccess({
      results,
      success_count: successCount,
      total_count: results.length
    }, `批量生成缩略图完成，成功：${successCount}/${results.length}`)
  } catch (error) {
    console.error('批量生成缩略图失败:', error)
    return res.apiError('批量生成缩略图失败', 'BATCH_THUMBNAIL_FAILED', { error: error.message }, 500)
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

module.exports = router
