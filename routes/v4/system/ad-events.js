/**
 * 系统端 - 广告事件上报模块
 *
 * 业务范围：
 * - 弹窗横幅展示事件上报
 * - 轮播图展示事件上报
 * - 广告曝光事件上报（Phase 5）
 * - 广告点击事件上报（Phase 5）
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取相应 Service
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 曝光和点击事件需经过反作弊检查（AdAntifraudService）
 *
 * @see docs/广告系统升级方案.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
/**
 * 异步路由包装器 - 自动捕获 async/await 错误
 *
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}
const logger = require('../../../utils/logger').logger

/**
 * POST /popup-banners/show-log - 上报弹窗横幅展示事件
 * @route POST /api/v4/system/ad-events/popup-banners/show-log
 * @access Private
 * @body {number} popup_banner_id - 弹窗横幅ID
 * @body {number} [show_duration_ms] - 展示时长（毫秒）
 * @body {string} [close_method] - 关闭方式（auto/manual/click）
 * @body {number} [queue_position] - 队列位置
 */
router.post(
  '/popup-banners/show-log',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { popup_banner_id, show_duration_ms, close_method, queue_position } = req.body

      if (!popup_banner_id) {
        return res.apiBadRequest('缺少必需参数：popup_banner_id')
      }

      const PopupShowLogService = req.app.locals.services.getService('popup_show_log')
      const showLog = await PopupShowLogService.createShowLog({
        popup_banner_id: parseInt(popup_banner_id),
        user_id: req.user.user_id,
        show_duration_ms: show_duration_ms ? parseInt(show_duration_ms) : null,
        close_method,
        queue_position: queue_position ? parseInt(queue_position) : null
      })

      logger.info('弹窗横幅展示事件上报成功', {
        popup_banner_id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(showLog, '上报展示事件成功')
    } catch (error) {
      logger.error('弹窗横幅展示事件上报失败', {
        error: error.message,
        popup_banner_id: req.body.popup_banner_id,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('上报展示事件失败', error.message, 'POPUP_SHOW_LOG_ERROR')
    }
  })
)

/**
 * POST /carousel-items/show-log - 上报轮播图展示事件
 * @route POST /api/v4/system/ad-events/carousel-items/show-log
 * @access Private
 * @body {number} carousel_item_id - 轮播图ID
 * @body {number} [exposure_duration_ms] - 曝光时长（毫秒）
 * @body {boolean} [is_manual_swipe] - 是否手动滑动
 * @body {boolean} [is_clicked] - 是否点击
 */
router.post(
  '/carousel-items/show-log',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { carousel_item_id, exposure_duration_ms, is_manual_swipe, is_clicked } = req.body

      if (!carousel_item_id) {
        return res.apiBadRequest('缺少必需参数：carousel_item_id')
      }

      const CarouselShowLogService = req.app.locals.services.getService('carousel_show_log')
      const showLog = await CarouselShowLogService.createShowLog({
        carousel_item_id: parseInt(carousel_item_id),
        user_id: req.user.user_id,
        exposure_duration_ms: exposure_duration_ms ? parseInt(exposure_duration_ms) : null,
        is_manual_swipe: is_manual_swipe === true || is_manual_swipe === 'true' || is_manual_swipe === 1,
        is_clicked: is_clicked === true || is_clicked === 'true' || is_clicked === 1
      })

      logger.info('轮播图展示事件上报成功', {
        carousel_item_id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(showLog, '上报展示事件成功')
    } catch (error) {
      logger.error('轮播图展示事件上报失败', {
        error: error.message,
        carousel_item_id: req.body.carousel_item_id,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('上报展示事件失败', error.message, 'CAROUSEL_SHOW_LOG_ERROR')
    }
  })
)

/**
 * POST /impression - 上报广告曝光事件（Phase 5）
 * @route POST /api/v4/system/ad-events/impression
 * @access Private
 * @body {number} ad_campaign_id - 广告活动ID
 * @body {number} ad_slot_id - 广告位ID
 */
router.post(
  '/impression',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { ad_campaign_id, ad_slot_id } = req.body

      if (!ad_campaign_id || !ad_slot_id) {
        return res.apiBadRequest('缺少必需参数：ad_campaign_id, ad_slot_id')
      }

      const AdAntifraudService = req.app.locals.services.getService('ad_antifraud')
      const AdImpressionLogService = req.app.locals.services.getService('ad_impression_log')

      // 反作弊检查
      const antifraudResult = await AdAntifraudService.checkImpression({
        ad_campaign_id: parseInt(ad_campaign_id),
        ad_slot_id: parseInt(ad_slot_id),
        user_id: req.user.user_id,
        ip: req.ip,
        user_agent: req.get('user-agent')
      })

      if (!antifraudResult.is_valid) {
        logger.warn('广告曝光反作弊检查未通过', {
          ad_campaign_id,
          ad_slot_id,
          user_id: req.user.user_id,
          reason: antifraudResult.reason
        })
        return res.apiError('曝光事件无效', 'INVALID_IMPRESSION', antifraudResult.reason, 400)
      }

      // 创建曝光日志
      const impressionLog = await AdImpressionLogService.createImpressionLog({
        ad_campaign_id: parseInt(ad_campaign_id),
        ad_slot_id: parseInt(ad_slot_id),
        user_id: req.user.user_id,
        ip: req.ip,
        user_agent: req.get('user-agent')
      })

      logger.info('广告曝光事件上报成功', {
        ad_campaign_id,
        ad_slot_id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(impressionLog, '上报曝光事件成功')
    } catch (error) {
      logger.error('广告曝光事件上报失败', {
        error: error.message,
        ad_campaign_id: req.body.ad_campaign_id,
        ad_slot_id: req.body.ad_slot_id,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('上报曝光事件失败', error.message, 'AD_IMPRESSION_ERROR')
    }
  })
)

/**
 * POST /click - 上报广告点击事件（Phase 5）
 * @route POST /api/v4/system/ad-events/click
 * @access Private
 * @body {number} ad_campaign_id - 广告活动ID
 * @body {number} ad_slot_id - 广告位ID
 * @body {string} [click_target] - 点击目标（如：landing_page/button等）
 */
router.post(
  '/click',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { ad_campaign_id, ad_slot_id, click_target } = req.body

      if (!ad_campaign_id || !ad_slot_id) {
        return res.apiBadRequest('缺少必需参数：ad_campaign_id, ad_slot_id')
      }

      const AdAntifraudService = req.app.locals.services.getService('ad_antifraud')
      const AdClickLogService = req.app.locals.services.getService('ad_click_log')

      // 反作弊检查
      const antifraudResult = await AdAntifraudService.checkClick({
        ad_campaign_id: parseInt(ad_campaign_id),
        ad_slot_id: parseInt(ad_slot_id),
        user_id: req.user.user_id,
        ip: req.ip,
        user_agent: req.get('user-agent')
      })

      if (!antifraudResult.is_valid) {
        logger.warn('广告点击反作弊检查未通过', {
          ad_campaign_id,
          ad_slot_id,
          user_id: req.user.user_id,
          reason: antifraudResult.reason
        })
        return res.apiError('点击事件无效', 'INVALID_CLICK', antifraudResult.reason, 400)
      }

      // 创建点击日志
      const clickLog = await AdClickLogService.createClickLog({
        ad_campaign_id: parseInt(ad_campaign_id),
        ad_slot_id: parseInt(ad_slot_id),
        user_id: req.user.user_id,
        ip: req.ip,
        user_agent: req.get('user-agent'),
        click_target
      })

      logger.info('广告点击事件上报成功', {
        ad_campaign_id,
        ad_slot_id,
        user_id: req.user.user_id
      })

      return res.apiSuccess(clickLog, '上报点击事件成功')
    } catch (error) {
      logger.error('广告点击事件上报失败', {
        error: error.message,
        ad_campaign_id: req.body.ad_campaign_id,
        ad_slot_id: req.body.ad_slot_id,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('上报点击事件失败', error.message, 'AD_CLICK_ERROR')
    }
  })
)

module.exports = router
