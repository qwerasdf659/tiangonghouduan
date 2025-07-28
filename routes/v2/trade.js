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
    fileSize: 12 * 1024 * 1024, // 12MB for trade images
    files: 3 // 最多3个文件
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`交易图片不支持的文件类型: ${file.mimetype}`), false)
    }
  }
})

/**
 * @route GET /api/v2/trade
 * @desc 获取交易业务API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(ApiResponse.success({
    module: 'trade',
    description: '交易业务图片资源管理API',
    version: '2.0.0',
    endpoints: {
      'GET /items/:itemId': '获取特定交易物品的图片资源',
      'POST /items/:itemId/images': '为特定交易物品上传图片（需要认证）',
      'GET /marketplace': '获取交易市场相关图片资源',
      'POST /marketplace/upload': '上传交易市场图片（管理员）',
      'GET /transactions': '获取交易记录展示图片',
      'POST /transactions/upload': '上传交易证明图片（需要认证）',
      'GET /verification': '获取交易验证图片',
      'PUT /images/:resourceId/verify': '验证交易相关图片（管理员）',
      'GET /reports': '获取交易业务图片报告（管理员）'
    },
    businessType: 'trade',
    supportedCategories: ['item', 'marketplace', 'transaction', 'verification'],
    maxFileSize: '12MB',
    maxFiles: 3
  }))
})

/**
 * @route GET /api/v2/trade/items/:itemId
 * @desc 获取特定交易物品的图片资源
 * @access 需要认证
 */
router.get('/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params
    const { category = 'items', limit = 10 } = req.query

    // 查询交易物品相关图片
    const result = await imageService.queryResources({
      businessType: 'trade',
      category: category,
      contextId: parseInt(itemId),
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    })

    res.json(
      ApiResponse.success(result.resources, '获取交易物品图片成功', {
        itemId: itemId,
        category: category,
        count: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取交易物品图片失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取交易物品图片失败', 'GET_TRADE_ITEM_IMAGES_FAILED', error.message)
    )
  }
})

/**
 * @route POST /api/v2/trade/items/:itemId/images
 * @desc 为特定交易物品上传图片
 * @access 需要认证
 */
