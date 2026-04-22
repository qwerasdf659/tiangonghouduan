/**
 * DIY 数据统计 — 管理端路由
 *
 * 顶层路径：/api/v4/console/diy/stats
 *
 * 接口清单（1 个）：
 * - GET /   获取 DIY 模块统计数据
 *
 * @module routes/v4/console/diy/stats
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(60))

/** 获取 DIY 统计数据 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const stats = await DIYService.getAdminStats()
    return res.apiSuccess(stats, '获取统计数据成功')
  })
)

module.exports = router
