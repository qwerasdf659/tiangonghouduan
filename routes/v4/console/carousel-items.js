/**
 * 管理后台 - 轮播图管理模块
 *
 * 业务范围：
 * - 轮播图列表查询（分页+筛选）
 * - 创建轮播图（含图片上传到 Sealos 对象存储）
 * - 更新轮播图（可选更新图片）
 * - 删除轮播图（同步删除 Sealos 上的图片对象）
 * - 启用/禁用轮播图
 * - 调整显示顺序
 * - 统计信息
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 CarouselItemService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @see docs/广告系统升级方案.md 14.1
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

/** 轮播图图片上传配置：400KB + 仅 JPG/PNG */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 400 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持 JPG、PNG 格式的图片'), false)
    }
  }
})

const VALID_DISPLAY_MODES = ['wide', 'horizontal', 'square']

/**
 * GET / - 获取轮播图列表
 * @route GET /api/v4/console/carousel-items
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { position = null, is_active = null, page = 1, limit = 20 } = req.query
      const offset = (parseInt(page) - 1) * parseInt(limit)

      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const { carouselItems, total } = await CarouselItemService.getAdminCarouselList({
        position,
        is_active,
        limit: parseInt(limit),
        offset
      })

      return res.apiSuccess(
        {
          carousel_items: carouselItems,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            total_pages: Math.ceil(total / parseInt(limit))
          }
        },
        '获取轮播图列表成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取轮播图列表失败', { error: error.message })
      return res.apiInternalError('获取轮播图列表失败', error.message, 'CAROUSEL_LIST_ERROR')
    }
  })
)

/**
 * GET /statistics - 获取轮播图统计
 * @route GET /api/v4/console/carousel-items/statistics
 */
router.get(
  '/statistics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const statistics = await CarouselItemService.getStatistics()
      return res.apiSuccess({ statistics }, '获取轮播图统计成功')
    } catch (error) {
      sharedComponents.logger.error('获取轮播图统计失败', { error: error.message })
      return res.apiInternalError('获取轮播图统计失败', error.message, 'CAROUSEL_STATS_ERROR')
    }
  })
)

/**
 * GET /:id - 获取单个轮播图详情
 * @route GET /api/v4/console/carousel-items/:id
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const carouselItem = await CarouselItemService.getCarouselById(parseInt(req.params.id))

      if (!carouselItem) {
        return res.apiError('轮播图不存在', 'CAROUSEL_NOT_FOUND', null, 404)
      }

      return res.apiSuccess({ carousel_item: carouselItem }, '获取轮播图详情成功')
    } catch (error) {
      sharedComponents.logger.error('获取轮播图详情失败', { error: error.message })
      return res.apiInternalError('获取轮播图详情失败', error.message, 'CAROUSEL_DETAIL_ERROR')
    }
  })
)

/**
 * POST / - 创建轮播图（含图片上传）
 * @route POST /api/v4/console/carousel-items
 */
router.post(
  '/',
  adminAuthMiddleware,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    try {
      const {
        title,
        display_mode,
        link_url = null,
        link_type = 'none',
        position = 'home',
        is_active = 'false',
        display_order = 0,
        slide_interval_ms = 3000,
        start_time = null,
        end_time = null
      } = req.body

      if (!title || title.trim() === '') {
        return res.apiError('轮播图标题不能为空', 'INVALID_PARAMETERS', null, 400)
      }
      if (!display_mode || !VALID_DISPLAY_MODES.includes(display_mode)) {
        return res.apiError(
          '请选择显示模式（wide/horizontal/square）',
          'DISPLAY_MODE_REQUIRED',
          null,
          400
        )
      }
      if (!req.file) {
        return res.apiError('请上传轮播图图片', 'IMAGE_REQUIRED', null, 400)
      }

      const CarouselItemService = req.app.locals.services.getService('carousel_item')

      const { objectKey, dimensions } = await CarouselItemService.uploadCarouselImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      )

      const carouselItem = await CarouselItemService.createCarousel(
        {
          title: title.trim(),
          image_url: objectKey,
          display_mode,
          image_width: dimensions.width,
          image_height: dimensions.height,
          link_url,
          link_type,
          position,
          is_active: is_active === 'true' || is_active === true,
          display_order: parseInt(display_order) || 0,
          slide_interval_ms: parseInt(slide_interval_ms) || 3000,
          start_time,
          end_time
        },
        req.user.user_id
      )

      sharedComponents.logger.info('管理员创建轮播图', {
        admin_id: req.user.user_id,
        carousel_item_id: carouselItem.carousel_item_id,
        title: carouselItem.title
      })

      return res.apiSuccess({ carousel_item: carouselItem }, '创建轮播图成功', 201)
    } catch (error) {
      sharedComponents.logger.error('创建轮播图失败', { error: error.message })
      return res.apiInternalError('创建轮播图失败', error.message, 'CAROUSEL_CREATE_ERROR')
    }
  })
)

