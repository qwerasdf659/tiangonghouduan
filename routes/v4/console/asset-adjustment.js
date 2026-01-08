/**
 * 管理员资产调整路由
 *
 * 路径：/api/v4/console/asset-adjustment
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
 * 审计整合方案（2026-01-08）：
 * - 决策5：资产调整是关键操作，审计失败阻断业务
 * - 决策6：幂等键由业务主键派生（禁止自动生成）
 * - 决策7：审计日志在同一事务内
 * - 决策10：target_id 指向 AssetTransaction.transaction_id
 *
 * 创建时间：2025-12-30
 * 更新时间：2026-01-08（审计整合决策5/6/7/10实现）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const MaterialManagementService = require('../../../services/MaterialManagementService')
const UserService = require('../../../services/UserService')

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
 * POST /api/v4/console/asset-adjustment/adjust
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

    /*
     * 【决策6】幂等键必须由前端提供或由业务数据派生
     * 禁止使用 Date.now() 自动生成（无法实现幂等性）
     * 格式：admin_adjust_{admin_id}_{user_id}_{asset_code}_{前端timestamp}
     */
    if (!idempotency_key || idempotency_key.trim() === '') {
      return res.apiError(
        'idempotency_key 是必填参数（关键操作禁止自动生成幂等键，请由前端提供唯一业务标识）',
        'BAD_REQUEST',
        { hint: '推荐格式：admin_adjust_{admin_id}_{user_id}_{asset_code}_{timestamp}' },
        400
      )
    }

    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')
    const AuditLogService = req.app.locals.services.getService('auditLog')

    try {
      /*
       * 【决策7】审计日志与业务操作在同一事务内
       * 【决策5】资产调整是关键操作，审计失败阻断业务
       */
      const result = await TransactionManager.execute(
        async transaction => {
          // 1. 执行资产调整
          const changeResult = await AssetService.changeBalance(
            {
              user_id,
              asset_code,
              delta_amount: Number(amount),
              business_type: 'admin_adjustment',
              idempotency_key,
              campaign_id: campaign_id || null,
              meta: {
                admin_id,
                reason,
                adjusted_at: new Date().toISOString()
              }
            },
            { transaction }
          )

          // 重复请求直接返回，不再记录审计日志
          if (changeResult.is_duplicate) {
            return changeResult
          }

          /*
           * 【决策5/10】记录审计日志（关键操作，失败阻断业务流程）
           * target_id 指向 AssetTransaction.transaction_id（决策10）
           * 审计日志与业务在同一事务内（决策7）
           */
          await AuditLogService.logOperation({
            operator_id: admin_id,
            operation_type: 'asset_adjustment',
            target_type: 'AssetTransaction',
            target_id: changeResult.transaction_record?.transaction_id,
            action: Number(amount) > 0 ? 'increase' : 'decrease',
            before_data: {
              user_id,
              asset_code,
              balance: changeResult.transaction_record?.balance_before
            },
            after_data: {
              user_id,
              asset_code,
              balance: changeResult.transaction_record?.balance_after,
              delta_amount: Number(amount)
            },
            reason,
            idempotency_key,
            ip_address: req.ip,
            is_critical_operation: true, // 关键操作标记
            transaction // 同一事务
          })

          return changeResult
        },
        { description: `管理员资产调整: user_id=${user_id}, asset_code=${asset_code}` }
      )

      // 检查是否是重复请求
      if (result.is_duplicate) {
        return res.apiSuccess({
          message: '重复请求，返回原结果',
          is_duplicate: true,
          user_id,
          asset_code,
          amount,
          balance_after: result.balance ? Number(result.balance.available_amount) : null,
          idempotency_key
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
        idempotency_key
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
 * POST /api/v4/console/asset-adjustment/batch-adjust
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

    /*
     * 【决策6】幂等键必须由业务主键派生，禁止兜底
     * 批量调整必须提供 batch_timestamp（由前端在发起请求时生成的唯一标识）
     * 格式：batch_adjust_{admin_id}_{user_id}_{asset_code}_{batch_timestamp}_{index}
     */
    const { batch_timestamp } = req.body
    if (!batch_timestamp || batch_timestamp.trim() === '') {
      return res.apiError(
        'batch_timestamp 是必填参数（关键操作禁止自动生成幂等键，请由前端提供批次唯一标识）',
        'BAD_REQUEST',
        { hint: '推荐格式：毫秒级时间戳，如 1736412345678' },
        400
      )
    }

    const AssetService = req.app.locals.services.getService('asset')
    const results = []
    const errors = []

    for (let index = 0; index < adjustments.length; index++) {
      const adj = adjustments[index]
      const { user_id, asset_code, amount, campaign_id } = adj

      if (!user_id || !asset_code || !amount) {
        errors.push({ user_id, error: '参数不完整' })
        continue
      }

      /*
       * 【决策6】批量调整的幂等键：由业务主键派生，禁止兜底
       * 每项调整可单独提供 idempotency_key，否则使用 batch_timestamp + index 派生
       * 格式：batch_adjust_{admin_id}_{user_id}_{asset_code}_{batch_timestamp}_{index}
       */
      const idempotencyKey =
        adj.idempotency_key ||
        `batch_adjust_${admin_id}_${user_id}_${asset_code}_${batch_timestamp}_${index}`

      try {
        const AuditLogService = req.app.locals.services.getService('auditLog')

        // eslint-disable-next-line no-await-in-loop -- 批量调整需要逐笔事务处理，确保单笔失败不影响其他
        const result = await TransactionManager.execute(
          async transaction => {
            const changeResult = await AssetService.changeBalance(
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

            // 重复请求不再记录审计日志
            if (!changeResult.is_duplicate) {
              // 【决策5/7/10】审计日志在事务内，关键操作
              await AuditLogService.logOperation({
                operator_id: admin_id,
                operation_type: 'asset_adjustment',
                target_type: 'AssetTransaction',
                target_id: changeResult.transaction_record?.transaction_id,
                action: Number(amount) > 0 ? 'increase' : 'decrease',
                before_data: {
                  user_id,
                  asset_code,
                  balance: changeResult.transaction_record?.balance_before
                },
                after_data: {
                  user_id,
                  asset_code,
                  balance: changeResult.transaction_record?.balance_after,
                  delta_amount: Number(amount)
                },
                reason: batch_reason,
                idempotency_key: idempotencyKey,
                ip_address: req.ip,
                is_critical_operation: true,
                transaction
              })
            }

            return changeResult
          },
          { description: `批量资产调整: user_id=${user_id}, asset_code=${asset_code}` }
        )

        results.push({
          user_id,
          asset_code,
          amount,
          success: true,
          balance_after: result.transaction_record?.balance_after,
          is_duplicate: result.is_duplicate || false
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
 * GET /api/v4/console/asset-adjustment/asset-types
 *
 * @description 获取所有可调整的资产类型（管理员视角）
 * @returns {Array} asset_types - 资产类型列表
 * @access Admin
 *
 * 设计说明：
 * - 暴露DB已存在能力：material_asset_types + 内置资产类型（POINTS/DIAMOND/BUDGET_POINTS）
 * - 只读接口，不创造新业务能力
 */
router.get(
  '/asset-types',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // 1. 内置资产类型（系统核心资产）
    const builtInTypes = [
      {
        asset_code: 'POINTS',
        name: '积分',
        display_name: '积分',
        category: 'builtin',
        is_enabled: true
      },
      {
        asset_code: 'DIAMOND',
        name: '钻石',
        display_name: '钻石',
        category: 'builtin',
        is_enabled: true
      },
      {
        asset_code: 'BUDGET_POINTS',
        name: '预算积分',
        display_name: '预算积分',
        category: 'builtin',
        is_enabled: true
      }
    ]

    // 2. 通过 Service 层获取材料资产类型（符合路由层规范）
    const { asset_types: materialTypes } = await MaterialManagementService.listAssetTypes({
      is_enabled: true
    })

    const materialAssetTypes = materialTypes.map(m => ({
      asset_code: m.asset_code,
      name: m.display_name,
      display_name: m.display_name,
      category: 'material',
      group_code: m.group_code,
      form: m.form,
      tier: m.tier,
      is_enabled: m.is_enabled
    }))

    // 3. 合并返回
    const allAssetTypes = [...builtInTypes, ...materialAssetTypes]

    return res.apiSuccess({
      asset_types: allAssetTypes,
      total: allAssetTypes.length
    })
  })
)

/**
 * GET /api/v4/console/asset-adjustment/user/:user_id/balances
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

    // 1. 通过 Service 层获取用户基本信息（符合路由层规范）
    let user
    try {
      user = await UserService.getUserById(Number(user_id))
    } catch (error) {
      if (error.message === '用户不存在') {
        return res.apiError('用户不存在', 'USER_NOT_FOUND', null, 404)
      }
      throw error
    }

    // 2. 获取资产余额
    const AssetService = req.app.locals.services.getService('asset')
    const balances = await AssetService.getAllBalances({ user_id: Number(user_id) })

    return res.apiSuccess({
      user: {
        user_id: user.user_id,
        nickname: user.nickname,
        mobile: user.mobile,
        status: user.status
      },
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
