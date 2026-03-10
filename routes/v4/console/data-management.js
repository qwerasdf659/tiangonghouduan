'use strict'

/**
 * 数据管理路由 - 数据一键删除功能
 *
 * 路径前缀：/api/v4/console/data-management
 *
 * 端点：
 * - GET  /stats              数据量统计
 * - GET  /policies           自动清理策略列表
 * - PUT  /policies/:config_key 更新策略
 * - GET  /history            清理历史（分页）
 * - POST /preview            预览清理影响
 * - POST /cleanup            执行清理
 *
 * @see docs/数据一键删除功能设计方案.md
 * @module routes/v4/console/data-management
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { requireValidSession } = require('../../../middleware/sensitiveOperation')
const { asyncHandler } = require('./shared/middleware')

/** 管理员认证中间件组 */
const adminAuth = [authenticateToken, requireRoleLevel(100)]

/**
 * GET /stats - 数据量统计
 *
 * @description 返回各表数据量、安全等级分组、数据库大小
 */
router.get(
  '/stats',
  adminAuth,
  asyncHandler(async (req, res) => {
    const service = req.app.locals.services.getService('data_management')
    const stats = await service.getStats()
    return res.apiSuccess(stats, '数据量统计获取成功')
  })
)

/**
 * GET /policies - 自动清理策略列表
 *
 * @description 返回 system_configs 中的清理策略配置
 */
router.get(
  '/policies',
  adminAuth,
  asyncHandler(async (req, res) => {
    const service = req.app.locals.services.getService('data_management')
    const policies = await service.getPolicies()
    return res.apiSuccess(policies, '清理策略获取成功')
  })
)

/**
 * PUT /policies/:config_key - 更新清理策略
 *
 * @description 更新指定表的保留天数或启用状态
 * @param {string} config_key - 策略对应的表名
 * @body {number} [retention_days] - 保留天数（1-365）
 * @body {boolean} [enabled] - 是否启用
 */
router.put(
  '/policies/:config_key',
  adminAuth,
  asyncHandler(async (req, res) => {
    const { config_key } = req.params
    const { retention_days, enabled } = req.body

    if (retention_days === undefined && enabled === undefined) {
      return res.apiBadRequest('至少提供 retention_days 或 enabled 参数')
    }

    const service = req.app.locals.services.getService('data_management')
    const result = await service.updatePolicy(
      config_key,
      { retention_days, enabled },
      req.user.user_id
    )
    return res.apiSuccess(result, '策略更新成功')
  })
)

/**
 * GET /history - 清理历史（分页）
 *
 * @description 从 admin_operation_logs 查询 operation_type='data_cleanup' 的记录
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页条数
 */
router.get(
  '/history',
  adminAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const page_size = Math.min(100, Math.max(1, parseInt(req.query.page_size) || 20))

    const service = req.app.locals.services.getService('data_management')
    const result = await service.getHistory({ page, page_size })
    return res.apiPaginated(result.items, result.pagination, '清理历史获取成功')
  })
)

/**
 * POST /preview - 预览清理影响
 *
 * @description 根据清理模式和参数，计算各表将删除的行数
 * @body {string} mode - 清理模式：'manual' / 'auto' / 'pre_launch'
 * @body {string[]} [categories] - 清理类目（manual 模式必需）
 * @body {Object} [time_range] - { start, end }
 * @body {Object} [filters] - 额外筛选条件
 */
router.post(
  '/preview',
  adminAuth,
  asyncHandler(async (req, res) => {
    const { mode, categories, time_range, filters } = req.body

    if (!mode || !['manual', 'auto', 'pre_launch'].includes(mode)) {
      return res.apiBadRequest('mode 参数必须为 manual / auto / pre_launch')
    }

    if (mode === 'manual' && (!categories || categories.length === 0)) {
      return res.apiBadRequest('手动清理模式必须指定至少一个清理类目')
    }

    const service = req.app.locals.services.getService('data_management')
    const result = await service.previewCleanup({ mode, categories, time_range, filters })
    return res.apiSuccess(result, '预览完成')
  })
)

/**
 * POST /cleanup - 执行清理
 *
 * @description 执行数据清理，需要预览令牌和二次确认
 * @body {string} preview_token - 预览令牌（5 分钟有效）
 * @body {boolean} [dry_run=false] - 干跑模式
 * @body {string} reason - 操作原因
 * @body {string} confirmation_text - 确认文字（必须为"确认删除"）
 */
router.post(
  '/cleanup',
  adminAuth,
  requireValidSession,
  asyncHandler(async (req, res) => {
    const { preview_token, dry_run, reason, confirmation_text } = req.body

    if (!preview_token) {
      return res.apiBadRequest('缺少 preview_token，请先执行预览')
    }
    if (!reason) {
      return res.apiBadRequest('缺少操作原因（reason）')
    }
    if (!confirmation_text) {
      return res.apiBadRequest('缺少确认文字（confirmation_text）')
    }

    const service = req.app.locals.services.getService('data_management')
    const result = await service.executeCleanup(
      { preview_token, dry_run, reason, confirmation_text },
      req.user.user_id
    )
    return res.apiSuccess(result, result.dry_run ? '干跑模式完成' : '清理完成')
  })
)

module.exports = router
