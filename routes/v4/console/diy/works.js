/**
 * DIY 用户作品查看 — 管理端路由（只读）
 *
 * 顶层路径：/api/v4/console/diy/works
 *
 * 接口清单（2 个）：
 * - GET /       获取所有用户作品列表（分页/筛选）
 * - GET /:id    获取作品详情
 *
 * @module routes/v4/console/diy/works
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')

/**
 * 异步路由处理器包装
 * @param {Function} fn - 异步路由处理函数
 * @returns {Function} Express 中间件
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

router.use(authenticateToken, requireRoleLevel(60))

/** 获取所有用户作品列表（分页/筛选） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    const result = await DIYService.getAdminWorkList(req.query)
    return res.apiSuccess(result, '获取作品列表成功')
  })
)

/** 获取作品详情 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    const work = await DIYService.getAdminWorkDetail(Number(req.params.id))
    return res.apiSuccess(work, '获取作品详情成功')
  })
)

module.exports = router
