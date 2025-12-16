/**
 * 餐厅积分抽奖系统 V4.5 - 钻石系统管理API（管理员侧）
 * 处理钻石账户管理、余额调整、流水查询等功能
 *
 * 功能说明：
 * - 查询用户钻石余额
 * - 管理员调整用户钻石余额
 * - 查询钻石流水
 *
 * 业务规则（强制）：
 * - ✅ 管理员调整余额必须携带幂等键（business_id）
 * - ✅ 所有写操作必须记录操作日志
 * - ✅ 钻石作为虚拟价值货币，统一用于交易市场结算
 * - ❌ 禁止删除钻石流水（审计合规要求）
 *
 * 创建时间：2025年12月15日
 * 参考文档：/docs/材料系统（碎片-水晶）方案.md 第12节
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')

/**
 * 查询用户钻石余额（已禁用）
 * GET /api/v4/admin/diamond/users/:user_id/balance
 * @deprecated Phase 4 - 旧钻石账户表已删除，请使用统一资产查询接口
 */
router.get('/users/:user_id/balance', authenticateToken, requireAdmin, async (req, res) => {
  return res.apiError(
    '❌ 钻石余额查询功能已迁移至统一资产管理模块（Phase 4）。' +
      '\n旧的钻石账户表（user_diamond_accounts）已删除。' +
      '\n请使用 GET /api/v4/admin/assets/balance/:user_id?asset_code=DIAMOND 查询资产余额。',
    'DEPRECATED_API',
    null,
    410 // 410 Gone
  )
})

/**
 * 管理员调整用户钻石余额（已禁用）
 * POST /api/v4/admin/diamond/users/:user_id/adjust
 * @deprecated 已迁移至统一资产管理模块
 */
router.post('/users/:user_id/adjust', authenticateToken, requireAdmin, async (req, res) => {
  return res.apiError(
    '❌ 管理员调整钻石余额功能已迁移至统一资产管理模块，此API已禁用（Phase 4）。' +
      '\n请使用 POST /api/v4/admin/assets/balance/adjust 接口进行资产调整。',
    'DEPRECATED_API',
    null,
    410 // 410 Gone
  )
})

/**
 * 查询钻石流水（管理员）- 已禁用
 * GET /api/v4/admin/diamond/transactions
 * @deprecated Phase 4 - 旧钻石流水表已删除，请使用统一资产流水查询接口
 */
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  return res.apiError(
    '❌ 钻石流水查询功能已迁移至统一资产管理模块（Phase 4）。' +
      '\n旧的钻石流水表（diamond_transactions）已删除。' +
      '\n请使用 GET /api/v4/admin/assets/transactions?asset_code=DIAMOND 查询资产流水。',
    'DEPRECATED_API',
    null,
    410 // 410 Gone
  )
})

module.exports = router
