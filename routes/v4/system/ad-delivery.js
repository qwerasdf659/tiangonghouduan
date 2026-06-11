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
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const { asyncHandler } = require('../../../middleware/validation')
const displayNameHelper = require('../../../utils/displayNameHelper')

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
 * @query {string} slot_type - 广告位类型（必填）：popup / carousel / announcement / feed
 * @query {string} [position=home] - 位置：home / lottery / profile / market_list / exchange_list
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { slot_type, position = 'home' } = req.query

    if (!slot_type) {
      return res.apiBadRequest('缺少必需参数：slot_type（popup / carousel / announcement / feed）')
    }

    const validSlotTypes = ['popup', 'carousel', 'announcement', 'feed']
    if (!validSlotTypes.includes(slot_type)) {
      return res.apiBadRequest('slot_type 必须是以下之一：' + validSlotTypes.join(', '))
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
        // 议题2：公告类型 code（面向用户的展示类型，前端用它做逻辑/差异化样式；非公告为 null）
        announcement_type: item.announcement_type || null,
        ad_creative_id: creative.ad_creative_id || null,
        title: creative.title || item.campaign_name,
        content_type: creative.content_type || 'image',
        image_url: creative.media_object_key
          ? `${process.env.PUBLIC_BASE_URL}/api/v4/images/${creative.media_object_key}`
          : null,
        image_width: creative.media_width || null,
        image_height: creative.media_height || null,
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

    /*
     * 议题2（拍板项3方案B）：后端直接附中文 announcement_type_display，C 端零映射直接展示。
     * 复用 displayNameHelper.attachDisplayNames（字典 announcement_type → dict_name）。
     * announcement_type 为 null 的非公告项，display 也为 null（attachDisplayNames 对 null 安全）。
     */
    await displayNameHelper.attachDisplayNames(flatItems, [
      { field: 'announcement_type', dictType: 'announcement_type' }
    ])

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
  })
)

module.exports = router
