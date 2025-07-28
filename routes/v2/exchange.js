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
    fileSize: 15 * 1024 * 1024, // 15MB for exchange images
    files: 5 // 最多5个文件
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`兑换图片不支持的文件类型: ${file.mimetype}`), false);
    }
  }
});

/**
 * @route GET /api/v2/exchange
 * @desc 获取兑换业务API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(ApiResponse.success({
    module: 'exchange',
    description: '兑换业务图片资源管理API',
    version: '2.0.0',
    endpoints: {
      'GET /products/:productId': '获取特定兑换商品的图片资源',
      'POST /products/:productId/images': '为特定兑换商品上传图片（管理员）',
      'GET /categories': '获取兑换分类相关图片资源',
      'POST /categories/upload': '上传兑换分类图片（管理员）',
      'GET /promotions': '获取兑换促销活动图片',
      'POST /promotions/upload': '上传兑换促销图片（管理员）',
      'GET /rewards': '获取兑换奖励展示图片',
      'PUT /images/:resourceId/status': '更新兑换相关图片状态（管理员）',
      'GET /analytics': '获取兑换业务图片分析（管理员）'
    },
    businessType: 'exchange',
    supportedCategories: ['product', 'category', 'promotion', 'reward'],
    maxFileSize: '15MB',
    maxFiles: 5
  }));
});

/**
 * @route GET /api/v2/exchange/products/:productId
 * @desc 获取特定商品的图片资源
 * @access 需要认证
 */
