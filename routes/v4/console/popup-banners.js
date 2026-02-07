/**
 * 管理后台 - 弹窗Banner管理模块
 *
 * 业务范围：
 * - 弹窗列表查询
 * - 创建弹窗（含图片上传）
 * - 更新弹窗
 * - 删除弹窗
 * - 启用/禁用弹窗
 * - 调整显示顺序
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()
const multer = require('multer')
const { sharedComponents, adminAuthMiddleware, asyncHandler } = require('./shared/middleware')

// 配置 multer 内存存储（文件上传到内存，再上传到Sealos）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制5MB
    files: 1 // 单文件上传
  },
  fileFilter: (_req, file, cb) => {
    // 仅允许图片类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('只允许上传 JPG、PNG、GIF、WebP 格式的图片'), false)
    }
  }
})

/**
 * GET /popup-banners - 获取弹窗列表
 *
 * @description 获取弹窗列表，支持分页和筛选
 * @route GET /api/v4/console/popup-banners
 * @access Private (需要管理员权限)
 *
 * @query {string} [position] - 显示位置筛选
 * @query {string} [is_active] - 启用状态筛选（true/false）
 * @query {number} [page=1] - 页码
 * @query {number} [limit=20] - 每页数量
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { position = null, is_active = null, page = 1, limit = 20 } = req.query

      const offset = (parseInt(page) - 1) * parseInt(limit)

      // 获取弹窗服务
      const PopupBannerService = req.app.locals.services.getService('popup_banner')

      // 调用服务层方法查询弹窗列表
      const { banners, total } = await PopupBannerService.getAdminBannerList({
        position,
        is_active,
        limit: parseInt(limit),
        offset
      })

      return res.apiSuccess(
        {
          banners,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            total_pages: Math.ceil(total / parseInt(limit))
          }
        },
        '获取弹窗列表成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取弹窗列表失败', { error: error.message })
      return res.apiInternalError('获取弹窗列表失败', error.message, 'POPUP_BANNER_LIST_ERROR')
    }
  })
)

/**
 * GET /popup-banners/statistics - 获取弹窗统计信息
 *
 * @description 获取弹窗统计数据（总数、启用数、待生效数、已过期数）
 * @route GET /api/v4/console/popup-banners/statistics
 * @access Private (需要管理员权限)
 */
router.get(
  '/statistics',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const PopupBannerService = req.app.locals.services.getService('popup_banner')
      const statistics = await PopupBannerService.getStatistics()

      return res.apiSuccess({ statistics }, '获取弹窗统计成功')
    } catch (error) {
      sharedComponents.logger.error('获取弹窗统计失败', { error: error.message })
      return res.apiInternalError('获取弹窗统计失败', error.message, 'POPUP_BANNER_STATS_ERROR')
    }
  })
)

/**
 * GET /popup-banners/:id - 获取单个弹窗详情
 *
 * @description 获取指定弹窗的详细信息
 * @route GET /api/v4/console/popup-banners/:id
 * @access Private (需要管理员权限)
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const PopupBannerService = req.app.locals.services.getService('popup_banner')
      const banner = await PopupBannerService.getBannerById(parseInt(id))

      if (!banner) {
        return res.apiError('弹窗不存在', 'POPUP_BANNER_NOT_FOUND', null, 404)
      }

      return res.apiSuccess({ banner }, '获取弹窗详情成功')
    } catch (error) {
      sharedComponents.logger.error('获取弹窗详情失败', { error: error.message })
      return res.apiInternalError('获取弹窗详情失败', error.message, 'POPUP_BANNER_DETAIL_ERROR')
    }
  })
)

/**
 * POST /popup-banners - 创建弹窗
 *
 * @description 创建新的弹窗Banner（支持图片上传）
 * @route POST /api/v4/console/popup-banners
 * @access Private (需要管理员权限)
 *
 * @body {string} title - 弹窗标题（必需）
 * @body {file} image - 弹窗图片文件（必需，JPG/PNG/GIF/WebP，最大5MB）
 * @body {string} [link_url] - 跳转链接
 * @body {string} [link_type=none] - 跳转类型（none/page/miniprogram/webview）
 * @body {string} [position=home] - 显示位置
 * @body {boolean} [is_active=false] - 是否启用
 * @body {number} [display_order=0] - 显示顺序
 * @body {string} [start_time] - 开始时间（ISO格式）
 * @body {string} [end_time] - 结束时间（ISO格式）
 */
router.post(
  '/',
  adminAuthMiddleware,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    try {
      const {
        title,
        link_url = null,
        link_type = 'none',
        position = 'home',
        is_active = 'false',
        display_order = 0,
        start_time = null,
        end_time = null
      } = req.body

      // 验证必需参数
      if (!title || title.trim() === '') {
        return res.apiError('弹窗标题不能为空', 'INVALID_PARAMETERS', null, 400)
      }

      // 验证图片文件
      if (!req.file) {
        return res.apiError('请上传弹窗图片', 'IMAGE_REQUIRED', null, 400)
      }

      const PopupBannerService = req.app.locals.services.getService('popup_banner')

      // 上传图片到Sealos（返回对象 key 和公网 URL）
      const { objectKey } = await PopupBannerService.uploadBannerImage(
        req.file.buffer,
        req.file.originalname
      )

      // 创建弹窗记录（存储对象 key，非完整 URL - 2026-01-08 拍板决策）
      const banner = await PopupBannerService.createBanner(
        {
          title: title.trim(),
          image_url: objectKey, // 存储对象 key
          link_url,
          link_type,
          position,
          is_active: is_active === 'true' || is_active === true,
          display_order: parseInt(display_order) || 0,
          start_time,
          end_time
        },
        req.user.user_id
      )

      sharedComponents.logger.info('管理员创建弹窗Banner', {
        admin_id: req.user.user_id,
        popup_banner_id: banner.popup_banner_id,
        title: banner.title,
        position: banner.position
      })

      return res.apiSuccess({ banner }, '创建弹窗成功', 201)
    } catch (error) {
      sharedComponents.logger.error('创建弹窗失败', { error: error.message })
      return res.apiInternalError('创建弹窗失败', error.message, 'POPUP_BANNER_CREATE_ERROR')
    }
  })
)