/**
 * PUT /:id - 更新轮播图（可选更新图片）
 * @route PUT /api/v4/console/carousel-items/:id
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    try {
      const updateData = { ...req.body }

      if (updateData.display_mode && !VALID_DISPLAY_MODES.includes(updateData.display_mode)) {
        return res.apiError(
          '显示模式无效（wide/horizontal/square）',
          'INVALID_DISPLAY_MODE',
          null,
          400
        )
      }

      const CarouselItemService = req.app.locals.services.getService('carousel_item')

      if (req.file) {
        const { objectKey, dimensions } = await CarouselItemService.uploadCarouselImage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          req.file.size
        )
        updateData.image_url = objectKey
        updateData.image_width = dimensions.width
        updateData.image_height = dimensions.height
      }

      const carouselItem = await CarouselItemService.updateCarousel(
        parseInt(req.params.id),
        updateData
      )

      if (!carouselItem) {
        return res.apiError('轮播图不存在', 'CAROUSEL_NOT_FOUND', null, 404)
      }

      sharedComponents.logger.info('管理员更新轮播图', {
        admin_id: req.user.user_id,
        carousel_item_id: req.params.id,
        updated_fields: Object.keys(updateData)
      })

      return res.apiSuccess({ carousel_item: carouselItem }, '更新轮播图成功')
    } catch (error) {
      sharedComponents.logger.error('更新轮播图失败', { error: error.message })
      return res.apiInternalError('更新轮播图失败', error.message, 'CAROUSEL_UPDATE_ERROR')
    }
  })
)

/**
 * DELETE /:id - 删除轮播图
 * @route DELETE /api/v4/console/carousel-items/:id
 */
router.delete(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const deleted = await CarouselItemService.deleteCarousel(parseInt(req.params.id))

      if (!deleted) {
        return res.apiError('轮播图不存在或删除失败', 'CAROUSEL_DELETE_FAILED', null, 404)
      }

      sharedComponents.logger.info('管理员删除轮播图', {
        admin_id: req.user.user_id,
        carousel_item_id: req.params.id
      })

      return res.apiSuccess({}, '删除轮播图成功')
    } catch (error) {
      sharedComponents.logger.error('删除轮播图失败', { error: error.message })
      return res.apiInternalError('删除轮播图失败', error.message, 'CAROUSEL_DELETE_ERROR')
    }
  })
)

/**
 * PATCH /:id/toggle - 切换轮播图启用状态
 * @route PATCH /api/v4/console/carousel-items/:id/toggle
 */
router.patch(
  '/:id/toggle',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const carouselItem = await CarouselItemService.toggleCarouselActive(parseInt(req.params.id))

      if (!carouselItem) {
        return res.apiError('轮播图不存在', 'CAROUSEL_NOT_FOUND', null, 404)
      }

      sharedComponents.logger.info('管理员切换轮播图状态', {
        admin_id: req.user.user_id,
        carousel_item_id: req.params.id,
        is_active: carouselItem.is_active
      })

      return res.apiSuccess(
        { carousel_item: carouselItem },
        carouselItem.is_active ? '轮播图已启用' : '轮播图已禁用'
      )
    } catch (error) {
      sharedComponents.logger.error('切换轮播图状态失败', { error: error.message })
      return res.apiInternalError('切换轮播图状态失败', error.message, 'CAROUSEL_TOGGLE_ERROR')
    }
  })
)

/**
 * PATCH /order - 批量更新显示顺序
 * @route PATCH /api/v4/console/carousel-items/order
 */
router.patch(
  '/order',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { order_list } = req.body

      if (!Array.isArray(order_list) || order_list.length === 0) {
        return res.apiError('排序列表不能为空', 'INVALID_PARAMETERS', null, 400)
      }

      const CarouselItemService = req.app.locals.services.getService('carousel_item')
      const updatedCount = await CarouselItemService.updateDisplayOrder(order_list)

      sharedComponents.logger.info('管理员更新轮播图排序', {
        admin_id: req.user.user_id,
        updated_count: updatedCount
      })

      return res.apiSuccess({ updated_count: updatedCount }, '更新排序成功')
    } catch (error) {
      sharedComponents.logger.error('更新轮播图排序失败', { error: error.message })
      return res.apiInternalError('更新轮播图排序失败', error.message, 'CAROUSEL_ORDER_ERROR')
    }
  })
)

module.exports = router
