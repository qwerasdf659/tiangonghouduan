/**
 * 资产今日汇总查询路由
 *
 * 路径：GET /api/v4/assets/today-summary
 *
 * 职责：
 * - 查询指定资产类型的今日收支汇总（获得/消费/交易笔数）
 * - 支持任意 asset_code（POINTS、DIAMOND、red_shard 等）
 *
 * 服务层复用：
 * - QueryService.getTodaySummary()（已有通用方法，支持任意 asset_code）
 *
 * 拆分依据（决策 D-1）：
 * - 今日汇总属于资产域通用能力，不应绑定在 /lottery/points 路由下
 * - 15 种资产类型中任何一种今后都可能需要今日汇总查询
 * - /api/v4/assets/ 已有 balance、balances、transactions、conversion-rules
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 QueryService）
 * - 读操作无需事务
 *
 * 创建时间：2026-02-21（决策 D-1 实施）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')

/**
 * 错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/v4/assets/today-summary
 *
 * @description 查询指定资产的今日收支汇总
 * @query {string} asset_code - 资产代码（必填，如 POINTS、DIAMOND、red_shard）
 * @access Private（JWT Token 认证）
 *
 * @returns {Object} 今日汇总数据
 * @returns {number} data.today_earned - 今日获得总额
 * @returns {number} data.today_consumed - 今日消费总额
 * @returns {number} data.transaction_count - 今日交易笔数
 * @returns {string} data.asset_code - 查询的资产代码
 *
 * @example
 * GET /api/v4/assets/today-summary?asset_code=POINTS
 * → { today_earned: 3128762, today_consumed: 24960, transaction_count: 279, asset_code: 'POINTS' }
 */
router.get(
  '/today-summary',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { asset_code } = req.query
    const user_id = req.user.user_id

    if (!asset_code) {
      return res.apiError('asset_code 是必填参数', 'BAD_REQUEST', null, 400)
    }

    /* BUDGET_POINTS 是系统内部资产，禁止前端直接查询 */
    if (asset_code === 'BUDGET_POINTS') {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }

    const AssetQueryService = req.app.locals.services.getService('asset_query')
    const summary = await AssetQueryService.getTodaySummary({ user_id, asset_code })

    return res.apiSuccess(
      {
        asset_code,
        today_earned: summary.today_earned,
        today_consumed: summary.today_consumed,
        transaction_count: summary.transaction_count
      },
      '今日汇总获取成功',
      'TODAY_SUMMARY_SUCCESS'
    )
  })
)

module.exports = router
