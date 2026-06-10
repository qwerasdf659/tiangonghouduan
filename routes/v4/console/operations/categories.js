/**
 * @file 统一商品中心 — 品类树管理路由
 * @description 品类 CRUD、子树查询、品类与 EAV 属性绑定
 *
 * @version 1.0.0
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const { asyncHandler } = require('../../../../middleware/validation')

/**
 * 从服务容器取属性服务（品类-属性绑定）
 *
 * @param {Object} req - Express请求对象
 * @returns {Object} AttributeService服务实例
 */
function getAttributeService(req) {
  return req.app.locals.services.getService('product_attribute')
}

/**
 * 扁平列表转为父子树（内存组装）
 *
 * @param {Array<Object>} rows - 品类 plain 行
 * @returns {Array<Object>} 根节点列表（含嵌套 children）
 */
function buildCategoryTree(rows) {
  const map = new Map()
  for (const r of rows) {
    map.set(r.category_id, { ...r, children: [] })
  }
  const roots = []
  for (const node of map.values()) {
    const pid = node.parent_category_id
    if (pid == null) {
      roots.push(node)
    } else {
      const parent = map.get(pid)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }
  const sortFn = (a, b) => a.sort_order - b.sort_order || a.category_id - b.category_id
  const walk = list => {
    list.sort(sortFn)
    for (const n of list) {
      if (n.children && n.children.length) walk(n.children)
    }
  }
  walk(roots)
  return roots
}

/**
 * GET / — 品类列表（扁平或树）
 *
 * 查询：`tree=true` 返回树，否则扁平列表
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = req.app.locals.services.getService('exchange_item_service')
    const wantTree = req.query.tree === 'true' || req.query.tree === '1'

    const plain = await service.listCategories()
    const data = wantTree ? { tree: buildCategoryTree(plain) } : { items: plain }

    return res.apiSuccess(data, wantTree ? '获取品类树成功' : '获取品类列表成功')
  })
)

/**
 * GET /:id/attributes — 品类已绑定属性（含选项）
 */
router.get(
  '/:id/attributes',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getAttributeService(req)
    const list = await service.getCategoryAttributes(req.params.id)
    return res.apiSuccess({ attributes: list }, '获取品类属性绑定成功')
  })
)

/**
 * PUT /:id/attributes — 全量替换品类属性绑定
 *
 * Body: `{ attribute_ids: number[] }`
 */
router.put(
  '/:id/attributes',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getAttributeService(req)
    const { attribute_ids } = req.body || {}

    const bound = await TransactionManager.execute(async transaction => {
      return await service.bindCategoryAttributes(req.params.id, attribute_ids, { transaction })
    })

    return res.apiSuccess({ bindings: bound }, '绑定品类属性成功')
  })
)

/**
 * GET /:id — 品类详情（含直接子节点）
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const cid = parseInt(req.params.id, 10)
    if (Number.isNaN(cid)) {
      return res.apiError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', null, 400)
    }

    const service = req.app.locals.services.getService('exchange_item_service')
    const detail = await service.getCategoryDetail(cid)

    if (!detail) {
      return res.apiError(
        '品类不存在',
        'PRODUCT_CENTER_CATEGORY_NOT_FOUND',
        { category_id: cid },
        404
      )
    }

    return res.apiSuccess(detail, '获取品类详情成功')
  })
)

/**
 * POST / — 创建品类
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { category_name, category_code } = req.body || {}

    if (!category_name || !String(category_name).trim()) {
      return res.apiError(
        'category_name 不能为空',
        'PRODUCT_CENTER_CATEGORY_NAME_REQUIRED',
        null,
        400
      )
    }
    if (!category_code || !String(category_code).trim()) {
      return res.apiError(
        'category_code 不能为空',
        'PRODUCT_CENTER_CATEGORY_CODE_REQUIRED',
        null,
        400
      )
    }

    const service = req.app.locals.services.getService('exchange_item_service')
    const created = await TransactionManager.execute(async transaction => {
      return service.createCategory(req.body || {}, { transaction })
    })

    return res.apiSuccess(created, '创建品类成功')
  })
)

/**
 * PUT /:id — 更新品类
 */
router.put(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const cid = parseInt(req.params.id, 10)
    if (Number.isNaN(cid)) {
      return res.apiError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', null, 400)
    }

    const service = req.app.locals.services.getService('exchange_item_service')
    const updated = await TransactionManager.execute(async transaction => {
      return service.updateCategory(cid, req.body || {}, { transaction })
    })

    return res.apiSuccess(updated, '更新品类成功')
  })
)

/**
 * DELETE /:id — 硬删除品类（存在子品类时禁止）
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const cid = parseInt(req.params.id, 10)
    if (Number.isNaN(cid)) {
      return res.apiError('category_id 无效', 'PRODUCT_CENTER_INVALID_CATEGORY_ID', null, 400)
    }

    const service = req.app.locals.services.getService('exchange_item_service')
    await TransactionManager.execute(async transaction => {
      return service.deleteCategory(cid, { transaction })
    })

    return res.apiSuccess({ category_id: cid }, '删除品类成功')
  })
)

module.exports = router
