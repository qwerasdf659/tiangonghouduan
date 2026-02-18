/**
 * 轮播图接口（小程序端）
 *
 * 业务范围：
 * - 获取当前有效的轮播图列表（供小程序 swiper 组件展示）
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 CarouselItemService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * Canonical Path：GET /api/v4/system/carousel-items?position=home
 *
 * @see docs/广告系统升级方案.md 14.1.5
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * GET /carousel-items - 获取活跃轮播图列表
 *
 * @route GET /api/v4/system/carousel-items
 * @access Public
 * @query {string} [position=home] - 显示位置
 * @query {number} [limit=10] - 返回数量限制（1-20）
 * @returns {Object} 轮播图列表
 */
router.get(
  '/carousel-items',
  asyncHandler(async (req, res) => {
    try {
      const { position = 'home', limit = 10 } = req.query

      const validPositions = ['home']
      if (!validPositions.includes(position)) {
        return res.apiBadRequest(`无效的 position 参数，允许值: ${validPositions.join('/')}`)
      }

      const maxLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 20)

      const CarouselItemService = req.app.locals.services.getService('carousel_item')

      const carouselItems = await CarouselItemService.getActiveCarousels({
        position,
        limit: maxLimit,
        user_id: req.user?.user_id || null
      })

      logger.info('获取轮播图成功', {
        position,
        count: carouselItems.length,
        ip: req.ip
      })

      return res.apiSuccess({ carousel_items: carouselItems }, '获取成功')
    } catch (error) {
      logger.error('获取轮播图失败', { error: error.message })
      return res.apiInternalError('获取轮播图失败', error.message, 'CAROUSEL_ITEM_ERROR')
    }
  })
)

module.exports = router
