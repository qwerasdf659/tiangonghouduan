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
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')

/**
 * GET /api/v4/assets/transactions
 *
 * @description 查询当前用户的资产流水记录
 * @query {string} [asset_code] - 资产代码筛选（如 POINTS、star_stone、red_core_shard）
 * @query {string} [business_type] - 业务类型筛选（如 lottery_consume、lottery_reward、exchange_debit）
 * @query {string} [start_date] - 起始时间（UTC ISO8601，如 2026-06-28T16:00:00.000Z；前端把"今天/本周/本月"按北京时区换算成 UTC 传入）
 * @query {string} [end_date] - 结束时间（UTC ISO8601）；与 start_date 一起在数据库层按 created_at 范围 + 分页筛选，杜绝"前端只对当前页本地过滤导致跨页数据对不上"
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
    const { asset_code, business_type, start_date, end_date, page = 1, page_size = 20 } = req.query

    /*
     * 日期范围校验（今天/本周/本月筛选）：前端传 UTC ISO8601 字符串。
     * 非法日期串直接忽略（不下传无效值，避免底层 new Date('xxx') → Invalid Date 污染查询）。
     * 时间筛选在数据库层按 created_at 执行 + 分页，确保跨页数据范围一致（修复前端本地过滤当前页对不上）。
     */
    const isValidDateStr = v => typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v))
    const startDate = isValidDateStr(start_date) ? start_date : undefined
    const endDate = isValidDateStr(end_date) ? end_date : undefined

    const QueryService = req.app.locals.services.getService('asset_query')
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')

    const result = await QueryService.getTransactions(
      { user_id },
      {
        asset_code,
        business_type,
        start_date: startDate,
        end_date: endDate,
        page: parseInt(page),
        page_size: parseInt(page_size)
      }
    )

    /*
     * γ 模式：通过 DataSanitizer 统一脱敏
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
