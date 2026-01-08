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
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')

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
 * @access Admin
 * @returns {Object} 孤儿冻结列表和统计
 */
router.get(
  '/detect',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id, asset_code } = req.query

    // 通过 ServiceManager 获取服务
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphanFrozenCleanup')

    const options = {}
    if (user_id) options.user_id = Number(user_id)
    if (asset_code) options.asset_code = asset_code

    const orphanList = await OrphanFrozenCleanupService.detectOrphanFrozen(options)

    return res.apiSuccess({
      message: `检测完成，发现 ${orphanList.length} 条孤儿冻结`,
      total: orphanList.length,
      total_amount: orphanList.reduce((sum, item) => sum + item.orphan_amount, 0),
      orphan_list: orphanList
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
  requireAdmin,
  asyncHandler(async (req, res) => {
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphanFrozenCleanup')

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
 * @body {string} [reason] - 清理原因（可选）
 * @access Admin
 * @returns {Object} 清理结果报告
 */
router.post(
  '/cleanup',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const admin_id = req.user.user_id
    const { dry_run = true, user_id, asset_code, reason } = req.body

    // 通过 ServiceManager 获取服务
    const OrphanFrozenCleanupService = req.app.locals.services.getService('orphanFrozenCleanup')

    const result = await OrphanFrozenCleanupService.cleanupOrphanFrozen({
      dry_run,
      user_id: user_id ? Number(user_id) : undefined,
      asset_code,
      operator_id: admin_id,
      reason: reason || `管理员手动清理孤儿冻结（admin_id=${admin_id}）`
    })

    // 根据 dry_run 状态返回不同消息
    const message = dry_run
      ? `干跑模式：发现 ${result.detected} 条孤儿冻结，总额 ${result.total_amount}（未实际清理）`
      : `清理完成：成功 ${result.cleaned} 条，失败 ${result.failed} 条`

    return res.apiSuccess({
      message,
      dry_run: result.dry_run,
      detected: result.detected,
      cleaned: result.cleaned,
      failed: result.failed,
      total_amount: result.total_amount,
      details: result.details
    })
  })
)

module.exports = router
