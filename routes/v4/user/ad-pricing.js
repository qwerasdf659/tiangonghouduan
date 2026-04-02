/**
 * 用户端广告定价预览路由
 *
 * 路径：/api/v4/user/ad-pricing
 *
 * 职责：
 * - 用户端查询广告位定价预览（复用 AdPricingService）
 * - 为广告主自助投放提供价格计算能力
 *
 * 架构原则：
 * - 通过 ServiceManager 获取 AdPricingService（不直接 require Service）
 * - 路由层不开启事务（只读查询）
 * - 使用 res.apiSuccess/apiError 统一响应格式
 *
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')

/**
 * 异步错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/**
 * GET /api/v4/user/ad-pricing/preview
 *
 * @description 广告位定价预览（复用后端 AdPricingService.calculateFinalDailyPrice）
 * @query {number} ad_slot_id - 广告位ID（必填）
 * @query {number} [days=1] - 投放天数（可选，默认1天）
 * @access Private（需 JWT 认证）
 *
 * @returns {Object} 定价预览结果
 * @returns {number} returns.ad_slot_id - 广告位ID
 * @returns {string} returns.slot_key - 广告位标识
 * @returns {number} returns.base_price - 基础日价
 * @returns {number} returns.dau_coefficient - DAU系数
 * @returns {number} returns.adjusted_price - DAU调整后价格
 * @returns {number} returns.min_daily_price - 最低日价下限
 * @returns {number} returns.effective_daily_price - 实际日价 = max(adjusted_price, min_daily_price)
 * @returns {number} returns.days - 投放天数
 * @returns {number} returns.discount - 折扣率
 * @returns {string} returns.discount_label - 折扣描述
 * @returns {number} returns.total_price - 折后总价
 * @returns {number} returns.saved - 节省星石数
 */
router.get(
  '/preview',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { ad_slot_id, days } = req.query

    if (!ad_slot_id) {
      return res.apiError('缺少 ad_slot_id 参数', 'MISSING_PARAM', null, 400)
    }

    const parsedSlotId = parseInt(ad_slot_id, 10)
    if (isNaN(parsedSlotId) || parsedSlotId <= 0) {
      return res.apiError('ad_slot_id 必须为正整数', 'INVALID_PARAM', null, 400)
    }

    const parsedDays = parseInt(days, 10) || 1
    if (parsedDays < 1 || parsedDays > 365) {
      return res.apiError('days 必须在 1-365 之间', 'INVALID_PARAM', null, 400)
    }

    const AdPricingService = req.app.locals.services.getService('ad_pricing')
    const result = await AdPricingService.calculateFinalDailyPrice(parsedSlotId, parsedDays)

    return res.apiSuccess(result, '价格预览计算成功')
  })
)

module.exports = router
