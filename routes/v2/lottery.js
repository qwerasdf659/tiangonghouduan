const express = require('express');
const multer = require('multer');
const ImageResourceService = require('../../services/ImageResourceService');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const ApiResponse = require('../../utils/ApiResponse');
const router = express.Router();

// 初始化服务
const imageService = new ImageResourceService();

// 配置文件上传中间件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for lottery images
    files: 3 // 最多3个文件
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`抽奖图片不支持的文件类型: ${file.mimetype}`), false);
    }
  }
});

/**
 * @route GET /api/v2/lottery
 * @desc 获取抽奖业务API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(ApiResponse.success({
    module: 'lottery',
    description: '抽奖业务图片资源管理API',
    version: '2.0.0',
    endpoints: {
      'GET /prizes/:prizeId': '获取特定奖品的图片资源',
      'POST /prizes/:prizeId/images': '为特定奖品上传图片（管理员）',
      'GET /wheels': '获取转盘相关图片资源',
      'POST /wheels/upload': '上传转盘背景或装饰图片（管理员）',
      'GET /banners': '获取抽奖活动横幅图片',
      'POST /banners/upload': '上传抽奖活动横幅（管理员）',
      'GET /results': '获取抽奖结果展示图片',
      'PUT /images/:resourceId/activate': '激活/停用抽奖相关图片（管理员）',
      'GET /stats': '获取抽奖业务图片统计（管理员）'
    },
    businessType: 'lottery',
    supportedCategories: ['prize', 'wheel', 'banner', 'result'],
    maxFileSize: '10MB',
    maxFiles: 3
  }));
});

/**
 * @route GET /api/v2/lottery/prizes/:prizeId
 * @desc 获取特定奖品的图片资源
 * @access 需要认证
 */
