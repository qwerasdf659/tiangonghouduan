/**
 * 导航徽标模块（Navigation Badges）
 *
 * @route /api/v4/console/nav
 * @description 侧边栏导航徽标计数接口，轻量级轮询
 *
 * 📌 模块说明：
 * - 此模块属于 console 域，仅限 admin（role_level >= 100）访问
 * - 提供侧边栏菜单项的待处理数量徽标
 * - 设计为轻量级接口，适合前端轮询（建议间隔30-60秒）
 *
 * API列表：
 * - GET /badges - 获取所有徽标计数
 *
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B13）
 *
 * @module routes/v4/console/operations/nav
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * @route GET /api/v4/console/nav/badges
 * @desc 获取侧边栏徽标计数
 * @access Private (管理员，role_level >= 100)
 *
 * @returns {Object} 徽标计数数据
 * @returns {Object} data.badges - 各分类的待处理数量
 * @returns {number} data.total - 总待处理数量
 * @returns {string} data.updated_at - 数据更新时间
 *
 * @example
 * GET /api/v4/console/nav/badges
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "badges": {
 *       "consumption": 5,
 *       "customer_service": 3,
 *       "risk_alert": 1,
 *       "lottery_alert": 2
 *     },
 *     "total": 11,
 *     "updated_at": "2026-01-31T14:30:00.000+08:00"
 *   },
 *   "message": "获取成功"
 * }
 *
 * 前端使用建议：
 * - 建议轮询间隔：30-60秒
 * - 使用 ETag 或 If-Modified-Since 进行缓存优化
 * - total > 0 时在侧边栏整体图标显示徽标
 * - 各分类 count > 0 时在对应菜单项显示徽标
 */
router.get('/badges', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    logger.debug('[导航徽标] 获取徽标计数', {
      admin_id: req.user.user_id
    })

    // 🔄 通过 ServiceManager 获取 NavBadgeService（符合TR-005规范）
    const NavBadgeService = req.app.locals.services.getService('nav_badge')
    const result = await NavBadgeService.getBadges()

    return res.apiSuccess(result, '获取成功')
  } catch (error) {
    logger.error('[导航徽标] 获取徽标计数失败', { error: error.message })
    return handleServiceError(error, res, '获取徽标计数失败')
  }
})

module.exports = router
