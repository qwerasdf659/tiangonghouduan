/**
 * 管理员资产调整路由
 *
 * 路径：/api/v4/admin/asset-adjustment
 *
 * 职责：
 * - 管理员调整用户积分（POINTS）
 * - 管理员调整预算积分（BUDGET_POINTS）
 * - 管理员调整其他资产（DIAMOND、材料等）
 *
 * 业务场景：
 * - 客服补偿用户积分
 * - 活动奖励发放
 * - 数据修正
 * - 预算积分分配
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 AssetService）
 * - 所有调整操作记录审计日志
 * - 支持幂等性控制（idempotency_key）
 *
 * 创建时间：2025-12-30
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { v4: uuidv4 } = require('uuid')
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 错误处理包装器
 *
 * @param {Function} fn - 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler (fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * POST /api/v4/admin/asset-adjustment/adjust
 *
 * @description 管理员调整用户资产
 * @body {number} user_id - 目标用户ID（必填）
 * @body {string} asset_code - 资产代码（必填，如 POINTS, BUDGET_POINTS, DIAMOND）
 * @body {number} amount - 调整数量（必填，正数=增加，负数=扣减）
 * @body {string} reason - 调整原因（必填）
 * @body {number} [campaign_id] - 活动ID（BUDGET_POINTS 必填）
 * @body {string} [idempotency_key] - 幂等键（可选，未提供则自动生成）
 * @access Admin
 */
router.post(
  '/adjust',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin_id = req.user.user_id
    const { user_id, asset_code, amount, reason, campaign_id, idempotency_key } = req.body

    // 参数验证
    if (!user_id) {
      return res.apiError('user_id 是必填参数', 'BAD_REQUEST', null, 400)
    }
    if (!asset_code) {
      return res.apiError('asset_code 是必填参数', 'BAD_REQUEST', null, 400)
    }
    if (amount === undefined || amount === null || amount === 0) {
      return res.apiError('amount 是必填参数且不能为0', 'BAD_REQUEST', null, 400)
    }
    if (!reason || reason.trim().length === 0) {
      return res.apiError('reason 是必填参数', 'BAD_REQUEST', null, 400)
    }

    // BUDGET_POINTS 必须提供 campaign_id
    if (asset_code === 'BUDGET_POINTS' && !campaign_id) {
      return res.apiError('调整预算积分必须提供 campaign_id', 'BAD_REQUEST', null, 400)
    }

    // 生成幂等键
    const finalIdempotencyKey =
      idempotency_key ||
      `admin_adjust_${admin_id}_${user_id}_${asset_code}_${Date.now()}_${uuidv4().slice(0, 8)}`

    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')
    const AuditLogService = req.app.locals.services.getService('auditLog')

    try {
      // 执行资产调整（使用 TransactionManager 确保事务边界）
      const result = await TransactionManager.execute(
        async (transaction) => {
          return await AssetService.changeBalance(
            {
              user_id,
              asset_code,
              delta_amount: Number(amount),
              business_type: 'admin_adjustment',
              idempotency_key: finalIdempotencyKey,
              campaign_id: campaign_id || null,
              meta: {
                admin_id,
                reason,
                adjusted_at: new Date().toISOString()
              }
            },
            { transaction }
          )
        },
        { description: `管理员资产调整: user_id=${user_id}, asset_code=${asset_code}` }
      )

      // 记录审计日志
      try {
        await AuditLogService.log({
          operator_id: admin_id,
          operation_type: 'asset_adjustment',
          target_type: 'user_asset',
          target_id: user_id,
          before_data: {
            asset_code,
            balance_before: result.transaction_record?.balance_before
          },
          after_data: {
            asset_code,
            balance_after: result.transaction_record?.balance_after,
            delta_amount: amount
          },
          reason,
          ip_address: req.ip
        })
      } catch (auditError) {
        // 审计日志失败不影响业务
        console.error('[管理员资产调整] 审计日志记录失败:', auditError.message)
      }

      // 检查是否是重复请求
      if (result.is_duplicate) {
        return res.apiSuccess({
          message: '重复请求，返回原结果',
          is_duplicate: true,
          user_id,
          asset_code,
          amount,
          balance_after: result.balance ? Number(result.balance.available_amount) : null,
          idempotency_key: finalIdempotencyKey
        })
      }

      return res.apiSuccess({
        message: `${amount > 0 ? '增加' : '扣减'}${asset_code}成功`,
        user_id,
        asset_code,
        amount,
        balance_before: result.transaction_record?.balance_before,
        balance_after: result.transaction_record?.balance_after,
        transaction_id: result.transaction_record?.transaction_id,
        idempotency_key: finalIdempotencyKey
      })
    } catch (error) {
      // 余额不足等业务错误
      if (error.message.includes('余额不足') || error.message.includes('insufficient')) {
        return res.apiError(error.message, 'INSUFFICIENT_BALANCE', null, 400)
      }
      throw error
    }
  })
)

