/**
 * 弹窗Banner接口（小程序端 + 管理后台）
 *
 * 业务范围：
 * - 获取弹窗列表（支持状态筛选）
 *
 * 架构规范：
 * - API设计与契约标准规范 v2.0（2025-12-23）
 * - 资源化路径 + query筛选（原则4）
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 * Canonical Path：GET /api/v4/system/popup-banners?status=active&position=home&limit=10
 *
 * 创建时间：2025-12-22
 * 重构时间：2025-12-23（符合API设计与契约标准规范）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger

/**
 * 异步处理包装器
 * @param {Function} fn - 异步处理函数
 * @returns {Function} Express中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * GET /popup-banners - 获取弹窗列表（支持状态筛选）
 *
 * @description 获取弹窗列表，支持状态筛选（资源化 + query筛选模式）
 * @route GET /api/v4/system/popup-banners
 * @access Public（普通用户）/ Private（管理员查看全状态）
 *
 * Canonical Path：GET /api/v4/system/popup-banners?status=active&position=home&limit=10
 *
 * @query {string} [status=active] - 弹窗状态（枚举：active/draft/expired）
 *        - 非管理员只能请求 active 状态
 *        - 管理员可请求所有状态
 * @query {string} [position=home] - 显示位置（枚举：home/profile）
 * @query {number} [limit=10] - 返回数量限制（1-10，默认10）
 *
 * @returns {Object} 弹窗列表
 * @example 成功响应
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取成功",
 *   "data": {
 *     "banners": [
 *       {
 *         "popup_banner_id": 1,
 *         "image_url": "https://xxx.sealos.run/popup-banners/xxx.jpg",
 *         "display_mode": "square",
 *         "image_width": 750,
 *         "image_height": 750,
 *         "link_url": "/pages/activity/index",
 *         "link_type": "page"
 *       }
 *     ]
 *   }
 * }
 */
router.get(
  '/popup-banners',
  asyncHandler(async (req, res) => {
    try {
      const { status = 'active', position = 'home', limit = 10 } = req.query

      // 参数枚举验证：status
      const validStatus = ['active', 'draft', 'expired']
      if (!validStatus.includes(status)) {
        return res.apiBadRequest(`无效的 status 参数，允许值: ${validStatus.join('/')}`)
      }

      // 参数枚举验证：position
      const validPosition = ['home', 'profile']
      if (!validPosition.includes(position)) {
        return res.apiBadRequest(`无效的 position 参数，允许值: ${validPosition.join('/')}`)
      }

      /*
       * 权限控制：非管理员只能请求 active 状态
       * req.user 可能不存在（未登录用户）
       * role_level >= 100 为管理员
       */
      const hasAdminAccess = (req.role_level || 0) >= 100
      if (!hasAdminAccess && status !== 'active') {
        return res.apiForbidden('权限不足：只能查询 active 状态弹窗')
      }

      // 限制最大返回数量（1-10）
      const maxLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 10)

      // 获取弹窗服务
      const PopupBannerService = req.app.locals.services.getService('popup_banner')

      // 根据状态调用不同的服务方法
      let banners
      if (status === 'active') {
        // 获取当前有效弹窗（is_active=true + 时间范围内 + 广告竞价定向匹配）
        banners = await PopupBannerService.getActiveBanners({
          position,
          limit: maxLimit,
          user_id: req.user?.user_id || null
        })
      } else {
        // 管理员查询草稿/过期弹窗（需要服务层支持）
        banners = await PopupBannerService.getBannersByStatus({
          status,
          position,
          limit: maxLimit
        })
      }

      logger.info('获取弹窗成功', {
        status,
        position,
        count: banners.length,
        has_admin_access: hasAdminAccess,
        ip: req.ip
      })

      return res.apiSuccess(
        {
          banners
        },
        '获取成功'
      )
    } catch (error) {
      logger.error('获取弹窗失败', { error: error.message })
      return res.apiInternalError('获取弹窗失败', error.message, 'POPUP_BANNER_ERROR')
    }
  })
)

module.exports = router
