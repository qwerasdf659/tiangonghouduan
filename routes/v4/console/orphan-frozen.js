/**
 * 管理员孤儿冻结清理路由
 *
 * 路径：/api/v4/console/orphan-frozen
 *
 * 职责（P0-2唯一入口）：
 * - 检测系统中的孤儿冻结（frozen_amount > 实际活跃挂牌冻结总额）
 * - 管理员手动触发孤儿冻结清理（解冻到可用余额）
 * - 获取孤儿冻结统计报告
 *
 * 业务场景：
 * - 定期审计孤儿冻结
 * - 手动修复因异常导致的冻结资产
 * - 系统健康检查
 *
 * 架构原则：
 * - 所有孤儿冻结清理必须通过 OrphanFrozenCleanupService（唯一入口）
 * - 禁止直接修改 AccountAssetBalance 表
 * - 所有清理操作必须记录审计日志
 *
 * 安全设计：
 * - 仅限管理员访问
 * - 默认为干跑模式（dry_run=true），确认后才能实际清理
 * - 审计日志强制记录
 *
 * 创建时间：2026-01-09（P0-2实施）
 * 版本：V4.5.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')

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
 * GET /api/v4/console/orphan-frozen/detect
 *
 * @description 检测孤儿冻结（仅检测，不清理）
 * @query {number} [user_id] - 指定用户ID（可选，不传则检测所有）
 * @query {string} [asset_code] - 指定资产代码（可选）
 * @query {number} [limit=1000] - 最大返回条数（默认 1000）
 * @access Admin
 * @returns {Object} 孤儿冻结 DTO（包含统计汇总和明细列表）
 *
 * @example 返回结构
 * {
 *   orphan_count: 5,                    // 孤儿冻结明细条数
 *   total_orphan_amount: 1000,          // 孤儿冻结总额
 *   affected_user_count: 3,             // 受影响用户数
 *   affected_asset_codes: ['POINTS'],   // 受影响资产代码列表
 *   checked_count: 100,                 // 本次检测的账户数
 *   items_truncated: false,             // 明细是否被截断
 *   generated_at: '2026-01-15T...',     // DTO 生成时间
 *   orphan_items: [...]                 // 孤儿冻结明细列表
 * }
 */
router.get(
  '/detect',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { user_id, asset_code, limit } = req.query

    // 通过 ServiceManager 获取服务
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphan_frozen_cleanup')

    const options = {}
    if (user_id) options.user_id = Number(user_id)
    if (asset_code) options.asset_code = asset_code
    if (limit) options.limit = Number(limit)

    // 🔴 P0 决策（2026-01-15）：detectOrphanFrozen 返回稳定 DTO 对象
    const dto = await OrphanFrozenCleanupService.detectOrphanFrozen(options)

    return res.apiSuccess({
      message: `检测完成，发现 ${dto.orphan_count} 条孤儿冻结`,
      // DTO 核心字段
      orphan_count: dto.orphan_count,
      total_orphan_amount: dto.total_orphan_amount,
      affected_user_count: dto.affected_user_count,
      affected_asset_codes: dto.affected_asset_codes,
      checked_count: dto.checked_count,
      items_truncated: dto.items_truncated,
      generated_at: dto.generated_at,
      // 明细列表
      orphan_items: dto.orphan_items
    })
  })
)

/**
 * GET /api/v4/console/orphan-frozen/stats
 *
 * @description 获取孤儿冻结统计报告
 * @access Admin
 * @returns {Object} 孤儿冻结统计信息（按资产类型分组）
 */
router.get(
  '/stats',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphan_frozen_cleanup')

    const stats = await OrphanFrozenCleanupService.getOrphanFrozenStats()

    return res.apiSuccess({
      message: '获取孤儿冻结统计成功',
      ...stats
    })
  })
)

/**
 * POST /api/v4/console/orphan-frozen/cleanup
 *
 * @description 清理孤儿冻结（解冻到可用余额）
 * @body {boolean} [dry_run=true] - 干跑模式（默认true，仅检测不清理）
 * @body {number} [user_id] - 指定用户ID（可选，不传则清理所有）
 * @body {string} [asset_code] - 指定资产代码（可选）
 * @body {number} [limit=100] - 最大清理条数（默认 100）
 * @body {string} reason - 清理原因（🔴 P0-2 必填：实际清理时必须提供）
 * @body {string} operator_name - 操作人姓名（🔴 P0-2 必填：实际清理时必须提供）
 * @access SuperAdmin（role_level >= 100 且 is_super_admin = true）
 * @returns {Object} 清理结果 DTO
 *
 * @example 返回结构
 * {
 *   dry_run: true,                     // 是否为演练模式
 *   detected_count: 5,                 // 检测到的孤儿冻结总数
 *   cleaned_count: 5,                  // 成功清理条数
 *   failed_count: 0,                   // 清理失败条数
 *   total_unfrozen_amount: 1000,       // 总解冻金额
 *   details: [...]                     // 清理明细
 * }
 */
router.post(
  '/cleanup',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const admin_id = req.user.user_id
    const admin_role_level = req.user.role_level || 0
    const { dry_run = true, user_id, asset_code, limit, reason, operator_name } = req.body

    // 🔴 P0-2 决策：实际清理操作（dry_run=false）仅限超级管理员
    if (!dry_run) {
      // 超级管理员权限校验：role_level >= 100
      if (admin_role_level < 100) {
        return res.apiError(
          '孤儿冻结清理操作仅限超级管理员执行',
          'SUPER_ADMIN_REQUIRED',
          { required_role_level: 100, current_role_level: admin_role_level },
          403
        )
      }

      // 🔴 P0-2 决策：实际清理必须提供 reason 和 operator_name
      if (!reason || !reason.trim()) {
        return res.apiError(
          '实际清理操作必须提供清理原因（reason）',
          'REASON_REQUIRED',
          { field: 'reason' },
          400
        )
      }

      if (!operator_name || !operator_name.trim()) {
        return res.apiError(
          '实际清理操作必须提供操作人姓名（operator_name）',
          'OPERATOR_NAME_REQUIRED',
          { field: 'operator_name' },
          400
        )
      }
    }

    // 通过 ServiceManager 获取服务
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphan_frozen_cleanup')

    // 🔴 P0 决策（2026-01-15）：cleanupOrphanFrozen 返回统一契约字段
    const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
      dry_run,
      user_id: user_id ? Number(user_id) : undefined,
      asset_code,
      limit: limit ? Number(limit) : 100,
      operator_id: admin_id,
      reason: reason
        ? `${reason.trim()}（操作人: ${operator_name || '未提供'}）`
        : `管理员手动清理孤儿冻结（admin_id=${admin_id}）`
    })

    /*
     * 根据 dry_run 状态返回不同消息
     * 🔴 适配新契约字段名：detected_count, cleaned_count, failed_count, total_unfrozen_amount
     */
    const message = dry_run
      ? `干跑模式：发现 ${result.detected_count} 条孤儿冻结，总额 ${result.total_unfrozen_amount}（未实际清理）`
      : `清理完成：成功 ${result.cleaned_count} 条，失败 ${result.failed_count} 条`

    return res.apiSuccess({
      message,
      dry_run: result.dry_run,
      detected_count: result.detected_count,
      cleaned_count: result.cleaned_count,
      failed_count: result.failed_count,
      total_unfrozen_amount: result.total_unfrozen_amount,
      details: result.details
    })
  })
)

module.exports = router
