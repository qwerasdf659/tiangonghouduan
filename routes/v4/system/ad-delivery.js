/**
 * 系统端 - 统一内容投放获取模块（D5 定论：新建 ad-delivery.js）
 *
 * 业务范围：
 * - 统一前端内容获取接口（GET only，替代原 popup-banners/carousel-items/announcements 3 个路由）
 * - 与 ad-events.js 职责分离（ad-delivery 只读，ad-events 只写）
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdBiddingService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 后端为权威，前端直接使用后端字段名，不做任何映射
 *
 * 对标行业实践：
 * - Google Ad Manager: GET /ad-delivery（Ad Serving Request）
 * - 美团: GET /api/promotion/feed（运营位内容下发）
 * - 字节跳动: GET /api/content/delivery
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第十八节 D5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 异步路由包装器
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * GET / - 统一内容获取接口
 *
 * 替代原来的 3 个独立路由：
 * - GET /api/v4/system/popup-banners/active?position=home → ?slot_type=popup&position=home
 * - GET /api/v4/system/carousel-items/active?position=home → ?slot_type=carousel&position=home
 * - GET /api/v4/system/announcements/active → ?slot_type=announcement
 *
 * @route GET /api/v4/system/ad-delivery
 * @access Private
 * @query {string} slot_type - 广告位类型（必填）：popup / carousel / announcement
 * @query {string} [position=home] - 位置：home / lottery / profile
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { slot_type, position = 'home' } = req.query

      if (!slot_type) {
        return res.apiBadRequest('缺少必需参数：slot_type（popup / carousel / announcement）')
      }

      const validSlotTypes = ['popup', 'carousel', 'announcement']
      if (!validSlotTypes.includes(slot_type)) {
        return res.apiBadRequest(
          'slot_type 必须是以下之一：' + validSlotTypes.join(', ')
        )
      }

      // 构造 slot_key：{position}_{slot_type}（与 ad_slots 种子数据一致）
      const slotKey = position + '_' + slot_type

      const AdBiddingService = req.app.locals.services.getService('ad_bidding')
      const items = await AdBiddingService.selectWinners(slotKey, req.user.user_id)

      // 扁平化返回结构：将 campaign + creative 合并为前端直接使用的字段
      const flatItems = items.map(item => {
        const creative = item.creative || {}
        return {
          ad_campaign_id: item.ad_campaign_id,
          campaign_name: item.campaign_name,
          campaign_category: item.campaign_category,
          ad_creative_id: creative.ad_creative_id || null,
          title: creative.title || item.campaign_name,
          content_type: creative.content_type || 'image',
          image_url: creative.image_url || null,
          image_width: creative.image_width || null,
          image_height: creative.image_height || null,
          text_content: creative.text_content || null,
          link_url: creative.link_url || null,
          link_type: creative.link_type || 'none',
          display_mode: creative.display_mode || null,
          frequency_rule: item.frequency_rule,
          frequency_value: item.frequency_value,
          force_show: item.force_show,
          priority: item.priority,
          slide_interval_ms: item.slide_interval_ms,
          start_date: item.start_date,
          end_date: item.end_date
        }
      })

      logger.info('统一内容获取成功', {
        slot_type,
        position,
        slot_key: slotKey,
        user_id: req.user.user_id,
        items_count: flatItems.length
      })

      return res.apiSuccess(
        {
          items: flatItems,
          slot_type,
          position,
          total: flatItems.length
        },
        '获取内容成功'
      )
    } catch (error) {
      logger.error('统一内容获取失败', {
        error: error.message,
        slot_type: req.query.slot_type,
        position: req.query.position,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('获取内容失败', error.message, 'AD_DELIVERY_ERROR')
    }
  })
)

module.exports = router
