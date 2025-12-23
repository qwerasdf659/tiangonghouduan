/**
 * 小程序端 - 弹窗Banner接口
 *
 * 业务范围：
 * - 获取当前有效的弹窗列表（首页弹窗）
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 *
 * 创建时间：2025-12-22
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
 * GET /popup-banners/active - 获取当前有效弹窗列表
 *
 * @description 供微信小程序调用，获取当前应该展示的弹窗
 * @route GET /api/v4/system/popup-banners/active
 * @access Public（无需登录）
 *
 * @query {string} [position=home] - 显示位置（home-首页, profile-个人中心）
 * @query {number} [limit=10] - 返回数量限制（最大10）
 *
 * @returns {Object} 有效弹窗列表
 * @example 成功响应
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "获取成功",
 *   "data": {
 *     "banners": [
 *       {
 *         "banner_id": 1,
 *         "title": "新年活动",
 *         "image_url": "https://xxx.sealos.run/popup-banners/xxx.jpg",
 *         "link_url": "/pages/activity/index",
 *         "link_type": "page"
 *       }
 *     ]
 *   }
 * }
 */
router.get(
  '/popup-banners/active',
  asyncHandler(async (req, res) => {
    try {
      const { position = 'home', limit = 10 } = req.query

      // 限制最大返回数量
      const maxLimit = Math.min(parseInt(limit) || 10, 10)

      // 获取弹窗服务
      const PopupBannerService = req.app.locals.services.getService('popupBanner')

      // 调用服务层方法获取有效弹窗
      const banners = await PopupBannerService.getActiveBanners({
        position,
        limit: maxLimit
      })

      logger.info('小程序获取弹窗成功', {
        position,
        count: banners.length,
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