router.get('/products/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { category = 'products', limit = 10 } = req.query;
    
    // 查询商品相关图片
    const result = await imageService.queryResources({
      businessType: 'exchange',
      category: category,
      contextId: parseInt(productId),
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    });
    
    res.json(
      ApiResponse.success(result.resources, '获取商品图片成功', {
        productId: productId,
        category: category,
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取商品图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取商品图片失败', 'GET_PRODUCT_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route POST /api/v2/exchange/products/:productId/images
 * @desc 为特定商品上传图片
 * @access 管理员
 */
router.post('/products/:productId/images', requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const { productId } = req.params;
    const { category = 'products', isActive = 'true', priority = 'high' } = req.body;
    
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
          businessType: 'exchange',
          category: category,
          contextId: parseInt(productId),
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'exchange_admin',
            productId: productId,
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
        
        return {
          success: true,
          resource: resource,
          filename: file.originalname
        };
        
      } catch (error) {
        console.error(`❌ 上传文件失败 ${file.originalname}:`, error.message);
        return {
          success: false,
          error: error.message,
          filename: file.originalname
        };
      }
    });
    
    const results = await Promise.all(uploadPromises);
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    res.status(successResults.length > 0 ? 201 : 400).json(
      ApiResponse.success({
        uploaded: successResults.map(r => r.resource),
        failed: failedResults,
        summary: {
          total: results.length,
          success: successResults.length,
          failed: failedResults.length
        }
      }, `商品图片上传完成: ${successResults.length}成功, ${failedResults.length}失败`)
    );
    
  } catch (error) {
    console.error('❌ 商品图片上传失败:', error.message);
    res.status(500).json(
      ApiResponse.error('商品图片上传失败', 'UPLOAD_PRODUCT_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/exchange/categories
 * @desc 获取兑换分类图片
 * @access 需要认证
 */
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const { categoryId, limit = 20 } = req.query;
    
    const queryParams = {
      businessType: 'exchange',
      category: 'categories',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    };
    
    if (categoryId) {
      queryParams.contextId = parseInt(categoryId);
    }
    
    const result = await imageService.queryResources(queryParams);
    
    res.json(
      ApiResponse.success(result.resources, '获取分类图片成功', {
        categoryId: categoryId || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取分类图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取分类图片失败', 'GET_CATEGORY_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route POST /api/v2/exchange/categories/upload
 * @desc 上传分类图片
 * @access 管理员
 */
router.post('/categories/upload', requireAdmin, upload.array('images', 3), async (req, res) => {
  try {
    const { categoryId, priority = 'normal' } = req.body;
    
    if (!categoryId) {
      return res.status(400).json(
        ApiResponse.error('缺少分类ID', 'MISSING_CATEGORY_ID')
      );
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(
        ApiResponse.error('未上传图片文件', 'NO_FILES')
      );
    }
    
    const uploadResults = [];
    
    for (const file of req.files) {
      try {
        const resourceData = {
          businessType: 'exchange',
          category: 'categories',
          contextId: parseInt(categoryId),
          userId: req.user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          metadata: {
            uploadUserAgent: req.headers['user-agent'],
            uploadIp: req.ip,
            uploadSource: 'exchange_category_admin',
            categoryId: categoryId
          }
        };
        
        const resource = await imageService.createResource(
          resourceData,
          file.buffer,
          { isActive: true, priority: priority }
        );
        
        uploadResults.push(resource);
        
      } catch (error) {
        console.error(`❌ 上传分类图片失败 ${file.originalname}:`, error.message);
      }
    }
    
    res.json(
      ApiResponse.success(uploadResults, `分类图片上传成功: ${uploadResults.length}个文件`)
    );
    
  } catch (error) {
    console.error('❌ 分类图片上传失败:', error.message);
    res.status(500).json(
      ApiResponse.error('分类图片上传失败', 'UPLOAD_CATEGORY_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/exchange/promotions
 * @desc 获取促销活动图片
 * @access 需要认证
 */
router.get('/promotions', authenticateToken, async (req, res) => {
  try {
    const { promotionId, limit = 10 } = req.query;
    
    const queryParams = {
      businessType: 'exchange',
      category: 'promotions',
      status: 'active',
      limit: parseInt(limit),
      orderBy: 'created_at',
      order: 'DESC'
    };
    
    if (promotionId) {
      queryParams.contextId = parseInt(promotionId);
    }
    
    const result = await imageService.queryResources(queryParams);
    
    res.json(
      ApiResponse.success(result.resources, '获取促销图片成功', {
        promotionId: promotionId || 'all',
        count: result.resources.length,
        pagination: result.pagination
      })
    );
    
  } catch (error) {
    console.error('❌ 获取促销图片失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取促销图片失败', 'GET_PROMOTION_IMAGES_FAILED', error.message)
    );
  }
});

/**
 * @route PUT /api/v2/exchange/images/:resourceId/activate
 * @desc 激活/停用兑换相关图片
 * @access 管理员
 */
router.put('/images/:resourceId/activate', requireAdmin, async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json(
        ApiResponse.error('isActive参数必须是布尔值', 'INVALID_ACTIVE_STATUS')
      );
    }
    
    const resource = await imageService.updateResource(resourceId, {
      status: isActive ? 'active' : 'archived',
      metadata: {
        lastStatusChange: new Date().toISOString(),
        changedBy: req.user.id
      }
    });
    
    res.json(
      ApiResponse.success(resource, `图片${isActive ? '激活' : '停用'}成功`)
    );
    
  } catch (error) {
    if (error.message.includes('不存在')) {
      return res.status(404).json(
        ApiResponse.error('图片资源不存在', 'RESOURCE_NOT_FOUND')
      );
    }
    
    console.error('❌ 更新图片状态失败:', error.message);
    res.status(500).json(
      ApiResponse.error('更新图片状态失败', 'UPDATE_IMAGE_STATUS_FAILED', error.message)
    );
  }
});

/**
 * @route GET /api/v2/exchange/stats
 * @desc 获取兑换业务图片统计
 * @access 管理员
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await imageService.getBusinessStats('exchange');
    
    res.json(
      ApiResponse.success(stats, '获取兑换业务统计成功')
    );
    
  } catch (error) {
    console.error('❌ 获取兑换业务统计失败:', error.message);
    res.status(500).json(
      ApiResponse.error('获取统计信息失败', 'GET_EXCHANGE_STATS_FAILED', error.message)
    );
  }
});

module.exports = router; 