/**
 * POST /api/v4/admin/asset-adjustment/batch-adjust
 *
 * @description 批量调整用户资产（用于活动奖励批量发放等场景）
 * @body {Array} adjustments - 调整列表
 * @body {string} batch_reason - 批量调整原因
 * @access Admin
 */
router.post(
  '/batch-adjust',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin_id = req.user.user_id
    const { adjustments, batch_reason } = req.body

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return res.apiError('adjustments 必须是非空数组', 'BAD_REQUEST', null, 400)
    }
    if (!batch_reason) {
      return res.apiError('batch_reason 是必填参数', 'BAD_REQUEST', null, 400)
    }
    if (adjustments.length > 100) {
      return res.apiError('单次批量调整不能超过100条', 'BAD_REQUEST', null, 400)
    }

    const AssetService = req.app.locals.services.getService('asset')
    const results = []
    const errors = []

    for (const adj of adjustments) {
      const { user_id, asset_code, amount, campaign_id } = adj

      if (!user_id || !asset_code || !amount) {
        errors.push({ user_id, error: '参数不完整' })
        continue
      }

      const idempotencyKey = `batch_adjust_${admin_id}_${user_id}_${asset_code}_${Date.now()}_${uuidv4().slice(0, 8)}`

      try {
        const result = await TransactionManager.execute(
          async (transaction) => {
            return await AssetService.changeBalance(
              {
                user_id,
                asset_code,
                delta_amount: Number(amount),
                business_type: 'admin_adjustment',
                idempotency_key: idempotencyKey,
                campaign_id: campaign_id || null,
                meta: {
                  admin_id,
                  reason: batch_reason,
                  batch: true
                }
              },
              { transaction }
            )
          },
          { description: `批量资产调整: user_id=${user_id}, asset_code=${asset_code}` }
        )

        results.push({
          user_id,
          asset_code,
          amount,
          success: true,
          balance_after: result.transaction_record?.balance_after
        })
      } catch (error) {
        errors.push({
          user_id,
          asset_code,
          amount,
          error: error.message
        })
      }
    }

    return res.apiSuccess({
      message: `批量调整完成：成功${results.length}条，失败${errors.length}条`,
      total: adjustments.length,
      success_count: results.length,
      error_count: errors.length,
      results,
      errors
    })
  })
)

/**
 * GET /api/v4/admin/asset-adjustment/user/:user_id/balances
 *
 * @description 查询用户所有资产余额（管理员视角）
 * @param {number} user_id - 用户ID
 * @access Admin
 */
router.get(
  '/user/:user_id/balances',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id } = req.params

    const AssetService = req.app.locals.services.getService('asset')

    const balances = await AssetService.getAllBalances({ user_id: Number(user_id) })

    return res.apiSuccess({
      user_id: Number(user_id),
      balances: balances.map(b => ({
        asset_code: b.asset_code,
        available_amount: Number(b.available_amount),
        frozen_amount: Number(b.frozen_amount),
        total: Number(b.available_amount) + Number(b.frozen_amount),
        campaign_id: b.campaign_id || null
      }))
    })
  })
)

module.exports = router
