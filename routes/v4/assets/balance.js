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
 * - 路由层不直连 models（通过 ServiceManager 获取 AssetService）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
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

    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')

    const balance = await AssetService.getBalance({ user_id, asset_code })

    return res.apiSuccess({
      asset_code,
      available: Number(balance.available_amount),
      frozen: Number(balance.frozen_amount),
      total: Number(balance.available_amount) + Number(balance.frozen_amount)
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

    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')

    const balances = await AssetService.getAllBalances({ user_id })

    return res.apiSuccess({
      balances: balances.map(b => ({
        asset_code: b.asset_code,
        available: Number(b.available_amount),
        frozen: Number(b.frozen_amount),
        total: Number(b.available_amount) + Number(b.frozen_amount)
      }))
    })
  })
)

module.exports = router
