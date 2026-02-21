/**
 * 资产流水查询路由
 *
 * 路径：/api/v4/assets/transactions
 *
 * 职责：
 * - 查询资产流水记录（支持按资产代码、业务类型筛选和分页）
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 QueryService）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 * 创建时间：2025-12-29
 * 更新时间：2026-02-16（补充 description/title 字段输出，修正主键字段名）
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
 * @description 查询当前用户的资产流水记录
 * @query {string} [asset_code] - 资产代码筛选（如 POINTS、DIAMOND、red_shard）
 * @query {string} [business_type] - 业务类型筛选（如 lottery_consume、lottery_reward、exchange_debit）
 * @query {number} [page=1] - 页码（默认1）
 * @query {number} [page_size=20] - 每页数量（默认20，最大100）
 * @access Private（需要 JWT 认证）
 *
 * @returns {Object} 响应体
 * @returns {Array} data.transactions - 流水记录数组（经 DataSanitizer 脱敏，含 BUDGET_POINTS 过滤）
 * @returns {number} data.transactions[].transaction_id - 流水ID（剥离 asset_ 前缀）
 * @returns {string} data.transactions[].asset_code - 资产代码
 * @returns {number} data.transactions[].delta_amount - 变动金额（正=增加，负=扣减）
 * @returns {number} data.transactions[].balance_before - 变动前余额
 * @returns {number} data.transactions[].balance_after - 变动后余额
 * @returns {string} data.transactions[].business_type - 业务类型枚举
 * @returns {string} data.transactions[].business_type_display - 业务类型中文显示名
 * @returns {string|null} data.transactions[].description - 交易描述（来自 meta.description，约91%有值）
 * @returns {string|null} data.transactions[].title - 交易标题（来自 meta.title，约79%有值）
 * @returns {string} data.transactions[].created_at - 创建时间（ISO 8601格式）
 * @returns {Object} data.pagination - 分页信息
 */
router.get(
  '/transactions',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id
    const { asset_code, business_type, page = 1, page_size = 20 } = req.query

    const QueryService = req.app.locals.services.getService('asset_query')
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')

    const result = await QueryService.getTransactions(
      { user_id },
      { asset_code, business_type, page: parseInt(page), page_size: parseInt(page_size) }
    )

    /*
     * γ 模式（2026-02-21）：通过 DataSanitizer 统一脱敏
     * - BUDGET_POINTS 等禁止资产自动过滤（安全关键）
     * - business_type_display 中文映射自动添加
     * - 内部字段（account_id、idempotency_key 等）自动删除
     */
    const dataLevel = req.dataLevel || 'public'
    const sanitizedTransactions = DataSanitizer.sanitizeTransactionRecords(
      result.transactions,
      dataLevel
    )

    return res.apiSuccess({
      transactions: sanitizedTransactions,
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