/**
 * PUT /popup-banners/:id - 更新弹窗
 *
 * @description 更新弹窗信息（可选更新图片）
 * @route PUT /api/v4/console/popup-banners/:id
 * @access Private (需要管理员权限)
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const updateData = { ...req.body }

      const PopupBannerService = req.app.locals.services.getService('popup_banner')

      // 如果上传了新图片，先上传到Sealos
      if (req.file) {
        const { objectKey } = await PopupBannerService.uploadBannerImage(
          req.file.buffer,
          req.file.originalname
        )
        updateData.image_url = objectKey // 存储对象 key
      }

      // 更新弹窗记录
      const banner = await PopupBannerService.updateBanner(parseInt(id), updateData)

      if (!banner) {
        return res.apiError('弹窗不存在', 'POPUP_BANNER_NOT_FOUND', null, 404)
      }

      sharedComponents.logger.info('管理员更新弹窗Banner', {
        admin_id: req.user.user_id,
        popup_banner_id: id,
        updated_fields: Object.keys(updateData)
      })

      return res.apiSuccess({ banner }, '更新弹窗成功')
    } catch (error) {
      sharedComponents.logger.error('更新弹窗失败', { error: error.message })
      return res.apiInternalError('更新弹窗失败', error.message, 'POPUP_BANNER_UPDATE_ERROR')
    }
  })
)

/**
 * DELETE /popup-banners/:id - 删除弹窗
 *
 * @description 删除指定弹窗
 * @route DELETE /api/v4/console/popup-banners/:id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const PopupBannerService = req.app.locals.services.getService('popup_banner')
      const deleted = await PopupBannerService.deleteBanner(parseInt(id))

      if (!deleted) {
        return res.apiError('弹窗不存在或删除失败', 'POPUP_BANNER_DELETE_FAILED', null, 404)
      }

      sharedComponents.logger.info('管理员删除弹窗Banner', {
        admin_id: req.user.user_id,
        popup_banner_id: id
      })

      return res.apiSuccess({}, '删除弹窗成功')
    } catch (error) {
      sharedComponents.logger.error('删除弹窗失败', { error: error.message })
      return res.apiInternalError('删除弹窗失败', error.message, 'POPUP_BANNER_DELETE_ERROR')
    }
  })
)

/**
 * PATCH /popup-banners/:id/toggle - 切换弹窗启用状态
 *
 * @description 切换弹窗的启用/禁用状态
 * @route PATCH /api/v4/console/popup-banners/:id/toggle
 * @access Private (需要管理员权限)
 */
router.patch(
  '/:id/toggle',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      const PopupBannerService = req.app.locals.services.getService('popup_banner')
      const banner = await PopupBannerService.toggleBannerActive(parseInt(id))

      if (!banner) {
        return res.apiError('弹窗不存在', 'POPUP_BANNER_NOT_FOUND', null, 404)
      }

      sharedComponents.logger.info('管理员切换弹窗状态', {
        admin_id: req.user.user_id,
        popup_banner_id: id,
        is_active: banner.is_active
      })

      return res.apiSuccess(
        {
          banner,
          message: banner.is_active ? '弹窗已启用' : '弹窗已禁用'
        },
        banner.is_active ? '弹窗已启用' : '弹窗已禁用'
      )
    } catch (error) {
      sharedComponents.logger.error('切换弹窗状态失败', { error: error.message })
      return res.apiInternalError('切换弹窗状态失败', error.message, 'POPUP_BANNER_TOGGLE_ERROR')
    }
  })
)

/**
 * PATCH /popup-banners/order - 批量更新显示顺序
 *
 * @description 批量更新弹窗的显示顺序
 * @route PATCH /api/v4/console/popup-banners/order
 * @access Private (需要管理员权限)
 *
 * @body {Array<{popup_banner_id: number, display_order: number}>} order_list - 排序列表
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

      const PopupBannerService = req.app.locals.services.getService('popup_banner')
      const updatedCount = await PopupBannerService.updateDisplayOrder(order_list)

      sharedComponents.logger.info('管理员更新弹窗排序', {
        admin_id: req.user.user_id,
        updated_count: updatedCount
      })

      return res.apiSuccess({ updated_count: updatedCount }, '更新排序成功')
    } catch (error) {
      sharedComponents.logger.error('更新弹窗排序失败', { error: error.message })
      return res.apiInternalError('更新弹窗排序失败', error.message, 'POPUP_BANNER_ORDER_ERROR')
    }
  })
)

module.exports = router