router.get('/prizes/:prizeId', authenticateToken, async (req, res) => {
  try {
    const { prizeId } = req.params;
    const { category = 'prizes', limit = 10 } = req.query;
    
    // 查询奖品相关图片
    const result = await imageService.queryResources({
      businessType: 'lottery',
      category: category,
      contextId: parseInt(prizeId),
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    });
    
    res.json(
      ApiResponse.success(result.resources, '获取奖品图片成功', {
        prizeId: prizeId,
        category: category,
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取奖品图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取奖品图片失败', 'GET_PRIZE_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route POST /api/v2/lottery/prizes/:prizeId/images
 * @desc 为特定奖品上传图片
 * @access 管理员
 */
router.post('/prizes/:prizeId/images', requireAdmin, upload.array('images', 3), async (req, res) => {
  try {
    const { prizeId } = req.params;
    const { category = 'prizes', isActive = 'true', priority = 'high' } = req.body;
    
    // 验证文件
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(
        ApiResponse.error('未上传图片文件', 'NO_FILES')
      );
    }
    
    const uploadResults = [];
    
    // 并行处理多个文件
    const uploadPromises = req.files.map(async (file, index) => {
      try {
        const resourceData = {
          businessType: 'lottery',
          category: category,
          contextId: parseInt(prizeId),
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'lottery_admin',
            prizeId: prizeId,
            uploadIndex: index
          }
        };
        
        const uploadOptions = {
          isActive: isActive === 'true',
          priority: priority
        };
        
        const resource = await imageService.createResource(
          resourceData,
          file.buffer,
          uploadOptions
        );
        
        uploadResults.push({
          success: true,
          resourceId: resource.resource_id,
          filename: file.originalname,
          url: resource.imageUrl,
          thumbnails: resource.thumbnails
        });
        
      } catch (error) {
        uploadResults.push({
          success: false,
          filename: file.originalname,
          error: error.message
        });
      }
    });
    
    await Promise.all(uploadPromises);
    
    const successCount = uploadResults.filter(r => r.success).length;
    const successRate = (successCount / uploadResults.length * 100).toFixed(1);
    
    console.log(`✅ 奖品图片上传完成: ${successCount}/${uploadResults.length} (${successRate}%)`);
    
    res.status(201).json(
      ApiResponse.created(uploadResults, '奖品图片上传完成', {
        prizeId: prizeId,
        category: category,
        successCount: successCount,
        totalCount: uploadResults.length,
        successRate: `${successRate}%`
      })
    );
    
  } catch (error) {
    console.error('❌ 奖品图片上传失败:', error.message);
    res.status(500).json(
      ApiResponse.error('奖品图片上传失败', 'UPLOAD_PRIZE_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/lottery/wheels
 * @desc 获取转盘相关图片资源
 * @access 需要认证
 */
router.get('/wheels', authenticateToken, async (req, res) => {
  try {
    const { wheelId, limit = 20 } = req.query;
    
    const queryParams = {
      businessType: 'lottery',
      category: 'wheels',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    };
    
    if (wheelId) {
      queryParams.contextId = parseInt(wheelId);
    }
    
    const result = await imageService.queryResources(queryParams);
    
    res.json(
      ApiResponse.success(result.resources, '获取转盘图片成功', {
        wheelId: wheelId || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取转盘图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取转盘图片失败', 'GET_WHEEL_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route POST /api/v2/lottery/wheels/upload
 * @desc 上传转盘背景或装饰图片
 * @access 管理员
 */
router.post('/wheels/upload', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { wheelId, category = 'wheels', description } = req.body;
    
    // 验证必需参数
    if (!wheelId) {
      return res.status(400).json(
        ApiResponse.error('缺少转盘ID参数', 'MISSING_WHEEL_ID')
      );
    }
    
    // 验证文件
    if (!req.file) {
      return res.status(400).json(
        ApiResponse.error('未上传图片文件', 'NO_FILE')
      );
    }
    
    const resourceData = {
      businessType: 'lottery',
      category: category,
      contextId: parseInt(wheelId),
      userId: req.user.id,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata: {
        uploadUserAgent: req.headers['user-agent'],
        uploadIp: req.ip,
        uploadSource: 'lottery_wheel_admin',
        wheelId: wheelId,
        description: description || '转盘图片'
      }
    };
    
    const uploadOptions = {
      isActive: true,
      priority: 'high'
    };
    
    const resource = await imageService.createResource(
      resourceData,
      req.file.buffer,
      uploadOptions
    );
    
    console.log(`✅ 转盘图片上传成功: ${resource.resource_id}`);
    
    res.status(201).json(
      ApiResponse.created(resource, '转盘图片上传成功', {
        wheelId: wheelId,
        category: category,
        fileSize: req.file.size
      })
    );
    
  } catch (error) {
    console.error('❌ 转盘图片上传失败:', error.message);
    res.status(500).json(
      ApiResponse.error('转盘图片上传失败', 'UPLOAD_WHEEL_IMAGE_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/lottery/banners
 * @desc 获取抽奖活动横幅图片
 * @access 需要认证
 */
router.get('/banners', authenticateToken, async (req, res) => {
  try {
    const { activityId, isActive, limit = 10 } = req.query;
    
    const queryParams = {
      businessType: 'lottery',
      category: 'banners',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    };
    
    if (activityId) {
      queryParams.contextId = parseInt(activityId);
    }
    
    const result = await imageService.queryResources(queryParams);
    
    // 如果需要只返回活跃的横幅
    let banners = result.resources;
    if (isActive === 'true') {
      banners = banners.filter(banner => 
        banner.metadata && banner.metadata.isActive === true
      );
    }
    
    res.json(
      ApiResponse.success(banners, '获取横幅图片成功', {
        activityId: activityId || 'all',
        isActiveFilter: isActive,
        count: banners.length,
        originalCount: result.resources.length
      })
    );
    
  } catch (error) {
    console.error('❌ 获取横幅图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取横幅图片失败', 'GET_BANNER_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route POST /api/v2/lottery/banners/upload
 * @desc 上传抽奖活动横幅
 * @access 管理员
 */
router.post('/banners/upload', requireAdmin, upload.single('banner'), async (req, res) => {
  try {
    const { 
      activityId, 
      title, 
      description, 
      startDate, 
      endDate, 
      isActive = 'true',
      position = 'main'
    } = req.body;
    
    // 验证必需参数
    if (!activityId || !title) {
      return res.status(400).json(
        ApiResponse.error('缺少必需参数: activityId, title', 'MISSING_PARAMS')
      );
    }
    
    // 验证文件
    if (!req.file) {
      return res.status(400).json(
        ApiResponse.error('未上传横幅文件', 'NO_FILE')
      );
    }
    
    const resourceData = {
      businessType: 'lottery',
      category: 'banners',
      contextId: parseInt(activityId),
      userId: req.user.id,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      metadata: {
        uploadUserAgent: req.headers['user-agent'],
        uploadIp: req.ip,
        uploadSource: 'lottery_banner_admin',
        activityId: activityId,
        title: title,
        description: description || '',
        startDate: startDate,
        endDate: endDate,
        isActive: isActive === 'true',
        position: position,
        createdBy: req.user.id
      }
    };
    
    const uploadOptions = {
      isActive: isActive === 'true',
      priority: 'high'
    };
    
    const resource = await imageService.createResource(
      resourceData,
      req.file.buffer,
      uploadOptions
    );
    
    console.log(`✅ 横幅图片上传成功: ${resource.resource_id}`);
    
    res.status(201).json(
      ApiResponse.created(resource, '横幅图片上传成功', {
        activityId: activityId,
        title: title,
        position: position,
        isActive: isActive === 'true',
        fileSize: req.file.size
      })
    );
    
  } catch (error) {
    console.error('❌ 横幅图片上传失败:', error.message);
    res.status(500).json(
      ApiResponse.error('横幅图片上传失败', 'UPLOAD_BANNER_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/lottery/results
 * @desc 获取抽奖结果展示图片
 * @access 需要认证
 */
router.get('/results', authenticateToken, async (req, res) => {
  try {
    const { userId, prizeId, dateFrom, dateTo, limit = 20 } = req.query;
    
    const queryParams = {
      businessType: 'lottery',
      category: 'results',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    };
    
    // 普通用户只能查看自己的抽奖结果图片
    if (!req.user.is_admin) {
      queryParams.userId = req.user.id;
    } else if (userId) {
      queryParams.userId = parseInt(userId);
    }
    
    if (prizeId) {
      queryParams.contextId = parseInt(prizeId);
    }
    
    if (dateFrom) {
      queryParams.dateFrom = dateFrom;
    }
    
    if (dateTo) {
      queryParams.dateTo = dateTo;
    }
    
    const result = await imageService.queryResources(queryParams);
    
    res.json(
      ApiResponse.success(result.resources, '获取抽奖结果图片成功', {
        userId: userId || (req.user.is_admin ? 'all' : req.user.id),
        prizeId: prizeId || 'all',
        dateRange: dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取抽奖结果图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取抽奖结果图片失败', 'GET_RESULT_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route PUT /api/v2/lottery/images/:resourceId/activate
 * @desc 激活/停用抽奖相关图片
 * @access 管理员
 */
router.put('/images/:resourceId/activate', requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json(
        ApiResponse.error('isActive参数必须是布尔值', 'INVALID_ACTIVE_PARAM')
      );
    }
    
    // 获取资源信息确认是抽奖业务
    const resource = await imageService.getResourceById(resourceId);
    
    if (resource.business_type !== 'lottery') {
      return res.status(400).json(
        ApiResponse.error('只能操作抽奖业务的图片资源', 'INVALID_BUSINESS_TYPE')
      );
    }
    
    const updateData = {
      metadata: {
        ...resource.metadata,
        isActive: isActive,
        lastActivatedAt: new Date().toISOString(),
        activatedBy: req.user.id
      }
    };
    
    const updatedResource = await imageService.updateResource(
      resourceId,
      updateData,
      req.user.id
    );
    
    console.log(`✅ 图片激活状态更新: ${resourceId}, isActive: ${isActive}`);
    
    res.json(
      ApiResponse.success(updatedResource, '图片状态更新成功', {
        resourceId: resourceId,
        isActive: isActive,
        operatedBy: req.user.id
      })
    );
    
  } catch (error) {
    console.error('❌ 更新图片状态失败:', error.message);
    
    if (error.message.includes('资源不存在')) {
      return res.status(404).json(
        ApiResponse.error('图片资源不存在', 'RESOURCE_NOT_FOUND')
      );
    }
    
    res.status(500).json(
      ApiResponse.error('更新图片状态失败', 'UPDATE_IMAGE_STATUS_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/lottery/stats
 * @desc 获取抽奖业务图片统计
 * @access 管理员
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    const stats = await imageService.getStorageStats({
      businessType: 'lottery',
      dateFrom: dateFrom,
      dateTo: dateTo
    });
    
    // 按分类统计
    const categoryStats = {};
    const storageStats = {};
    
    stats.forEach(stat => {
      // 这里假设stat包含category信息，实际需要根据查询结果调整
      const category = stat.category || 'unknown';
      const storageLayer = stat.storage_layer;
      
      if (!categoryStats[category]) {
        categoryStats[category] = { count: 0, totalSize: 0 };
      }
      
      if (!storageStats[storageLayer]) {
        storageStats[storageLayer] = { count: 0, totalSize: 0 };
      }
      
      categoryStats[category].count += parseInt(stat.count);
      categoryStats[category].totalSize += parseInt(stat.total_size || 0);
      
      storageStats[storageLayer].count += parseInt(stat.count);
      storageStats[storageLayer].totalSize += parseInt(stat.total_size || 0);
    });
    
    res.json(
      ApiResponse.success({
        categoryStats: categoryStats,
        storageStats: storageStats,
        rawStats: stats
      }, '获取抽奖图片统计成功', {
        dateRange: dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'all',
        timestamp: new Date().toISOString()
      })
    );
    
  } catch (error) {
    console.error('❌ 获取抽奖图片统计失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取抽奖图片统计失败', 'GET_LOTTERY_STATS_FAILED', error.message)
    );
  }
});

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error('❌ 抽奖路由错误:', error.message);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(
        ApiResponse.error('抽奖图片文件大小超过10MB限制', 'FILE_SIZE_LIMIT')
      );
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json(
        ApiResponse.error('上传文件数量超过限制', 'FILE_COUNT_LIMIT')
      );
    }
  }
  
  res.status(500).json(
    ApiResponse.error('抽奖服务内部错误', 'LOTTERY_INTERNAL_ERROR', error.message)
  );
});

module.exports = router; 