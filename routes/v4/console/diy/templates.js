/**
 * DIY 款式模板管理 — 管理端路由
 *
 * 顶层路径：/api/v4/console/diy/templates
 *
 * 接口清单（6 个）：
 * - GET    /            获取模板列表（分页/筛选）     role_level >= 60
 * - GET    /:id         获取模板详情                  role_level >= 60
 * - POST   /            创建模板                      role_level >= 60
 * - PUT    /:id         更新模板                      role_level >= 60
 * - PUT    /:id/status  发布/下线模板（状态机校验）   role_level >= 60
 * - DELETE /:id         删除模板（仅草稿可删）        role_level >= 80
 *
 * @module routes/v4/console/diy/templates
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

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

// 全局认证 + 基础权限（role_level >= 60）
router.use(authenticateToken, requireRoleLevel(60))

/** 获取模板列表（分页/筛选） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    const result = await DIYService.getTemplateList(req.query)
    return res.apiSuccess(result, '获取模板列表成功')
  })
)

/** 获取模板详情 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    const template = await DIYService.getTemplateDetail(Number(req.params.id))
    return res.apiSuccess(template, '获取模板详情成功')
  })
)

/** 创建模板 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    let template
    await TransactionManager.execute(async transaction => {
      template = await DIYService.createTemplate(req.body, { transaction })
    })

    logger.info('[Console/DIY] 管理员创建款式模板', {
      admin_user_id: req.user.user_id,
      diy_template_id: template.diy_template_id,
      template_code: template.template_code,
      display_name: template.display_name
    })

    return res.apiSuccess(template, '款式模板创建成功')
  })
)

/** 更新模板 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    let template
    await TransactionManager.execute(async transaction => {
      template = await DIYService.updateTemplate(Number(req.params.id), req.body, { transaction })
    })

    logger.info('[Console/DIY] 管理员更新款式模板', {
      admin_user_id: req.user.user_id,
      diy_template_id: Number(req.params.id),
      updated_fields: Object.keys(req.body)
    })

    return res.apiSuccess(template, '款式模板更新成功')
  })
)

/**
 * 发布/下线模板（独立状态切换接口，含状态机校验）
 *
 * 合法状态转换：
 * - draft → published（发布）
 * - published → archived（下线/归档）
 * - archived → published（重新上线）
 */
router.put(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    const { status } = req.body

    if (!status) {
      return res.apiFail('status 参数必填', 400)
    }

    let template
    await TransactionManager.execute(async transaction => {
      template = await DIYService.updateTemplateStatus(Number(req.params.id), status, {
        transaction
      })
    })

    logger.info('[Console/DIY] 管理员变更模板状态', {
      admin_user_id: req.user.user_id,
      diy_template_id: Number(req.params.id),
      new_status: status
    })

    return res.apiSuccess(template, `模板状态已更新为 ${status}`)
  })
)

/** 删除模板（仅草稿可删，需要更高权限） */
router.delete(
  '/:id',
  requireRoleLevel(80),
  asyncHandler(async (req, res) => {
    const DIYService = require('../../../../services').getService('diy')
    await TransactionManager.execute(async transaction => {
      await DIYService.deleteTemplate(Number(req.params.id), { transaction })
    })

    logger.info('[Console/DIY] 管理员删除款式模板', {
      admin_user_id: req.user.user_id,
      diy_template_id: Number(req.params.id)
    })

    return res.apiSuccess(null, '款式模板删除成功')
  })
)

module.exports = router
