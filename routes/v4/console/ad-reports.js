/**
 * 管理后台 - 广告报表模块
 *
 * 业务范围：
 * - 全局广告数据概览（Phase 6）
 * - 单个广告活动报表
 * - 单个广告位报表
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdReportService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @see docs/广告系统升级方案.md Phase 6
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger

/** 日期格式校验（YYYY-MM-DD） */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /overview - 获取全局广告数据概览（Phase 6）
 * @route GET /api/v4/console/ad-reports/overview
 * @access Private (Admin)
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/overview',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { start_date, end_date } = req.query

      if (start_date && !DATE_REGEX.test(start_date)) {
        return res.apiBadRequest('start_date 格式必须为 YYYY-MM-DD')
      }
      if (end_date && !DATE_REGEX.test(end_date)) {
        return res.apiBadRequest('end_date 格式必须为 YYYY-MM-DD')
      }

      const AdReportService = req.app.locals.services.getService('ad_report')
      const overview = await AdReportService.getDashboardOverview(
        start_date || null,
        end_date || null
      )

      return res.apiSuccess(overview, '获取全局广告数据概览成功')
    } catch (error) {
      logger.error('获取全局广告数据概览失败', { error: error.message })
      return res.apiInternalError(
        '获取全局广告数据概览失败',
        error.message,
        'AD_REPORT_OVERVIEW_ERROR'
      )
    }
  })
)

/**
 * GET /campaigns/:id - 获取单个广告活动报表
 * @route GET /api/v4/console/ad-reports/campaigns/:id
 * @access Private (Admin)
 * @param {number} id - 广告活动ID
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/campaigns/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id)
      if (isNaN(campaignId)) {
        return res.apiBadRequest('广告活动 ID 必须是有效数字')
      }
      const { start_date, end_date } = req.query
      if (start_date && !DATE_REGEX.test(start_date)) {
        return res.apiBadRequest('start_date 格式必须为 YYYY-MM-DD')
      }
      if (end_date && !DATE_REGEX.test(end_date)) {
        return res.apiBadRequest('end_date 格式必须为 YYYY-MM-DD')
      }

      const AdReportService = req.app.locals.services.getService('ad_report')
      const report = await AdReportService.getCampaignReport(campaignId, null, {
        start_date,
        end_date
      })

      if (!report) {
        return res.apiError('报表数据不存在', 'REPORT_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(report, '获取广告活动报表成功')
    } catch (error) {
      logger.error('获取广告活动报表失败', {
        error: error.message,
        campaign_id: req.params.id
      })
      return res.apiInternalError('获取广告活动报表失败', error.message, 'AD_CAMPAIGN_REPORT_ERROR')
    }
  })
)

/**
 * GET /slots/:id - 获取单个广告位报表
 * @route GET /api/v4/console/ad-reports/slots/:id
 * @access Private (Admin)
 * @param {number} id - 广告位ID
 * @query {string} [start_date] - 开始日期（YYYY-MM-DD）
 * @query {string} [end_date] - 结束日期（YYYY-MM-DD）
 */
router.get(
  '/slots/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const slotId = parseInt(req.params.id)
      if (isNaN(slotId)) {
        return res.apiBadRequest('广告位 ID 必须是有效数字')
      }
      const { start_date, end_date } = req.query
      if (start_date && !DATE_REGEX.test(start_date)) {
        return res.apiBadRequest('start_date 格式必须为 YYYY-MM-DD')
      }
      if (end_date && !DATE_REGEX.test(end_date)) {
        return res.apiBadRequest('end_date 格式必须为 YYYY-MM-DD')
      }

      const AdReportService = req.app.locals.services.getService('ad_report')
      const report = await AdReportService.getSlotReport(slotId, {
        start_date,
        end_date
      })

      if (!report) {
        return res.apiError('报表数据不存在', 'REPORT_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(report, '获取广告位报表成功')
    } catch (error) {
      logger.error('获取广告位报表失败', {
        error: error.message,
        slot_id: req.params.id
      })
      return res.apiInternalError('获取广告位报表失败', error.message, 'AD_SLOT_REPORT_ERROR')
    }
  })
)

module.exports = router
