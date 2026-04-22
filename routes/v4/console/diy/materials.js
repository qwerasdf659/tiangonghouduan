/**
 * DIY 材料/珠子素材管理 — 管理端路由
 *
 * 顶层路径：/api/v4/console/diy/materials
 *
 * 接口清单（5 个）：
 * - GET    /       获取材料列表（分页/筛选）
 * - GET    /:id    获取材料详情
 * - POST   /       创建材料
 * - PUT    /:id    更新材料
 * - DELETE /:id    删除材料
 *
 * @module routes/v4/console/diy/materials
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(60))

/** 获取材料列表（分页/筛选） */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const result = await DIYService.getAdminMaterialList(req.query)
    return res.apiSuccess(result, '获取材料列表成功')
  })
)

/** 获取材料详情 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const material = await DIYService.getAdminMaterialDetail(Number(req.params.id))
    return res.apiSuccess(material, '获取材料详情成功')
  })
)

/** 创建材料 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const material = await DIYService.createMaterial(req.body)

    logger.info('[Console/DIY] 管理员创建材料', {
      admin_user_id: req.user.user_id,
      diy_material_id: material.diy_material_id,
      display_name: material.display_name
    })

    return res.apiSuccess(material, '材料创建成功')
  })
)

/** 更新材料 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    const material = await DIYService.updateMaterial(Number(req.params.id), req.body)

    logger.info('[Console/DIY] 管理员更新材料', {
      admin_user_id: req.user.user_id,
      diy_material_id: Number(req.params.id)
    })

    return res.apiSuccess(material, '材料更新成功')
  })
)

/** 删除材料 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const DIYService = req.app.locals.services.getService('diy')
    await DIYService.deleteMaterial(Number(req.params.id))

    logger.info('[Console/DIY] 管理员删除材料', {
      admin_user_id: req.user.user_id,
      diy_material_id: Number(req.params.id)
    })

    return res.apiSuccess(null, '材料删除成功')
  })
)

module.exports = router
