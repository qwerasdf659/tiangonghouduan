/**
 * 用户端 - 广告位查询模块
 *
 * 业务范围：
 * - 查询当前可用（is_active=true）的广告位列表
 * - 按广告位类型（popup/carousel）和位置（home/lottery/profile）筛选
 *
 * 使用场景：
 * - 小程序用户创建广告活动时，选择广告位
 * - ad_slot_id 是创建广告活动的必填字段
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取 AdSlotService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 * - 仅返回启用状态的广告位，不暴露管理端数据
 *
 * @see routes/v4/user/ad-campaigns.js 创建广告活动时需要 ad_slot_id
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 异步路由包装器 - 自动捕获 async/await 错误
 *
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件函数
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

/** 广告位类型枚举（用于参数校验） */
const VALID_SLOT_TYPES = ['popup', 'carousel']

/**
 * GET / - 获取可用广告位列表
 *
 * 仅返回 is_active=true 的广告位，供用户创建广告活动时选择。
 * 返回字段：ad_slot_id, slot_key, slot_name, slot_type, position,
 *           daily_price_diamond, min_bid_diamond, min_budget_diamond, description
 *
 * @route GET /api/v4/user/ad-slots
 * @access Private（JWT 认证，普通用户可调用）
 * @query {string} [slot_type] - 广告位类型筛选（popup/carousel）
 * @query {string} [position] - 页面位置筛选（home/lottery/profile）
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    try {
      const { slot_type = null, position = null } = req.query

      if (slot_type && !VALID_SLOT_TYPES.includes(slot_type)) {
        return res.apiBadRequest(`slot_type 必须是以下之一：${VALID_SLOT_TYPES.join(', ')}`)
      }

      const AdSlotService = req.app.locals.services.getService('ad_slot')
      let slots = await AdSlotService.getActiveSlots()

      // 路由层筛选（AdSlotService.getActiveSlots 已过滤 is_active=true）
      if (slot_type) {
        slots = slots.filter(s => s.slot_type === slot_type)
      }
      if (position) {
        slots = slots.filter(s => s.position === position)
      }

      return res.apiSuccess(
        {
          slots,
          total: slots.length
        },
        '获取可用广告位列表成功'
      )
    } catch (error) {
      logger.error('获取可用广告位列表失败', {
        error: error.message,
        user_id: req.user.user_id
      })
      return res.apiInternalError(
        '获取可用广告位列表失败',
        error.message,
        'USER_AD_SLOT_LIST_ERROR'
      )
    }
  })
)

module.exports = router
