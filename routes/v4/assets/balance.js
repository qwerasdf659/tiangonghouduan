/**
 * 资产余额查询路由
 *
 * 路径：/api/v4/assets/balance, /api/v4/assets/balances
 *
 * 职责：
 * - 查询单个资产余额
 * - 查询所有资产余额
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 BalanceService）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-01-31（V4.7.0 AssetService 拆分）
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
 * GET /api/v4/assets/balance
 *
 * @description 查询单个资产余额
 * @query {string} asset_code - 资产代码（如 POINTS, DIAMOND, red_shard）
 * @access Private
 */
router.get(
  '/balance',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { asset_code } = req.query
    const user_id = req.user.user_id

    if (!asset_code) {
      return res.apiError('asset_code 是必填参数', 'BAD_REQUEST', null, 400)
    }

    // BUDGET_POINTS 是系统内部资产，禁止前端直接查询
    if (asset_code === 'BUDGET_POINTS') {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 BalanceService（2026-01-31）
    const BalanceService = req.app.locals.services.getService('asset_balance')

    const balance = await BalanceService.getBalance({ user_id, asset_code })

    // 处理不存在的资产类型：返回0余额（用户从未持有该资产）
    if (!balance) {
      return res.apiSuccess({
        asset_code,
        available_amount: 0,
        frozen_amount: 0,
        total_amount: 0
      })
    }

    // 返回字段命名与 BalanceService.getBalance() 保持一致（全链路统一）
    return res.apiSuccess({
      asset_code,
      available_amount: Number(balance.available_amount),
      frozen_amount: Number(balance.frozen_amount),
      total_amount: Number(balance.available_amount) + Number(balance.frozen_amount)
    })
  })
)

/**
 * GET /api/v4/assets/balances
 *
 * @description 查询所有资产余额
 * @access Private
 */
router.get(
  '/balances',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 BalanceService（2026-01-31）
    const BalanceService = req.app.locals.services.getService('asset_balance')

    const balances = await BalanceService.getAllBalances({ user_id })

    /*
     * 过滤系统内部资产类型，BUDGET_POINTS 不暴露给前端
     * BUDGET_POINTS 是活动预算积分，仅在抽奖引擎内部使用
     */
    const filteredBalances = balances.filter(b => b.asset_code !== 'BUDGET_POINTS')

    // 返回字段命名与 BalanceService.getBalance() 保持一致（全链路统一）
    return res.apiSuccess({
      balances: filteredBalances.map(b => ({
        asset_code: b.asset_code,
        available_amount: Number(b.available_amount),
        frozen_amount: Number(b.frozen_amount),
        total_amount: Number(b.available_amount) + Number(b.frozen_amount)
      }))
    })
  })
)

module.exports = router
