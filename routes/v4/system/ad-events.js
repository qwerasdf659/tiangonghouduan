/**
 * 系统端 - 广告事件上报模块
 *
 * 业务范围：
 * - 统一内容交互日志上报（D2 定论：替代 popup-banners/carousel-items 独立上报）
 * - 广告曝光事件上报（Phase 5，commercial 类型专用）
 * - 广告点击事件上报（Phase 5，commercial 类型专用）
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取相应 Service
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 曝光和点击事件需经过反作弊检查（AdAntifraudService）
 * - 与 ad-delivery.js 职责分离（ad-events 只写，ad-delivery 只读）
 *
 * @see docs/内容投放系统-重复功能合并方案.md 第十七节 17.3
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
 * POST /interaction-log - 统一内容交互日志上报（D2 定论：替代旧的独立上报端点）
 *
 * 替代原来的 2 个独立端点：
 * - POST /popup-banners/show-log → interaction_type='impression', extra_data.show_duration_ms
 * - POST /carousel-items/show-log → interaction_type='impression', extra_data.exposure_duration_ms
 *
 * @route POST /api/v4/system/ad-events/interaction-log
 * @access Private
 * @body {number} ad_campaign_id - 广告计划ID（来自 ad-delivery 接口返回）
 * @body {string} interaction_type - 交互类型（impression/click/close/swipe）
 * @body {Object} [extra_data] - 扩展数据JSON
 */
router.post(
  '/interaction-log',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { ad_campaign_id, interaction_type, extra_data } = req.body

      if (!ad_campaign_id || !interaction_type) {
        return res.apiBadRequest('缺少必需参数：ad_campaign_id, interaction_type')
      }

      const parsedCampaignId = parseInt(ad_campaign_id)
      if (isNaN(parsedCampaignId)) {
        return res.apiBadRequest('ad_campaign_id 必须是有效数字')
      }

      const validTypes = ['impression', 'click', 'close', 'swipe']
      if (!validTypes.includes(interaction_type)) {
        return res.apiBadRequest('interaction_type 必须是以下之一：' + validTypes.join(', '))
      }

      const AdInteractionLogService = req.app.locals.services.getService('ad_interaction_log')
      const log = await AdInteractionLogService.createLog({
        ad_campaign_id: parsedCampaignId,
        user_id: req.user.user_id,
        interaction_type,
        extra_data: extra_data || null
      })

      logger.info('统一交互日志上报成功', {
        ad_campaign_id: parsedCampaignId,
        interaction_type,
        user_id: req.user.user_id
      })

      return res.apiSuccess(log, '上报交互日志成功')
    } catch (error) {
      logger.error('统一交互日志上报失败', {
        error: error.message,
        ad_campaign_id: req.body.ad_campaign_id,
        user_id: req.user?.user_id
      })
      return res.apiInternalError('上报交互日志失败', error.message, 'INTERACTION_LOG_ERROR')
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

      const parsedCampaignId = parseInt(ad_campaign_id)
      const parsedSlotId = parseInt(ad_slot_id)
      if (isNaN(parsedCampaignId) || isNaN(parsedSlotId)) {
        return res.apiBadRequest('ad_campaign_id 和 ad_slot_id 必须是有效数字')
      }

      const AdAntifraudService = req.app.locals.services.getService('ad_antifraud')
      const AdImpressionLogService = req.app.locals.services.getService('ad_impression_log')

      // 反作弊检查（位置参数：userId, campaignId, adSlotId）
      const antifraudResult = await AdAntifraudService.checkImpression(
        req.user.user_id,
        parsedCampaignId,
        parsedSlotId
      )

      if (!antifraudResult.is_valid) {
        logger.warn('广告曝光反作弊检查未通过', {
          ad_campaign_id: parsedCampaignId,
          ad_slot_id: parsedSlotId,
          user_id: req.user.user_id,
          reason: antifraudResult.invalid_reason
        })
        return res.apiError(
          '曝光事件无效',
          'INVALID_IMPRESSION',
          antifraudResult.invalid_reason,
          400
        )
      }

      // 创建曝光日志
      const impressionLog = await AdImpressionLogService.createLog({
        ad_campaign_id: parsedCampaignId,
        ad_slot_id: parsedSlotId,
        user_id: req.user.user_id
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

      const parsedCampaignId = parseInt(ad_campaign_id)
      const parsedSlotId = parseInt(ad_slot_id)
      if (isNaN(parsedCampaignId) || isNaN(parsedSlotId)) {
        return res.apiBadRequest('ad_campaign_id 和 ad_slot_id 必须是有效数字')
      }

      const AdAntifraudService = req.app.locals.services.getService('ad_antifraud')
      const AdClickLogService = req.app.locals.services.getService('ad_click_log')

      // 反作弊检查（位置参数：userId, campaignId, adSlotId, clickTarget）
      const antifraudResult = await AdAntifraudService.checkClick(
        req.user.user_id,
        parsedCampaignId,
        parsedSlotId,
        click_target
      )

      if (!antifraudResult.is_valid) {
        logger.warn('广告点击反作弊检查未通过', {
          ad_campaign_id: parsedCampaignId,
          ad_slot_id: parsedSlotId,
          user_id: req.user.user_id,
          reason: antifraudResult.invalid_reason
        })
        return res.apiError('点击事件无效', 'INVALID_CLICK', antifraudResult.invalid_reason, 400)
      }

      // 创建点击日志
      const clickLog = await AdClickLogService.createLog({
        ad_campaign_id: parsedCampaignId,
        ad_slot_id: parsedSlotId,
        user_id: req.user.user_id,
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
