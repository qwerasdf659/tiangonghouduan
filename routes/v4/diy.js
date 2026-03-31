/**
 * DIY 饰品设计引擎 — 用户端路由（小程序端）
 *
 * 顶层路径：/api/v4/diy
 *
 * 接口清单（10 个）：
 * - GET    /templates                获取模板列表（按分类分组，仅已发布+已启用）
 * - GET    /templates/:id            获取模板详情
 * - GET    /templates/:id/materials  获取模板可用材料（含用户持有量）
 * - GET    /works                    获取用户作品列表
 * - GET    /works/:id                获取作品详情
 * - POST   /works                    保存作品（创建或更新草稿）
 * - DELETE /works/:id                删除作品（仅 draft 状态）
 * - POST   /works/:id/confirm        确认设计（冻结材料，draft → frozen）
 * - POST   /works/:id/complete       完成设计（从冻结扣减 + 铸造物品，frozen → completed）
 * - POST   /works/:id/cancel         取消设计（解冻材料，frozen → cancelled）
 *
 * @module routes/v4/diy
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../middleware/auth')
const TransactionManager = require('../../utils/TransactionManager')

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

// ==================== 模板接口（公开 + 认证） ====================

/** 获取模板列表（已发布+已启用，按分类分组） */
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const templates = await DIYService.getUserTemplates()
    return res.apiSuccess(templates, '获取模板列表成功')
  })
)

/** 获取模板详情 */
router.get(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const template = await DIYService.getTemplateDetail(Number(req.params.id))
    return res.apiSuccess(template, '获取模板详情成功')
  })
)

/** 获取模板可用材料（需登录，含用户持有量） */
router.get(
  '/templates/:id/materials',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const accountId = await DIYService.getAccountIdByUserId(req.user.user_id)
    const materials = await DIYService.getTemplateMaterials(Number(req.params.id), accountId)
    return res.apiSuccess(materials, '获取可用材料成功')
  })
)

/** 获取模板可用的实物珠子/宝石素材 */
router.get(
  '/templates/:id/beads',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const materials = await DIYService.getUserMaterials(Number(req.params.id), req.query)
    return res.apiSuccess(materials, '获取珠子素材成功')
  })
)

/** 获取材料分组列表（用于前端 Tab） */
router.get(
  '/material-groups',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const groups = await DIYService.getMaterialGroups()
    return res.apiSuccess(groups, '获取材料分组成功')
  })
)

// ==================== 作品接口（全部需登录） ====================

router.use('/works', authenticateToken)

/** 中间件：将 user_id 转换为 account_id */
router.use(
  '/works',
  asyncHandler(async (req, _res, next) => {
    const DIYService = require('../../services').getService('diy')
    const accountId = await DIYService.getAccountIdByUserId(req.user.user_id)
    req.accountId = accountId // eslint-disable-line require-atomic-updates
    next()
  })
)

/** 获取用户作品列表 */
router.get(
  '/works',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const result = await DIYService.getWorkList(req.accountId, req.query)
    return res.apiSuccess(result, '获取作品列表成功')
  })
)

/** 获取作品详情 */
router.get(
  '/works/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    const work = await DIYService.getWorkDetail(Number(req.params.id), req.accountId)
    return res.apiSuccess(work, '获取作品详情成功')
  })
)

/** 保存作品（创建或更新草稿） */
router.post(
  '/works',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.saveWork(req.accountId, req.body, { transaction })
    })
    return res.apiSuccess(work, work.diy_work_id ? '作品保存成功' : '作品创建成功')
  })
)

/** 删除作品（仅 draft 状态） */
router.delete(
  '/works/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    await TransactionManager.execute(async transaction => {
      await DIYService.deleteWork(Number(req.params.id), req.accountId, { transaction })
    })
    return res.apiSuccess(null, '作品删除成功')
  })
)

/** 确认设计（冻结材料，draft → frozen） */
router.post(
  '/works/:id/confirm',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.confirmDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id
      })
    })
    return res.apiSuccess(work, '设计确认成功，材料已冻结')
  })
)

/** 完成设计（从冻结扣减 + 铸造物品，frozen → completed） */
router.post(
  '/works/:id/complete',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.completeDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id
      })
    })
    return res.apiSuccess(work, '设计完成，物品已铸造')
  })
)

/** 取消设计（解冻材料，frozen → cancelled） */
router.post(
  '/works/:id/cancel',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../services').getService('diy')
    let work
    await TransactionManager.execute(async transaction => {
      work = await DIYService.cancelDesign(Number(req.params.id), req.accountId, {
        transaction,
        userId: req.user.user_id
      })
    })
    return res.apiSuccess(work, '设计已取消，材料已解冻')
  })
)

module.exports = router
