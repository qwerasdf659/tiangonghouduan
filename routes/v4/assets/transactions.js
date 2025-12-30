/**
 * 资产流水查询路由
 *
 * 路径：/api/v4/assets/transactions
 *
 * 职责：
 * - 查询资产流水记录
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
 * GET /api/v4/assets/transactions
 *
 * @description 查询资产流水
 * @query {string} [asset_code] - 资产代码（可选）
 * @query {string} [business_type] - 业务类型（可选）
 * @query {number} [page=1] - 页码（默认1）
 * @query {number} [page_size=20] - 每页数量（默认20）
 * @access Private
 */
router.get(
  '/transactions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
    const { asset_code, business_type, page = 1, page_size = 20 } = req.query

    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')

    const result = await AssetService.getTransactions(
      { user_id },
      { asset_code, business_type, page: parseInt(page), page_size: parseInt(page_size) }
    )

    return res.apiSuccess({
      transactions: result.transactions.map(t => ({
        transaction_id: t.transaction_id,
        asset_code: t.asset_code,
        delta_amount: Number(t.delta_amount),
        balance_before: Number(t.balance_before),
        balance_after: Number(t.balance_after),
        business_type: t.business_type,
        created_at: t.created_at
      })),
      pagination: {
        total: result.total,
        page: result.page,
        page_size: result.page_size,
        total_pages: result.total_pages
      }
    })
  })
)

module.exports = router