router.post('/items/:itemId/images', authenticateToken, upload.array('images', 3), async (req, res) => {
  try {
    const { itemId } = req.params
    const { category = 'items', isActive = 'true', priority = 'normal' } = req.body

    // 验证文件
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(
        ApiResponse.error('未上传图片文件', 'NO_FILES')
      )
    }

    const uploadResults = []

    // 处理多个文件
    for (const file of req.files) {
      try {
        const resourceData = {
          businessType: 'trade',
          category: category,
          contextId: parseInt(itemId),
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'trade_user',
            itemId: itemId
          }
        }

        const uploadOptions = {
          isActive: isActive === 'true',
          priority: priority
        }

        const resource = await imageService.createResource(
          resourceData,
          file.buffer,
          uploadOptions
        )

        uploadResults.push(resource)
      } catch (error) {
        console.error(`❌ 上传交易物品图片失败 ${file.originalname}:`, error.message)
      }
    }

    res.status(201).json(
      ApiResponse.success(uploadResults, `交易物品图片上传成功: ${uploadResults.length}个文件`)
    )
  } catch (error) {
    console.error('❌ 交易物品图片上传失败:', error.message)
    res.status(500).json(
      ApiResponse.error('交易物品图片上传失败', 'UPLOAD_TRADE_ITEM_IMAGES_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/trade/banners
 * @desc 获取交易横幅图片
 * @access 需要认证
 */
router.get('/banners', authenticateToken, async (req, res) => {
  try {
    const { bannerId, limit = 5 } = req.query

    const queryParams = {
      businessType: 'trade',
      category: 'banners',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    }

    if (bannerId) {
      queryParams.contextId = parseInt(bannerId)
    }

    const result = await imageService.queryResources(queryParams)

    res.json(
      ApiResponse.success(result.resources, '获取交易横幅成功', {
        bannerId: bannerId || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取交易横幅失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取交易横幅失败', 'GET_TRADE_BANNERS_FAILED', error.message)
    )
  }
})

/**
 * @route POST /api/v2/trade/banners/upload
 * @desc 上传交易横幅图片
 * @access 管理员
 */
router.post('/banners/upload', requireAdmin, upload.single('banner'), async (req, res) => {
  try {
    const { bannerId, priority = 'high' } = req.body

    if (!bannerId) {
      return res.status(400).json(
        ApiResponse.error('缺少横幅ID', 'MISSING_BANNER_ID')
      )
    }

    if (!req.file) {
      return res.status(400).json(
        ApiResponse.error('未上传横幅图片', 'NO_FILE')
      )
    }

    const resourceData = {
      businessType: 'trade',
      category: 'banners',
      contextId: parseInt(bannerId),
      userId: req.user.id,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata: {
        uploadUserAgent: req.headers['user-agent'],
        uploadIp: req.ip,
        uploadSource: 'trade_banner_admin',
        bannerId: bannerId
      }
    }

    const resource = await imageService.createResource(
      resourceData,
      req.file.buffer,
      { isActive: true, priority: priority }
    )

    res.json(
      ApiResponse.success(resource, '交易横幅上传成功')
    )
  } catch (error) {
    console.error('❌ 交易横幅上传失败:', error.message)
    res.status(500).json(
      ApiResponse.error('交易横幅上传失败', 'UPLOAD_TRADE_BANNER_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/trade/transactions
 * @desc 获取交易记录相关图片
 * @access 需要认证
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const { transactionId, userId, limit = 20 } = req.query

    const queryParams = {
      businessType: 'trade',
      category: 'transactions',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    }

    if (transactionId) {
      queryParams.contextId = parseInt(transactionId)
    }

    if (userId) {
      queryParams.userId = parseInt(userId)
    }

    const result = await imageService.queryResources(queryParams)

    res.json(
      ApiResponse.success(result.resources, '获取交易记录图片成功', {
        transactionId: transactionId || 'all',
        userId: userId || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    )
  } catch (error) {
    console.error('❌ 获取交易记录图片失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取交易记录图片失败', 'GET_TRANSACTION_IMAGES_FAILED', error.message)
    )
  }
})

/**
 * @route PUT /api/v2/trade/images/:resourceId/activate
 * @desc 激活/停用交易相关图片
 * @access 管理员
 */
router.put('/images/:resourceId/activate', requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.params
    const { isActive } = req.body

    if (typeof isActive !== 'boolean') {
      return res.status(400).json(
        ApiResponse.error('isActive参数必须是布尔值', 'INVALID_ACTIVE_STATUS')
      )
    }

    const resource = await imageService.updateResource(resourceId, {
      status: isActive ? 'active' : 'archived',
      metadata: {
        lastStatusChange: new Date().toISOString(),
        changedBy: req.user.id
      }
    })

    res.json(
      ApiResponse.success(resource, `交易图片${isActive ? '激活' : '停用'}成功`)
    )
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json(
        ApiResponse.error('图片资源不存在', 'RESOURCE_NOT_FOUND')
      )
    }

    console.error('❌ 更新交易图片状态失败:', error.message)
    res.status(500).json(
      ApiResponse.error('更新图片状态失败', 'UPDATE_TRADE_IMAGE_STATUS_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/trade/stats
 * @desc 获取交易业务图片统计
 * @access 管理员
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await imageService.getBusinessStats('trade')

    res.json(
      ApiResponse.success(stats, '获取交易业务统计成功')
    )
  } catch (error) {
    console.error('❌ 获取交易业务统计失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取统计信息失败', 'GET_TRADE_STATS_FAILED', error.message)
    )
  }
})

module.exports = router